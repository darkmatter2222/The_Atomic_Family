/**
 * DailySummaryManager.js — LLM-generated narrative daily summaries & relationship narratives.
 *
 * Per goals.md Tier 2 & Tier 3 memory:
 *   Tier 2: "Today's Running Summary" — LLM-generated narrative of the day so far,
 *           updated every 30 game minutes. Reads like a person's inner account of their day,
 *           not a bullet-point list. Emotional weight shapes what's remembered.
 *
 *   Tier 3: "Relationship Narratives" — Per-relationship narrative updated after
 *           significant interactions. Carries the emotional texture of each relationship.
 *
 * CommonJS module (server-side).
 */

const { getPersona } = require('./PersonaManager');
const { MEMORY_PERSONALITY } = require('./MemoryManager');

// ── Configuration ────────────────────────────────────────────────
const SUMMARY_UPDATE_INTERVAL_MINUTES = 30; // game minutes between narrative updates
const SUMMARY_MAX_TOKENS = 250;
const RELATIONSHIP_MAX_TOKENS = 180;

// ── Tracking: when each character last had a summary update ──────
const lastSummaryGameMinute = {}; // characterName → last game minute
const pendingSummaryUpdates = new Map(); // characterName → Promise

// ── Relationship update queue ────────────────────────────────────
const pendingRelationshipUpdates = new Map(); // characterName → Promise
const relationshipUpdateQueue = []; // { subject, target, context }

/**
 * Check if a character is due for a daily summary narrative update.
 *
 * @param {string} name - Character name
 * @param {Date} gameTime - Current game time
 * @returns {boolean}
 */
function isDueSummaryUpdate(name, gameTime) {
  const currentGameMinute = gameTime.getHours() * 60 + gameTime.getMinutes();
  const last = lastSummaryGameMinute[name];
  
  // First summary of the day
  if (last === undefined) return true;
  
  // Handle day rollover
  const elapsed = currentGameMinute >= last 
    ? currentGameMinute - last 
    : (1440 - last) + currentGameMinute;
  
  return elapsed >= SUMMARY_UPDATE_INTERVAL_MINUTES;
}

/**
 * Generate or update the character's daily narrative summary via LLM.
 *
 * This replaces the bullet-point daily log with a first-person narrative
 * that reads like how a person remembers their day — with emotional weight,
 * selective detail, and personality-appropriate framing.
 *
 * @param {object} member - Family member state
 * @param {object} personaState - Character persona state
 * @param {Date} gameTime - Current game time
 * @param {object} llmClient - LLM client instance
 * @returns {Promise<string|null>} The generated narrative, or null on failure
 */
