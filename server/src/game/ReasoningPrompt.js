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
function buildUserPrompt(member, allMembers, gameTime, roomLights, personaState, recentEvents = [], agenda = null, conversationContext = null) {
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

${buildConversationResponseSection(conversationContext)}

${buildAgendaSection(agenda, gameTime)}

## Time Awareness
It is currently ${timeStr}. Think about how long each activity takes.
${getTimeUrgencyHints(perception.environment.hour, schedule, member.needs)}

## Available Actions (pick ONE by id)
${interactionList}

## Instructions
Decide what to do next. Think carefully and deeply about:
1. Your most pressing needs (eat if hungry, sleep if tired, bathroom if urgent)
2. The current time — be very conscious of how much time you have before your next scheduled activity
3. How long the activity will take — don't start a 30min task if dinner is in 10 minutes
4. Your plan for the day — what have you done, what's next on your agenda?
5. Social context — who's around, what they're doing, should you interact?
6. Recent conversations — RESPOND to people who spoke to you! If someone said something to you, your reply is the HIGHEST priority.
7. Should you say something to someone nearby? Be social and expressive! Have real conversations.
8. Should you turn on/off the light in this room?

CONVERSATION RULES:
- If someone just spoke TO you, you MUST reply with speech directed at them. This is your #1 priority!
- When you speak, always set speechTarget to the NAME of the person you're talking to.
- Don't talk to people who aren't in the same room as you.
- Have natural back-and-forth conversations — ask follow-up questions, react to what was said.
- Express your personality through how you speak — your speech style matters!

Be autonomous and proactive. Don't just repeat the same activities. Explore your personality.
Express yourself through speech regularly — comment on what you're doing, ask questions, make observations.

Respond with ONLY this JSON (no other text):
{
  "thought": "2-3 sentence internal reasoning about your decision",
  "action": "interaction_id from the list above",
  "speech": "what you say out loud (be expressive!), or null",
  "speechTarget": "name of person you're addressing, or null",
  "emotion": "current emotion word",
  "lightAction": "on" or "off" or null
}`;
}

/**
 * Build a section for the user prompt when the character needs to
 * reply to an active conversation. This creates the two-way dialogue.
 */
function buildConversationResponseSection(conversationContext) {
  if (!conversationContext) return '';

  return `## ⚠️ ACTIVE CONVERSATION — YOU MUST REPLY!
${conversationContext.from} just spoke to you! You are in a conversation with them.

CONVERSATION SO FAR (turn ${conversationContext.turnNumber}):
${conversationContext.fullThread}

${conversationContext.from} said: "${conversationContext.lastText}" (${conversationContext.lastEmotion})

→ You MUST set "speech" to your reply to ${conversationContext.from}.
→ You MUST set "speechTarget" to "${conversationContext.from}".
→ Your reply should be natural and in-character. React to what they said!
→ You can still pick an action — maybe continue what you're doing, or change based on the conversation.`;
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

/**
 * Build an agenda section for the user prompt.
 */
function buildAgendaSection(agenda, gameTime) {
  if (!agenda || !agenda.plan || agenda.plan.length === 0) {
    return '## My Plan for Today\nNo plan yet — I should think about what I want to accomplish today.';
  }

  const hour = gameTime.getHours() + gameTime.getMinutes() / 60;
  const items = agenda.plan.map((item, i) => {
    const status = item.done ? '✅' : '⬜';
    const timeStr = item.time || '??:??';
    const isCurrent = !item.done && parseTimeToHour(item.time) <= hour;
    const marker = isCurrent ? ' ← NOW' : '';
    return `${status} ${timeStr} — ${item.activity} (~${item.duration || '?'}min)${marker}`;
  }).join('\n');

  const completed = agenda.plan.filter(i => i.done).length;
  return `## My Plan for Today (${completed}/${agenda.plan.length} done)\n${items}`;
}

function parseTimeToHour(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  return parseInt(parts[0] || 0) + parseInt(parts[1] || 0) / 60;
}

/**
 * Generate time-urgency hints to make characters conscious of time.
 */
function getTimeUrgencyHints(hour, schedule, needs) {
  const hints = [];

  // Meal time awareness
  if (hour >= 6.5 && hour < 7.5 && needs?.hunger < 60) hints.push('Breakfast time is approaching — you should eat soon.');
  if (hour >= 11 && hour < 12 && needs?.hunger < 60) hints.push('It\'s almost lunchtime.');
  if (hour >= 17 && hour < 18 && needs?.hunger < 60) hints.push('Dinner will be ready soon.');

  // Bedtime awareness  
  if (hour >= 19.5 && hour < 20) hints.push('It\'s getting close to the kids\' bedtime.');
  if (hour >= 21 && hour < 22) hints.push('It\'s getting late. Consider winding down.');
  if (hour >= 22) hints.push('It\'s very late. You should probably go to sleep soon.');

  // Morning awareness
  if (hour >= 5 && hour < 6) hints.push('Early morning — the day is just starting.');

  // Schedule awareness
  if (schedule?.next) {
    const nextHour = parseTimeToHour(schedule.next.time);
    const timeUntil = nextHour - hour;
    if (timeUntil > 0 && timeUntil < 0.5) {
      hints.push(`Your next scheduled activity (${schedule.next.activity}) is in less than 30 minutes!`);
    } else if (timeUntil > 0 && timeUntil < 1) {
      hints.push(`You have about ${Math.round(timeUntil * 60)} minutes until ${schedule.next.activity}.`);
    }
  }

  return hints.length > 0 ? hints.join('\n') : 'No time-sensitive matters right now.';
}

/**
 * Build a prompt for generating a daily agenda.
 */
function buildAgendaPrompt(member, gameTime, personaState) {
  const persona = getPersona(member.name);
  if (!persona) return '';

  const dayStr = gameTime.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'America/New_York'
  });
  const schedule = getCurrentScheduleEntry(member.name, gameTime);
  const isWeekend = schedule?.isWeekend || false;

  return `It's the start of a new day: ${dayStr}. ${isWeekend ? 'It\'s the weekend!' : 'It\'s a weekday.'}

As ${persona.fullName} (${persona.age} years old, ${persona.role}), plan out your day.
Think about:
- Your personality: ${persona.traits.slice(0, 4).join(', ')}
- Your likes: ${persona.likes.slice(0, 5).join(', ')}
- Your responsibilities
- Meal times (breakfast ~7-8am, lunch ~12pm, dinner ~6pm)
- ${persona.age < 10 ? 'You\'re a kid — play, learn, and follow house rules!' : ''}
- ${persona.role === 'father' || persona.role === 'mother' ? 'As a parent, include time for the kids and household tasks.' : ''}
- ${isWeekend ? 'Weekend — more free time for fun activities!' : 'Regular day routine.'}

Current mood: ${personaState.mood}
Stress level: ${Math.round(personaState.stressLevel * 100)}%

Respond with ONLY a JSON array of planned activities (no other text):
[{"time":"7:00","activity":"short description","duration":30}]

Make 6-8 activities covering the whole day from waking to bedtime.
Keep activity descriptions SHORT (under 30 characters). No markdown, no explanation.`;
}

