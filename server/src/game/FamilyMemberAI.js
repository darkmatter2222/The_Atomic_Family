/**
 * FamilyMemberAI (server-side) — Interaction-driven behavior for each family member.
 * Characters pick an interaction from the catalog, pathfind to the furniture,
 * perform the action for its duration, then pick a new one.
 *
 * State machine: CHOOSING → WALKING → PERFORMING → CHOOSING
 * Occasionally falls back to random wandering for variety.
 *
 * CommonJS conversion of client/src/game/FamilyMemberAI.js
 */

const { findPath, smoothPath } = require('./Pathfinding');
const { createWalkableGrid, worldToGrid, getRandomWalkablePosition, getRoomAtPosition, HOUSE_LAYOUT } = require('./HouseLayout');
const {
  INTERACTION_CATALOG,
  INTERACTION_MAP,
  FURNITURE_ZONES,
  getInteractionsForRole,
  filterByTimeWindow,
  rollDuration,
  createInitialNeeds,
  createInitialSkills,
  createInitialRelationships,
  decayNeeds,
  applyNeedsEffects,
  applySkillEffects,
  getCriticalNeeds,
  getBodyAnimForInteraction
} = require('./InteractionData');
const { getBodyAnimSpeed, getBodyAnimFrameCount } = require('./ActivityAnimator');

// Create the walkable grid once
const gridData = createWalkableGrid(2);

// ── Furniture-position lookup  { furnitureId → full furniture def } ──
const FURNITURE_MAP = {};
for (const f of HOUSE_LAYOUT.furniture) {
  FURNITURE_MAP[f.id] = f;
}

/**
 * State machine states
 */
const STATE = {
  IDLE: 'idle',
  WALKING: 'walking',
  CHOOSING: 'choosing',
  PERFORMING: 'performing',
  THINKING: 'thinking'
};

/**
 * Mapping from need names to interaction categories that address them.
 */
const NEED_CATEGORY_MAP = {
  energy:    ['sleeping'],
  hunger:    ['eating', 'cooking'],
  hydration: ['eating'],
  hygiene:   ['hygiene'],
  bladder:   ['hygiene'],
  fun:       ['entertainment', 'hobby', 'exercise'],
  social:    ['social'],
  comfort:   ['relaxing', 'sleeping']
};

/**
 * Pick the best interaction for this member given the current game hour.
 * Needs-aware: interactions whose needsEffects restore a critical need get
 * a large priority boost.
 */
function pickInteraction(role, gameHour, needs) {
  let pool = getInteractionsForRole(role);
  pool = filterByTimeWindow(pool, gameHour);
  if (pool.length === 0) return null;

  const critical = needs ? getCriticalNeeds(needs, 25) : [];

  const weighted = pool.map(interaction => {
    let weight = interaction.priority;

    for (const { key, value } of critical) {
      const fx = interaction.needsEffects || {};
      if (fx[key] && fx[key] > 0) {
        const urgency = (25 - value) / 25;
        weight += 15 * urgency;
      }
      const cats = NEED_CATEGORY_MAP[key] || [];
      if (cats.includes(interaction.category)) {
        const urgency = (25 - value) / 25;
        weight += 5 * urgency;
      }
    }

    return { interaction, weight };
  });

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  let r = Math.random() * totalWeight;
  for (const { interaction, weight } of weighted) {
    r -= weight;
    if (r <= 0) return interaction;
  }
  return weighted[weighted.length - 1].interaction;
}

/**
 * Compute the exact world position where a character should go
 * to use a piece of furniture.
 */