async function updateDailySummary(member, personaState, gameTime, llmClient) {
  const name = member.name;
  
  // Prevent concurrent updates
  if (pendingSummaryUpdates.has(name)) return null;
  
  const persona = getPersona(name);
  if (!persona) return null;
  
  const memPersonality = MEMORY_PERSONALITY[name] || MEMORY_PERSONALITY.Dad;
  const previousSummary = personaState.dailySummaryNarrative || '';
  
  // Gather recent events from dailyLog since last summary
  const dailyLog = personaState.dailyLog || [];
  const recentConversations = (personaState.conversations || []).slice(-8);
  
  // Build a brief event list from recent activity
  const recentEvents = dailyLog.slice(-15).map(entry => {
    const label = (entry.action || 'unknown').replace(/_/g, ' ');
    const reason = entry.reason || '';
    return `- ${label}${reason ? ` (${reason})` : ''}`;
  }).join('\n');
  
  const recentConvText = recentConversations.map(c => {
    return `- ${c.speaker} to ${c.target}: "${c.text}"`;
  }).join('\n');
  
  const timeStr = gameTime.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York'
  });
  
  // Personality-specific narrative instructions
  let narrativeStyle = '';
  if (persona.age < 10) {
    narrativeStyle = `Remember things like a ${persona.age}-year-old would — in terms of feelings, fun vs boring, and whether people were nice or mean. Details blur fast. Big emotions stay.`;
  } else if (persona.age >= 10 && persona.age < 18) {
    narrativeStyle = 'Remember like a teenager — dramatic about things that matter to you, dismissive about mundane stuff. Social interactions loom large. Perceived injustices are remembered with precision.';
  } else if (persona.role === 'mother') {
    narrativeStyle = 'Your memory catalogs everything with emotional color — who said what, the look on their face, what it meant. The mental load is always running in the background. Mundane tasks still carry emotional weight because they represent your care for the family.';
  } else if (persona.role === 'father') {
    narrativeStyle = 'You remember practically — what got done, what still needs doing. But quiet moments of connection with the kids stick. You notice more than you say. Your summary is organized but has soft spots.';
  }

  const systemPrompt = `You ARE ${persona.fullName} (${persona.age}, ${persona.role}).
You are writing a brief internal summary of your day to yourself — not for anyone else.
This is how YOU remember the day so far, filtered through YOUR personality.

Memory style: ${memPersonality.desc}
${narrativeStyle}

RULES:
- Write in first person, present tense ("I've been..." not "They did...")
- Keep the MOST emotionally significant moments. Let mundane details fade.
- If the previous summary mentions something important, keep it. Don't lose significant events.
- This should feel like a person's actual mental recap — messy, emotional, human.
- 3-5 sentences maximum. Short and natural.
- NO bullet points. Write as flowing thought.`;

  const userPrompt = `${previousSummary ? `MY PREVIOUS SUMMARY:\n${previousSummary}\n\n` : ''}WHAT'S HAPPENED SINCE THEN:
${recentEvents || 'Not much.'}

${recentConvText ? `CONVERSATIONS:\n${recentConvText}\n` : ''}
Current time: ${timeStr}
Current mood: ${personaState.mood} (intensity: ${Math.round(personaState.moodIntensity * 100)}%)
Stress: ${Math.round((personaState.stressLevel || 0) * 100)}%

Update my day summary. Keep what matters, let go of what doesn't. Write as ME, not about me.`;

  const updatePromise = (async () => {
    try {
      const response = await llmClient.reason(systemPrompt, userPrompt, {
        temperature: 0.8,  // Reflector temperature per goals.md
        max_tokens: SUMMARY_MAX_TOKENS,
        top_p: 0.95,
      });
      
      if (response) {
        // Clean up the response — remove any JSON wrapping or quotes
        let narrative = response.trim();
        // Remove leading/trailing quotes if the LLM wrapped it
        if (narrative.startsWith('"') && narrative.endsWith('"')) {
          narrative = narrative.slice(1, -1);
        }
        
        // Store the narrative
        personaState.dailySummaryNarrative = narrative;
        
        // Update the tracking time
        const currentGameMinute = gameTime.getHours() * 60 + gameTime.getMinutes();
        lastSummaryGameMinute[name] = currentGameMinute;
        
        console.log(`[DailySummary] ${name} updated daily narrative (${narrative.length} chars)`);
        return narrative;
      }
    } catch (err) {
      console.error(`[DailySummary] Error updating ${name}'s summary: ${err.message}`);
    } finally {
      pendingSummaryUpdates.delete(name);
    }
    return null;
  })();
  
  pendingSummaryUpdates.set(name, updatePromise);
  return updatePromise;
}

/**
 * Queue a relationship narrative update after a significant interaction.
 *
 * @param {string} subjectName - Character whose perspective to update
 * @param {string} targetName - The other character in the relationship
 * @param {object} context - { interaction, emotion, conversationSnippet }
 */
function queueRelationshipUpdate(subjectName, targetName, context) {
  relationshipUpdateQueue.push({
    subject: subjectName,
    target: targetName,
    context,
    timestamp: Date.now(),
  });
  
  // Cap queue size
  if (relationshipUpdateQueue.length > 20) {
    relationshipUpdateQueue.splice(0, relationshipUpdateQueue.length - 20);
  }
}

/**
 * Process pending relationship narrative updates.
 * Called periodically from AgenticEngine.
 *
 * @param {object} personaStates - Map of character states
 * @param {object} llmClient - LLM client instance
 * @param {Date} gameTime - Current game time
 */
