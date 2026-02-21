/**
 * MemoryManager.js — Personality-filtered, emotionally-weighted memory.
 *
 * Wraps and enhances PersonaManager's basic memory system with:
 *   - Emotional persistence: traumatic/joyful events stick longer
 *   - Asymmetric recall: Emma remembers snapping at Jack; Jack forgot
 *   - Personality filtering: what you REMEMBER is shaped by who you are
 *   - Sliding window: different recall on different cycles
 *   - First-person narration: memories described as felt experience
 *
 * Per goals.md:
 *   "Memory isn't a database — it's a story you tell yourself.
 *    And you edit it every time you tell it."
 *
 * CommonJS module (server-side).
 */

const { getPersona, addMemory } = require('./PersonaManager');

// ── Memory emotional weights ────────────────────────────────────
// High-emotion memories persist longer. Low-emotion ones fade fast.
const EMOTION_PERSISTENCE = {
  joy:          { weight: 1.4, fadeRate: 0.8 },
  love:         { weight: 1.6, fadeRate: 0.7 },
  pride:        { weight: 1.3, fadeRate: 0.9 },
  amusement:    { weight: 1.1, fadeRate: 1.0 },
  guilt:        { weight: 1.8, fadeRate: 0.5 },  // guilt lingers
  shame:        { weight: 1.7, fadeRate: 0.6 },
  anger:        { weight: 1.5, fadeRate: 0.9 },
  frustration:  { weight: 1.2, fadeRate: 1.1 },
  sadness:      { weight: 1.4, fadeRate: 0.7 },
  fear:         { weight: 1.6, fadeRate: 0.6 },
  embarrassment:{ weight: 1.5, fadeRate: 0.8 },
  boredom:      { weight: 0.5, fadeRate: 2.0 },   // boring stuff forgotten fast
  neutral:      { weight: 1.0, fadeRate: 1.0 },
  contentment:  { weight: 0.8, fadeRate: 1.2 },
};

// ── Per-character memory personality ────────────────────────────
// How each character PROCESSES and STORES memories.
const MEMORY_PERSONALITY = {
  Dad: {
    style: 'practical',
    desc: 'You remember what happened, not so much how you felt about it. Facts first, emotions second.',
    retention: {
      positive: 1.0,   // remembers positive stuff normally
      negative: 0.8,   // lets go of negative stuff slightly faster
      mundane: 0.6,    // forgets routine quickly
    },
    bias: 'Tend to remember solutions and outcomes. Forget the emotional buildup.',
    quirk: 'Can recall exactly which tool was used for which repair but not what the argument was about.',
  },
  Mom: {
    style: 'emotional-cataloger',
    desc: 'You remember EVERYTHING, especially the emotional texture. Who said what, how they looked when they said it, what it meant.',
    retention: {
      positive: 1.3,   // cherishes good moments
      negative: 1.5,   // negative events lodge deep
      mundane: 0.8,    // even routine stuff has emotional color
    },
    bias: 'Remembers tone and context that others miss. Also carries grudges longer than she admits.',
    quirk: 'Remembers that Jack smiled when he picked those dandelions last Tuesday. Remembers that Emma rolled her eyes at 3:47 PM.',
  },
  Emma: {
    style: 'selective-intense',
    desc: 'You remember things that matter to YOU with vivid clarity. Everything else is a blur.',
    retention: {
      positive: 1.1,
      negative: 1.4,   // negative emotions stick — teen angst
      mundane: 0.3,    // boring stuff? what boring stuff?
    },
    bias: 'Remembers perceived injustice with legal precision. Forgets that you were late to breakfast.',
    quirk: 'Can tell you exactly what Mom said three days ago that was "unfair" but not what she had for lunch.',
  },
  Lily: {
    style: 'vivid-but-fleeting',
    desc: 'Everything is BIG when it happens. Massive joy, massive sadness, massive anger. But it fades and the world resets.',
    retention: {
      positive: 1.0,
      negative: 0.6,   // bounces back fast
      mundane: 0.4,    // attention span of a butterfly
    },
    bias: 'Living in the present. Yesterday is a long time ago. But REALLY big feelings leave marks.',
    quirk: 'Still remembers the time the butterfly landed on her hand (3 weeks ago) but not yesterday\'s argument with Jack.',
  },
  Jack: {
    style: 'goldfish-with-exceptions',
    desc: 'What happened five minutes ago? ANCIENT HISTORY. Unless it was REALLY COOL or REALLY SCARY.',
    retention: {
      positive: 0.7,
      negative: 0.4,   // forgets fast, barely holds grudges
      mundane: 0.2,    // what? nothing happened
    },
    bias: 'Life began ten minutes ago. Every moment is new. Why are you still talking about that thing from this morning?',
    quirk: 'Remembers that time he almost caught a frog (2 weeks ago) with PERFECT CLARITY. Forgot he made Lily cry an hour ago.',
  },
};