function getInteractionPosition(furnitureId) {
  let resolvedId = furnitureId;
  const zone = FURNITURE_ZONES[furnitureId];
  if (zone?.snapTo) {
    resolvedId = zone.snapTo;
  } else if (zone?.snapToNearest) {
    resolvedId = zone.snapToNearest[Math.floor(Math.random() * zone.snapToNearest.length)];
  }

  const furn = FURNITURE_MAP[resolvedId];
  if (!furn) return null;

  const resolvedZone = FURNITURE_ZONES[resolvedId] || {};
  const side = resolvedZone.approachSide || 'front';
  const standOff = resolvedZone.standOffset || 0.5;

  const cx = furn.position.x;
  const cz = furn.position.z;
  const hw = (furn.size?.w || 1) / 2;
  const hd = (furn.size?.d || 1) / 2;

  let tx, tz;

  if (side === 'center') {
    tx = cx; tz = cz;
  } else if (side === 'front') {
    tx = cx; tz = cz - hd - standOff;
  } else if (side === 'back') {
    tx = cx; tz = cz + hd + standOff;
  } else if (side === 'left') {
    tx = cx - hw - standOff; tz = cz;
  } else if (side === 'right') {
    tx = cx + hw + standOff; tz = cz;
  } else {
    tx = cx; tz = cz - hd - standOff;
  }

  const g = worldToGrid(tx, tz, gridData);
  if (g.gx >= 0 && g.gx < gridData.gridWidth && g.gz >= 0 && g.gz < gridData.gridHeight
      && gridData.grid[g.gz][g.gx] === 1) {
    return { x: tx, z: tz, atFurniture: resolvedId };
  }

  const fallbackOffsets = [
    { x: 0, z: 0 },
    { x: 0.5, z: 0 }, { x: -0.5, z: 0 },
    { x: 0, z: 0.5 }, { x: 0, z: -0.5 },
    { x: 0.5, z: 0.5 }, { x: -0.5, z: 0.5 },
    { x: 0.5, z: -0.5 }, { x: -0.5, z: -0.5 },
    { x: 1, z: 0 }, { x: -1, z: 0 },
    { x: 0, z: 1 }, { x: 0, z: -1 },
  ];
  for (const off of fallbackOffsets) {
    const fx = tx + off.x;
    const fz = tz + off.z;
    const fg = worldToGrid(fx, fz, gridData);
    if (fg.gx >= 0 && fg.gx < gridData.gridWidth && fg.gz >= 0 && fg.gz < gridData.gridHeight
        && gridData.grid[fg.gz][fg.gx] === 1) {
      return { x: fx, z: fz, atFurniture: resolvedId };
    }
  }

  return { x: cx, z: cz, atFurniture: resolvedId };
}

/**
 * Snap to furniture center for "center" approach-side interactions.
 */
function snapToFurnitureCenter(position, furnitureId) {
  const zone = FURNITURE_ZONES[furnitureId];
  if (!zone || zone.approachSide !== 'center') return position;

  const furn = FURNITURE_MAP[furnitureId];
  if (!furn) return position;

  return { x: furn.position.x, y: furn.size.h || 0, z: furn.position.z };
}

/**
 * Create initial AI state for a family member
 */
function createFamilyMemberState(name, role, startX, startZ) {
  return {
    name,
    role,
    position: { x: startX, y: 0, z: startZ },
    state: STATE.CHOOSING,
    path: [],
    pathIndex: 0,
    idleTimer: 0,
    idleDuration: 1 + Math.random() * 3,
    walkSpeed: 1.5 + Math.random() * 0.5,
    currentRoom: getRoomAtPosition(startX, startZ) || 'living_room',
    animFrame: 0,
    animTimer: 0,
    facingRight: true,
    currentInteraction: null,
    interactionTimer: 0,
    interactionDuration: 0,
    activityLabel: null,
    activityAnim: null,
    activityAnimFrame: 0,
    activityAnimTimer: 0,
    targetFurniture: null,
    needs: createInitialNeeds(),
    skills: createInitialSkills(),
    relationships: createInitialRelationships(),
    inventory: [],
    effectsApplied: 0
  };
}

/**
 * Update a single family member's AI state.
 */