async function processRelationshipUpdates(personaStates, llmClient, gameTime) {
  if (relationshipUpdateQueue.length === 0) return;
  
  // Process one at a time to avoid LLM overload
  const update = relationshipUpdateQueue.shift();
  if (!update) return;
  
  const { subject, target, context } = update;
  const personaState = personaStates[subject];
  if (!personaState) return;
  
  // Prevent concurrent updates for same character
  if (pendingRelationshipUpdates.has(subject)) {
    relationshipUpdateQueue.unshift(update); // put it back
    return;
  }
  
  const persona = getPersona(subject);
  if (!persona) return;
  
  // Initialize relationship narratives map
  if (!personaState.relationshipNarratives) {
    personaState.relationshipNarratives = {};
  }
  
  const previousNarrative = personaState.relationshipNarratives[target] || '';
  const dynamicRel = personaState.dynamicRelationships?.[target];
  
  // Get the static relationship description if available
  const staticRel = persona.relationships?.[target];
  const staticDesc = staticRel?.description || '';
  
  const systemPrompt = `You ARE ${persona.fullName}. Write a brief update about your relationship with ${target}.
This is your private, honest feeling about this person RIGHT NOW — not a neutral analysis.
Write in first person. Be emotionally honest. 2-3 sentences max.
${persona.age < 10 ? `You're ${persona.age} — you think in terms of who you like, who's mean, who's fun, who gets you in trouble.` : ''}
${persona.age >= 10 && persona.age < 18 ? `You're a teenager — relationships are complicated and you don't always know how you feel.` : ''}`;

  const warmthLabel = dynamicRel ? 
    (dynamicRel.warmth > 0.7 ? 'warm' : dynamicRel.warmth > 0.4 ? 'neutral' : 'strained') : 'unknown';
  const patienceLabel = dynamicRel ?
    (dynamicRel.patience > 0.7 ? 'patient' : dynamicRel.patience > 0.3 ? 'short' : 'very thin') : 'unknown';
  
  const userPrompt = `${previousNarrative ? `PREVIOUS FEELING ABOUT ${target.toUpperCase()}:\n${previousNarrative}\n\n` : ''}WHAT JUST HAPPENED:
${context.conversationSnippet || context.interaction || 'A brief interaction.'}
How I felt: ${context.emotion || 'mixed'}

Current warmth toward ${target}: ${warmthLabel}
My patience with ${target}: ${patienceLabel}

${staticDesc ? `BASELINE: ${staticDesc}\n` : ''}
Update my feeling about ${target}. Keep what's still true, update what's changed.`;

  const updatePromise = (async () => {
    try {
      const response = await llmClient.reason(systemPrompt, userPrompt, {
        temperature: 0.7,
        max_tokens: RELATIONSHIP_MAX_TOKENS,
        top_p: 0.9,
      });
      
      if (response) {
        let narrative = response.trim();
        if (narrative.startsWith('"') && narrative.endsWith('"')) {
          narrative = narrative.slice(1, -1);
        }
        
        personaState.relationshipNarratives[target] = narrative;
        console.log(`[DailySummary] ${subject}'s feeling about ${target} updated (${narrative.length} chars)`);
      }
    } catch (err) {
      console.error(`[DailySummary] Relationship update error (${subject}→${target}): ${err.message}`);
    } finally {
      pendingRelationshipUpdates.delete(subject);
    }
  })();
  
  pendingRelationshipUpdates.set(subject, updatePromise);
}

/**
 * Get the daily narrative for prompt injection.
 * Falls back to bullet-point summary if narrative hasn't been generated yet.
 *
 * @param {object} personaState - Character state
 * @returns {string} Narrative or empty string
 */
function getDailySummaryNarrative(personaState) {
  return personaState.dailySummaryNarrative || '';
}

/**
 * Get relationship narrative for a specific character pair.
 *
 * @param {object} personaState - Subject character state
 * @param {string} targetName - Other character
 * @returns {string} Narrative or empty string
 */
function getRelationshipNarrative(personaState, targetName) {
  return personaState.relationshipNarratives?.[targetName] || '';
}

