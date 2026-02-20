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
 *
 * UPGRADED: Added emotionalMemories (for MemoryManager), dynamic
 * relationship tracking (patience, warmth, recent sentiment),
 * and internal monologue buffer.
 */
function createPersonaState(name) {
  const persona = PERSONA_MAP[name];
  if (!persona) return null;

  // Build initial dynamic relationship state from static persona data
  const dynamicRelationships = {};
  if (persona.relationships) {
    for (const [targetName, staticRel] of Object.entries(persona.relationships)) {
      dynamicRelationships[targetName] = {
        closeness: staticRel.closeness || 0.5,
        patience: 1.0,                // depletes during arguments, refills over time
        warmth: staticRel.closeness || 0.5, // rises with positive interactions
        recentSentiment: 0,           // running average: -1 (hostile) to +1 (loving)
        lastInteractionTime: null,
        interactionCount: 0,
      };
    }
  }

  return {
    name,
    mood: 'content',              // current emotional state
    moodIntensity: 0.5,           // 0 = flat, 1 = intense
    stressLevel: 0.1,             // 0 = zen, 1 = overwhelmed
    socialBattery: persona.personality.extraversion,  // drains/recharges based on E
    lastDecision: null,            // { interactionId, reason, timestamp }
    lastThought: null,             // string — most recent LLM reasoning
    currentGoal: null,             // short-term goal string
    pendingSpeech: null,           // { text, target, emotion } — for speech bubbles
    memories: [],                  // [{ timestamp, type, content, importance }]
    emotionalMemories: [],         // [{ timestamp, type, content, emotion, emotionIntensity, fadeRate, importance, involvedCharacters, location }]
    conversations: [],             // [{ timestamp, speaker, target, text, emotion }]
    recentInteractions: [],        // last 10 interaction IDs performed
    dailyLog: [],                  // summary of today's activities
    dynamicRelationships,          // per-character live relationship dimensions
    internalMonologue: null,       // last LLM reflector thought (displayed as thought bubble)
    dailySummaryNarrative: null,   // Tier 2: LLM-generated narrative of today so far
    relationshipNarratives: {},    // Tier 3: { targetName: "narrative string" } per-relationship
    emotionalCascadeBuffer: [],    // Rolling buffer of recent emotional shifts: [{ shift, emotion, reason, gameHour }]
    obedience: persona.authority < 0.5 ? 0.5 : 0.8, // how likely to follow commands (kids lower)
  };
}

/**
 * Update dynamic relationship dimensions after a social interaction.
 * Called by MemoryManager.recordSocialMemory() or GameSimulation.
 *
 * @param {object} personaState - Subject character's state
 * @param {string} targetName - Who the interaction was with
 * @param {number} sentimentDelta - How positive/negative (-1 to +1)
 */
function updateDynamicRelationship(personaState, targetName, sentimentDelta = 0) {
  const rel = personaState.dynamicRelationships?.[targetName];
  if (!rel) return;

  rel.interactionCount++;
  rel.lastInteractionTime = Date.now();

  // Running sentiment average (exponential moving average)
  rel.recentSentiment = rel.recentSentiment * 0.7 + sentimentDelta * 0.3;

  // Warmth slowly moves toward recent sentiment
  rel.warmth = Math.max(0, Math.min(1,
    rel.warmth + sentimentDelta * 0.05
  ));

  // Patience depletes with negative interactions, slowly recharges
  if (sentimentDelta < -0.2) {
    rel.patience = Math.max(0, rel.patience + sentimentDelta * 0.2);
  }
}

/**
 * Tick dynamic relationships (called each game tick).
 * Patience slowly recovers. Sentiment drifts toward neutral.
 */
