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
  buildDailySummary,
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
- You can ONLY see and talk to people in the SAME room as you. Do not address people in other rooms.
- If you want to talk to someone in another room, walk there first (pick an action in their room).
- ${persona.age < 10 ? 'You need adult supervision for swimming and the kitchen stove.' : ''}
- ${persona.role === 'father' || persona.role === 'mother' ? 'You are a parent with authority. Monitor kids\' safety and enforce rules.' : ''}
- Turn off lights when you leave a room if you are the last person.
- Don't repeat yourself. Vary your activities and speech.`;
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
  const dailySummary = buildDailySummary(personaState);

  // Get available interactions
  const availableInteractions = getFilteredInteractions(member.role, gameTime, perception);

  // ── Sort interactions: needs-addressing actions first ──
  // Actions that restore critical needs get priority in the list
  const urgentNeeds = getCriticalNeeds(member.needs, 40); // threshold 40 = somewhat urgent
  const urgentKeys = new Set(urgentNeeds.map(n => n.key));

  const sortedInteractions = [...availableInteractions].sort((a, b) => {
    // Score: how much does this action help critical needs?
    const scoreA = getNeedsScore(a, urgentKeys);
    const scoreB = getNeedsScore(b, urgentKeys);
    return scoreB - scoreA; // Higher score = more helpful = earlier in list
  });

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
    ? perception.visible.peopleInRoom.map(p => {
        let desc = `${p.name} (${p.activity || p.state})`;
        if (p.destination && p.state === 'walking') {
          desc = `${p.name} (walking toward ${p.destination})`;
        }
        return desc;
      }).join(', ')
    : 'Nobody else here.';

  // Format sounds
  const soundsHeard = perception.audible.length > 0
    ? perception.audible.map(s => s.description).join('; ')
    : 'Nothing unusual.';

  // Format schedule
  const scheduleStr = schedule
    ? `Current: ${schedule.current.activity}${schedule.next ? ` | Next: ${schedule.next.time} — ${schedule.next.activity}` : ''}`
    : 'No schedule entry.';

  // Format interactions as numbered list (IDs only, no numbering in the value)
  const interactionList = sortedInteractions
    .slice(0, 20) // limit to 20 options for smaller model
    .map((ia, i) => `${i + 1}. ${ia.id} — ${ia.label} (${ia.category}, ${ia.duration.min}-${ia.duration.max}min)`)
    .join('\n');

  // Build anti-repetition context — stronger, tracks last 5
  const recentActions = personaState.recentInteractions?.slice(-5) || [];
  const recentActionsStr = recentActions.length > 0
    ? `⚠ AVOID REPEATING: ${recentActions.join(', ')} — You just did these! Pick something DIFFERENT!`
    : '';

  // Dark room warning
  const darkRoomWarning = perception.environment.isDark
    ? `\n⚠ THIS ROOM IS DARK! Lights are off. Set lightAction to "on" before doing anything, or move to a lit room.`
    : '';

  // Current activity elapsed time context
  const elapsedStr = member.interactionTimer && member.interactionDuration
    ? ` (${Math.round(member.interactionTimer)}s / ${Math.round(member.interactionDuration)}s — ${Math.round((member.interactionTimer / member.interactionDuration) * 100)}% done)`
    : '';

  // Room light status
  const currentRoomLit = roomLights[member.currentRoom] !== false;
  const lightStatusEntries = Object.entries(perception.environment.roomLights || {});
  const lightStatus = lightStatusEntries.length > 0
    ? lightStatusEntries.map(([room, on]) => `${room}: ${on ? '💡on' : '🌑off'}`).join(', ')
    : '';

  // Meal time proximity
  const mealReminder = getMealReminder(perception.environment.hour, member);

  // Parent engagement hints
  const parentHints = getParentEngagementHints(member, perception);

  return `## Current Situation
TIME: ${dayStr}, ${timeStr} (${perception.environment.timeOfDay})
LOCATION: ${perception.visible.roomName}${!currentRoomLit ? ' ⚠ DARK — lights are off!' : ''}
MOOD: ${personaState.mood} (stress: ${Math.round(personaState.stressLevel * 100)}%)
${member.activityLabel ? `CURRENTLY DOING: ${member.activityLabel}${elapsedStr}` : 'CURRENTLY: idle'}

## My Needs (0=desperate, 100=full)
${needsStr}
${criticalStr}

## What I See
Room: ${perception.visible.roomName}${perception.environment.isDark ? ' (dark — lights are off)' : ''}
People here: ${peopleSeen}
Nearby room lights: ${lightStatus}
Bathroom occupied: ${perception.environment.bathroomOccupied ? 'Yes' : 'No'}
Sleeping family: ${perception.environment.sleepingMembers.length > 0 ? perception.environment.sleepingMembers.join(', ') : 'Nobody sleeping'}

${buildConversationResponseSection(conversationContext)}

## What I Hear
${soundsHeard}

## My Schedule
${scheduleStr}
${schedule?.isWeekend ? '(Weekend)' : '(Weekday)'}

## What I've Done Today
${dailySummary}

## Recent Memory
${memories}

## Recent Conversations
${conversations}
${recentActionsStr}
${darkRoomWarning}

${buildAgendaSection(agenda, gameTime)}

## Time Awareness
It is currently ${timeStr}. Think about how long each activity takes.
${getTimeUrgencyHints(perception.environment.hour, schedule, member.needs, member.name)}
${mealReminder}
${parentHints}

## Available Actions (pick ONE by id)
${interactionList}

## Instructions
Decide what to do next. Think carefully:
1. Your most pressing needs (eat if hungry, sleep if tired, bathroom if urgent)
2. The current time — be conscious of how much time you have before your next scheduled activity
3. How long the activity will take — don't start a 30min task if dinner is in 10 minutes
4. Your plan for the day — what have you done, what's next on your agenda?
5. Social context — who's around, what they're doing
6. Recent conversations — RESPOND to people who spoke to you! This is your HIGHEST priority.
7. Should you say something to someone nearby? Be social and expressive!
8. Room lighting — turn on lights if the room is dark before doing anything!

CRITICAL CONVERSATION RULES:
- You can ONLY talk to people who are listed in "People here" above. They must be IN YOUR ROOM.
- Do NOT talk to people who are not in the same room. You cannot see or hear them.
- If someone just spoke TO you (see Active Conversation above), you MUST reply with speech directed at them.
- Set speechTarget to the exact NAME of the person (e.g., "Dad", "Mom", "Emma", "Lily", "Jack").
- Have natural back-and-forth conversations — ask follow-up questions, react to what they said.
- If nobody is in the room with you, set speech to null and speechTarget to null.
- Do NOT target someone in a different room. Only target people listed in "People here".
- Express your personality through how you speak!

LIGHT RULES:
- Set lightAction to "on" ONLY if the room is dark and you need light for your activity.
- Set lightAction to "off" ONLY if you are the LAST person leaving the room (nobody else listed here).
- If lights are already on, set lightAction to null.
- If lights are already off and you don't need them, set lightAction to null.

VARIETY: Don't repeat the same action or speech you just did. Try different activities!

Respond with ONLY this JSON (no other text):
{
  "thought": "2-3 sentence internal reasoning about your decision",
  "action": "interaction_id from the list above (JUST the id, not the number)",
  "speech": "what you say out loud, or null if silent",
  "speechTarget": "name of person you're addressing (must be in your room), or null",
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
${conversationContext.from} just spoke to you! You are in a face-to-face conversation with them in the same room.

CONVERSATION SO FAR (turn ${conversationContext.turnNumber}):
${conversationContext.fullThread}

${conversationContext.from} said: "${conversationContext.lastText}" (${conversationContext.lastEmotion})

→ You MUST set "speech" to your reply to ${conversationContext.from}.
→ You MUST set "speechTarget" to "${conversationContext.from}" (exactly this name).
→ Your reply should be natural and in-character. React to what they said!
→ Keep replies concise — 1-2 sentences, like real conversation.
→ If you want to end the conversation, say goodbye or farewell.
→ You can still pick an action — maybe continue what you were doing, or change activity.`;
}

