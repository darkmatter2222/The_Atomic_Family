/**
 * FamilyMemberAI - Interaction-driven behavior for each family member.
 * Characters pick an interaction from the catalog, pathfind to the furniture,
 * perform the action for its duration, then pick a new one.
 *
 * State machine: CHOOSING → WALKING → PERFORMING → CHOOSING
 * Occasionally falls back to random wandering for variety.
 */

import { findPath, smoothPath } from './Pathfinding';
import { createWalkableGrid, worldToGrid, getRandomWalkablePosition, getRoomAtPosition, HOUSE_LAYOUT } from './HouseLayout';
import {
  INTERACTION_CATALOG,
  getInteractionsForRole,
  filterByTimeWindow,
  rollDuration
} from './InteractionData';

// Create the walkable grid once
const gridData = createWalkableGrid(2);

// ── Furniture-position lookup  { furnitureId → full furniture def } ──
const FURNITURE_MAP = {};
for (const f of HOUSE_LAYOUT.furniture) {
  FURNITURE_MAP[f.id] = f;
}

/**
 * INTERACTION ZONES — per-furniture rules for WHERE the character should stand
 * or sit when using that piece of furniture.
 *
 * approachSide: 'front' (+Z face), 'back' (-Z face), 'left' (-X), 'right' (+X),
 *               'center' (on top / inside the furniture itself),
 *               'custom' (use the x/z offset directly)
 * offset: { x, z } — world offset from furniture center to the use-position
 * snapTo: an alternative furnitureId — go to THAT furniture instead (e.g. watch_tv → couch)
 *
 * If a furniture id is not listed here, we fall back to the generic closest-
 * walkable-cell logic, but prefer the 'front' side (positive-Z face) first.
 */
