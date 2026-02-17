/**
 * InteractionData.js (server-side) — CommonJS wrapper around interactions.json.
 *
 * Provides the same helper functions as the client version but uses require()
 * for JSON loading and module.exports for CommonJS.
 */

const catalogData = require('../data/interactions.json');

// Raw data straight from JSON
const INTERACTION_CATALOG = catalogData.interactions;
const CATEGORIES          = catalogData.categories;
const FURNITURE_ZONES     = catalogData.furnitureZones;
const POSE_TRANSFORMS     = catalogData.poseTransforms;
const NEEDS_DEFS          = catalogData.needs;
const SKILLS_DEFS         = catalogData.skills;
const RELATIONSHIPS_DEF   = catalogData.relationships;
const INVENTORY_DEF       = catalogData.inventory;
const BODY_ANIM_DEFAULTS  = catalogData.bodyAnimDefaults;
const BODY_ANIM_OVERRIDES = catalogData.bodyAnimOverrides;

// Derived look-ups

/** Map from interaction id → interaction object */
const INTERACTION_MAP = Object.freeze(
  INTERACTION_CATALOG.reduce((map, item) => { map[item.id] = item; return map; }, {})
);

/** Get all interactions that can happen at a given furniture id */
function getInteractionsForFurniture(furnitureId) {
  return INTERACTION_CATALOG.filter(i => i.furnitureId === furnitureId);
}

/** Get all interactions available in a given room */
function getInteractionsForRoom(roomId) {
  return INTERACTION_CATALOG.filter(i => i.room === roomId || i.room === '_any');
}

/** Get all interactions a specific role can perform */
function getInteractionsForRole(role) {
  return INTERACTION_CATALOG.filter(i =>
    i.eligibleRoles === null || i.eligibleRoles.includes(role)
  );
}

/**
 * Filter interactions that are valid right now given the current game hour.
 */
function filterByTimeWindow(interactions, gameHour) {
  return interactions.filter(i => {
    if (!i.timeWindow) return true;
    const { start, end } = i.timeWindow;
    if (start < end) {
      return gameHour >= start && gameHour < end;
    } else {
      return gameHour >= start || gameHour < end;
    }
  });
}

/**
 * Pick a random duration (in game minutes) from the interaction's range.
 */
function rollDuration(interaction) {
  const { min, max } = interaction.duration;
  return min + Math.random() * (max - min);
}

function getCategories() {
  return Object.keys(CATEGORIES);
}

function getCategoryIcon(category) {
  return CATEGORIES[category]?.icon || '';
}

function getCategoryColor(category) {
  return CATEGORIES[category]?.color || '#999';
}

function getFurnitureZone(furnitureId) {
  return FURNITURE_ZONES[furnitureId] || null;
}

function getPoseTransform(animation) {
  return POSE_TRANSFORMS[animation] || POSE_TRANSFORMS.walk;
}

function getBodyAnimForInteraction(interaction) {
  if (!interaction) return 'stand_use';
  return BODY_ANIM_OVERRIDES[interaction.id]
      || BODY_ANIM_DEFAULTS[interaction.category]
      || 'stand_use';
}

function getCatalogStats() {
  const byRoom = {};
  const byCategory = {};
  for (const i of INTERACTION_CATALOG) {
    byRoom[i.room] = (byRoom[i.room] || 0) + 1;
    byCategory[i.category] = (byCategory[i.category] || 0) + 1;
  }
  return { totalInteractions: INTERACTION_CATALOG.length, byRoom, byCategory };
}

// ═══════════════════════════════════════════════════════════════════
// Needs / Skills helpers
// ═══════════════════════════════════════════════════════════════════

function createInitialNeeds() {
  const needs = {};
  for (const [key, def] of Object.entries(NEEDS_DEFS)) {
    needs[key] = def.initial;
  }
  return needs;
}

function createInitialSkills() {
  const skills = {};
  for (const [key, def] of Object.entries(SKILLS_DEFS)) {
    skills[key] = def.initial;
  }
  return skills;
}

function createInitialRelationships() {
  return { ...RELATIONSHIPS_DEF.defaults };
}

/**
 * Decay all needs by the given number of game-hours elapsed.
 */
function decayNeeds(needs, gameHours, currentHour) {
  const updated = { ...needs };
  for (const [key, def] of Object.entries(NEEDS_DEFS)) {
    let rate = def.decayPerHour;

    if (def.decayModifiers) {
      for (const [range, multiplier] of Object.entries(def.decayModifiers)) {
        const [start, end] = range.split('-').map(Number);
        if (start < end) {
          if (currentHour >= start && currentHour < end) rate *= multiplier;
        } else {
          if (currentHour >= start || currentHour < end) rate *= multiplier;
        }
      }
    }

    updated[key] = Math.max(0, Math.min(100, (updated[key] ?? def.initial) - rate * gameHours));
  }
  return updated;
}

function applyNeedsEffects(needs, needsEffects, fraction = 1) {
  if (!needsEffects) return needs;
  const updated = { ...needs };
  for (const [key, amount] of Object.entries(needsEffects)) {
    if (updated[key] !== undefined) {
      updated[key] = Math.max(0, Math.min(100, updated[key] + amount * fraction));
    }
  }
  return updated;
}

function applySkillEffects(skills, skillEffects, fraction = 1) {
  if (!skillEffects) return skills;
  const updated = { ...skills };
  for (const [key, amount] of Object.entries(skillEffects)) {
    const max = SKILLS_DEFS[key]?.max || 10;
    if (updated[key] !== undefined) {
      updated[key] = Math.min(max, updated[key] + amount * fraction);
    }
  }
  return updated;
}

function getLowestNeed(needs) {
  let lowest = null;
  for (const [key, value] of Object.entries(needs)) {
    if (!lowest || value < lowest.value) {
      lowest = { key, value, def: NEEDS_DEFS[key] };
    }
  }
  return lowest;
}

function getCriticalNeeds(needs, threshold = 20) {
  const critical = [];
  for (const [key, value] of Object.entries(needs)) {
    if (value < threshold) {
      critical.push({ key, value, def: NEEDS_DEFS[key] });
    }
  }
  return critical.sort((a, b) => a.value - b.value);
}

module.exports = {
  INTERACTION_CATALOG,
  INTERACTION_MAP,
  CATEGORIES,
  FURNITURE_ZONES,
  POSE_TRANSFORMS,
  NEEDS_DEFS,
  SKILLS_DEFS,
  RELATIONSHIPS_DEF,
  INVENTORY_DEF,
  BODY_ANIM_DEFAULTS,
  BODY_ANIM_OVERRIDES,
  getInteractionsForFurniture,
  getInteractionsForRoom,
  getInteractionsForRole,
  filterByTimeWindow,
  rollDuration,
  getCategories,
  getCategoryIcon,
  getCategoryColor,
  getFurnitureZone,
  getPoseTransform,
  getBodyAnimForInteraction,
  getCatalogStats,
  createInitialNeeds,
  createInitialSkills,
  createInitialRelationships,
  decayNeeds,
  applyNeedsEffects,
  applySkillEffects,
  getLowestNeed,
  getCriticalNeeds,
};
