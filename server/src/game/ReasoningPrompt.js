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

const { buildPerception, getTimeOfDayLabel, narratePerception } = require('./EnvironmentPerception');

const {
  getInteractionsForRole,
  filterByTimeWindow,
  getCriticalNeeds,
} = require('./InteractionData');

// ── New Narrator Modules ────────────────────────────────────────
const { narrateNeeds, narrateMood } = require('./NeedsNarrator');
const { narrateSkills } = require('./SkillsNarrator');
const { narrateRelationships } = require('./RelationshipNarrator');
const { narrateMemories, getMemoriesInvolving } = require('./MemoryManager');

/**
 * Build the system prompt — character identity and behavioral rules.
 * This stays relatively stable between calls for the same character.
 *
 * UPGRADED: You ARE the character, not "analyzing" one.
 * Personality-first, anti-optimization, human-authentic.
 */
function buildSystemPrompt(memberName) {
  const persona = getPersona(memberName);
  if (!persona) return 'You are a family member in a house simulation.';

  // Build quirk string
  const quirks = persona.quirks?.slice(0, 3).join(' ') || '';

  return `You ARE ${persona.fullName}. You are ${persona.age} years old. You are the ${persona.role} of the Atomic family.

WHO YOU ARE:
${persona.bio}

YOUR PERSONALITY: ${persona.personality.summary}
YOUR TRAITS: ${persona.traits.join(', ')}
YOUR VALUES: ${persona.values.join(', ')}
THINGS YOU LIKE: ${persona.likes.slice(0, 6).join(', ')}
THINGS YOU DISLIKE: ${persona.dislikes.slice(0, 5).join(', ')}

YOUR QUIRKS: ${quirks}

HOW YOU TALK: ${persona.speechStyle}
${persona.catchPhrases ? `THINGS YOU TEND TO SAY: ${persona.catchPhrases.slice(0, 4).join(' | ')}` : ''}

IMPORTANT — YOU ARE A PERSON, NOT AN AI:
- You do NOT optimize. You do NOT strategize. You make human decisions.
- Sometimes you pick the "wrong" thing because it feels right. That's authentic.
- You have moods that color everything. A bad mood makes even good options feel unappealing.
- You can be irrational, stubborn, lazy, impulsive, or overly cautious. That's human.
- You don't always know what you want. Sometimes you just... exist.
${getCharacterQuirks(memberName)}

HOUSE RULES (you know these but don't always follow them perfectly):
${FAMILY_DATA.houseRules.slice(0, 8).map(r => `- ${r}`).join('\n')}

BEHAVORIAL CONSTRAINTS:
- You MUST respond with ONLY valid JSON — no other text.
- You can ONLY see and talk to people in the SAME room as you.
- If you want to talk to someone elsewhere, walk there first.
- ${persona.age < 10 ? 'You need adult supervision for swimming and the kitchen stove.' : ''}
- ${persona.role === 'father' || persona.role === 'mother' ? 'You are a parent. You care about safety and rules, but you\'re also tired sometimes.' : ''}
- Turn off lights when leaving a room if you're the last person.
- Don't repeat the same action or conversation. Vary naturally.`;
}

/**
 * Build the user prompt — current situation and available actions.
 * This changes every reasoning cycle.
 *
 * UPGRADED: Uses personality-filtered narration instead of raw numbers.
 * The LLM never sees "hunger: 28%". It sees "Your stomach is growling..."
 */
