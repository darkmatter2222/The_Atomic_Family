/**
 * ReasoningPrompt.js — Constructs structured prompts for the LLM.
 *
 * Builds a system prompt (character identity) and user prompt
 * (current situation + available actions) that the LLM uses to
 * reason about what the character should do next.
 *
 * The prompt is designed for Qwen 2.5 3B — structured, concise,
 * and demanding strict JSON output.
 *
 * CommonJS module (server-side).
 */

const {
  getPersona,
  getCurrentScheduleEntry,
  buildMemorySummary,
  buildConversationSummary,
  FAMILY_DATA,
  ENVIRONMENT_RULES,
} = require('./PersonaManager');

const { buildPerception, getTimeOfDayLabel } = require('./EnvironmentPerception');

const {
  getInteractionsForRole,
  filterByTimeWindow,
  getCriticalNeeds,
} = require('./InteractionData');

/**
 * Build the system prompt — character identity and behavioral rules.
 * This stays relatively stable between calls for the same character.
 */
function buildSystemPrompt(memberName) {
  const persona = getPersona(memberName);
  if (!persona) return 'You are a family member in a house simulation.';

  return `You are the inner mind of ${persona.fullName}, a ${persona.age}-year-old ${persona.gender} (${persona.role}) in the Atomic family household.

PERSONALITY: ${persona.personality.summary}
TRAITS: ${persona.traits.join(', ')}
VALUES: ${persona.values.join(', ')}
LIKES: ${persona.likes.slice(0, 6).join(', ')}
DISLIKES: ${persona.dislikes.slice(0, 5).join(', ')}
SPEECH STYLE: ${persona.speechStyle}

HOUSE RULES:
${FAMILY_DATA.houseRules.slice(0, 10).map(r => `- ${r}`).join('\n')}

IMPORTANT BEHAVIORAL RULES:
- You MUST respond with ONLY valid JSON — no other text.
- Think about what ${persona.name} would realistically do at this moment.
- Consider your needs, schedule, time of day, and who's around.
- Respect social norms: don't enter an occupied bathroom, don't mow the lawn at night, use indoor voices.
- If someone spoke to you recently, acknowledge it in your decision.
- You are aware of the room you're in and can only see people in the same room.
- ${persona.age < 10 ? 'You need adult supervision for swimming and the kitchen stove.' : ''}
- ${persona.role === 'father' || persona.role === 'mother' ? 'You are a parent with authority. Monitor kids\' safety and enforce rules.' : ''}
- Turn off lights when you leave a room if you are the last person.`;
}

/**
 * Build the user prompt — current situation and available actions.
 * This changes every reasoning cycle.
 */
function buildUserPrompt(member, allMembers, gameTime, roomLights, personaState, recentEvents = []) {
  const persona = getPersona(member.name);
  const perception = buildPerception(member, allMembers, gameTime, roomLights, recentEvents);
  const schedule = getCurrentScheduleEntry(member.name, gameTime);
  const memories = buildMemorySummary(personaState);
  const conversations = buildConversationSummary(personaState);

  // Get available interactions
  const availableInteractions = getFilteredInteractions(member.role, gameTime, perception);

  // Format needs
  const needsStr = formatNeeds(member.needs);
  const criticalNeeds = getCriticalNeeds(member.needs, 25);
  const criticalStr = criticalNeeds.length > 0
    ? `⚠ CRITICAL NEEDS: ${criticalNeeds.map(n => `${n.key} (${Math.round(n.value)}%)`).join(', ')}`
    : 'All needs are okay.';

  // Format time
  const timeStr = gameTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York'
  });
  const dayStr = gameTime.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'America/New_York'
  });

  // Format visible people
  const peopleSeen = perception.visible.peopleInRoom.length > 0
    ? perception.visible.peopleInRoom.map(p =>
        `${p.name} (${p.activity || p.state})`
      ).join(', ')
    : 'Nobody else here.';

  // Format sounds
  const soundsHeard = perception.audible.length > 0
    ? perception.audible.map(s => s.description).join('; ')
    : 'Nothing unusual.';

  // Format schedule
  const scheduleStr = schedule
    ? `Current: ${schedule.current.activity}${schedule.next ? ` | Next: ${schedule.next.time} — ${schedule.next.activity}` : ''}`
    : 'No schedule entry.';

  // Format interactions as numbered list
  const interactionList = availableInteractions
    .slice(0, 20) // limit to 20 options for smaller model
    .map((ia, i) => `${i + 1}. ${ia.id} — ${ia.label} (${ia.category}, ${ia.duration.min}-${ia.duration.max}min)`)
    .join('\n');

  return `## Current Situation
TIME: ${dayStr}, ${timeStr} (${perception.environment.timeOfDay})
LOCATION: ${perception.visible.roomName}
MOOD: ${personaState.mood} (stress: ${Math.round(personaState.stressLevel * 100)}%)
${member.activityLabel ? `CURRENTLY DOING: ${member.activityLabel}` : 'CURRENTLY: idle'}

## My Needs (0=desperate, 100=full)
${needsStr}
${criticalStr}

## What I See
Room: ${perception.visible.roomName}${perception.environment.isDark ? ' (dark — lights are off)' : ''}
People here: ${peopleSeen}
Bathroom occupied: ${perception.environment.bathroomOccupied ? 'Yes' : 'No'}
Sleeping family: ${perception.environment.sleepingMembers.length > 0 ? perception.environment.sleepingMembers.join(', ') : 'Nobody sleeping'}

## What I Hear
${soundsHeard}

## My Schedule
${scheduleStr}
${schedule?.isWeekend ? '(Weekend)' : '(Weekday)'}

## Recent Memory
${memories}

## Recent Conversations
${conversations}

## Available Actions (pick ONE by id)
${interactionList}

## Instructions
Decide what to do next. Think about:
1. Your most pressing needs (eat if hungry, sleep if tired, bathroom if urgent)
2. The current time and your schedule
3. Social context — who's around, what they're doing
4. Recent conversations or requests made of you
5. Should you say something to someone nearby?
6. Should you turn on/off the light in this room?

Respond with ONLY this JSON (no other text):
{
  "thought": "1-2 sentence internal reasoning",
  "action": "interaction_id from the list above",
  "speech": "what you say out loud, or null",
  "speechTarget": "name of person, or null",
  "emotion": "current emotion word",
  "lightAction": "on" or "off" or null
}`;
}

