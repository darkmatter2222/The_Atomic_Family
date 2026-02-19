/**
 * PersonaManager.js — Manages character personas and dynamic memory.
 *
 * Loads static persona data from personas.json and maintains each
 * character's dynamic state: short-term memory, mood, recent
 * conversations, and emotional state that evolves over time.
 *
 * CommonJS module (server-side).
 */

const personaData = require('../data/personas.json');

const MAX_MEMORIES = 50;        // keep last N memories per character
const MAX_CONVERSATIONS = 30;   // keep last N conversation messages per character
const MEMORY_DECAY_HOURS = 2;   // memories older than this lose importance

// ── Static persona lookup ─────────────────────────────────────────
const PERSONA_MAP = {};
for (const member of personaData.members) {
  PERSONA_MAP[member.name] = member;
}

// ── Reverse name/alias lookup (nicknames, full names → canonical name) ──
const NAME_ALIASES = {};
for (const member of personaData.members) {
  const canonical = member.name;
  NAME_ALIASES[canonical.toLowerCase()] = canonical;
  if (member.fullName) {
    NAME_ALIASES[member.fullName.toLowerCase()] = canonical;
    const firstName = member.fullName.split(' ')[0].toLowerCase();
    if (firstName !== canonical.toLowerCase()) {
      NAME_ALIASES[firstName] = canonical;
    }
  }
  if (member.nicknames) {
    for (const nick of Object.values(member.nicknames)) {
      NAME_ALIASES[nick.toLowerCase()] = canonical;
    }
  }
}

const FAMILY_DATA = personaData.family;
const SOCIAL_DYNAMICS = personaData.socialDynamics;
const ENVIRONMENT_RULES = personaData.environmentalRules;
const INTERRUPT_EVENTS = personaData.interruptEvents;
const CONVERSATION_TOPICS = personaData.conversationTopics;

/**
 * Resolve a character name, alias, or nickname to the canonical name.
 * Handles: full names ("David Atomic"), nicknames ("Daddy", "Mommy"),
 * first names ("Sarah"), and canonical names ("Dad").
 * @returns {string|null} Canonical name or null if no match.
 */
function resolveCharacterName(name) {
  if (!name) return null;
  if (PERSONA_MAP[name]) return name;
  const resolved = NAME_ALIASES[name.toLowerCase().trim()];
  if (resolved) return resolved;
  // Fuzzy: check if input contains a known alias
  const lower = name.toLowerCase().trim();
  for (const [alias, canonical] of Object.entries(NAME_ALIASES)) {
    if (lower.includes(alias) && alias.length >= 3) return canonical;
  }
  return null;
}

/**
 * Get the static persona for a character.
 */
function getPersona(name) {
  return PERSONA_MAP[name] || null;
}

/**
 * Get all persona names.
 */
function getAllPersonaNames() {
  return Object.keys(PERSONA_MAP);
}

/**
 * PersonaState — Dynamic per-character state managed alongside the
 * static persona. Created once per character at simulation start.
 */
function createPersonaState(name) {
  const persona = PERSONA_MAP[name];
  if (!persona) return null;

  return {
    name,
    mood: 'content',           // current emotional state
    moodIntensity: 0.5,         // 0 = flat, 1 = intense
    stressLevel: 0.1,           // 0 = zen, 1 = overwhelmed
    socialBattery: persona.personality.extraversion,  // drains/recharges based on E
    lastDecision: null,          // { interactionId, reason, timestamp }
    lastThought: null,           // string — most recent LLM reasoning
    currentGoal: null,           // short-term goal string
    pendingSpeech: null,         // { text, target, emotion } — for speech bubbles
    memories: [],                // [{ timestamp, type, content, importance }]
    conversations: [],           // [{ timestamp, speaker, target, text, emotion }]
    recentInteractions: [],      // last 10 interaction IDs performed
    dailyLog: [],                // summary of today's activities
    obedience: persona.authority < 0.5 ? 0.5 : 0.8, // how likely to follow commands (kids lower)
  };
}