/**
 * Record a memory with emotional weighting appropriate to the character.
 *
 * This wraps PersonaManager.addMemory() but processes the emotional
 * significance through the character's memory personality first.
 *
 * @param {object} personaState - Character's persona state
 * @param {string} type - Memory type (event, observation, thought, emotion, social, decision)
 * @param {string} content - What happened (plain description)
 * @param {string} emotion - Emotional tone (joy, guilt, anger, etc.)
 * @param {object} [context] - Additional context { involvedCharacters, location, importance }
 * @returns {object} The stored memory object
 */
function recordMemory(personaState, type, content, emotion = 'neutral', context = {}) {
  const name = personaState.name;
  const memPersonality = MEMORY_PERSONALITY[name] || MEMORY_PERSONALITY.Dad;
  const emotionMeta = EMOTION_PERSISTENCE[emotion] || EMOTION_PERSISTENCE.neutral;

  // Calculate effective importance
  let baseImportance = context.importance || 3;

  // Adjust by emotion weight
  baseImportance *= emotionMeta.weight;

  // Adjust by character's retention style
  const sentimentType = _classifySentiment(emotion);
  const retentionMultiplier = memPersonality.retention[sentimentType] || 1.0;
  baseImportance *= retentionMultiplier;

  // Clamp to 1-5 range
  const finalImportance = Math.max(1, Math.min(5, Math.round(baseImportance)));

  // Enrich the memory with emotional metadata
  const enrichedMemory = {
    timestamp: Date.now(),
    type,
    content,
    emotion,
    emotionIntensity: emotionMeta.weight,
    fadeRate: emotionMeta.fadeRate,
    importance: finalImportance,
    involvedCharacters: context.involvedCharacters || [],
    location: context.location || null,
  };

  // Store using PersonaManager's addMemory (which handles trimming)
  addMemory(personaState, type, content, finalImportance);

  // Also store in an extended memory if available
  if (!personaState.emotionalMemories) personaState.emotionalMemories = [];
  personaState.emotionalMemories.push(enrichedMemory);

  // Trim extended memories
  if (personaState.emotionalMemories.length > 80) {
    personaState.emotionalMemories = _trimMemories(
      personaState.emotionalMemories,
      60,
      memPersonality
    );
  }

  return enrichedMemory;
}

/**
 * Record a social interaction memory — stored for BOTH participants
 * but with asymmetric emotional processing.
 *
 * @param {object} subjectState - Character who did/said something
 * @param {object} targetState - Character who received/witnessed it
 * @param {string} description - What happened
 * @param {string} subjectEmotion - How subject felt about it
 * @param {string} targetEmotion - How target felt about it
 * @param {object} [context] - Additional context
 */
function recordSocialMemory(subjectState, targetState, description, subjectEmotion, targetEmotion, context = {}) {
  // Subject remembers from their perspective
  recordMemory(
    subjectState,
    'social',
    description,
    subjectEmotion,
    { ...context, involvedCharacters: [targetState.name] }
  );

  // Target remembers from THEIR perspective — possibly different emotion
  recordMemory(
    targetState,
    'social',
    description,
    targetEmotion,
    { ...context, involvedCharacters: [subjectState.name] }
  );
}

/**
 * Narrate memories as a first-person felt experience for the LLM prompt.
 *
 * This isn't a log — it's how the character REMEMBERS their recent past,
 * filtered through personality.
 *
 * @param {object} personaState - Character state
 * @param {number} maxEntries - How many memories to include
 * @returns {string} First-person memory narrative
 */