const INTERACTION_ZONES = {
  // Kitchen — stand in front of counter appliances (counter faces -Z / toward room center)
  fridge:        { approachSide: 'front', standOffset: 0.6 },
  sink:          { approachSide: 'front', standOffset: 0.6 },
  dishwasher:    { approachSide: 'front', standOffset: 0.6 },
  stove:         { approachSide: 'front', standOffset: 0.6 },
  microwave:     { approachSide: 'front', standOffset: 0.6 },
  pantry:        { approachSide: 'right', standOffset: 0.6 },
  kitchen_table: { approachSide: 'center', snapToNearest: ['kitchen_chair_1', 'kitchen_chair_2'] },
  kitchen_chair_1: { approachSide: 'center' },
  kitchen_chair_2: { approachSide: 'center' },

  // Living room
  couch:       { approachSide: 'center' },       // sit ON the couch
  loveseat:    { approachSide: 'center' },
  tv_stand:    { snapTo: 'couch' },              // watch TV → go sit on couch
  tv:          { snapTo: 'couch' },              // watch TV → go sit on couch
  coffee_table:{ snapTo: 'couch' },              // magazines → sit on couch
  bookshelf:   { snapTo: 'couch' },              // grab book then sit on couch
  end_table:   { snapTo: 'loveseat' },

  // Master bedroom
  master_bed:   { approachSide: 'center' },      // lie on the bed
  nightstand_l: { approachSide: 'right', standOffset: 0.4 },
  nightstand_r: { approachSide: 'left', standOffset: 0.4 },
  dresser:      { approachSide: 'left', standOffset: 0.6 },
  wardrobe:     { approachSide: 'left', standOffset: 0.6 },

  // Bathroom — sink & mirror against -Z wall, so approach from +Z (back) side
  toilet:       { approachSide: 'center' },
  shower:       { approachSide: 'center' },
  bath_sink:    { approachSide: 'back', standOffset: 0.5 },
  bath_mirror:  { approachSide: 'back', standOffset: 0.5 },

  // Laundry — washer/dryer/utility_sink are against +X wall, facing -X into the room
  washer:        { approachSide: 'left', standOffset: 0.6 },
  dryer:         { approachSide: 'left', standOffset: 0.6 },
  utility_sink:  { approachSide: 'left', standOffset: 0.5 },
  folding_table: { approachSide: 'front', standOffset: 0.5 },
  laundry_basket:  { approachSide: 'front', standOffset: 0.4 },
  laundry_basket_2:{ approachSide: 'front', standOffset: 0.4 },
  ironing_board: { approachSide: 'right', standOffset: 0.5 },
  drying_rack:   { approachSide: 'back', standOffset: 0.5 },
  steam_press:   { approachSide: 'back', standOffset: 0.5 },
  laundry_shelf: { approachSide: 'right', standOffset: 0.5 },

  // Kids rooms
  kids_bed_1:      { approachSide: 'center' },
  kids_bed_2:      { approachSide: 'center' },
  kids_bed_3:      { approachSide: 'center' },
  toy_box:         { approachSide: 'front', standOffset: 0.5 },
  kids_desk_shared:{ approachSide: 'center' },
  kids_desk_single:{ approachSide: 'center' },
  kids_bookshelf:  { approachSide: 'left', standOffset: 0.5 },
  bean_bag:        { approachSide: 'center' },

  // Garage
  car:        { approachSide: 'right', standOffset: 1.2 },
  workbench:  { approachSide: 'left', standOffset: 0.5 },
  tool_shelf: { approachSide: 'left', standOffset: 0.5 },
  bike:       { approachSide: 'center' },
  lawn_mower: { approachSide: 'right', standOffset: 0.5 },

  // Master closet
  master_clothes_rod_l: { approachSide: 'left', standOffset: 0.6 },
  master_clothes_rod_r: { approachSide: 'left', standOffset: 0.6 },
  master_shoe_rack:     { approachSide: 'front', standOffset: 0.5 },
  master_mirror:        { approachSide: 'right', standOffset: 0.5 },
  master_storage_box:   { approachSide: 'left', standOffset: 0.5 },

  // Kids closet
  kids_clothes_rod_1: { approachSide: 'left', standOffset: 0.6 },
  kids_clothes_rod_2: { approachSide: 'left', standOffset: 0.6 },
  kids_shoe_rack:     { approachSide: 'front', standOffset: 0.5 },
  kids_costume_box:   { approachSide: 'front', standOffset: 0.5 },
  kids_storage_bins:  { approachSide: 'left', standOffset: 0.5 },

  // Backyard
  grill:          { approachSide: 'front', standOffset: 0.6 },
  hot_tub:        { approachSide: 'center' },
  picnic_table:   { approachSide: 'front', standOffset: 0.7 },
  swimming_pool:  { approachSide: 'center' },
  pool_chair_1:   { approachSide: 'center' },
  pool_chair_2:   { approachSide: 'center' },
  pool_diving_board: { approachSide: 'center' },
  swing_set:      { approachSide: 'center' },
  slide:          { approachSide: 'back', standOffset: 0.6 },
  sandbox:        { approachSide: 'center' },
  monkey_bars:    { approachSide: 'center' },
  trampoline:     { approachSide: 'center' },
  soccer_ball:    { approachSide: 'center' },
  basketball:     { approachSide: 'center' },
  beach_ball:     { approachSide: 'center' },
  jump_rope:      { approachSide: 'center' },
  garden_shed:    { approachSide: 'front', standOffset: 1.0 },
};

/**
 * State machine states
 */
const STATE = {
  IDLE: 'idle',
  WALKING: 'walking',
  CHOOSING: 'choosing',
  PERFORMING: 'performing'
};

/**
 * Pick the best interaction for this member given the current game hour.
 * Uses weighted-random selection based on priority.
 */
function pickInteraction(role, gameHour) {
  let pool = getInteractionsForRole(role);
  pool = filterByTimeWindow(pool, gameHour);
  if (pool.length === 0) return null;

  const totalWeight = pool.reduce((sum, i) => sum + i.priority, 0);
  let r = Math.random() * totalWeight;
  for (const interaction of pool) {
    r -= interaction.priority;
    if (r <= 0) return interaction;
  }
  return pool[pool.length - 1];
}

/**
 * Compute the exact world position where a character should go
 * to use a piece of furniture, using the INTERACTION_ZONES rules.
 *
 * Returns { x, z, atFurniture: furnitureId } or null if furniture doesn't exist.
 */