/**
 * Add a memory to a character's state.
 */
function addMemory(personaState, type, content, importance = 3) {
  personaState.memories.push({
    timestamp: Date.now(),
    type,         // 'event', 'observation', 'thought', 'emotion', 'decision'
    content,
    importance,   // 1–5 (5 = most important)
  });

  // Trim to max, keeping high-importance ones
  if (personaState.memories.length > MAX_MEMORIES) {
    personaState.memories.sort((a, b) => {
      // Combine recency and importance for ranking
      const ageA = (Date.now() - a.timestamp) / (MEMORY_DECAY_HOURS * 3600000);
      const ageB = (Date.now() - b.timestamp) / (MEMORY_DECAY_HOURS * 3600000);
      const scoreA = a.importance - ageA;
      const scoreB = b.importance - ageB;
      return scoreB - scoreA;
    });
    personaState.memories = personaState.memories.slice(0, MAX_MEMORIES);
  }
}

/**
 * Add a conversation message to a character's history.
 */
function addConversation(personaState, speaker, target, text, emotion = 'neutral') {
  personaState.conversations.push({
    timestamp: Date.now(),
    speaker,
    target,
    text,
    emotion,
  });

  if (personaState.conversations.length > MAX_CONVERSATIONS) {
    personaState.conversations = personaState.conversations.slice(-MAX_CONVERSATIONS);
  }

  // Also add as a high-importance memory
  addMemory(
    personaState,
    'conversation',
    `${speaker} said to ${target}: "${text}"`,
    4
  );
}

/**
 * Record a decision made by the character.
 * Also populates the dailyLog for activity tracking.
 */
function recordDecision(personaState, interactionId, reason) {
  personaState.lastDecision = {
    interactionId,
    reason,
    timestamp: Date.now(),
  };

  personaState.recentInteractions.push(interactionId);
  if (personaState.recentInteractions.length > 10) {
    personaState.recentInteractions = personaState.recentInteractions.slice(-10);
  }

  // Populate daily log — track what they've done today
  if (!personaState.dailyLog) personaState.dailyLog = [];
  personaState.dailyLog.push({
    timestamp: Date.now(),
    action: interactionId,
    reason: reason ? reason.substring(0, 100) : '',
  });
  // Keep daily log to last 50 entries
  if (personaState.dailyLog.length > 50) {
    personaState.dailyLog = personaState.dailyLog.slice(-50);
  }

  addMemory(personaState, 'decision', `Decided to: ${interactionId} — ${reason}`, 2);
}

/**
 * Update the character's mood based on needs and events.
 */