/**
 * Parse the LLM response for a daily agenda.
 */
function parseAgenda(rawResponse) {
  if (!rawResponse) return null;

  try {
    let jsonStr = rawResponse.trim();

    // Find array brackets
    const firstBracket = jsonStr.indexOf('[');
    let lastBracket = jsonStr.lastIndexOf(']');

    // If no closing bracket, try to repair truncated JSON
    if (firstBracket >= 0 && lastBracket <= firstBracket) {
      // Truncated — find the last complete object (ending with })
      let truncated = jsonStr.substring(firstBracket);
      const lastCloseBrace = truncated.lastIndexOf('}');
      if (lastCloseBrace > 0) {
        truncated = truncated.substring(0, lastCloseBrace + 1) + ']';
        jsonStr = truncated;
      } else {
        return null;
      }
    } else if (firstBracket >= 0 && lastBracket > firstBracket) {
      jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
    }

    // Remove trailing commas before ] (common LLM mistake)
    jsonStr = jsonStr.replace(/,\s*\]/g, ']');

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return null;

    return parsed
      .filter(item => item.time && item.activity)
      .map(item => ({
        time: String(item.time),
        activity: String(item.activity).substring(0, 100),
        duration: parseInt(item.duration) || 30,
        done: false,
        completedAt: null,
      }));
  } catch (err) {
    console.error(`[ReasoningPrompt] Failed to parse agenda: ${err.message}`);
    return null;
  }
}

module.exports = {
  buildSystemPrompt,
  buildUserPrompt,
  buildAgendaPrompt,
  parseDecision,
  parseAgenda,
  getFilteredInteractions,
  formatNeeds,
};