/**
 * Get interactions filtered by role, time, and environmental constraints.
 */
function getFilteredInteractions(role, gameTime, perception) {
  const hour = gameTime.getHours() + gameTime.getMinutes() / 60;
  let pool = getInteractionsForRole(role);
  pool = filterByTimeWindow(pool, hour);

  // Filter out bathroom interactions if bathroom is occupied
  if (perception.environment.bathroomOccupied) {
    pool = pool.filter(i => i.room !== 'bathroom');
  }

  // Filter out loud outdoor activities at night
  if (hour >= 21 || hour < 6) {
    const noisyOutdoor = ['mow_lawn', 'jump_trampoline', 'kick_soccer_ball', 'shoot_hoops'];
    pool = pool.filter(i => !noisyOutdoor.includes(i.id));
  }

  // Filter out swimming for kids if no adult is in backyard/pool area
  if (role === 'son' || role === 'daughter') {
    const adultsOutside = perception.visible?.peopleInRoom?.some(p =>
      p.role === 'father' || p.role === 'mother'
    ) || false;
    // This is approximate — we check if an adult is nearby
    if (!adultsOutside && perception.self.room !== '_exterior') {
      pool = pool.filter(i => !['swim_in_pool', 'swim_laps', 'pool_cannonball', 'diving_board_dive'].includes(i.id));
    }
  }

  return pool;
}

/**
 * Format needs as a readable string.
 */
function formatNeeds(needs) {
  if (!needs) return 'Unknown';
  return Object.entries(needs)
    .map(([key, val]) => {
      const bar = val > 70 ? '🟢' : val > 40 ? '🟡' : val > 20 ? '🟠' : '🔴';
      return `${bar} ${key}: ${Math.round(val)}%`;
    })
    .join('\n');
}

/**
 * Parse the LLM response into a structured decision.
 * Handles malformed JSON gracefully.
 */
function parseDecision(rawResponse, availableInteractions) {
  if (!rawResponse) return null;

  try {
    // Try to extract JSON from the response (in case there's extra text)
    let jsonStr = rawResponse.trim();

    // Find the first { and last }
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(jsonStr);

    // Validate the action is a real interaction
    const actionId = parsed.action;
    const validAction = availableInteractions.some(i => i.id === actionId);

    return {
      thought: String(parsed.thought || 'No reasoning provided.'),
      action: validAction ? actionId : null,
      speech: parsed.speech && parsed.speech !== 'null' ? String(parsed.speech).substring(0, 200) : null,
      speechTarget: parsed.speechTarget && parsed.speechTarget !== 'null' ? String(parsed.speechTarget) : null,
      emotion: String(parsed.emotion || 'neutral'),
      lightAction: ['on', 'off'].includes(parsed.lightAction) ? parsed.lightAction : null,
      valid: validAction,
      raw: parsed,
    };
  } catch (err) {
    console.error(`[ReasoningPrompt] Failed to parse LLM response: ${err.message}`);
    console.error(`[ReasoningPrompt] Raw response: ${rawResponse?.substring(0, 300)}`);
    return null;
  }
}

module.exports = {
  buildSystemPrompt,
  buildUserPrompt,
  parseDecision,
  getFilteredInteractions,
  formatNeeds,
};