function updateFamilyMember(member, deltaTime, gameHour = 12) {
  const updated = { ...member };

  const gameHoursElapsed = deltaTime / 3600;
  if (gameHoursElapsed > 0) {
    updated.needs = decayNeeds(updated.needs, gameHoursElapsed, gameHour);
  }

  switch (updated.state) {
    case STATE.CHOOSING: {
      const wander = Math.random() < 0.10;

      if (wander) {
        const dest = getRandomWalkablePosition();
        const startGrid = worldToGrid(updated.position.x, updated.position.z, gridData);
        const endGrid = worldToGrid(dest.x, dest.z, gridData);
        const rawPath = findPath(gridData.grid, startGrid, endGrid);
        if (rawPath.length > 1) {
          updated.path = smoothPath(rawPath, gridData);
          updated.pathIndex = 0;
          updated.state = STATE.WALKING;
          updated.currentInteraction = null;
          updated.activityLabel = null;
          updated.activityAnim = 'walk';
          updated.targetFurniture = null;
        } else {
          updated.idleTimer = 0;
          updated.idleDuration = 0.5;
          updated.state = STATE.IDLE;
        }
        break;
      }

      const interaction = pickInteraction(updated.role, gameHour, updated.needs);
      if (!interaction) {
        updated.idleTimer = 0;
        updated.idleDuration = 1;
        updated.state = STATE.IDLE;
        break;
      }

      const dest = getInteractionPosition(interaction.furnitureId);
      if (!dest) {
        updated.currentInteraction = interaction;
        updated.interactionTimer = 0;
        updated.interactionDuration = rollDuration(interaction) * 60;
        updated.activityLabel = interaction.label;
        updated.activityAnim = interaction.animation;
        updated.state = STATE.PERFORMING;
        updated.targetFurniture = null;
        updated.effectsApplied = 0;
        break;
      }

      const startGrid = worldToGrid(updated.position.x, updated.position.z, gridData);
      const endGrid = worldToGrid(dest.x, dest.z, gridData);
      const rawPath = findPath(gridData.grid, startGrid, endGrid);

      if (rawPath.length > 1) {
        updated.path = smoothPath(rawPath, gridData);
        updated.pathIndex = 0;
        updated.currentInteraction = interaction;
        updated.activityLabel = interaction.label;
        updated.activityAnim = 'walk';
        updated.targetFurniture = dest.atFurniture;
        updated.state = STATE.WALKING;
      } else {
        const dx = dest.x - updated.position.x;
        const dz = dest.z - updated.position.z;
        const distToTarget = Math.sqrt(dx * dx + dz * dz);

        if (distToTarget < 2.0) {
          updated.currentInteraction = interaction;
          updated.interactionTimer = 0;
          updated.interactionDuration = rollDuration(interaction) * 60;
          updated.activityLabel = interaction.label;
          updated.activityAnim = interaction.animation;
          updated.targetFurniture = dest.atFurniture;
          const snapped = snapToFurnitureCenter(updated.position, dest.atFurniture);
          updated.position = snapped;
          updated.state = STATE.PERFORMING;
          updated.effectsApplied = 0;
        } else {
          updated.state = STATE.IDLE;
          updated.idleTimer = 0;
          updated.idleDuration = 0.5;
        }
      }
      break;
    }

    case STATE.WALKING: {
      if (updated.pathIndex >= updated.path.length) {
        if (updated.currentInteraction) {
          if (updated.targetFurniture) {
            const snapped = snapToFurnitureCenter(updated.position, updated.targetFurniture);
            updated.position = snapped;
          }
          updated.interactionTimer = 0;
          updated.interactionDuration = rollDuration(updated.currentInteraction) * 60;
          updated.activityAnim = updated.currentInteraction.animation;
          updated.state = STATE.PERFORMING;
          updated.animFrame = 0;
          updated.effectsApplied = 0;
        } else {
          updated.state = STATE.IDLE;
          updated.idleTimer = 0;
          updated.idleDuration = 2 + Math.random() * 5;
          updated.animFrame = 0;
        }
        break;
      }

      const target = updated.path[updated.pathIndex];
      const dx = target.x - updated.position.x;
      const dz = target.z - updated.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 0.1) {
        updated.pathIndex++;
        break;
      }

      const moveAmount = updated.walkSpeed * deltaTime;
      const ratio = Math.min(moveAmount / dist, 1);
      updated.position = {
        x: updated.position.x + dx * ratio,
        y: 0,
        z: updated.position.z + dz * ratio
      };

      if (Math.abs(dx) > 0.01) {
        updated.facingRight = dx > 0;
      }

      const room = getRoomAtPosition(updated.position.x, updated.position.z);
      if (room) updated.currentRoom = room;

      updated.animTimer += deltaTime;
      if (updated.animTimer > 0.125) {
        updated.animTimer = 0;
        updated.animFrame = (updated.animFrame + 1) % 6;
      }
      break;
    }

    case STATE.PERFORMING: {
      updated.interactionTimer += deltaTime;
      updated.animFrame = 0;

      if (updated.currentInteraction) {
        const bodyAnim = getBodyAnimForInteraction(updated.currentInteraction);
        const animSpeed = getBodyAnimSpeed(bodyAnim);
        const frameCount = getBodyAnimFrameCount(bodyAnim);
        updated.activityAnimTimer = (updated.activityAnimTimer || 0) + deltaTime;
        if (animSpeed > 0 && updated.activityAnimTimer >= (1 / animSpeed)) {
          updated.activityAnimTimer = 0;
          updated.activityAnimFrame = ((updated.activityAnimFrame || 0) + 1) % frameCount;
        }
      }

      if (updated.currentInteraction && updated.interactionDuration > 0) {
        const progress = Math.min(updated.interactionTimer / updated.interactionDuration, 1);
        const newFraction = progress - (updated.effectsApplied || 0);
        if (newFraction > 0) {
          updated.needs = applyNeedsEffects(
            updated.needs,
            updated.currentInteraction.needsEffects,
            newFraction
          );
          updated.skills = applySkillEffects(
            updated.skills,
            updated.currentInteraction.skillEffects,
            newFraction
          );
          updated.effectsApplied = progress;
        }
      }

      if (updated.interactionTimer >= updated.interactionDuration) {
        if (updated.currentInteraction && (updated.effectsApplied || 0) < 1) {
          const remaining = 1 - (updated.effectsApplied || 0);
          updated.needs = applyNeedsEffects(
            updated.needs,
            updated.currentInteraction.needsEffects,
            remaining
          );
          updated.skills = applySkillEffects(
            updated.skills,
            updated.currentInteraction.skillEffects,
            remaining
          );
        }
        updated.currentInteraction = null;
        updated.activityLabel = null;
        updated.activityAnim = null;
        updated.activityAnimFrame = 0;
        updated.activityAnimTimer = 0;
        updated.interactionTimer = 0;
        updated.interactionDuration = 0;
        updated.targetFurniture = null;
        updated.effectsApplied = 0;
        updated.position = { ...updated.position, y: 0 };
        updated.state = STATE.IDLE;
        updated.idleTimer = 0;
        updated.idleDuration = 1 + Math.random() * 2;
      }
      break;
    }

    case STATE.IDLE: {
      updated.idleTimer += deltaTime;
      updated.animFrame = 0;
      updated.activityLabel = null;
      updated.activityAnim = null;
      if (updated.idleTimer >= updated.idleDuration) {
        updated.state = STATE.CHOOSING;
      }
      break;
    }

    case STATE.THINKING: {
      // Waiting for AgenticEngine LLM decision.
      // GameSimulation._tickAgentic() handles transitions out of this state.
      // Show a thinking indicator.
      updated.animFrame = 0;
      if (!updated.activityLabel || !updated.activityLabel.includes('Thinking')) {
        updated.activityLabel = '💭 Thinking...';
      }
      updated.activityAnim = null;

      // Safety timeout: if stuck in THINKING for >15 real seconds,
      // fall back to CHOOSING. (Real-time timeout is also managed in
      // AgenticEngine, but this is a safety net.)
      if (updated._thinkingRealStart && Date.now() - updated._thinkingRealStart > 15000) {
        updated.state = STATE.CHOOSING;
        updated._thinkingRealStart = null;
        updated._decisionHandlerAttached = false;
        updated.activityLabel = null;
      }
      break;
    }
  }

  return updated;
}

