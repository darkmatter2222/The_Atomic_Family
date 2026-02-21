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
/**
 * Attention span multipliers per character.
 * Per goals.md: Jack cycles activities every 15-20 minutes (short attention).
 * Adults sustain longer activities. Emma hyperfocuses on art/reading.
 */
const ATTENTION_SPAN = {
  Dad:  { default: 1.0, work: 1.2, fix: 1.3 },           // Patient, focused worker
  Mom:  { default: 1.0, cooking: 1.1, gardening: 1.2 },   // Steady, multitasker
  Emma: { default: 0.85, creative: 1.4, reading: 1.5, social: 0.7 }, // Hyperfocus on interests, low patience for socializing
  Lily: { default: 0.8, creative: 1.1, playing: 0.9 },    // Good attention for age, art-focused
  Jack: { default: 0.55, active: 0.7, fun: 0.65, eating: 0.5 }, // 15-20 min attention span = ~0.55x of normal durations
};

function rollDuration(interaction, characterName = null) {
  const { min, max } = interaction.duration;
  let base = min + Math.random() * (max - min);

  if (characterName && ATTENTION_SPAN[characterName]) {
    const spans = ATTENTION_SPAN[characterName];
    const cat = interaction.category;
    const multiplier = spans[cat] || spans.default || 1.0;
    base *= multiplier;
  }

  return base;
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

// ═══════════════════════════════════════════════════════════════════
// Per-character decay rate multipliers (from goals.md)
//
// Each multiplier adjusts the base decayPerHour for that need.
// > 1.0 = decays faster, < 1.0 = decays slower.
//
// Based on: metabolism (fast/moderate), energyStyle, personality quirks
// ═══════════════════════════════════════════════════════════════════
const CHARACTER_DECAY_MULTIPLIERS = {
  Dad: {
    energy:   0.85,  // steady — decays slowly, crashes only at very low levels
    hunger:   0.80,  // work suppresses hunger during work hours (handled below too)
    hygiene:  1.0,   // normal — showers every morning without fail
    bladder:  1.0,   // methodical, normal
    fun:      0.9,   // finds satisfaction in fixing things, dry humor sustains him
    social:   0.9,   // introverted-moderate, social drains slower
    comfort:  0.85,  // stoic, doesn't notice discomfort easily
    hydration: 1.0,
    // Special: during work hours (8-17), hunger decays 40% slower
    _workHourHungerMultiplier: 0.6,
  },
  Mom: {
    energy:   1.15,  // bursts-and-crashes — drains faster, crashes dramatic
    hunger:   0.70,  // self-neglecting — forgets to eat, decay seems lower but she just ignores it
    hygiene:  1.1,   // identity-based — FEELS dirtier faster because it matters more to her
    bladder:  1.0,   // normal
    fun:      1.15,  // rare moments of fun, decays fast under chore burden
    social:   1.2,   // needs adult conversation specifically, kid interaction barely helps
    comfort:  1.0,   // aware but pushes through
    hydration: 1.0,
  },
  Emma: {
    energy:   1.0,   // normal base, but night-owl modifier handled by time-of-day
    hunger:   0.75,  // distracted — barely notices hunger when absorbed in activities
    hygiene:  0.85,  // independent — doesn't feel dirty as fast (or doesn't care)
    bladder:  1.0,   // normal
    fun:      1.2,   // needs stimulation, boredom hits fast for a teen
    social:   0.7,   // introvert — social need drains much slower
    comfort:  1.05,  // particular about personal space
    hydration: 0.9,
    // Special: energy decays 30% slower after 8 PM (night owl energy)
    _nightOwlEnergyMultiplier: 0.7,
  },
  Lily: {
    energy:   1.0,   // gentle, normal pace
    hunger:   1.1,   // emotional eater — hunger feels more intense to her
    hygiene:  0.9,   // enjoys baths, doesn't mind getting a bit messy during play
    bladder:  1.0,   // normal
    fun:      0.85,  // imaginative — creates her own fun, drains slower
    social:   1.3,   // mommy-dependent — social need drains FAST, especially without Mom
    comfort:  1.0,   // sensitive — but 1.3 caused zero-comfort by evening hours every day
    hydration: 1.0,
  },
  Jack: {
    energy:   1.3,   // explosive — burns through energy fast
    hunger:   1.4,   // fast metabolism + always thinks he's starving
    hygiene:  0.6,   // zero awareness — doesn't decay meaningfully because he never cared
    bladder:  0.7,   // ignores it — effectively lower perceived decay until emergency
    fun:      1.4,   // constant need — boredom is his worst enemy, drains fastest
    social:   1.3,   // desperate for attention — drains fast when alone
    comfort:  0.5,   // oblivious — doesn't notice discomfort at all
    hydration: 1.2,  // active kid, dehydrates faster
  },
};

/**
 * Decay all needs by the given number of game-hours elapsed.
 * Optional characterName enables per-character decay rate modifiers.
 */
function decayNeeds(needs, gameHours, currentHour, characterName) {
  const updated = { ...needs };
  const charMods = characterName ? CHARACTER_DECAY_MULTIPLIERS[characterName] : null;

  for (const [key, def] of Object.entries(NEEDS_DEFS)) {
    let rate = def.decayPerHour;

    // Time-of-day modifiers from interactions.json
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

    // Per-character base multiplier
    if (charMods && charMods[key] !== undefined) {
      rate *= charMods[key];
    }

    // Special per-character conditional modifiers
    if (charMods) {
      // Dad: work hours suppress hunger further
      if (characterName === 'Dad' && key === 'hunger' &&
          currentHour >= 8 && currentHour < 17) {
        rate *= charMods._workHourHungerMultiplier || 1;
      }
      // Emma: night owl energy — slower energy decay after 8 PM
      if (characterName === 'Emma' && key === 'energy' && currentHour >= 20) {
        rate *= charMods._nightOwlEnergyMultiplier || 1;
      }
    }

    updated[key] = Math.max(0, Math.min(100, (updated[key] ?? def.initial) - rate * gameHours));
  }
  return updated;
}

function applyNeedsEffects(needs, needsEffects, fraction = 1, options = {}) {
  if (!needsEffects) return needs;
  const updated = { ...needs };
  for (const [key, amount] of Object.entries(needsEffects)) {
    if (updated[key] !== undefined) {
      let adjustedAmount = amount;

      // ── Diminishing returns on fun (goals.md: repetition kills fun) ──
      // If fun is being gained and we have repetition info, reduce gains
      if (key === 'fun' && amount > 0 && options.recentCategories && options.currentCategory) {
        const repeatCount = options.recentCategories.filter(c => c === options.currentCategory).length;
        // 1st time: 100%, 2nd: 75%, 3rd: 50%, 4th+: 30%
        const diminishingFactor = repeatCount === 0 ? 1.0
          : repeatCount === 1 ? 0.75
          : repeatCount === 2 ? 0.50
          : 0.30;
        adjustedAmount = amount * diminishingFactor;
      }

      // ── Meal quality scaling (goals.md: home-cooked > microwave > cold snack) ──
      if (key === 'hunger' && amount > 0 && options.mealQuality) {
        const qualityMultipliers = {
          'home_cooked': 1.3,  // Full home-cooked meal: 130% satisfaction
          'grilled':     1.25, // Dad's grilling: 125%
          'reheated':    0.85, // Microwave/leftovers: 85%
          'cold':        0.70, // Cold snack: 70%
          'junk':        0.60, // Junk food: 60% (fills but doesn't satisfy)
        };
        const mult = qualityMultipliers[options.mealQuality] || 1.0;
        adjustedAmount = amount * mult;
      }

      updated[key] = Math.max(0, Math.min(100, updated[key] + adjustedAmount * fraction));
    }
  }

  // ── Bladder acceleration from drinks (goals.md: +5 after drinks, +8 after coffee) ──
  if (options.isDrink && updated.bladder !== undefined) {
    const bladderHit = options.isCoffee ? -8 : -5; // Negative = filling bladder faster
    updated.bladder = Math.max(0, updated.bladder + bladderHit);
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
