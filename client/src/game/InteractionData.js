/**
 * InteractionData.js  Thin JS wrapper around the master interactions.json.
 *
 * The JSON is the single source of truth for every action, its timing,
 * positioning, animation, and display data.  This module re-exports the
 * catalog and provides the same helper functions the rest of the codebase
 * already depends on.
 */

import catalogData from '../data/interactions.json';

//  Raw data straight from JSON 
export const INTERACTION_CATALOG = catalogData.interactions;
export const CATEGORIES          = catalogData.categories;
export const FURNITURE_ZONES     = catalogData.furnitureZones;
export const POSE_TRANSFORMS     = catalogData.poseTransforms;
export const NEEDS_DEFS          = catalogData.needs;
export const SKILLS_DEFS         = catalogData.skills;
export const RELATIONSHIPS_DEF   = catalogData.relationships;
export const INVENTORY_DEF       = catalogData.inventory;
export const BODY_ANIM_DEFAULTS  = catalogData.bodyAnimDefaults;
export const BODY_ANIM_OVERRIDES = catalogData.bodyAnimOverrides;

//  Derived look-ups 

/** Map from interaction id  interaction object */
export const INTERACTION_MAP = Object.freeze(
  INTERACTION_CATALOG.reduce((map, item) => { map[item.id] = item; return map; }, {})
);

/** Get all interactions that can happen at a given furniture id */
export function getInteractionsForFurniture(furnitureId) {
  return INTERACTION_CATALOG.filter(i => i.furnitureId === furnitureId);
}

/** Get all interactions available in a given room */
export function getInteractionsForRoom(roomId) {
  return INTERACTION_CATALOG.filter(i => i.room === roomId || i.room === '_any');
}

/** Get all interactions a specific role can perform */
export function getInteractionsForRole(role) {
  return INTERACTION_CATALOG.filter(i =>
    i.eligibleRoles === null || i.eligibleRoles.includes(role)
  );
}

/**
 * Filter interactions that are valid right now given the current game hour.
 * Handles time windows that wrap past midnight (e.g. 216).
 */
export function filterByTimeWindow(interactions, gameHour) {
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
export function rollDuration(interaction) {
  const { min, max } = interaction.duration;
  return min + Math.random() * (max - min);
}

/**
 * Get all unique categories in the catalog.
 */
export function getCategories() {
  return Object.keys(CATEGORIES);
}

/**
 * Get icon for a category.
 */
export function getCategoryIcon(category) {
  return CATEGORIES[category]?.icon || '';
}

/**
 * Get color for a category.
 */
export function getCategoryColor(category) {
  return CATEGORIES[category]?.color || '#999';
}

/**
 * Get the furniture zone (positioning rules) for a furniture id.
 */
export function getFurnitureZone(furnitureId) {
  return FURNITURE_ZONES[furnitureId] || null;
}

/**
 * Get the pose transform for an animation type.
 */
export function getPoseTransform(animation) {
  return POSE_TRANSFORMS[animation] || POSE_TRANSFORMS.walk;
}

/**
 * Get the body animation type for an interaction.
 * Checks per-interaction overrides first, then category defaults.
 */
export function getBodyAnimForInteraction(interaction) {
  if (!interaction) return 'stand_use';
  return BODY_ANIM_OVERRIDES[interaction.id]
      || BODY_ANIM_DEFAULTS[interaction.category]
      || 'stand_use';
}

/**
 * Summary statistics for debugging / display.
 */
export function getCatalogStats() {
  const byRoom = {};
  const byCategory = {};
  for (const i of INTERACTION_CATALOG) {
    byRoom[i.room] = (byRoom[i.room] || 0) + 1;
    byCategory[i.category] = (byCategory[i.category] || 0) + 1;
  }
  return {
    totalInteractions: INTERACTION_CATALOG.length,
    byRoom,
    byCategory
  };
}

// ═══════════════════════════════════════════════════════════════════
// Needs / Skills helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Build the initial needs object for a new character.
 * Returns { energy: 100, hunger: 80, ... }
 */
export function createInitialNeeds() {
  const needs = {};
  for (const [key, def] of Object.entries(NEEDS_DEFS)) {
    needs[key] = def.initial;
  }
  return needs;
}

/**
 * Build the initial skills object for a new character.
 * Returns { cooking: 0, handiness: 0, ... }
 */
export function createInitialSkills() {
  const skills = {};
  for (const [key, def] of Object.entries(SKILLS_DEFS)) {
    skills[key] = def.initial;
  }
  return skills;
}

/**
 * Build the initial relationships object for a character.
 * Returns { "Dad:Mom": 80, ... } — all 10 pairs.
 */
export function createInitialRelationships() {
  return { ...RELATIONSHIPS_DEF.defaults };
}

/**
 * Decay all needs by the given number of game-hours elapsed.
 * Applies per-hour decay rates and optional time-of-day modifiers.
 * Clamps to [0, 100].
 *
 * @param {Object} needs      – current needs { energy: 85, ... }
 * @param {number} gameHours  – number of game-hours elapsed since last tick
 * @param {number} currentHour – current game hour (0-24) for decay modifiers
 * @returns {Object} updated needs (new object)
 */
export function decayNeeds(needs, gameHours, currentHour) {
  const updated = { ...needs };
  for (const [key, def] of Object.entries(NEEDS_DEFS)) {
    let rate = def.decayPerHour;

    // Apply time-of-day modifiers  (e.g. "14-16": 1.5)
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

/**
 * Apply an interaction's needs effects (called once when interaction completes, or
 * gradually during PERFORMING via fraction).
 *
 * @param {Object} needs       – current needs
 * @param {Object} needsEffects – from interaction.needsEffects  { hunger: 40, energy: -5, ... }
 * @param {number} fraction    – 0-1, how much of the effect to apply (1 = full)
 * @returns {Object} updated needs
 */
export function applyNeedsEffects(needs, needsEffects, fraction = 1) {
  if (!needsEffects) return needs;
  const updated = { ...needs };
  for (const [key, amount] of Object.entries(needsEffects)) {
    if (updated[key] !== undefined) {
      updated[key] = Math.max(0, Math.min(100, updated[key] + amount * fraction));
    }
  }
  return updated;
}

/**
 * Apply an interaction's skill effects.
 *
 * @param {Object} skills       – current skills
 * @param {Object} skillEffects – from interaction.skillEffects { cooking: 0.3, ... }
 * @param {number} fraction     – 0-1
 * @returns {Object} updated skills
 */
export function applySkillEffects(skills, skillEffects, fraction = 1) {
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

/**
 * Get the lowest need (the one most in danger).
 * Returns { key, value, def }.
 */
export function getLowestNeed(needs) {
  let lowest = null;
  for (const [key, value] of Object.entries(needs)) {
    if (!lowest || value < lowest.value) {
      lowest = { key, value, def: NEEDS_DEFS[key] };
    }
  }
  return lowest;
}

/**
 * Get needs that are critically low (below threshold).
 * @param {Object} needs
 * @param {number} threshold – default 20
 * @returns {Array<{key, value, def}>}
 */
export function getCriticalNeeds(needs, threshold = 20) {
  const critical = [];
  for (const [key, value] of Object.entries(needs)) {
    if (value < threshold) {
      critical.push({ key, value, def: NEEDS_DEFS[key] });
    }
  }
  return critical.sort((a, b) => a.value - b.value);
}