/**
 * Get all relationship narratives for prompt injection.
 *
 * @param {object} personaState - Character state
 * @returns {string} Combined relationship narratives
 */
function getAllRelationshipNarratives(personaState) {
  const narratives = personaState.relationshipNarratives || {};
  const entries = Object.entries(narratives);
  if (entries.length === 0) return '';
  
  const lines = ['HOW I FEEL ABOUT MY FAMILY RIGHT NOW:'];
  for (const [name, narrative] of entries) {
    lines.push(`${name}: ${narrative}`);
  }
  return lines.join('\n');
}

/**
 * Reset daily tracking for a new simulation day.
 *
 * @param {string} name - Character name
 */
function resetDailyTracking(name) {
  delete lastSummaryGameMinute[name];
}

// ═══════════════════════════════════════════════════════════════
//  TIER 4 — LONG-TERM PATTERN MEMORY
//  Archives daily summaries and relationship narratives,
//  then periodically extracts recurring patterns via LLM.
// ═══════════════════════════════════════════════════════════════

const MAX_ARCHIVED_DAYS = 7;
const PATTERN_EXTRACTION_INTERVAL_DAYS = 7; // Extract patterns every N archived days (goals.md: 7-day cycle)
const PATTERN_MAX_TOKENS = 300;

// ── Habit formation tracking (goals.md) ──────────────────────────
// Track repeated actions to detect emerging habits
const habitTrackers = {}; // characterName → { actionCounts: {}, streaks: {} }

// Track when we last extracted patterns per character
const lastPatternExtractionDay = {}; // characterName → archived day count

/**
 * Archive the current day's narrative and relationship narratives before resetting.
 * Call this at day transition BEFORE clearing dailySummaryNarrative.
 *
 * @param {object} personaState - Character state
 * @param {string} dayLabel - Human-readable day label (e.g. "Monday 6/15")
 */
function archiveDailySummaries(personaState, dayLabel) {
  if (!personaState.archivedDailySummaries) {
    personaState.archivedDailySummaries = [];
  }
  if (!personaState.archivedRelationshipNarratives) {
    personaState.archivedRelationshipNarratives = [];
  }

  // Only archive if there's actual content
  const dailyNarrative = personaState.dailySummaryNarrative;
  if (dailyNarrative && dailyNarrative.length > 20) {
    personaState.archivedDailySummaries.push({
      day: dayLabel,
      narrative: dailyNarrative,
      mood: personaState.mood || 'neutral',
      moodIntensity: personaState.moodIntensity || 0.5,
    });

    // Cap at MAX_ARCHIVED_DAYS
    if (personaState.archivedDailySummaries.length > MAX_ARCHIVED_DAYS) {
      personaState.archivedDailySummaries.shift();
    }

    console.log(`[LongTermMemory] ${personaState.name || 'unknown'} archived daily summary for ${dayLabel} (${personaState.archivedDailySummaries.length} days archived)`);
  }

  // Archive relationship narratives
  const relNarratives = personaState.relationshipNarratives;
  if (relNarratives && Object.keys(relNarratives).length > 0) {
    personaState.archivedRelationshipNarratives.push({
      day: dayLabel,
      narratives: { ...relNarratives },
    });

    if (personaState.archivedRelationshipNarratives.length > MAX_ARCHIVED_DAYS) {
      personaState.archivedRelationshipNarratives.shift();
    }
  }
}

/**
 * Check if a character is due for long-term pattern extraction.
 *
 * @param {object} personaState - Character state
 * @returns {boolean}
 */
function isDuePatternExtraction(personaState) {
  const archived = personaState.archivedDailySummaries || [];
  const name = personaState.name || 'unknown';
  const lastCount = lastPatternExtractionDay[name] || 0;

  // Need at least PATTERN_EXTRACTION_INTERVAL_DAYS new archives since last extraction
  return archived.length >= PATTERN_EXTRACTION_INTERVAL_DAYS &&
    (archived.length - lastCount) >= PATTERN_EXTRACTION_INTERVAL_DAYS;
}

