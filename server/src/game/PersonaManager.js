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

const FAMILY_DATA = personaData.family;
const SOCIAL_DYNAMICS = personaData.socialDynamics;
const ENVIRONMENT_RULES = personaData.environmentalRules;
const INTERRUPT_EVENTS = personaData.interruptEvents;
const CONVERSATION_TOPICS = personaData.conversationTopics;

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

  addMemory(personaState, 'decision', `Decided to: ${interactionId} — ${reason}`, 2);
}

/**
 * Update the character's mood based on needs and events.
 */
function updateMood(personaState, needs, recentEvents = []) {
  const persona = PERSONA_MAP[personaState.name];
  if (!persona) return;

  // Base mood from needs
  const needValues = Object.values(needs || {});
  const avgNeed = needValues.length > 0 ? needValues.reduce((s, v) => s + v, 0) / needValues.length : 50;

  if (avgNeed > 70) {
    personaState.mood = 'happy';
    personaState.moodIntensity = Math.min((avgNeed - 70) / 30, 1);
  } else if (avgNeed > 40) {
    personaState.mood = 'content';
    personaState.moodIntensity = 0.5;
  } else if (avgNeed > 20) {
    personaState.mood = 'uncomfortable';
    personaState.moodIntensity = (40 - avgNeed) / 20;
  } else {
    personaState.mood = 'miserable';
    personaState.moodIntensity = 1;
  }

  // Stress increases with low needs and neuroticism
  const neuroticism = persona.personality?.neuroticism || 0.5;
  personaState.stressLevel = Math.max(0, Math.min(1,
    (1 - avgNeed / 100) * neuroticism + personaState.stressLevel * 0.7
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
  createPersonaState,
  addMemory,
  addConversation,
  recordDecision,
  updateMood,
  getCurrentScheduleEntry,
  buildMemorySummary,
  buildConversationSummary,
  getNickname,
  serializePersonaState,
  FAMILY_DATA,
  SOCIAL_DYNAMICS,
  ENVIRONMENT_RULES,
  INTERRUPT_EVENTS,
  CONVERSATION_TOPICS,
  PERSONA_MAP,
};