function narrateMemories(personaState, maxEntries = 12, currentMood = null) {
  const name = personaState.name;
  const memPersonality = MEMORY_PERSONALITY[name] || MEMORY_PERSONALITY.Dad;
  const memories = personaState.emotionalMemories || personaState.memories || [];

  if (memories.length === 0) {
    return `WHAT'S ON YOUR MIND:\n${_getEmptyMemoryFlavor(name)}`;
  }

  // Determine current mood sentiment for mood-congruent recall
  // (goals.md: when angry, grievances surface; when happy, positive memories surface)
  const moodSentiment = currentMood ? _classifySentiment(currentMood) : null;

  // Score and sort memories by salience (importance × recency × personality × mood)
  const scored = memories.map(m => {
    const ageMinutes = (Date.now() - m.timestamp) / 60000;
    const ageHours = ageMinutes / 60;
    const fadeRate = m.fadeRate || 1.0;

    // Recency score drops with age, faster for high-fadeRate memories
    const recencyScore = Math.exp(-ageHours * fadeRate * 0.3);

    // Importance is base importance boosted by emotion intensity
    const importanceScore = (m.importance || 3) * (m.emotionIntensity || 1.0);

    // Character personality modifier
    const sentimentType = _classifySentiment(m.emotion);
    const personalityBoost = memPersonality.retention[sentimentType] || 1.0;

    // ── Mood-congruent recall bias ──
    // Current mood colors which memories surface — angry people recall slights,
    // happy people recall good times.
    let moodCongruence = 1.0;
    if (moodSentiment) {
      if (sentimentType === moodSentiment) {
        moodCongruence = 1.4; // Same-valence memories surface more easily
      } else if (
        (moodSentiment === 'positive' && sentimentType === 'negative') ||
        (moodSentiment === 'negative' && sentimentType === 'positive')
      ) {
        moodCongruence = 0.65; // Opposite-valence memories suppressed
      }
    }

    // Random jitter — memory is imperfect, different things surface each time
    const jitter = 0.8 + Math.random() * 0.4;

    return {
      memory: m,
      salience: recencyScore * importanceScore * personalityBoost * moodCongruence * jitter,
    };
  });

  // Sort by salience and take top N
  scored.sort((a, b) => b.salience - a.salience);
  const topMemories = scored.slice(0, maxEntries);

  // Re-sort by timestamp for chronological narration
  topMemories.sort((a, b) => a.memory.timestamp - b.memory.timestamp);

  const lines = [`WHAT'S ON YOUR MIND (what you remember, how it felt):`];
  lines.push(`(${memPersonality.desc})`);
  if (currentMood && currentMood !== 'neutral') {
    lines.push(`(Current mood: ${currentMood} — this colors what surfaces)`);
  }

  for (const { memory } of topMemories) {
    const ageMinutes = (Date.now() - memory.timestamp) / 60000;
    const timeLabel = _getTimeLabel(ageMinutes);
    const emotionTag = memory.emotion !== 'neutral' ? ` [felt: ${memory.emotion}]` : '';
    lines.push(`- ${timeLabel}: ${memory.content}${emotionTag}`);
  }

  return lines.join('\n');
}

/**
 * Get memories involving a specific other character.
 * Used by RelationshipNarrator to provide "recent events" context.
 *
 * @param {object} personaState - Character state
 * @param {string} targetName - Character to filter by
 * @param {number} maxAge - Max age in minutes
 * @returns {Array} Recent memories involving targetName
 */
function getMemoriesInvolving(personaState, targetName, maxAge = 120) {
  const memories = personaState.emotionalMemories || [];
  const cutoff = Date.now() - maxAge * 60000;

  return memories
    .filter(m =>
      m.timestamp > cutoff &&
      (m.involvedCharacters?.includes(targetName) ||
       m.content?.includes(targetName))
    )
    .map(m => ({
      type: m.type === 'social' ? 'conversation' : m.type,
      sentiment: _emotionToSentiment(m.emotion),
      content: m.content,
      timestamp: m.timestamp,
    }));
}

/**
 * Clear memories from the previous day.
 * Keeps only high-importance emotional memories that would persist overnight.
 *
 * @param {object} personaState - Character state
 */