/**
 * Extract long-term patterns from archived daily summaries via LLM.
 * Produces a narrative about habits, routines, and recurring behaviors.
 *
 * @param {object} member - Family member state
 * @param {object} personaState - Character state
 * @param {object} llmClient - LLM client instance
 * @returns {Promise<string|null>} The pattern narrative, or null
 */
async function extractLongTermPatterns(member, personaState, llmClient) {
  const name = member.name;
  const persona = getPersona(name);
  if (!persona) return null;

  const archived = personaState.archivedDailySummaries || [];
  if (archived.length < PATTERN_EXTRACTION_INTERVAL_DAYS) return null;

  // Compile archived daily summaries
  const dailyEntries = archived.map(a =>
    `${a.day} (mood: ${a.mood}, intensity: ${Math.round((a.moodIntensity || 0.5) * 100)}%):\n${a.narrative}`
  ).join('\n\n');

  // Compile archived relationship trends
  const archivedRels = personaState.archivedRelationshipNarratives || [];
  let relTrends = '';
  if (archivedRels.length >= 2) {
    // Compare most recent vs oldest to find trends
    const familyNames = new Set();
    archivedRels.forEach(a => Object.keys(a.narratives).forEach(n => familyNames.add(n)));
    const trendLines = [];
    for (const familyMember of familyNames) {
      const recent = archivedRels[archivedRels.length - 1]?.narratives[familyMember];
      const older = archivedRels[0]?.narratives[familyMember];
      if (recent && older) {
        trendLines.push(`${familyMember}:\n  Then: ${older}\n  Now: ${recent}`);
      }
    }
    if (trendLines.length > 0) {
      relTrends = '\n\nRELATIONSHIP CHANGES OVER TIME:\n' + trendLines.join('\n\n');
    }
  }

  const previousPatterns = personaState.longTermPatterns || '';

  const systemPrompt = `You ARE ${persona.fullName} (${persona.age}, ${persona.role}).
You're reflecting on your life over the past several days — looking for patterns, habits, and recurring themes.
This is your private self-awareness. What do you notice about yourself?

RULES:
- Write in first person ("I tend to..." "I've been..." "Every morning I...")
- Focus on PATTERNS and HABITS — things that recur, not one-off events
- Note any relationship trends — are things with someone getting better? Worse?
- Include emotional patterns — are you generally stressed? Content? Moody?
- 4-6 sentences. These are observations, not a diary entry.
- If previous patterns still hold, keep them. Add new observations.
- Be personality-appropriate. ${persona.age < 10 ? "Simple observations, big emotions." : persona.age < 18 ? "Self-aware but dramatic about it." : "Adult self-reflection."}`;

  const userPrompt = `${previousPatterns ? `MY PREVIOUS SELF-OBSERVATIONS:\n${previousPatterns}\n\n` : ''}MY RECENT DAILY SUMMARIES:
${dailyEntries}
${relTrends}

What patterns do I notice in my own behavior? What habits have formed? How are my relationships trending?
Write as ME reflecting on myself — not a report about me.`;

  try {
    const response = await llmClient.reason(systemPrompt, userPrompt, {
      temperature: 0.7,
      max_tokens: PATTERN_MAX_TOKENS,
      top_p: 0.9,
    });

    if (response) {
      let patterns = response.trim();
      if (patterns.startsWith('"') && patterns.endsWith('"')) {
        patterns = patterns.slice(1, -1);
      }

      personaState.longTermPatterns = patterns;
      lastPatternExtractionDay[name] = archived.length;

      console.log(`[LongTermMemory] ${name} extracted long-term patterns (${patterns.length} chars)`);
      return patterns;
    }
  } catch (err) {
    console.error(`[LongTermMemory] Error extracting patterns for ${name}: ${err.message}`);
  }
  return null;
}

/**
 * Get the long-term patterns narrative for prompt injection.
 *
 * @param {object} personaState - Character state
 * @returns {string} Pattern narrative or empty string
 */
function getLongTermPatterns(personaState) {
  return personaState.longTermPatterns || '';
}

// ═══════════════════════════════════════════════════════════════
//  HABIT FORMATION SYSTEM (goals.md)
//  Repeated behaviors across days become habits that are harder
//  to break and surface in prompts automatically.
// ═══════════════════════════════════════════════════════════════