function getInteractionPosition(furnitureId) {
  // Resolve snapTo chains (e.g. tv → couch)
  let resolvedId = furnitureId;
  const zone = INTERACTION_ZONES[furnitureId];
  if (zone?.snapTo) {
    resolvedId = zone.snapTo;
  } else if (zone?.snapToNearest) {
    // Pick the nearest from a list (e.g. kitchen_table → nearest chair)
    resolvedId = zone.snapToNearest[Math.floor(Math.random() * zone.snapToNearest.length)];
  }

  const furn = FURNITURE_MAP[resolvedId];
  if (!furn) return null;

  const resolvedZone = INTERACTION_ZONES[resolvedId] || {};
  const side = resolvedZone.approachSide || 'front';
  const standOff = resolvedZone.standOffset || 0.5;

  const cx = furn.position.x;
  const cz = furn.position.z;
  const hw = (furn.size?.w || 1) / 2;
  const hd = (furn.size?.d || 1) / 2;

  let tx, tz;

  if (side === 'center') {
    // Go right to the furniture center (sit ON it, lie IN it, etc.)
    tx = cx;
    tz = cz;
  } else if (side === 'front') {
    // Front = negative-Z face (facing toward room center / away from wall)
    tx = cx;
    tz = cz - hd - standOff;
  } else if (side === 'back') {
    tx = cx;
    tz = cz + hd + standOff;
  } else if (side === 'left') {
    tx = cx - hw - standOff;
    tz = cz;
  } else if (side === 'right') {
    tx = cx + hw + standOff;
    tz = cz;
  } else {
    tx = cx;
    tz = cz - hd - standOff;
  }

  // Check if target tile is walkable; if not, try to find a nearby walkable cell
  const g = worldToGrid(tx, tz, gridData);
  if (g.gx >= 0 && g.gx < gridData.gridWidth && g.gz >= 0 && g.gz < gridData.gridHeight
      && gridData.grid[g.gz][g.gx] === 1) {
    return { x: tx, z: tz, atFurniture: resolvedId };
  }

  // Fallback: scan a small radius around the target for any walkable cell
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

  // Last resort: furniture center (may be inside geometry but better than nothing)
  return { x: cx, z: cz, atFurniture: resolvedId };
}

/**
 * When a character arrives and starts PERFORMING, snap them to the exact
 * furniture position for "center" approach-side interactions (sitting on
 * couch, lying in bed, etc.). This makes it look like they're truly
 * on/in the furniture instead of standing nearby.
 */
function snapToFurnitureCenter(position, furnitureId) {
  const zone = INTERACTION_ZONES[furnitureId];
  if (!zone || zone.approachSide !== 'center') return position;

  const furn = FURNITURE_MAP[furnitureId];
  if (!furn) return position;

  // Snap X/Z to furniture center, Y to top of furniture so character sits/lies ON it
  return { x: furn.position.x, y: furn.size.h || 0, z: furn.position.z };
}

/**
 * Create initial AI state for a family member
 */
export function createFamilyMemberState(name, role, startX, startZ) {
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
    // Interaction tracking
    currentInteraction: null,      // the interaction object from catalog
    interactionTimer: 0,           // seconds spent performing
    interactionDuration: 0,        // total seconds to perform
    activityLabel: null,           // e.g. "Cooking dinner" – displayed on sprite
    activityAnim: null,            // animation hint: 'sit', 'sleep', 'use', 'walk'
    targetFurniture: null          // furniture id the character is headed to / using
  };
}

/**
 * Update a single family member's AI state.
 * @param {Object} member     – member state
 * @param {number} deltaTime  – real seconds elapsed (already scaled by timeSpeed)
 * @param {number} gameHour   – current game hour (0-24 float) for time-window checks
 * @returns {Object} updated member state
 */