function buildUserPrompt(member, allMembers, gameTime, roomLights, personaState, recentEvents = [], agenda = null, conversationContext = null) {
  const persona = getPersona(member.name);
  const perception = buildPerception(member, allMembers, gameTime, roomLights, recentEvents);
  const schedule = getCurrentScheduleEntry(member.name, gameTime);
  const conversations = buildConversationSummary(personaState);
  const dailySummary = buildDailySummary(personaState);

  // ── Personality-filtered narration ──
  const percNarrative = narratePerception(perception, member.name);
  const needsNarrative = narrateNeeds(member.name, member.needs, perception.environment.hour);
  const moodNarrative = narrateMood(member.name, personaState.mood, personaState.stressLevel);
  const memoryNarrative = narrateMemories(personaState, 8, personaState.mood);
  const skillsNarrative = narrateSkills(member.name, personaState.skills || {});

  // ── Build family location awareness (who's where in the house) ──
  const familyLocationStr = buildFamilyLocationAwareness(member, allMembers);

  // Get available interactions (with navigation and anti-repetition)
  const recentActions = personaState.recentInteractions?.slice(-15) || [];
  const availableInteractions = getFilteredInteractions(member.role, gameTime, perception, allMembers, recentActions);

  // ── Sort interactions: needs-addressing actions first ──
  const urgentNeeds = getCriticalNeeds(member.needs, 40);
  const urgentKeys = new Set(urgentNeeds.map(n => n.key));

  const sortedInteractions = [...availableInteractions].sort((a, b) => {
    const scoreA = getNeedsScore(a, urgentKeys);
    const scoreB = getNeedsScore(b, urgentKeys);
    return scoreB - scoreA;
  });

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

  // Format schedule
  const scheduleStr = schedule
    ? `Current: ${schedule.current.activity}${schedule.next ? ` | Next: ${schedule.next.time} — ${schedule.next.activity}` : ''}`
    : 'No schedule entry.';

  // Format interactions as numbered list — separate room actions from navigation
  const roomActions = sortedInteractions.filter(i => !i._isNavigation);
  const navActions = sortedInteractions.filter(i => i._isNavigation);

  const roomActionList = roomActions
    .slice(0, 18)
    .map((ia, i) => `${i + 1}. ${ia.id} — ${ia.label} (${ia.category}, ${ia.duration.min}-${ia.duration.max}min)`)
    .join('\n');

  const navActionList = navActions.length > 0
    ? '\n\n### Go Somewhere Else\n' + navActions
        .map((ia, i) => `${roomActions.length + i + 1}. ${ia.id} — ${ia.label}`)
        .join('\n')
    : '';

  const interactionList = roomActionList + navActionList;

  // Anti-repetition context (use the already-computed recentActions from above)
  const recentActionsStr = recentActions.length > 0
    ? `⚠ AVOID REPEATING: ${[...new Set(recentActions.slice(-5))].join(', ')} — You just did these! Pick something DIFFERENT! Variety is human.`
    : '';

  // Dark room warning
  const darkRoomWarning = perception.environment.isDark
    ? `\n⚠ THIS ROOM IS DARK! Set lightAction to "on" before doing anything, or move to a lit room.`
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

  // Relationship context for people in room
  const peopleInRoom = perception.visible.peopleInRoom;
  const relationshipData = persona.relationships || {};
  const recentEventsMap = {};
  for (const p of peopleInRoom) {
    recentEventsMap[p.name] = getMemoriesInvolving(personaState, p.name, 60);
  }
  const relationshipNarrative = peopleInRoom.length > 0
    ? narrateRelationships(member.name, relationshipData, recentEventsMap, perception.environment.hour)
    : '';

  return `## Where You Are & What You Perceive
${percNarrative}
${member.activityLabel ? `CURRENTLY DOING: ${member.activityLabel}${elapsedStr}` : 'CURRENTLY: idle'}
Nearby room lights: ${lightStatus}
Bathroom occupied: ${perception.environment.bathroomOccupied ? 'Yes' : 'No'}

## How You Feel
${needsNarrative}

${moodNarrative}

${skillsNarrative ? `## What You're Good At\n${skillsNarrative}` : ''}

${relationshipNarrative ? `## Your Family (who\'s here)\n${relationshipNarrative}` : ''}

${familyLocationStr ? `## Where Everyone Is\n${familyLocationStr}` : ''}

${buildConversationResponseSection(conversationContext)}

## Your Thoughts
${memoryNarrative}

## Your Schedule
${scheduleStr}
${schedule?.isWeekend ? '(Weekend)' : '(Weekday)'}

## What You've Done Today
${dailySummary}

## Recent Conversations
${conversations}
${_buildUnresolvedTopics(personaState)}
${_buildAttentionHint(personaState, member)}
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
Decide what to do next. Think as YOURSELF — first person, authentic, human.
Don't optimize. Don't strategize. Just... be yourself.

Consider naturally:
1. How your body feels — eat if hungry, sleep if tired, bathroom if urgent
2. What time it is — don't start a long task if dinner is soon
3. Who's around — social opportunities, parenting moments, or need for solitude
4. Recent conversations — RESPOND to people who spoke to you (HIGHEST priority)
5. What you actually WANT to do vs what you SHOULD do (these often conflict)
6. Room lighting — turn on lights if dark

CONVERSATION RULES:
- You can ONLY talk to people in "People here" — they must be IN YOUR ROOM.
- If someone just spoke TO you, you MUST reply with speech directed at them.
- Set speechTarget to the exact NAME (e.g., "Dad", "Mom", "Emma", "Lily", "Jack").
- If nobody is here, set speech to null and speechTarget to null.
- Have natural conversations — ask questions, react, be authentic.
- Express YOUR personality through how you speak!

LIGHT RULES (YOU control all lights — there is NO automatic lighting):
- Set lightAction to "on" if the room is dark and you need light to do anything.
- Set lightAction to "off" if you're the LAST person leaving a room.
- Otherwise set lightAction to null.
- Do NOT leave dark rooms without turning a light on first.

ACTIVITY PLAN RULES:
- For complex activities (cooking, cleaning, morning routine, getting snack, etc.), use "plan" to sequence 2-6 sub-steps.
- Each plan step is an action_id you'll execute in order. You walk to each location automatically.
- The first element of "plan" MUST match "action" (your current first step).
- Plan steps can span multiple rooms — just list them in the order you'd naturally do them.
- EXAMPLES:
  - Getting a snack: ["get_snack_fridge", "use_kitchen_counter", "eat_at_table"]
  - Morning routine: ["morning_shower", "use_bathroom_sink", "get_dressed"]
  - Full cooking: ["use_kitchen_stove", "use_kitchen_counter", "set_table", "eat_at_table", "clear_table"]
  - After toilet: ["use_toilet", "wash_hands_bathroom"]
- For simple single activities (watch TV, read, sleep), omit "plan" or set it to null.
- Keep plan steps realistic — things you'd ACTUALLY do in that order.

Respond with ONLY this JSON (no other text):
{
  "thought": "2-3 sentence internal reasoning — think as yourself",
  "action": "interaction_id from the list above (JUST the id)",
  "plan": ["step1_id", "step2_id", "step3_id"] or null,
  "speech": "what you say out loud, or null if silent",
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
 *
 * Room-based filtering: Only shows interactions from the character's CURRENT room
 * (plus _any room actions). But ALSO generates dynamic "go_to_[room]" navigation
 * actions so characters can move purposefully to other rooms.
/**
 * Character-specific behavioral tendencies that make each person
 * "suboptimal" in unique, authentic ways. These override the LLM's
 * tendency to always pick the globally optimal action.
 */
function getCharacterQuirks(name) {
  const quirks = {
    Dad: `
YOUR SPECIFIC TENDENCIES (these are YOU, not bugs):
- You NEED coffee in the morning. Without it, everything feels harder.
- You tend to zone out watching TV or tinkering in the garage. You lose track of time.
- You sometimes forget to eat because you're absorbed in a project.
- You're a bit of a night owl — you resist going to bed even when tired.
- When stressed, you retreat to the garage. It's your sanctuary.`,

    Mom: `
YOUR SPECIFIC TENDENCIES (these are YOU, not bugs):
- You often neglect your own hunger because you're busy taking care of everyone else.
- You clean or organize when anxious — it's how you process stress.
- You always check on the kids before bed, even if they say they're fine.
- You sometimes overcommit to tasks and end up exhausted.
- You gravitate toward the kitchen — it's your domain and comfort zone.`,

    Emma: `
YOUR SPECIFIC TENDENCIES (these are YOU, not bugs):
- You sacrifice sleep to read "just one more chapter." Books are more important than rest.
- You avoid noisy rooms. If it's too loud, you'll leave immediately.
- You prefer being alone or with one person — groups drain you.
- You sometimes forget meals when deep in a book.
- You roll your eyes at Jack's antics but secretly care about him.`,

    Jack: `
YOUR SPECIFIC TENDENCIES (these are YOU, not bugs):
- You IGNORE the need to use the bathroom until it's almost an emergency. You hate interrupting play.
- You're always in motion. Sitting still feels like punishment.
- You pick the FUN option almost every time, even when you should eat or rest.
- You're drawn to wherever the action is — if someone's doing something, you want in.
- You ask "why?" about everything. Adults find it exhausting. You find their answers fascinating.`,

    Lily: `
YOUR SPECIFIC TENDENCIES (these are YOU, not bugs):
- You follow your big sister Emma everywhere. She's your favorite person.
- You get cranky VERY fast when hungry. Low blood sugar = meltdown territory.
- You talk to your stuffed animals when no one's around. They're real friends to you.
- You're afraid of the dark — you want lights on and someone nearby at night.
- You want to do everything the big kids do, even things you're too small for.`,
  };

  return quirks[name] || '';
}

 /**
 * Consolidated interaction filtering for LLM prompts.
 *
 * Navigation actions include WHO is in each room so the LLM can make social
 * decisions about where to go.
 */
function getFilteredInteractions(role, gameTime, perception, allMembers, recentActions) {
  const hour = gameTime.getHours() + gameTime.getMinutes() / 60;
  const currentRoom = perception.self?.room || 'living_room';
  const memberName = perception.self?.memberName;

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

  // ── Bedtime enforcement ──
  const bedtimes = { Jack: 20.0, Lily: 20.5, Emma: 21.5, Dad: 22.5, Mom: 22.0 };
  const myBedtime = bedtimes[memberName];
  if (myBedtime) {
    const pastBedtime = hour - myBedtime;
    if (pastBedtime >= 0.5) {
      // Well past bedtime — only allow sleep, bathroom, and navigation to bedroom
      const sleepActions = new Set([
        'sleep_night', 'nap_daytime', 'nap_on_couch', 'read_in_bed',
        'kids_sleep_night_1', 'kids_sleep_night_2', 'kids_sleep_night_3',
        'kids_nap_1', 'kids_nap_3',
        'use_toilet', 'brush_teeth', 'wash_hands',
        'turn_off_lights', 'turn_off_lights_leaving',
      ]);
      pool = pool.filter(i => sleepActions.has(i.id) || i.room === '_any');
    } else if (pastBedtime >= 0) {
      // At bedtime — only short-duration wind-down activities
      pool = pool.filter(i => !i.duration || i.duration.max <= 30);
    } else if (pastBedtime > -0.5) {
      // Approaching bedtime — cap long activities
      pool = pool.filter(i => !i.duration || i.duration.max <= 30);
    }
  }

  // ── Hard-filter recently repeated actions ──
  // Tiered anti-repetition: 
  //   Last 3 actions: hard block any repeat (threshold 1)
  //   Last 10 actions: block if done 2+ times
  //   Last 15 actions: block if done 3+ times
  if (recentActions && recentActions.length > 0) {
    const last3 = new Set(recentActions.slice(-3));
    const actionCountsLast10 = {};
    const actionCountsLast15 = {};
    for (const a of recentActions.slice(-10)) {
      actionCountsLast10[a] = (actionCountsLast10[a] || 0) + 1;
    }
    for (const a of recentActions.slice(-15)) {
      actionCountsLast15[a] = (actionCountsLast15[a] || 0) + 1;
    }
    pool = pool.filter(i => {
      // Hard block: don't immediately repeat any of the last 3 actions
      if (last3.has(i.id)) return false;
      // Moderate block: done 2+ times in last 10
      if ((actionCountsLast10[i.id] || 0) >= 2) return false;
      // Soft block: done 3+ times in last 15
      if ((actionCountsLast15[i.id] || 0) >= 3) return false;
      return true;
    });

    // ── Category-level repetition check ──
    // Don't do 3+ actions from the same category in the last 5
    const last5 = recentActions.slice(-5);
    const categoryCounts = {};
    const { INTERACTION_MAP } = require('./InteractionData');
    for (const a of last5) {
      const interaction = INTERACTION_MAP[a];
      if (interaction?.category) {
        categoryCounts[interaction.category] = (categoryCounts[interaction.category] || 0) + 1;
      }
    }
    // If any category has 3+ in last 5, deprioritize (don't hard block, but filter if alternatives exist)
    const saturatedCategories = new Set(
      Object.entries(categoryCounts)
        .filter(([, count]) => count >= 3)
        .map(([cat]) => cat)
    );
    if (saturatedCategories.size > 0 && pool.length > 3) {
      const nonSaturated = pool.filter(i => !saturatedCategories.has(i.category) || i._isNavigation);
      // Only apply if we'd still have reasonable options
      if (nonSaturated.length >= 3) {
        pool = nonSaturated;
      }
    }
  }

  // ── Generate dynamic navigation actions ──
  // Characters can go to any other room (with context about who's there)
  if (allMembers) {
    let navActions = generateNavigationActions(currentRoom, allMembers, memberName, hour, perception);
    
    // If well past bedtime, only allow navigation to bedroom or bathroom
    if (myBedtime && hour - myBedtime >= 0.5) {
      const bedroomRooms = getBedroom(memberName);
      navActions = navActions.filter(a =>
        bedroomRooms.includes(a._targetRoom) || a._targetRoom === 'bathroom'
      );
    }
    
    // ── Anti-repetition filter for navigation actions too ──
    // Apply same history-based filter to prevent go_to_kitchen loops
    if (recentActions && recentActions.length > 0) {
      const last3Nav = new Set(recentActions.slice(-3));
      const navCountsLast10 = {};
      for (const a of recentActions.slice(-10)) {
        if (a.startsWith('go_to_')) navCountsLast10[a] = (navCountsLast10[a] || 0) + 1;
      }
      navActions = navActions.filter(a => {
        // Hard block: don't immediately repeat any of the last 3 nav actions
        if (last3Nav.has(a.id)) return false;
        // Moderate block: same nav done 2+ times in last 10
        if ((navCountsLast10[a.id] || 0) >= 2) return false;
        return true;
      });
    }

    pool = pool.concat(navActions);
  }

  return pool;
}

/**
 * Map character names to their bedroom room IDs.
 * Used for bedtime enforcement (restricting navigation).
 */
function getBedroom(name) {
  const map = {
    Dad: ['bedroom_master'],
    Mom: ['bedroom_master'],
    Emma: ['bedroom_kids_shared'],
    Jack: ['bedroom_kids_single'],
    Lily: ['bedroom_kids_shared'],
  };
  return map[name] || ['bedroom_master'];
}

/**
 * ROOM_FRIENDLY_NAMES — human-readable room names for prompts.
 */
const ROOM_FRIENDLY_NAMES = {
  living_room: 'Living Room',
  kitchen: 'Kitchen',
  hallway: 'Hallway',
  bedroom_master: 'Master Bedroom',
  bathroom: 'Bathroom',
  laundry: 'Laundry Room',
  bedroom_kids_shared: 'Shared Kids Room',
  bedroom_kids_single: 'Kids Room',
  garage: 'Garage',
  closet_master: 'Master Closet',
  closet_kids: 'Kids Closet',
  backyard: 'Backyard',
};

/**
 * Generate dynamic "go_to_[room]" navigation actions.
 * These let characters move between rooms purposefully.
 * Each action includes who's in the target room for social context.
 */
function generateNavigationActions(currentRoom, allMembers, selfName, hour, perception) {
  const navActions = [];
  const allRoomIds = Object.keys(ROOM_FRIENDLY_NAMES);

  // Build occupancy map: roomId → [names]
  const roomOccupants = {};
  for (const m of allMembers) {
    if (m.name === selfName) continue;
    const r = m.currentRoom || 'living_room';
    if (!roomOccupants[r]) roomOccupants[r] = [];
    roomOccupants[r].push(m.name);
  }

  for (const roomId of allRoomIds) {
    if (roomId === currentRoom) continue; // already here

    // Skip closets unless someone is there (not interesting destinations)
    if ((roomId === 'closet_master' || roomId === 'closet_kids') && !roomOccupants[roomId]) continue;

    // Skip bathroom if occupied
    if (roomId === 'bathroom' && perception.environment.bathroomOccupied) continue;

    // Skip backyard at night (unless someone is there)
    if (roomId === 'backyard' && (hour >= 22 || hour < 5) && !roomOccupants[roomId]) continue;

    const friendlyName = ROOM_FRIENDLY_NAMES[roomId] || roomId;
    const occupants = roomOccupants[roomId];
    const occupantStr = occupants && occupants.length > 0
      ? ` — ${occupants.join(', ')} ${occupants.length > 1 ? 'are' : 'is'} there`
      : ' — empty';

    navActions.push({
      id: `go_to_${roomId}`,
      furnitureId: null,
      label: `Go to ${friendlyName}${occupantStr}`,
      room: currentRoom, // technically starts from current room
      duration: { min: 0, max: 1 },
      timeWindow: null,
      eligibleRoles: null,
      animation: 'walk',
      category: 'transit',
      priority: 5,  // Boosted from 3 — navigation should be a real option
      description: `Walk to the ${friendlyName}.`,
      needsEffects: {},
      skillEffects: {},
      _isNavigation: true,
      _targetRoom: roomId,
    });
  }

  return navActions;
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

    // ── Parse and validate activity plan ──
    // Plan steps can reference interactions from any room (the character will path to them).
    // We validate each step against a broader INTERACTION_MAP if available.
    let plan = null;
    if (Array.isArray(parsed.plan) && parsed.plan.length > 1) {
      // Build a set of all known interaction IDs (available list + any extras we can tolerate)
      const availableIds = new Set(availableInteractions.map(i => i.id));
      const validatedPlan = parsed.plan
        .map(step => {
          if (!step) return null;
          let stepId = String(step).trim().replace(/^\d+\.\s*/, '').replace(/^["']|["']$/g, '');
          if (stepId.includes(' — ') || stepId.includes(' - ')) {
            stepId = stepId.split(/\s[—-]\s/)[0].trim();
          }
          return stepId;
        })
        .filter(id => id && /^[a-z0-9_]+$/.test(id)); // Only allow valid ID-format strings

      if (validatedPlan.length > 1) {
        // First step should match action, but don't require it strictly — just use it
        plan = validatedPlan;
        // Ensure first step matches the resolved action
        if (validAction && plan[0] !== actionId) {
          plan = [actionId, ...plan.filter(id => id !== actionId)];
        }
      }
    }

    return {
      thought: String(parsed.thought || 'No reasoning provided.'),
      action: validAction ? actionId : null,
      plan: plan,
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

  // Rich agenda metadata (mustDo, wantToDo, obstacles)
  const mustDoStr = agenda.mustDo && agenda.mustDo.length > 0
    ? `\nMust do: ${agenda.mustDo.join(', ')}`
    : '';
  const wantToDoStr = agenda.wantToDo && agenda.wantToDo.length > 0
    ? `\nWant to do: ${agenda.wantToDo.join(', ')}`
    : '';
  const obstaclesStr = agenda.anticipatedObstacles && agenda.anticipatedObstacles.length > 0
    ? `\nWatch out for: ${agenda.anticipatedObstacles.join(', ')}`
    : '';

  return `## My Plan for Today (${completed}/${agenda.plan.length} done)${mustDoStr}${wantToDoStr}${obstaclesStr}\n${items}`;
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

  // Day-specific flavor (goals.md: day-of-week affects agenda)
  const dayNumber = gameTime.getDay(); // 0=Sun, 6=Sat
  const dayFlavor = _getDayOfWeekFlavor(member.name, dayNumber, isWeekend);

  return `${greeting} It's ${timeStr} on ${dayStr}. ${isWeekend ? 'It\'s the weekend!' : 'It\'s a weekday.'}

As ${persona.fullName} (${persona.age} years old, ${persona.role}), plan the REST of your day starting from NOW (${timeStr}).
${hoursLeftStr}
${dayFlavor ? `TODAY'S VIBE: ${dayFlavor}\n` : ''}Think about:
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

Respond with ONLY this JSON (no other text):
{
  "mustDo": ["things you HAVE to do today — meals, chores, responsibilities"],
  "wantToDo": ["things you'd LIKE to do — hobbies, social, fun"],
  "anticipatedObstacles": ["things that might get in the way — moods, other people, weather"],
  "plan": [{"time":"${gameTime.getHours()}:${String(gameTime.getMinutes()).padStart(2, '0')}","activity":"short description","duration":30}]
}

Make ${expectedItems} plan activities from now until bedtime.
mustDo and wantToDo: 2-4 items each, short phrases.
anticipatedObstacles: 1-2 items (what could derail your day).
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

    // Try to parse as a rich agenda object first (new format: { mustDo, wantToDo, anticipatedObstacles, plan })
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const objStr = jsonStr.substring(firstBrace, lastBrace + 1);
      try {
        const richParsed = JSON.parse(objStr);
        if (richParsed.plan && Array.isArray(richParsed.plan)) {
          // Rich format detected — extract plan array and attach metadata
          const plan = _sanitizeAgendaPlan(richParsed.plan);
          if (plan) {
            plan._mustDo = Array.isArray(richParsed.mustDo) ? richParsed.mustDo.map(s => String(s).substring(0, 100)) : [];
            plan._wantToDo = Array.isArray(richParsed.wantToDo) ? richParsed.wantToDo.map(s => String(s).substring(0, 100)) : [];
            plan._anticipatedObstacles = Array.isArray(richParsed.anticipatedObstacles) ? richParsed.anticipatedObstacles.map(s => String(s).substring(0, 100)) : [];
            return plan;
          }
        }
      } catch (_) { /* fall through to legacy array parsing */ }
    }

    // Legacy format: bare JSON array
    const firstBracket = jsonStr.indexOf('[');
    let lastBracket = jsonStr.lastIndexOf(']');

    // If no closing bracket, try to repair truncated JSON
    if (firstBracket >= 0 && lastBracket <= firstBracket) {
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

    return _sanitizeAgendaPlan(parsed);
  } catch (err) {
    console.error(`[ReasoningPrompt] Failed to parse agenda: ${err.message}`);
    return null;
  }
}

/**
 * Sanitize and validate an agenda plan array.
 * Fixes invalid times, caps items, validates structure.
 */
function _sanitizeAgendaPlan(planArray) {
  if (!Array.isArray(planArray)) return null;

  const result = planArray
    .filter(item => item.time && item.activity)
    .map(item => {
      // Sanitize time — fix invalid formats like "8:60", "12:60"
      let timeStr = String(item.time);
      const timeParts = timeStr.split(':');
      if (timeParts.length === 2) {
        let h = parseInt(timeParts[0]) || 0;
        let m = parseInt(timeParts[1]) || 0;
        if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
        h = Math.max(0, Math.min(23, h));
        m = Math.max(0, Math.min(59, m));
        timeStr = `${h}:${String(m).padStart(2, '0')}`;
      }
      return {
        time: timeStr,
        activity: String(item.activity).substring(0, 100),
        duration: Math.min(parseInt(item.duration) || 30, 120),
        done: false,
        completedAt: null,
      };
    })
    .slice(0, 8);

  return result.length > 0 ? result : null;
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

/**
 * Build a "Where Everyone Is" section for the user prompt.
 * Characters don't have omniscient knowledge — they know general
 * locations based on sounds they've heard and when they last saw someone.
 * For simplicity, we show all family locations since characters in a
 * real house generally know where everyone is (sounds, routine, etc.)
 */
function buildFamilyLocationAwareness(member, allMembers) {
  if (!allMembers || allMembers.length === 0) return '';

  const lines = [];
  for (const m of allMembers) {
    if (m.name === member.name) continue;
    const room = m.currentRoom || 'unknown';
    const friendlyRoom = ROOM_FRIENDLY_NAMES[room] || room;
    const isSleeping = m.activityLabel && m.activityLabel.toLowerCase().includes('sleep');
    const activity = isSleeping ? 'sleeping' : (m.activityLabel || (m.state === 'walking' ? 'walking' : 'idle'));

    if (room === member.currentRoom) continue; // Already shown in "People here"

    lines.push(`- ${m.name}: ${friendlyRoom} (${activity})`);
  }

  if (lines.length === 0) return 'Everyone else is in this room with you.';
  return lines.join('\n');
}

/**
 * Build unresolved conversation topics section for the prompt.
 * Per goals.md: conversations shouldn't feel standalone — topics carry forward.
 */
function _buildUnresolvedTopics(personaState) {
  const topics = personaState._unresolvedTopics;
  if (!topics || topics.length === 0) return '';

  const topicLines = topics.slice(0, 5).map(t =>
    `- ${t.with}: ${t.topic}${t.type === 'interrupted' ? ' (was interrupted)' : ''}`
  );
  return `\n## Unresolved Conversations\nThings that were mentioned but never resolved:\n${topicLines.join('\n')}`;
}

/**
 * Build attention deficit hint for children.
 * Per goals.md: the kid who gets least attention is most likely to act out.
 */
function _buildAttentionHint(personaState, member) {
  if (!personaState._attentionDeficit) return '';

  const att = personaState._parentalAttention;
  if (!att) return '';

  const total = att.fromDad + att.fromMom;
  if (total > 3) return ''; // They've gotten some attention, deficit isn't extreme

  const hints = {
    Emma: 'Nobody has really talked to you much today. Typical. It\'s fine. (It\'s not fine.)',
    Lily: 'You haven\'t gotten much attention from Mommy or Daddy today. That makes you feel a little sad.',
    Jack: 'Nobody\'s paying attention to you! Maybe if you DO something they\'ll HAVE to look!',
  };
  return hints[member.name] ? `\n⚠️ ${hints[member.name]}` : '';
}

/**
 * Get day-of-week specific flavor text for agenda building.
 * Per goals.md: days should feel different. Monday ≠ Friday ≠ Sunday.
 *
 * @param {string} name - Character name
 * @param {number} dayNumber - 0=Sun through 6=Sat
 * @param {boolean} isWeekend
 * @returns {string|null} Day-flavor text or null
 */
function _getDayOfWeekFlavor(name, dayNumber, isWeekend) {
  const dayFlavors = {
    0: { // Sunday
      Dad: 'Lazy Sunday. Maybe the grill? Or just football and doing nothing.',
      Mom: 'Sunday — a slower pace. Church? Meal prep for the week? Just... breathe.',
      Emma: 'Sunday. Tomorrow is Monday. Ugh. Enjoy the freedom while it lasts.',
      Lily: 'Sunday funday! No school tomorrow... wait, yes there is.',
      Jack: 'SUNDAY! Last day before school! DO ALL THE THINGS!',
    },
    1: { // Monday
      Dad: 'Monday. The week starts fresh. Get organized, knock out the big stuff.',
      Mom: 'Monday madness. School runs, packed lunches, getting everyone back on track.',
      Emma: 'Monday. The worst day. Everything feels like a chore.',
      Lily: 'Monday... school was long. Home feels nice.',
      Jack: 'Monday is OVER. Play time!',
    },
    3: { // Wednesday
      Dad: 'Hump day. Halfway through the week.',
      Mom: 'Wednesday — the week is half over but the to-do list hasn\'t shrunk.',
      Emma: 'Wednesday. Still 2 more days until the weekend. Counting down.',
    },
    5: { // Friday
      Dad: 'Friday! Weekend vibes starting. Maybe order pizza tonight?',
      Mom: 'Friday — the light at the end of the tunnel. Family movie night?',
      Emma: 'Friday. FINALLY. Weekend plans forming in your head.',
      Lily: 'Friday! Almost the weekend! Can we do something FUN?',
      Jack: 'FRIDAY FRIDAY FRIDAY! NO SCHOOL TOMORROW!',
    },
    6: { // Saturday
      Dad: 'Saturday. Sleep in, projects, maybe something fun with the family.',
      Mom: 'Saturday — errands, but also maybe actually relax for once?',
      Emma: 'Saturday. YOUR day. No obligations. Well, maybe some chores. But mostly YOUR day.',
      Lily: 'SATURDAY! No school! Art all day!',
      Jack: 'SATURDAY!!! OUTSIDE ALL DAY!!!',
    },
  };

  const dayObj = dayFlavors[dayNumber];
  if (!dayObj) return null;
  return dayObj[name] || null;
}

module.exports = {
  buildSystemPrompt,
  buildUserPrompt,
  buildAgendaPrompt,
  parseDecision,
  parseAgenda,
  getFilteredInteractions,
  formatNeeds,
  ROOM_FRIENDLY_NAMES,
};