function updateMood(personaState, needs, recentEvents = []) {
  const persona = PERSONA_MAP[personaState.name];
  if (!persona) return;

  // Base mood from needs — use weighted average (energy and hunger matter more)
  const needWeights = { energy: 1.5, hunger: 1.3, hygiene: 1.0, social: 0.8, fun: 0.7, comfort: 0.6, bladder: 1.2 };
  let weightedSum = 0, weightTotal = 0;
  for (const [key, value] of Object.entries(needs || {})) {
    const w = needWeights[key] || 1.0;
    weightedSum += value * w;
    weightTotal += w;
  }
  const weightedAvg = weightTotal > 0 ? weightedSum / weightTotal : 50;

  // Find the LOWEST need — a single critical need can override mood
  const lowestNeed = Math.min(...Object.values(needs || { x: 50 }));

  // Effective avg blends weighted average with lowest need (critical need pulls mood down)
  const effectiveAvg = lowestNeed < 20
    ? weightedAvg * 0.4 + lowestNeed * 0.6 // Critical need dominates
    : lowestNeed < 40
      ? weightedAvg * 0.7 + lowestNeed * 0.3
      : weightedAvg;

  // Expanded mood vocabulary based on personality traits
  const agreeableness = persona.personality?.agreeableness || 0.5;
  const openness = persona.personality?.openness || 0.5;

  if (effectiveAvg > 80) {
    // Very satisfied — mood varies by personality
    const happyMoods = agreeableness > 0.6
      ? ['cheerful', 'grateful', 'happy']
      : openness > 0.6 ? ['energized', 'inspired', 'happy'] : ['happy', 'content', 'satisfied'];
    personaState.mood = happyMoods[Math.floor(Date.now() / 300000) % happyMoods.length]; // rotate slowly
    personaState.moodIntensity = Math.min((effectiveAvg - 70) / 30, 1);
  } else if (effectiveAvg > 60) {
    personaState.mood = 'content';
    personaState.moodIntensity = 0.5;
  } else if (effectiveAvg > 40) {
    // Mildly uncomfortable — what's the cause?
    if ((needs?.energy || 100) < 30) personaState.mood = 'tired';
    else if ((needs?.hunger || 100) < 30) personaState.mood = 'hungry';
    else if ((needs?.social || 100) < 25) personaState.mood = 'lonely';
    else personaState.mood = 'restless';
    personaState.moodIntensity = (60 - effectiveAvg) / 20;
  } else if (effectiveAvg > 20) {
    if ((needs?.energy || 100) < 15) personaState.mood = 'exhausted';
    else if ((needs?.hunger || 100) < 15) personaState.mood = 'starving';
    else personaState.mood = 'uncomfortable';
    personaState.moodIntensity = (40 - effectiveAvg) / 20;
  } else {
    personaState.mood = 'miserable';
    personaState.moodIntensity = 1;
  }

  // Stress increases with low needs and neuroticism
  const neuroticism = persona.personality?.neuroticism || 0.5;
  personaState.stressLevel = Math.max(0, Math.min(1,
    (1 - weightedAvg / 100) * neuroticism + personaState.stressLevel * 0.7
  ));

  // Social battery
  const extraversion = persona.personality?.extraversion || 0.5;
  const socialNeed = needs?.social || 50;
  personaState.socialBattery = Math.max(0, Math.min(1,
    socialNeed / 100 * extraversion + (1 - extraversion) * 0.5
  ));
}

/**
 * Get the relevant schedule entry for the current time.
 */
function getCurrentScheduleEntry(name, gameTime) {
  const persona = PERSONA_MAP[name];
  if (!persona || !persona.schedule) return null;

  const dayOfWeek = gameTime.getDay(); // 0=Sun, 6=Sat
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const schedule = isWeekend ? persona.schedule.weekend : persona.schedule.weekday;
  if (!schedule || schedule.length === 0) return null;

  const currentHour = gameTime.getHours();
  const currentMinute = gameTime.getMinutes();
  const currentTimeStr = `${currentHour}:${String(currentMinute).padStart(2, '0')}`;

  // Find the current and next schedule entries
  let current = schedule[0];
  let next = schedule.length > 1 ? schedule[1] : null;

  for (let i = 0; i < schedule.length; i++) {
    const entryTime = schedule[i].time;
    if (entryTime <= currentTimeStr) {
      current = schedule[i];
      next = i + 1 < schedule.length ? schedule[i + 1] : null;
    }
  }

  return { current, next, isWeekend };
}

/**
 * Build a memory summary string for the LLM prompt.
 * Only includes recent and important memories.
 */
function buildMemorySummary(personaState, maxEntries = 10) {
  if (!personaState.memories.length) return 'No recent memories.';

  const sorted = [...personaState.memories]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, maxEntries);

  return sorted.map(m => {
    const ago = Math.round((Date.now() - m.timestamp) / 60000);
    const timeLabel = ago < 1 ? 'just now' : ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
    return `- [${timeLabel}] ${m.content}`;
  }).join('\n');
}

/**
 * Build a conversation history string for the LLM prompt.
 */
