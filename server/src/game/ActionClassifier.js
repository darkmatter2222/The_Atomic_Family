/**
 * ActionClassifier.js — Rule-based classification of freeform action descriptions
 * into executable game actions.
 *
 * When the LLM uses createAction("description"), this module determines:
 *   - id: A unique ephemeral action ID
 *   - label: Human-readable activity label for UI
 *   - room: Which room this happens in (or '_any')
 *   - duration: { min, max } in game minutes
 *   - animation: Sprite pose ('use', 'sit', 'walk', 'sleep')
 *   - category: Grouping tag for needs/display
 *   - needsEffects: What needs this affects
 *   - icon: Emoji for activity bubble
 *
 * This is a fast, deterministic classifier — no LLM call needed.
 * The goals.md action classification temperature is 0.2 (parsing task),
 * but we do it entirely rule-based for zero latency.
 */

// ── Keyword → Category mapping ──────────────────────────────────

const CATEGORY_KEYWORDS = {
  cooking: ['cook', 'bake', 'fry', 'grill', 'prepare food', 'make dinner', 'make lunch', 'make breakfast', 'recipe', 'chop', 'stir', 'season', 'roast', 'boil', 'simmer'],
  eating: ['eat', 'snack', 'drink', 'sip', 'taste', 'munch', 'chew', 'devour', 'have a bite'],
  hygiene: ['wash hands', 'brush teeth', 'shower', 'take a bath', 'bath time', 'clean up myself', 'floss', 'grooming', 'comb hair', 'shave'],
  chores: ['clean', 'sweep', 'mop', 'vacuum', 'dust', 'organize', 'tidy', 'laundry', 'fold clothes', 'iron clothes', 'scrub', 'wipe', 'dishes', 'trash', 'sort'],
  sleeping: ['sleep', 'nap', 'rest in bed', 'lie down', 'doze', 'close my eyes'],
  entertainment: ['watch tv', 'watch movie', 'video game', 'play games', 'play cards', 'board game', 'puzzle', 'lego', 'play with toy'],
  creative: ['draw', 'paint', 'sketch', 'color', 'craft', 'build', 'make art', 'write', 'journal', 'sculpt', 'origami', 'knit', 'sew', 'doodle', 'fort', 'puppet', 'stack', 'create', 'invent', 'decorate', 'design'],
  social: ['talk to', 'chat with', 'tell a story', 'teach', 'show someone', 'hug', 'cuddle', 'tickle', 'play together', 'play with', 'read aloud', 'sing together', 'dance together', 'help with'],
  music: ['guitar', 'piano', 'sing a song', 'hum a tune', 'listen to music', 'play music', 'dance', 'song', 'melody', 'whistle'],
  reading: ['read a book', 'read book', 'magazine', 'comic', 'browse phone', 'study', 'do homework'],
  exercise: ['exercise', 'stretch', 'yoga', 'push-up', 'sit-up', 'jog', 'jump', 'workout', 'run around'],
  relaxing: ['relax', 'sit quietly', 'daydream', 'stare out', 'meditate', 'zone out', 'chill', 'unwind', 'lay on the couch', 'take it easy'],
  outdoor: ['garden', 'water plants', 'mow', 'rake', 'play outside', 'swing set', 'trampoline', 'play catch', 'throw ball', 'kick ball', 'chalk', 'blow bubbles', 'splash'],
  work: ['work on', 'check email', 'computer work', 'type', 'program', 'code', 'spreadsheet', 'meeting', 'phone call'],
};

// ── Category → Default properties ──────────────────────────────

const CATEGORY_DEFAULTS = {
  cooking:       { animation: 'use', icon: '🍳', duration: { min: 10, max: 25 }, needs: { hunger: 5, energy: -3, fun: 2 } },
  eating:        { animation: 'sit', icon: '🍽️', duration: { min: 5, max: 15 },  needs: { hunger: 15, energy: 3 } },
  hygiene:       { animation: 'use', icon: '🚿', duration: { min: 5, max: 15 },  needs: { hygiene: 20, energy: -2 } },
  chores:        { animation: 'use', icon: '🧹', duration: { min: 10, max: 30 }, needs: { energy: -5, comfort: 3 } },
  sleeping:      { animation: 'sleep', icon: '💤', duration: { min: 30, max: 120 }, needs: { energy: 40, comfort: 10 } },
  entertainment: { animation: 'sit', icon: '🎮', duration: { min: 15, max: 45 }, needs: { fun: 15, energy: -2, social: 3 } },
  creative:      { animation: 'use', icon: '🎨', duration: { min: 15, max: 45 }, needs: { fun: 12, energy: -3 } },
  social:        { animation: 'use', icon: '💬', duration: { min: 5, max: 20 },  needs: { social: 15, fun: 5 } },
  music:         { animation: 'use', icon: '🎵', duration: { min: 10, max: 30 }, needs: { fun: 12, social: 5, energy: -2 } },
  reading:       { animation: 'sit', icon: '📖', duration: { min: 15, max: 45 }, needs: { fun: 10, energy: -2 } },
  exercise:      { animation: 'use', icon: '💪', duration: { min: 10, max: 30 }, needs: { energy: -10, fun: 8, hygiene: -5 } },
  relaxing:      { animation: 'sit', icon: '😌', duration: { min: 5, max: 20 },  needs: { energy: 5, comfort: 8 } },
  outdoor:       { animation: 'use', icon: '🌳', duration: { min: 15, max: 45 }, needs: { fun: 15, energy: -5, social: 5 } },
  work:          { animation: 'sit', icon: '💻', duration: { min: 20, max: 60 }, needs: { energy: -8, fun: -3 } },
};