export function updateFamilyMember(member, deltaTime, gameHour = 12) {
  const updated = { ...member };

  switch (updated.state) {
    // ── CHOOSING ─────────────────────────────────────────
    case STATE.CHOOSING: {
      // 15% chance to just wander randomly (keeps things natural)
      const wander = Math.random() < 0.15;

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

      // Pick an interaction
      const interaction = pickInteraction(updated.role, gameHour);
      if (!interaction) {
        updated.idleTimer = 0;
        updated.idleDuration = 1;
        updated.state = STATE.IDLE;
        break;
      }

      // Find destination — uses per-furniture interaction zones
      const dest = getInteractionPosition(interaction.furnitureId);
      if (!dest) {
        // Furniture not found (exterior / room-level action) — perform in place
        updated.currentInteraction = interaction;
        updated.interactionTimer = 0;
        updated.interactionDuration = rollDuration(interaction) * 60;
        updated.activityLabel = interaction.label;
        updated.activityAnim = interaction.animation;
        updated.state = STATE.PERFORMING;
        updated.targetFurniture = null;
        break;
      }

      // Pathfind to the interaction position
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
        // rawPath <= 1 means either already adjacent OR unreachable.
        // Only perform in-place if we're actually close to the target furniture.
        const dx = dest.x - updated.position.x;
        const dz = dest.z - updated.position.z;
        const distToTarget = Math.sqrt(dx * dx + dz * dz);

        if (distToTarget < 2.0) {
          // Close enough — perform the interaction
          updated.currentInteraction = interaction;
          updated.interactionTimer = 0;
          updated.interactionDuration = rollDuration(interaction) * 60;
          updated.activityLabel = interaction.label;
          updated.activityAnim = interaction.animation;
          updated.targetFurniture = dest.atFurniture;
          // Snap to furniture for 'center' approach
          const snapped = snapToFurnitureCenter(updated.position, dest.atFurniture);
          updated.position = snapped;
          updated.state = STATE.PERFORMING;
        } else {
          // Too far and can't pathfind — skip this interaction, pick again soon
          updated.state = STATE.IDLE;
          updated.idleTimer = 0;
          updated.idleDuration = 0.5;
        }
      }
      break;
    }

    // ── WALKING ──────────────────────────────────────────
    case STATE.WALKING: {
      if (updated.pathIndex >= updated.path.length) {
        // Reached destination
        if (updated.currentInteraction) {
          // Snap position for center-type furniture (couch, bed, chair, etc.)
          if (updated.targetFurniture) {
            const snapped = snapToFurnitureCenter(updated.position, updated.targetFurniture);
            updated.position = snapped;
          }
          // Start performing the interaction
          updated.interactionTimer = 0;
          updated.interactionDuration = rollDuration(updated.currentInteraction) * 60;
          updated.activityAnim = updated.currentInteraction.animation;
          updated.state = STATE.PERFORMING;
          updated.animFrame = 0;
        } else {
          // Random walk — short idle
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

      // Walk animation
      updated.animTimer += deltaTime;
      if (updated.animTimer > 0.125) {
        updated.animTimer = 0;
        updated.animFrame = (updated.animFrame + 1) % 6;
      }
      break;
    }

    // ── PERFORMING ───────────────────────────────────────
    case STATE.PERFORMING: {
      updated.interactionTimer += deltaTime;
      updated.animFrame = 0;  // standing still frame (overridden by activity visuals)

      // Slow idle-style animation while performing (gentle bob)
      updated.animTimer += deltaTime;
      if (updated.animTimer > 0.5) {
        updated.animTimer = 0;
      }

      if (updated.interactionTimer >= updated.interactionDuration) {
        // Done — clear interaction and go back to choosing
        updated.currentInteraction = null;
        updated.activityLabel = null;
        updated.activityAnim = null;
        updated.interactionTimer = 0;
        updated.interactionDuration = 0;
        updated.targetFurniture = null;
        // Reset Y to floor level (step off furniture)
        updated.position = { ...updated.position, y: 0 };
        updated.state = STATE.IDLE;
        updated.idleTimer = 0;
        updated.idleDuration = 1 + Math.random() * 2;
      }
      break;
    }

    // ── IDLE ─────────────────────────────────────────────
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
  }

  return updated;
}

/**
 * Get the initial family members
 */
export function createFamily() {
  return [
    createFamilyMemberState('Dad', 'father', -5, -3),
    createFamilyMemberState('Mom', 'mother', -5, 3),
    createFamilyMemberState('Emma', 'daughter', 3.5, 4),
    createFamilyMemberState('Lily', 'daughter', 4.5, 4),
    createFamilyMemberState('Jack', 'son', 8.5, 3.5)
  ];
}