function processNewDay(personaState) {
  const name = personaState.name;
  const memPersonality = MEMORY_PERSONALITY[name] || MEMORY_PERSONALITY.Dad;

  if (personaState.emotionalMemories) {
    // Personality-filtered overnight pruning (goals.md: memory is edited on sleep)
    // Tier 1: <2hr always keep (still "fresh")
    // Tier 2: 2-8hr personality-filtered (some events consolidated, some forgotten)
    // Tier 3: >8hr strict filter (only strong emotions survive the night)
    personaState.emotionalMemories = personaState.emotionalMemories.filter(m => {
      const ageHours = (Date.now() - m.timestamp) / 3600000;
      if (ageHours < 2) return true;

      const sentimentType = _classifySentiment(m.emotion);
      const retentionMult = memPersonality.retention[sentimentType] || 1.0;
      const effectiveImportance = (m.importance || 0) * retentionMult;

      if (ageHours < 8) {
        // Mid-range: personality determines the bar
        // Traumatic/intense emotions get a pass (guilt, shame, fear linger in dreams)
        const traumaEmotions = ['guilt', 'shame', 'fear'];
        if (traumaEmotions.includes(m.emotion) && (m.emotionIntensity || 0) > 1.3) return true;
        return effectiveImportance >= 3;
      }

      // Old memories: only the strongest survive
      // Traumatic events with high persistence persist
      const traumaEmotions = ['guilt', 'shame', 'fear'];
      if (traumaEmotions.includes(m.emotion) && (m.importance || 0) >= 4) return true;

      return effectiveImportance >= 4.5 && (m.emotionIntensity || 0) > 1.3;
    });

    // Personality-based overnight editing: slightly adjust importance scores
    // (goals.md: "you edit memory every time you tell it")
    for (const m of personaState.emotionalMemories) {
      const ageHours = (Date.now() - m.timestamp) / 3600000;
      if (ageHours < 2) continue;

      const sentimentType = _classifySentiment(m.emotion);
      const retentionMult = memPersonality.retention[sentimentType] || 1.0;

      // Memories drift toward the character's bias over time
      // Mom's negative memories get slightly more important (she catalogs everything)
      // Jack's mundane memories fade even faster
      if (retentionMult > 1.2) {
        m.importance = Math.min(5, (m.importance || 3) + 0.1);
      } else if (retentionMult < 0.5) {
        m.importance = Math.max(1, (m.importance || 3) - 0.2);
      }
    }
  }
}

// ── Internal helpers ────────────────────────────────────────────

function _classifySentiment(emotion) {
  const positive = ['joy', 'love', 'pride', 'amusement', 'contentment'];
  const negative = ['guilt', 'shame', 'anger', 'frustration', 'sadness', 'fear', 'embarrassment'];
  if (positive.includes(emotion)) return 'positive';
  if (negative.includes(emotion)) return 'negative';
  return 'mundane';
}

function _emotionToSentiment(emotion) {
  const positive = ['joy', 'love', 'pride', 'amusement', 'contentment'];
  const negative = ['guilt', 'shame', 'anger', 'frustration', 'sadness', 'fear', 'embarrassment'];
  if (positive.includes(emotion)) return 0.6;
  if (negative.includes(emotion)) return -0.6;
  return 0;
}