// ── Room detection keywords ─────────────────────────────────────

const ROOM_KEYWORDS = {
  kitchen:              ['kitchen', 'cook', 'fridge', 'stove', 'oven', 'microwave', 'pantry', 'counter', 'dish'],
  living_room:          ['living room', 'couch', 'sofa', 'tv', 'television', 'cushion', 'loveseat', 'coffee table'],
  bedroom_master:       ['master bedroom', 'our bedroom', 'parent', 'office nook', 'mom and dad'],
  bedroom_kids_shared:  ['kids room', 'shared room', 'toy', 'bunk bed', 'lily.*room', 'jack.*room'],
  bedroom_kids_single:  ['emma.*room', 'my room', 'teen room', 'single bedroom'],
  bathroom:             ['bathroom', 'shower', 'bath', 'toilet', 'sink', 'mirror', 'brush teeth'],
  laundry:              ['laundry', 'washer', 'dryer', 'iron', 'fold'],
  garage:               ['garage', 'workshop', 'tool', 'workbench', 'sawdust'],
  hallway:              ['hallway', 'corridor', 'hall'],
  backyard:             ['backyard', 'garden', 'yard', 'outside', 'porch', 'grill', 'swing', 'trampoline'],
};

// ── Counter for unique ephemeral IDs ────────────────────────────

let _ephemeralCounter = 0;

/**
 * Classify a freeform action description into a structured game action.
 *
 * @param {string} description - The freeform action description from createAction()
 * @param {string} [currentRoom] - The character's current room (used as fallback)
 * @returns {object} A classified action object compatible with the game engine
 */
function classifyCreatedAction(description, currentRoom) {
  const lower = description.toLowerCase();
  _ephemeralCounter++;

  // ── Determine category ──
  let bestCategory = 'relaxing'; // default fallback
  let bestScore = 0;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      // Use leading word-boundary matching to prevent mid-word false positives
      // e.g., "using" should not match "sing", but "puppets" SHOULD match "puppet"
      try {
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}`, 'i');
        if (regex.test(lower)) score += kw.length;
      } catch (_) {
        if (lower.includes(kw)) score += kw.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = cat;
    }
  }

  // ── Determine room ──
  let detectedRoom = currentRoom || '_any';
  let roomScore = 0;
  for (const [room, keywords] of Object.entries(ROOM_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      // Support regex patterns in keywords
      try {
        if (new RegExp(kw).test(lower)) score += kw.length;
      } catch (_) {
        if (lower.includes(kw)) score += kw.length;
      }
    }
    if (score > roomScore) {
      roomScore = score;
      detectedRoom = room;
    }
  }
  // If no room keywords matched, stay in current room
  if (roomScore === 0) detectedRoom = currentRoom || '_any';

  // ── Get category defaults ──
  const defaults = CATEGORY_DEFAULTS[bestCategory] || CATEGORY_DEFAULTS.relaxing;

  // ── Build a clean label (truncate to 40 chars) ──
  let label = description;
  if (label.length > 40) {
    label = label.substring(0, 37) + '...';
  }
  // Capitalize first letter
  label = label.charAt(0).toUpperCase() + label.slice(1);

  // ── Detect social aspect (involves another person) ──
  const socialPatterns = /\b(with|together|teach|show|tell|play with|help|hug|cuddle|tickle)\b/i;
  const isSocial = socialPatterns.test(description);
  const needsEffects = { ...defaults.needs };
  if (isSocial && !needsEffects.social) {
    needsEffects.social = 8;
  }

  // ── Build ephemeral action ID ──
  const sanitizedDesc = lower
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 30);
  const id = `created_${sanitizedDesc}_${_ephemeralCounter}`;

  return {
    id,
    label,
    room: detectedRoom,
    duration: { ...defaults.duration },
    animation: defaults.animation,
    category: bestCategory,
    priority: 5,
    icon: defaults.icon,
    needsEffects,
    description,
    isCreatedAction: true,
    furnitureId: null, // No specific furniture — perform in place
    eligibleRoles: null,
    timeWindow: null,
    poseTransform: null,
    skillEffects: {},
  };
}

/**
 * Get statistics about created action usage.
 * Useful for seeing what kinds of creative actions characters invent.
 */
const _createdActionLog = [];

function logCreatedAction(characterName, description, classified) {
  _createdActionLog.push({
    character: characterName,
    description,
    category: classified.category,
    room: classified.room,
    timestamp: Date.now(),
  });
  // Keep last 100
  if (_createdActionLog.length > 100) _createdActionLog.shift();
}

function getCreatedActionStats() {
  return {
    total: _createdActionLog.length,
    byCategory: _groupBy(_createdActionLog, 'category'),
    byCharacter: _groupBy(_createdActionLog, 'character'),
    recent: _createdActionLog.slice(-10),
  };
}

function _groupBy(arr, key) {
  return arr.reduce((map, item) => {
    const k = item[key];
    map[k] = (map[k] || 0) + 1;
    return map;
  }, {});
}

module.exports = {
  classifyCreatedAction,
  logCreatedAction,
  getCreatedActionStats,
  CATEGORY_KEYWORDS,
  CATEGORY_DEFAULTS,
};
