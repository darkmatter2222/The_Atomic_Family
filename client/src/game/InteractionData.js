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