/**
 * Track an action for habit formation.
 * Called when a character performs an activity.
 *
 * @param {string} name - Character name
 * @param {string} action - Activity ID
 * @param {number} gameHour - Current game hour
 */
function trackActionForHabit(name, action, gameHour) {
  if (!habitTrackers[name]) {
    habitTrackers[name] = { actionCounts: {}, streaks: {}, lastDayActions: {} };
  }
  const tracker = habitTrackers[name];

  // Normalize action to a simplified key
  const key = action.toLowerCase().replace(/[^a-z_]/g, '');
  if (!key) return;

  // Track daily count
  tracker.actionCounts[key] = (tracker.actionCounts[key] || 0) + 1;

  // Track time-of-day association (morning/afternoon/evening)
  const timeSlot = gameHour < 12 ? 'morning' : gameHour < 18 ? 'afternoon' : 'evening';
  const timeKey = `${key}_${timeSlot}`;
  tracker.actionCounts[timeKey] = (tracker.actionCounts[timeKey] || 0) + 1;
}

/**
 * Process day transition for habit tracking.
 * Calculates streaks and identifies emerging/established habits.
 *
 * @param {string} name - Character name
 */
function processHabitDay(name) {
  if (!habitTrackers[name]) return;
  const tracker = habitTrackers[name];

  // For each action done today, update streak
  for (const [action, count] of Object.entries(tracker.actionCounts)) {
    if (action.includes('_morning') || action.includes('_afternoon') || action.includes('_evening')) continue;
    if (count > 0) {
      tracker.streaks[action] = (tracker.streaks[action] || 0) + 1;
    }
  }

  // Decay streaks for actions NOT done today
  for (const [action, streak] of Object.entries(tracker.streaks)) {
    if (!tracker.actionCounts[action] || tracker.actionCounts[action] === 0) {
      tracker.streaks[action] = Math.max(0, streak - 1);
    }
  }

  // Save today's actions as last-day reference
  tracker.lastDayActions = { ...tracker.actionCounts };
  tracker.actionCounts = {};
}

/**
 * Get established habits for a character (streak ≥ 3 days).
 * Returns habit descriptions suitable for LLM prompt injection.
 *
 * @param {string} name - Character name
 * @returns {Array<{action: string, streak: number, strength: string}>}
 */
function getEstablishedHabits(name) {
  if (!habitTrackers[name]) return [];
  const tracker = habitTrackers[name];
  const habits = [];

  for (const [action, streak] of Object.entries(tracker.streaks)) {
    if (streak < 3) continue;
    if (action.includes('_morning') || action.includes('_afternoon') || action.includes('_evening')) continue;

    const strength = streak >= 7 ? 'deeply ingrained' :
                     streak >= 5 ? 'strong' :
                     streak >= 3 ? 'emerging' : 'weak';

    habits.push({
      action: action.replace(/_/g, ' '),
      streak,
      strength,
    });
  }

  // Sort by streak descending
  habits.sort((a, b) => b.streak - a.streak);
  return habits.slice(0, 8);
}

/**
 * Build a habit narrative for prompt injection.
 *
 * @param {string} name - Character name
 * @returns {string|null} Habit narrative or null if no habits
 */
function buildHabitNarrative(name) {
  const habits = getEstablishedHabits(name);
  if (habits.length === 0) return null;

  const lines = habits.map(h =>
    `- ${h.action} (${h.strength} habit, ${h.streak} days running)`
  );
  return `YOUR HABITS (you tend to do these regularly):\n${lines.join('\n')}`;
}

module.exports = {
  isDueSummaryUpdate,
  updateDailySummary,
  getDailySummaryNarrative,
  queueRelationshipUpdate,
  processRelationshipUpdates,
  getRelationshipNarrative,
  getAllRelationshipNarratives,
  resetDailyTracking,
  archiveDailySummaries,
  isDuePatternExtraction,
  extractLongTermPatterns,
  getLongTermPatterns,
  trackActionForHabit,
  processHabitDay,
  getEstablishedHabits,
  buildHabitNarrative,
};