function buildConversationSummary(personaState, maxEntries = 8) {
  if (!personaState.conversations.length) return 'No recent conversations.';

  const recent = personaState.conversations.slice(-maxEntries);
  return recent.map(c => {
    const ago = Math.round((Date.now() - c.timestamp) / 60000);
    const timeLabel = ago < 1 ? 'just now' : ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`;
    return `- [${timeLabel}] ${c.speaker} → ${c.target}: "${c.text}" (${c.emotion})`;
  }).join('\n');
}

/**
 * Build a "today so far" summary from the dailyLog.
 * Groups activities and shows frequency with sequential numbering.
 * Uses relative ordering rather than real-time timestamps
 * (since game speed may differ from real time).
 */
function buildDailySummary(personaState) {
  const log = personaState.dailyLog || [];
  if (log.length === 0) return 'Just woke up — haven\'t done anything yet today.';

  // Group by action, track count and most recent position (order-based)
  const actionCounts = {};
  const actionLastIndex = {};
  for (let i = 0; i < log.length; i++) {
    const label = (log[i].action || 'unknown').replace(/_/g, ' ');
    actionCounts[label] = (actionCounts[label] || 0) + 1;
    actionLastIndex[label] = i;
  }

  // Sort by most recent first
  const sorted = Object.entries(actionCounts)
    .sort((a, b) => (actionLastIndex[b[0]] || 0) - (actionLastIndex[a[0]] || 0));

  // Show the most recent unique actions with recency labels
  const items = sorted.slice(0, 8).map(([action, count], idx) => {
    const recency = idx === 0 ? 'most recent' : idx < 3 ? 'recent' : 'earlier';
    return `- ${action}${count > 1 ? ` (${count}x)` : ''} (${recency})`;
  });

  // Also show a brief chronological recent trail
  const recentTrail = log.slice(-5)
    .map(e => (e.action || '?').replace(/_/g, ' '))
    .join(' → ');

  return `Today so far (${log.length} activities):\n${items.join('\n')}\nRecent sequence: ${recentTrail}`;
}

/**
 * Reset daily log — call at start of new day.
 */
function resetDailyLog(personaState) {
  personaState.dailyLog = [];
}

/**
 * Get nickname that this character uses for another.
 */
function getNickname(speakerName, targetName) {
  const speaker = PERSONA_MAP[speakerName];
  if (!speaker || !speaker.nicknames) return targetName;

  const key = `by${speakerName}`;
  const target = PERSONA_MAP[targetName];
  if (!target || !target.nicknames) return targetName;

  // Reverse lookup: target's nicknames has byDad, byMom, etc.
  return target.nicknames[`by${speakerName}`] || targetName;
}

/**
 * Serialize persona state for client broadcast.
 */
function serializePersonaState(personaState) {
  return {
    mood: personaState.mood,
    moodIntensity: personaState.moodIntensity,
    stressLevel: personaState.stressLevel,
    lastThought: personaState.lastThought,
    currentGoal: personaState.currentGoal,
    pendingSpeech: personaState.pendingSpeech,
    recentConversations: personaState.conversations.slice(-5).map(c => ({
      speaker: c.speaker,
      target: c.target,
      text: c.text,
      emotion: c.emotion,
      timestamp: c.timestamp,
    })),
  };
}

module.exports = {
  getPersona,
  getAllPersonaNames,
  resolveCharacterName,
  createPersonaState,
  addMemory,
  addConversation,
  recordDecision,
  updateMood,
  getCurrentScheduleEntry,
  buildMemorySummary,
  buildConversationSummary,
  buildDailySummary,
  resetDailyLog,
  getNickname,
  serializePersonaState,
  FAMILY_DATA,
  SOCIAL_DYNAMICS,
  ENVIRONMENT_RULES,
  INTERRUPT_EVENTS,
  CONVERSATION_TOPICS,
  PERSONA_MAP,
};