/**
 * Command a family member to perform a specific interaction.
 */
function commandFamilyMember(member, interactionId) {
  const interaction = INTERACTION_MAP[interactionId];
  if (!interaction) return member;

  const updated = { ...member };
  updated.position = { ...updated.position, y: 0 };

  const dest = getInteractionPosition(interaction.furnitureId);

  if (!dest) {
    updated.currentInteraction = interaction;
    updated.interactionTimer = 0;
    updated.interactionDuration = rollDuration(interaction) * 60;
    updated.activityLabel = interaction.label;
    updated.activityAnim = interaction.animation;
    updated.targetFurniture = null;
    updated.state = STATE.PERFORMING;
    updated.effectsApplied = 0;
    return updated;
  }

  const startGrid = worldToGrid(updated.position.x, updated.position.z, gridData);
  const endGrid = worldToGrid(dest.x, dest.z, gridData);
  const rawPath = findPath(gridData.grid, startGrid, endGrid);

  if (rawPath.length > 1) {
    updated.path = smoothPath(rawPath, gridData);
    updated.pathIndex = 0;
    updated.currentInteraction = interaction;
    updated.activityLabel = interaction.label;
    updated.activityAnim = 'walk';
    updated.targetFurniture = dest.atFurniture;
    updated.state = STATE.WALKING;
  } else {
    const snapped = snapToFurnitureCenter(updated.position, dest.atFurniture);
    updated.position = snapped;
    updated.currentInteraction = interaction;
    updated.interactionTimer = 0;
    updated.interactionDuration = rollDuration(interaction) * 60;
    updated.activityLabel = interaction.label;
    updated.activityAnim = interaction.animation;
    updated.targetFurniture = dest.atFurniture;
    updated.state = STATE.PERFORMING;
    updated.effectsApplied = 0;
  }

  return updated;
}

/**
 * Get the initial family members
 */
function createFamily() {
  return [
    createFamilyMemberState('Dad', 'father', -5, -3),
    createFamilyMemberState('Mom', 'mother', -5, 3),
    createFamilyMemberState('Emma', 'daughter', 3.5, 4),
    createFamilyMemberState('Lily', 'daughter', 4.5, 4),
    createFamilyMemberState('Jack', 'son', 8.5, 3.5)
  ];
}

module.exports = {
  createFamily,
  createFamilyMemberState,
  updateFamilyMember,
  commandFamilyMember,
  STATE
};