function _trimMemories(memories, targetCount, memPersonality) {
  // Score by importance × emotion persistence, trim lowest
  return memories
    .map(m => {
      const ageHours = (Date.now() - m.timestamp) / 3600000;
      const fadeRate = m.fadeRate || 1.0;
      const sentimentType = _classifySentiment(m.emotion);
      const personalityBoost = memPersonality.retention[sentimentType] || 1.0;
      const score = (m.importance || 1) * personalityBoost * Math.exp(-ageHours * fadeRate * 0.2);
      return { memory: m, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, targetCount)
    .map(s => s.memory);
}

function _getTimeLabel(ageMinutes) {
  if (ageMinutes < 2) return 'just now';
  if (ageMinutes < 10) return 'a few minutes ago';
  if (ageMinutes < 30) return 'a little while ago';
  if (ageMinutes < 60) return 'about half an hour ago';
  if (ageMinutes < 120) return 'about an hour ago';
  if (ageMinutes < 300) return 'a few hours ago';
  return 'earlier today';
}

function _getEmptyMemoryFlavor(name) {
  const flavors = {
    Dad: 'Mind\'s clear. Fresh start. Coffee would be good.',
    Mom: 'Day\'s just beginning. Everyone needs something. What first?',
    Emma: 'Nothing on your mind yet. That won\'t last.',
    Lily: 'Everything is NEW and EXCITING! What should you do first?',
    Jack: 'AWAKE! What\'s the first fun thing??',
  };
  return flavors[name] || 'A new moment. What now?';
}

// ═══════════════════════════════════════════════════════════════
//  MEMORY DISTORTION SYSTEM (goals.md)
//  "Memory isn't a database — it's a story you tell yourself.
//   And you edit it every time you tell it."
//
//  Over time, memories subtly shift:
//  - Positive memories get slightly more positive
//  - Negative memories get more extreme OR get minimized (personality-dependent)
//  - Details blur but emotional core persists
//  - Kids' memories distort faster than adults'
// ═══════════════════════════════════════════════════════════════

/**
 * Apply memory distortion to a character's emotional memories.
 * Called periodically (e.g., during daily summary processing or new-day).
 * Memories drift based on personality and time elapsed.
 *
 * @param {object} personaState - Character state
 */
function distortMemories(personaState) {
  const name = personaState.name;
  const memPersonality = MEMORY_PERSONALITY[name] || MEMORY_PERSONALITY.Dad;
  const memories = personaState.emotionalMemories || [];
  if (memories.length === 0) return;

  const now = Date.now();

  for (const m of memories) {
    const ageHours = (now - m.timestamp) / 3600000;
    if (ageHours < 1) continue; // Too recent to distort

    // Distortion rate: faster for kids, slower for adults
    const ageMod = _getAgeDistortionRate(name);
    const distortionChance = Math.min(0.3, ageHours * 0.01 * ageMod);

    if (Math.random() > distortionChance) continue;

    // Apply personality-specific distortion
    const sentiment = _classifySentiment(m.emotion);

    if (memPersonality.style === 'emotional-cataloger') {
      // Mom: negative memories get slightly MORE important over time (she catalogs)
      if (sentiment === 'negative') {
        m.importance = Math.min(5, (m.importance || 3) + 0.15);
        m.emotionIntensity = Math.min(2.0, (m.emotionIntensity || 1) + 0.05);
      }
    } else if (memPersonality.style === 'practical') {
      // Dad: emotional details fade, facts remain — emotion intensity drops
      m.emotionIntensity = Math.max(0.5, (m.emotionIntensity || 1) - 0.1);
    } else if (memPersonality.style === 'selective-intense') {
      // Emma: negative memories intensify (teen angst), mundane evaporates
      if (sentiment === 'negative') {
        m.emotionIntensity = Math.min(2.0, (m.emotionIntensity || 1) + 0.1);
      } else if (sentiment === 'mundane') {
        m.importance = Math.max(1, (m.importance || 3) - 0.3);
      }
    } else if (memPersonality.style === 'vivid-but-fleeting') {
      // Lily: everything fades fast but the emotional core persists in simplified form
      m.importance = Math.max(1, (m.importance || 3) - 0.1);
      // Emotions simplify: nuanced emotions become broader
      if (m.emotion === 'frustration') m.emotion = 'anger';
      if (m.emotion === 'contentment') m.emotion = 'joy';
    } else if (memPersonality.style === 'goldfish-with-exceptions') {
      // Jack: rapid importance decay unless REALLY exciting/scary
      if (m.importance < 4) {
        m.importance = Math.max(1, (m.importance || 3) - 0.2);
      }
    }

    // Universal: very old memories lose detail (importance rounds toward average)
    if (ageHours > 12) {
      const currentImportance = m.importance || 3;
      m.importance = currentImportance + (3 - currentImportance) * 0.05;
    }
  }
}

/**
 * Get age-based distortion rate multiplier.
 * Kids' memories distort faster.
 */
function _getAgeDistortionRate(name) {
  const rates = { Jack: 2.0, Lily: 1.8, Emma: 1.3, Mom: 0.8, Dad: 0.9 };
  return rates[name] || 1.0;
}

module.exports = {
  recordMemory,
  recordSocialMemory,
  narrateMemories,
  getMemoriesInvolving,
  processNewDay,
  distortMemories,
  MEMORY_PERSONALITY,
  EMOTION_PERSISTENCE,
};