function tickDynamicRelationships(personaState, deltaSeconds) {
  if (!personaState.dynamicRelationships) return;

  for (const rel of Object.values(personaState.dynamicRelationships)) {
    // Patience slowly recovers (full recovery in ~15 minutes)
    rel.patience = Math.min(1, rel.patience + deltaSeconds * (1 / 900));

    // Recent sentiment slowly drifts toward neutral
    if (Math.abs(rel.recentSentiment) > 0.01) {
      rel.recentSentiment *= (1 - deltaSeconds * 0.001);
    }
  }
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

  // Social battery — tracks social energy, separate from social need
  // Introverts: drain faster from interaction, recharge faster alone
  // Extroverts: drain slower from interaction, recharge slower alone (they need people!)
  const extraversion = persona.personality?.extraversion || 0.5;
  const currentBattery = personaState.socialBattery;

  // Count recent conversations (last 30 minutes of game time)
  const recentConvs = (personaState.conversations || []).filter(c => {
    if (!c.timestamp) return false;
    return (Date.now() - c.timestamp) < 30 * 60 * 1000; // 30 real minutes
  }).length;

  // Drain from social interaction (stronger for introverts)
  const drainPerConv = extraversion < 0.45 ? 0.08 : extraversion > 0.7 ? 0.02 : 0.04;
  const drainFromRecent = Math.min(recentConvs * drainPerConv, 0.5);

  // Recharge rate when alone (stronger for introverts)
  const isAlone = !personaState._currentlyWithPeople; // set externally during tick
  const rechargeRate = isAlone
    ? (extraversion < 0.45 ? 0.03 : extraversion > 0.7 ? 0.01 : 0.02)
    : 0;

  // Extroverts get a boost from social need being met (they recharge through people)
  const socialBoost = extraversion > 0.6 && recentConvs > 0 ? 0.02 * extraversion : 0;

  // Compute new battery: blend current state with interaction-based adjustments
  const targetBattery = Math.max(0, Math.min(1,
    currentBattery - drainFromRecent + rechargeRate + socialBoost
  ));
  // Smooth transition (don't jump instantly)
  personaState.socialBattery = Math.max(0, Math.min(1,
    currentBattery * 0.7 + targetBattery * 0.3
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
 * Summarize the emotional cascade buffer into a natural-language string for the Deliberator.
 * Returns null if the buffer is empty or too small to summarize.
 * 
 * The cascade buffer accumulates emotional shifts across decisions. This function
 * detects emotional trends (escalating frustration, improving mood, emotional volatility)
 * and produces a short first-person narrative that feeds into the next reasoning cycle.
 */
function summarizeEmotionalCascade(personaState) {
  const buffer = personaState.emotionalCascadeBuffer;
  if (!buffer || buffer.length < 2) return null;

  // Calculate net emotional trajectory
  const totalShift = buffer.reduce((sum, e) => sum + (e.shift || 0), 0);
  const recentShift = buffer.slice(-3).reduce((sum, e) => sum + (e.shift || 0), 0);
  const negativeCount = buffer.filter(e => (e.shift || 0) < -3).length;
  const positiveCount = buffer.filter(e => (e.shift || 0) > 3).length;
  
  // Collect unique recent emotions (last 5 entries)
  const recentEmotions = [...new Set(buffer.slice(-5).map(e => e.emotion).filter(Boolean))];
  
  // Detect emotional volatility (rapid swings)
  let swings = 0;
  for (let i = 1; i < buffer.length; i++) {
    const prev = buffer[i - 1].shift || 0;
    const curr = buffer[i].shift || 0;
    if ((prev > 3 && curr < -3) || (prev < -3 && curr > 3)) swings++;
  }

  const parts = [];

  // Overall trajectory
  if (totalShift < -15) {
    parts.push(`Your day has been rough — you've been accumulating frustration and stress.`);
  } else if (totalShift < -5) {
    parts.push(`Your mood has been dipping — small irritations adding up.`);
  } else if (totalShift > 15) {
    parts.push(`You've been in a genuinely good mood — things have been going well today.`);
  } else if (totalShift > 5) {
    parts.push(`Your mood has been gently improving — small wins adding up.`);
  }

  // Recent trend (last 3 decisions)
  if (recentShift < -8) {
    parts.push(`The last few things that happened really got to you.`);
  } else if (recentShift > 8) {
    parts.push(`The last few moments have been a real mood boost.`);
  }

  // Escalation warning (goals.md Step 5: threshold flagging)
  if (negativeCount >= 4) {
    parts.push(`You can feel your patience wearing thin. You've been getting increasingly frustrated.`);
  } else if (negativeCount >= 3) {
    parts.push(`There's a tension building — not terrible, but you're not at your most patient.`);
  }

  // Emotional volatility
  if (swings >= 2) {
    parts.push(`Your emotions have been all over the place — up and down, up and down.`);
  }

  // Recent emotional coloring
  if (recentEmotions.length > 0 && parts.length > 0) {
    parts.push(`Recently you've been feeling: ${recentEmotions.join(', ')}.`);
  }

  if (parts.length === 0) return null;

  return `YOUR EMOTIONAL STATE RIGHT NOW:\n${parts.join(' ')}`;
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
  updateDynamicRelationship,
  tickDynamicRelationships,
  getCurrentScheduleEntry,
  buildMemorySummary,
  buildConversationSummary,
  buildDailySummary,
  resetDailyLog,
  getNickname,
  summarizeEmotionalCascade,
  serializePersonaState,
  FAMILY_DATA,
  SOCIAL_DYNAMICS,
  ENVIRONMENT_RULES,
  INTERRUPT_EVENTS,
  CONVERSATION_TOPICS,
  PERSONA_MAP,
};