/**
 * Get interactions filtered by role, time, room, and environmental constraints.
 * CRITICAL FIX: Only show interactions available in the character's CURRENT room
 * (plus _any room actions). Characters must walk to another room to access
 * its interactions — they shouldn't see kitchen actions from a bedroom.
 */
function getFilteredInteractions(role, gameTime, perception) {
  const hour = gameTime.getHours() + gameTime.getMinutes() / 60;
  const currentRoom = perception.self?.room || 'living_room';

  let pool = getInteractionsForRole(role);
  pool = filterByTimeWindow(pool, hour);

  // ── Room-based filtering — ONLY show actions in current room (+ _any) ──
  pool = pool.filter(i => i.room === currentRoom || i.room === '_any');

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
    if (!adultsOutside && currentRoom !== '_exterior') {
      pool = pool.filter(i => !['swim_in_pool', 'swim_laps', 'pool_cannonball', 'diving_board_dive'].includes(i.id));
    }
  }

  // ── Cap activity durations near bedtime ──
  // Don't offer 30+ min activities within 30 min of character's bedtime
  const bedtimes = { Jack: 20.0, Lily: 20.5, Emma: 21.5, Dad: 22.5, Mom: 22.0 };
  const memberName = perception.self?.memberName;
  const myBedtime = bedtimes[memberName];
  if (myBedtime && hour >= myBedtime - 0.5 && hour < myBedtime + 1) {
    pool = pool.filter(i => !i.duration || i.duration.max <= 30);
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
 * Fixes: strips numeric prefixes ("12. sit_on_couch" → "sit_on_couch"),
 *        handles numeric-only actions (index into available list).
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

    // ── Robust action ID parsing ──
    let actionId = parsed.action;

    if (actionId != null) {
      actionId = String(actionId).trim();

      // Strip numeric prefix like "12. sit_on_couch" → "sit_on_couch"
      actionId = actionId.replace(/^\d+\.\s*/, '');

      // Strip surrounding quotes
      actionId = actionId.replace(/^["']|["']$/g, '');

      // If it's purely a number, treat as 1-based index into available interactions
      if (/^\d+$/.test(actionId)) {
        const idx = parseInt(actionId, 10) - 1;
        if (idx >= 0 && idx < availableInteractions.length) {
          actionId = availableInteractions[idx].id;
        }
      }

      // Strip any description suffix (e.g., "sit_on_couch — Sit on the couch")
      if (actionId.includes(' — ') || actionId.includes(' - ')) {
        actionId = actionId.split(/\s[—-]\s/)[0].trim();
      }
    }

    // Validate the action is a real interaction
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
 * Enhanced with per-character bedtime awareness and parental duties.
 */
function getTimeUrgencyHints(hour, schedule, needs, memberName) {
  const hints = [];

  // Per-character bedtime awareness
  const bedtimes = { Jack: 20.0, Lily: 20.5, Emma: 21.5, Dad: 22.5, Mom: 22.0 };
  const myBedtime = bedtimes[memberName];

  // Meal time awareness
  if (hour >= 6.5 && hour < 7.5 && needs?.hunger < 60) hints.push('Breakfast time is approaching — you should eat soon.');
  if (hour >= 11 && hour < 12 && needs?.hunger < 60) hints.push('It\'s almost lunchtime.');
  if (hour >= 17 && hour < 18 && needs?.hunger < 60) hints.push('Dinner will be ready soon.');

  // Parent-specific bedtime enforcement reminders
  // Framed as awareness rather than direct visual knowledge
  if (memberName === 'Dad' || memberName === 'Mom') {
    if (hour >= 19.5 && hour < 20.0) hints.push('Jack\'s bedtime (8:00 PM) is coming up soon. You should start getting him ready for bed.');
    if (hour >= 20.0 && hour < 20.5) hints.push('It\'s past Jack\'s bedtime (8:00 PM). Go check that he\'s heading to bed. Lily\'s bedtime (8:30 PM) is next.');
    if (hour >= 20.5 && hour < 21.0) hints.push('It\'s past Lily\'s bedtime (8:30 PM). Go check on the kids\' rooms to make sure they\'re in bed.');
    if (hour >= 21.0 && hour < 21.5) hints.push('Emma should be heading to bed soon (9:30 PM). Remind her if you see her.');
    if (hour >= 21.5) hints.push('All kids should be in bed by now. If you see any of them still up, send them to bed.');
  }

  // Personal bedtime awareness
  if (myBedtime) {
    const timeUntilBed = myBedtime - hour;
    if (timeUntilBed > 0 && timeUntilBed < 0.5) {
      hints.push(`Your bedtime is in less than 30 minutes! Start winding down.`);
    } else if (hour >= myBedtime && hour < 24) {
      hints.push(`It's past your bedtime! You should go to sleep.`);
    } else if (timeUntilBed > 0 && timeUntilBed < 1) {
      hints.push(`About ${Math.round(timeUntilBed * 60)} minutes until your bedtime.`);
    }
  }

  // General late night
  if (hour >= 22 && (memberName === 'Dad' || memberName === 'Mom')) {
    hints.push('It\'s getting late. The kids should all be asleep by now. Consider winding down.');
  }

  // Morning awareness
  if (hour >= 5 && hour < 6) hints.push('Early morning — the day is just starting.');

  // Parent morning duties
  if ((memberName === 'Mom' || memberName === 'Dad') && hour >= 6.5 && hour < 8) {
    hints.push('Morning routine: make sure kids are up and getting breakfast!');
  }

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
 * Get meal-time reminders for parents to coordinate family meals.
 * Also provides awareness of who's eating and who hasn't eaten yet.
 */
function getMealReminder(hour, member) {
  const isParent = member.role === 'father' || member.role === 'mother';

  const meals = [
    { name: 'breakfast', start: 7.0, end: 8.5, prepStart: 6.5 },
    { name: 'lunch', start: 11.5, end: 13.0, prepStart: 11.0 },
    { name: 'dinner', start: 17.5, end: 19.0, prepStart: 17.0 },
  ];

  const lines = [];
  for (const meal of meals) {
    if (isParent && hour >= meal.prepStart && hour < meal.start) {
      lines.push(`🍽 It's almost ${meal.name} time! Consider starting to prepare ${meal.name} in the kitchen.`);
    }
    if (hour >= meal.start && hour < meal.start + 0.5) {
      if (isParent) {
        lines.push(`🍽 Time for ${meal.name}! The family should be eating together. Call everyone to the kitchen/dining area.`);
      } else {
        lines.push(`🍽 It's ${meal.name} time! You should head to the kitchen to eat.`);
      }
    }
    // Gentle reminder if meal window is passing and hunger is low
    if (hour >= meal.start + 0.5 && hour < meal.end && (member.needs?.hunger || 100) < 50) {
      lines.push(`🍽 You should eat ${meal.name} soon — you're getting hungry.`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate proactive parent engagement hints.
 * Parents should actively engage with kids — reading bedtime stories,
 * checking homework, playing together, teaching skills.
 */
function getParentEngagementHints(member, perception) {
  const isParent = member.role === 'father' || member.role === 'mother';
  if (!isParent) return '';

  const hints = [];
  const hour = perception.environment.hour;
  const kidsInRoom = perception.visible.peopleInRoom.filter(p =>
    p.role === 'son' || p.role === 'daughter'
  );

  // If kids are in the room, suggest engagement
  if (kidsInRoom.length > 0) {
    const kidNames = kidsInRoom.map(k => k.name).join(' and ');
    if (hour >= 18 && hour < 20) {
      hints.push(`🧒 ${kidNames} ${kidsInRoom.length > 1 ? 'are' : 'is'} here with you. Consider spending quality time — play a game, read together, or help with homework.`);
    }
    if (hour >= 19.5 && hour < 21) {
      hints.push(`🌙 It's getting close to bedtime for the kids. Consider reading a bedtime story or helping them get ready for bed.`);
    }
    // Morning routine
    if (hour >= 6.5 && hour < 8) {
      hints.push(`☀️ ${kidNames} ${kidsInRoom.length > 1 ? 'are' : 'is'} here. Make sure they eat breakfast and get ready for the day.`);
    }
  }

  // If alone and kids are awake, suggest going to check on them
  if (kidsInRoom.length === 0 && hour >= 15 && hour < 20) {
    const awakeKids = ['Jack', 'Lily', 'Emma'].filter(name =>
      !perception.environment.sleepingMembers.includes(name)
    );
    if (awakeKids.length > 0 && Math.random() < 0.3) { // Only hint occasionally
      hints.push(`💭 You haven't checked on the kids in a while. ${awakeKids.join(', ')} should be awake.`);
    }
  }

  return hints.length > 0 ? hints.join('\n') : '';
}

/**
 * Build a prompt for generating a daily agenda.
 * TIME-AWARE: Plan from CURRENT time forward, not always from 7 AM.
 */
function buildAgendaPrompt(member, gameTime, personaState) {
  const persona = getPersona(member.name);
  if (!persona) return '';

  const dayStr = gameTime.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'America/New_York'
  });
  const timeStr = gameTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York'
  });
  const schedule = getCurrentScheduleEntry(member.name, gameTime);
  const isWeekend = schedule?.isWeekend || false;
  const hour = gameTime.getHours() + gameTime.getMinutes() / 60;

  // Time-appropriate greeting
  let greeting;
  if (hour < 12) greeting = 'Good morning!';
  else if (hour < 18) greeting = 'Good afternoon!';
  else greeting = 'Good evening!';

  // How many hours left in the day
  const bedtimes = { Jack: 20.0, Lily: 20.5, Emma: 21.5, Dad: 22.5, Mom: 22.0 };
  const myBedtime = bedtimes[member.name] || 22.0;
  const hoursLeft = Math.max(0, myBedtime - hour);
  const hoursLeftStr = hoursLeft > 0 ? `You have about ${Math.round(hoursLeft)} hours until bedtime.` : 'It\'s past your bedtime — plan for just winding down.';

  // Expected number of items based on time remaining
  const expectedItems = Math.max(2, Math.min(8, Math.ceil(hoursLeft / 1.5)));

  return `${greeting} It's ${timeStr} on ${dayStr}. ${isWeekend ? 'It\'s the weekend!' : 'It\'s a weekday.'}

As ${persona.fullName} (${persona.age} years old, ${persona.role}), plan the REST of your day starting from NOW (${timeStr}).
${hoursLeftStr}
Think about:
- Your personality: ${persona.traits.slice(0, 4).join(', ')}
- Your likes: ${persona.likes.slice(0, 5).join(', ')}
- Your responsibilities
- Upcoming meal times (breakfast ~7-8am, lunch ~12pm, dinner ~6pm) — only include meals that haven't happened yet
- ${persona.age < 10 ? 'You\'re a kid — play, learn, and follow house rules!' : ''}
- ${persona.role === 'father' || persona.role === 'mother' ? 'As a parent, include time for the kids and household tasks.' : ''}
- ${isWeekend ? 'Weekend — more free time for fun activities!' : 'Regular day routine.'}

Current mood: ${personaState.mood}
Stress level: ${Math.round(personaState.stressLevel * 100)}%

IMPORTANT: Start your plan from the CURRENT time (${timeStr}), NOT from the morning.
Only plan activities that make sense for this time of day.

Respond with ONLY a JSON array of planned activities (no other text):
[{"time":"${gameTime.getHours()}:${String(gameTime.getMinutes()).padStart(2, '0')}","activity":"short description","duration":30}]

Make ${expectedItems} activities from now until bedtime.
Use 24-hour format for times (e.g., "14:30" not "2:30 PM"). Hours must be 0-23, minutes 0-59.
Keep activity descriptions SHORT (under 30 characters). No markdown, no explanation.`;
}

/**
 * Parse the LLM response for a daily agenda.
 * Sanitizes invalid times, caps to 8 items max.
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
      .map(item => {
        // Sanitize time — fix invalid formats like "8:60", "12:60"
        let timeStr = String(item.time);
        const timeParts = timeStr.split(':');
        if (timeParts.length === 2) {
          let h = parseInt(timeParts[0]) || 0;
          let m = parseInt(timeParts[1]) || 0;
          // Fix invalid minutes (8:60 → 9:00)
          if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
          // Clamp hours
          h = Math.max(0, Math.min(23, h));
          m = Math.max(0, Math.min(59, m));
          timeStr = `${h}:${String(m).padStart(2, '0')}`;
        }
        return {
          time: timeStr,
          activity: String(item.activity).substring(0, 100),
          duration: Math.min(parseInt(item.duration) || 30, 120), // Cap at 2 hours
          done: false,
          completedAt: null,
        };
      })
      .slice(0, 8); // Cap to 8 items max
  } catch (err) {
    console.error(`[ReasoningPrompt] Failed to parse agenda: ${err.message}`);
    return null;
  }
}

/**
 * Score how much an interaction helps critical/urgent needs.
 * Interactions that restore needs in the urgentKeys set score higher.
 */
function getNeedsScore(interaction, urgentKeys) {
  if (!interaction.needsEffects || urgentKeys.size === 0) return 0;
  let score = 0;
  for (const [need, amount] of Object.entries(interaction.needsEffects)) {
    if (urgentKeys.has(need) && amount > 0) {
      score += amount; // higher restoration = higher score
    }
  }
  return score;
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
