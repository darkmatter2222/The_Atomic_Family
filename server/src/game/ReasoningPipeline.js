/**
 * ReasoningPipeline.js — Multi-Agent Reasoning Pipeline
 *
 * Each character has a CLUSTER of specialized agents that work together
 * through multiple LLM calls to produce deep, coherent decisions.
 *
 * AGENT CLUSTER (per character):
 *   1. Observer Agent   — Perceives environment, summarizes situation
 *   2. Assessor Agent   — Analyzes needs, identifies priorities/urgencies
 *   3. Deliberator Agent — Weighs options, reasons through trade-offs
 *   4. Social Agent      — Handles interpersonal reasoning, empathy
 *   5. Validator Agent   — Ensures action-speech coherence, outputs JSON
 *   6. Reflector Agent   — Background thinking during activities
 *
 * PIPELINE TYPES:
 *   - Full Pipeline (4-5 calls):   IDLE/CHOOSING → deep reasoning
 *   - Conversation Pipeline (2-3): Reply to speech → commit
 *   - Background Pipeline (1-2):   Thinking while performing a task
 *
 * CommonJS module (server-side).
 */

const {
  getPersona,
  getCurrentScheduleEntry,
  buildMemorySummary,
  buildConversationSummary,
  buildDailySummary,
  summarizeEmotionalCascade,
  FAMILY_DATA,
} = require('./PersonaManager');

const { buildPerception, getTimeOfDayLabel, narratePerception } = require('./EnvironmentPerception');
const {
  getInteractionsForRole,
  filterByTimeWindow,
  getCriticalNeeds,
  getLowestNeed,
} = require('./InteractionData');
const { getFilteredInteractions, formatNeeds } = require('./ReasoningPrompt');

// ── New Narrator Modules ────────────────────────────────────────
const { narrateNeeds, narrateMood, narrateSocialEnergy } = require('./NeedsNarrator');
const { narrateSkills, getSkillConfidence } = require('./SkillsNarrator');
const { narrateRelationships } = require('./RelationshipNarrator');
const { narrateMemories, getMemoriesInvolving } = require('./MemoryManager');
const { getDailySummaryNarrative, getAllRelationshipNarratives, getLongTermPatterns } = require('./DailySummaryManager');

// ── Pipeline Configuration ──────────────────────────────────────
const PIPELINE_CONFIG = {
  full: { maxStages: 5, label: 'Full Deliberation' },
  conversation: { maxStages: 3, label: 'Conversation Response' },
  background: { maxStages: 2, label: 'Background Thinking' },
};

class ReasoningPipeline {
  constructor(llmClient) {
    this.llmClient = llmClient;
    this.pipelineCount = 0;
  }

  // ═══════════════════════════════════════════════════════════════
  //  FULL REASONING PIPELINE — Deep multi-agent deliberation
  // ═══════════════════════════════════════════════════════════════

  /**
   * Full reasoning pipeline — 4-5 LLM calls for deep deliberation.
   *
   * @returns {{ stages, finalDecision, totalElapsed, totalTokens, pipelineType, pipelineId }}
   */
  async fullPipeline(member, allMembers, gameTime, roomLights, personaState, recentEvents, agenda, conversationContext) {
    const pipelineId = `pipeline_${++this.pipelineCount}`;
    const stages = [];
    const pipelineStart = Date.now();

    // Build shared context once
    const persona = getPersona(member.name);
    const perception = buildPerception(member, allMembers, gameTime, roomLights, recentEvents);
    const recentActionsList = personaState?.recentInteractions?.slice(-15) || [];
    const availableInteractions = getFilteredInteractions(member.role, gameTime, perception, allMembers, recentActionsList);
    const schedule = getCurrentScheduleEntry(member.name, gameTime);
    const needs = member.needs;
    const criticalNeeds = getCriticalNeeds(needs, 30);
    const lowestNeed = getLowestNeed(needs);
    const memories = buildMemorySummary(personaState);
    const conversations = buildConversationSummary(personaState);
    const dailySummary = getDailySummaryNarrative(personaState) || buildDailySummary(personaState);
    const relationshipContext = getAllRelationshipNarratives(personaState);
    const peopleInRoom = perception.visible.peopleInRoom;

    const timeStr = gameTime.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York'
    });
    const dayStr = gameTime.toLocaleDateString('en-US', {
      weekday: 'long', timeZone: 'America/New_York'
    });

    // If there's a pending conversation, use the conversation pipeline
    if (conversationContext) {
      return this._conversationPipeline(
        member, persona, perception, availableInteractions,
        personaState, conversationContext, gameTime, stages, pipelineId
      );
    }

    // ──────────────────────────────────────────────────────
    // STAGE 1: OBSERVE & ASSESS  (Observer + Assessor Agents)
    //   "What's happening? What do I need most?"
    //   Uses personality-filtered narration — no raw numbers
    // ──────────────────────────────────────────────────────

    // Build personality-filtered perception and needs
    const percNarrative = narratePerception(perception, member.name);
    const needsNarrative = narrateNeeds(member.name, needs, perception.environment.hour);
    const moodNarrative = narrateMood(member.name, personaState.mood, personaState.moodIntensity, personaState.stressLevel, member.needs);
    const memoryNarrative = narrateMemories(personaState, 10);
    const skillsNarrative = narrateSkills(member.name, member.skills);
    const socialEnergyNarrative = narrateSocialEnergy(
      member.name,
      personaState.socialBattery || 0.5,
      needs.social || 50,
      persona.personality?.extraversion || 0.5,
      (personaState.conversations || []).length
    );

    // Build schedule awareness hint for Observer
    let scheduleHint = '';
    if (schedule?.current?.activity) {
      const currentActivity = member.activityLabel || member.state;
      const scheduledActivity = schedule.current.activity;
      // Only mention schedule if it provides meaningful context
      const isDeviating = currentActivity && !currentActivity.toLowerCase().includes(scheduledActivity.toLowerCase().split(' ')[0]);
      if (isDeviating) {
        scheduleHint = `\nROUTINE AWARENESS:\nYou'd normally be doing "${scheduledActivity}" around now.`;
        if (schedule.next?.time && schedule.next?.activity) {
          scheduleHint += ` Coming up: "${schedule.next.activity}" at ${schedule.next.time}.`;
        }
      }
    }

    // Build long-term patterns context (Tier 4 memory)
    const longTermPatterns = getLongTermPatterns(personaState);
    const patternsHint = longTermPatterns
      ? `\nMY HABITS & PATTERNS I'VE NOTICED ABOUT MYSELF:\n${longTermPatterns}`
      : '';

    // Build current activity context for Observer
    let currentActivityHint = '';
    {
      const actLabel = member.activityLabel;
      const actState = member.state;
      if (actLabel && actState === 'performing') {
        const elapsedStr = member.interactionTimer && member.interactionDuration
          ? ` — ${Math.round((member.interactionTimer / member.interactionDuration) * 100)}% done`
          : '';
        currentActivityHint = `\nWHAT YOU'RE CURRENTLY DOING:\nYou are in the middle of: ${actLabel}${elapsedStr}. This is already in progress — factor it into your thinking.`;
      } else if (actState === 'walking' && actLabel) {
        currentActivityHint = `\nWHAT YOU'RE CURRENTLY DOING:\nYou are ${actLabel}.`;
      } else if (personaState?.nextIntention) {
        currentActivityHint = `\nWHAT YOU WERE PLANNING:\nYour last intention was: "${personaState.nextIntention}"`;
      }
    }

    const stage1 = await this._runStage({
      name: 'Observe & Assess',
      agent: 'Observer + Assessor',
      icon: '👁️',
      systemPrompt: `You ARE ${persona.fullName}, a ${persona.age}-year-old ${persona.role}. 
You are not analyzing a character — you ARE this person. Think in first person.
Personality: ${persona.personality.summary}
${persona.quirks ? `Your quirks: ${persona.quirks.slice(0, 3).join('. ')}.` : ''}
${persona.age < 10 ? 'You think like a kid. Simple, direct, emotional, immediate. Everything is either AMAZING or TERRIBLE.' : ''}
${persona.age >= 10 && persona.age < 18 ? 'You think like a teenager. Everything feels intense and personal. You notice things adults miss and miss things adults notice.' : ''}
${persona.role === 'mother' ? 'You notice everything — the mess, the kids, what needs doing. Your brain never stops running the household checklist.' : ''}
${persona.role === 'father' ? 'You notice the big picture — who looks happy, what needs fixing, whether the house is running smoothly.' : ''}

Look around. Feel your body. What's your FIRST instinct about what matters right now?
Don't list everything — focus on what JUMPS OUT at you. What's your gut reaction?
Respond in 3-5 short sentences AS YOURSELF. No JSON. First person. Raw and honest.`,
      userPrompt: `${percNarrative}

${needsNarrative}

${moodNarrative}

${memoryNarrative}
${scheduleHint}${patternsHint}${currentActivityHint}
What's going on right now? What matters most to you? What opportunities or concerns do you notice?`,
      options: { temperature: 0.0, max_tokens: 200, top_p: 0.9 },
    });
    stages.push(stage1);

    if (!stage1.response) {
      return this._buildResult(stages, null, pipelineStart, 'full', pipelineId);
    }

    // ──────────────────────────────────────────────────────
    // STAGE 2: DELIBERATE  (Deliberator Agent)
    //   "What are my options? What's the best choice?"
    // ──────────────────────────────────────────────────────

    // Sort interactions by need relevance — separate room actions from navigation
    const urgentKeys = new Set(criticalNeeds.map(n => n.key));
    const roomActions = availableInteractions.filter(i => !i._isNavigation);
    const navActions = availableInteractions.filter(i => i._isNavigation);

    const sortedRoomActions = [...roomActions].sort((a, b) => {
      return this._getNeedsScore(b, urgentKeys) - this._getNeedsScore(a, urgentKeys);
    });

    // Build the exact list shown to the LLM (sorted room actions + nav actions)
    // This MUST match what _parseFinalDecision uses for numeric index lookup
    const displayedRoomActions = sortedRoomActions.slice(0, 18);
    const displayedInteractions = [...displayedRoomActions, ...navActions];

    const roomList = displayedRoomActions
      .map((ia, i) => `${i + 1}. ${ia.id} — ${ia.label} [${ia.category}] (${ia.duration.min}-${ia.duration.max}min)`)
      .join('\n');

    const navList = navActions.length > 0
      ? '\n\n### Go Somewhere Else\n' + navActions
          .map((ia, i) => `${displayedRoomActions.length + i + 1}. ${ia.id} — ${ia.label}`)
          .join('\n')
      : '';

    const interactionList = roomList + navList;

    // Anti-repetition context
    const recentActionsStr = recentActionsList.length > 0
      ? `\n⚠ I just did: ${recentActionsList.join(', ')} — I should try something DIFFERENT!`
      : '';

    // ── Room time awareness ──
    // How long has the character been in this room?
    const roomTimeMinutes = personaState?._roomTimeMinutes || 0;
    let roomTimeHint = '';
    if (roomTimeMinutes >= 10) {
      roomTimeHint = `\n🚶 I've been in this room for ${Math.round(roomTimeMinutes)} minutes. Maybe it's time to go somewhere else?`;
    }
    if (roomTimeMinutes >= 20) {
      roomTimeHint = `\n🚶 I've been stuck in this room for ${Math.round(roomTimeMinutes)} minutes! I should seriously consider going somewhere else.`;
    }

    // ── Navigation encouragement ──
    // If there are critical needs that can't be met in the current room, hint at navigation
    let navEncouragement = '';
    if (navActions.length > 0) {
      const roomActionCategories = new Set(displayedRoomActions.map(a => a.category));
      const needsHints = [];
      const n = member.needs || {};
      if ((n.hunger || 100) < 40 && !roomActionCategories.has('cooking') && !roomActionCategories.has('eating')) {
        needsHints.push('hungry but there\'s no food here');
      }
      if ((n.hygiene || 100) < 30 && member.currentRoom !== 'bathroom') {
        needsHints.push('need a shower/bath but not near a bathroom');
      }
      if ((n.bladder || 100) < 25 && member.currentRoom !== 'bathroom') {
        needsHints.push('urgently need the bathroom');
      }
      if ((n.energy || 100) < 25 && !['bedroom_master', 'bedroom_kids_shared', 'bedroom_kids_single'].includes(member.currentRoom)) {
        needsHints.push('exhausted but not near a bed');
      }
      if (needsHints.length > 0) {
        navEncouragement = `\n⚠ I'm ${needsHints.join(' and ')} — I might need to GO TO a different room!`;
      }
    }

    // Agenda context
    const agendaStr = agenda?.plan?.length > 0
      ? `My plan: ${agenda.plan.filter(i => !i.done).map(i => `${i.time} ${i.activity}`).join(', ')}`
      : 'No plan yet.';

    // Schedule context — what the character's typical routine says they should be doing
    let scheduleStr = '';
    if (schedule) {
      const current = schedule.current;
      const next = schedule.next;
      const dayType = schedule.isWeekend ? 'Weekend' : 'Weekday';
      if (current?.activity) {
        scheduleStr = `${dayType} routine: I'd normally be doing "${current.activity}" around now.`;
        if (next?.time && next?.activity) {
          scheduleStr += ` Coming up next: "${next.activity}" at ${next.time}.`;
        }
      }
    }

    // Build relationship awareness for people in room
    const relationshipData = persona.relationships || {};
    const recentEventsMap = {};
    for (const p of peopleInRoom) {
      recentEventsMap[p.name] = getMemoriesInvolving(personaState, p.name, 60);
    }
    const relationshipNarrative = peopleInRoom.length > 0
      ? narrateRelationships(member.name, relationshipData, recentEventsMap, perception.environment.hour)
      : '';

    // ── Build descriptive activity summary for Deliberator ──
    // Instead of a numbered menu (anti-pattern), group activities naturally
    // The Validator (Stage 4) still gets the exact numbered list for ID mapping
    const categoryGroups = {};
    for (const ia of displayedRoomActions) {
      const cat = ia.category || 'other';
      if (!categoryGroups[cat]) categoryGroups[cat] = [];
      categoryGroups[cat].push(ia.label);
    }
    const activitySummary = Object.entries(categoryGroups)
      .map(([cat, labels]) => `  ${cat}: ${labels.join(', ')}`)
      .join('\n');

    const navSummary = navActions.length > 0
      ? '\n  I could also leave and go to: ' + navActions.map(a => a.label.replace(/^Go to /, '')).join(', ')
      : '';

    // ── Emotional cascade summary (per goals.md Step 5) ──
    const emotionalCascadeSummary = summarizeEmotionalCascade(personaState);

    const stage2 = await this._runStage({
      name: 'Deliberate',
      agent: 'Deliberator',
      icon: '🤔',
      systemPrompt: `You ARE ${persona.fullName} (${persona.age}, ${persona.role}).
Personality: ${persona.traits.slice(0, 5).join(', ')}.
Values: ${persona.values.slice(0, 4).join(', ')}.
${persona.quirks ? `Quirks: ${persona.quirks.slice(0, 3).join(', ')}.` : ''}

You are deciding what to do next. This is YOUR inner monologue — think like a real person.
You don't scan a checklist. You don't optimize. You FEEL your way through a decision.
Sometimes you procrastinate. Sometimes you get distracted. Sometimes you do something 
impulsive because it sounds fun or because you're avoiding something else.
Consider what you WANT, what you SHOULD do, and what you'll ACTUALLY do — they're often different.

${this._getCharacterReasoningStyle(persona)}
No JSON — just your honest inner monologue in 4-6 sentences. What are you thinking? What are you going to do?`,
      userPrompt: `HOW I SEE THINGS RIGHT NOW:
${stage1.response}

${relationshipNarrative ? `\n${relationshipNarrative}\n` : ''}
${relationshipContext ? `\n${relationshipContext}\n` : ''}
${skillsNarrative ? `\n${skillsNarrative}\n` : ''}
${socialEnergyNarrative ? `\n${socialEnergyNarrative}\n` : ''}
${emotionalCascadeSummary ? `\n${emotionalCascadeSummary}\n` : ''}

THINGS I COULD DO:
${activitySummary}${navSummary}
${recentActionsStr}
${roomTimeHint}
${navEncouragement}

CONTEXT:
- Time: ${timeStr}
- ${agendaStr}
${scheduleStr ? `- ${scheduleStr}` : ''}
- Today so far: ${dailySummary}
- Recent conversations: ${conversations}
${peopleInRoom.length > 0 ? `- ${peopleInRoom.map(p => p.name).join(', ')} ${peopleInRoom.length > 1 ? 'are' : 'is'} here with me` : '- Nobody else is here'}
${perception.environment.isDark ? '- The room is dark! Maybe turn on lights or go somewhere else.' : ''}
${personaState.nextIntention ? `- I was loosely planning to: ${personaState.nextIntention}` : ''}

What am I going to do? Not what's "optimal" — what feels RIGHT for me in this moment?
Think through 2-3 options honestly, then decide. I can stay here OR go somewhere else.`,
      options: { temperature: 0.9, max_tokens: 300, top_p: 0.9 },
    });
    stages.push(stage2);

    if (!stage2.response) {
      return this._buildResult(stages, null, pipelineStart, 'full', pipelineId);
    }

    // ──────────────────────────────────────────────────────
    // STAGE 3: SOCIAL REASONING  (Social Agent)
    //   Only if other people are present. "What should I say?"
    // ──────────────────────────────────────────────────────
    let socialContext = null;
    if (peopleInRoom.length > 0) {
      // Build "recently talked to" context from conversation summary
      const recentConvCount = personaState?.conversations?.length || 0;
      const recentConvWarning = recentConvCount > 3
        ? `\n⚠ You've had ${recentConvCount} recent conversations. Don't force another one — silence is natural! Only speak if you genuinely have something to say.`
        : '';

      const stage3 = await this._runStage({
        name: 'Social Reasoning',
        agent: 'Social Agent',
        icon: '💬',
        systemPrompt: `You ARE ${persona.fullName} (${persona.age}, ${persona.role}).
Your speech style: ${persona.speechStyle}
${persona.catchPhrases ? `Things you tend to say: ${persona.catchPhrases.slice(0, 3).join(' | ')}` : ''}
${persona.role === 'father' || persona.role === 'mother' ? 'As a parent, you care about your children and engage with them. But you don\'t script your parenting — you react naturally.' : ''}
${persona.age < 10 ? 'You talk like a kid — excited, unfiltered, sometimes too loud.' : ''}
${persona.age >= 10 && persona.age < 18 ? 'You talk like a teenager — sometimes casual, sometimes sharp, sometimes unexpectedly sincere.' : ''}

Think about whether you\'d naturally say something. Don\'t force it.
Sometimes silence IS the right call — people don't talk constantly in real life.
IMPORTANT: If you recently had a conversation with someone, DON'T immediately start another one. 
Give it time. Real people have quiet periods between conversations.
If speaking, say WHO and WHAT — and make it sound like YOU, not a script.
Keep speech short — 1-2 sentences max. Real conversation is concise.
No JSON — just your social reasoning and what you might say (or "I\'d stay quiet").`,
        userPrompt: `I've decided to: ${stage2.response}

People in the room with me:
${peopleInRoom.map(p => `- ${p.name} (${p.activity || p.state})${p.destination ? ` heading to ${p.destination}` : ''}`).join('\n')}

${perception.environment.sleepingMembers.length > 0 ? `⚠ Sleeping: ${perception.environment.sleepingMembers.join(', ')} — be quiet!` : ''}

Recent conversations:
${conversations}
${recentConvWarning}

Should I say something? If so, to whom and what? Consider:
- Do I need information I don't have (like when's dinner)?
- Should I greet someone who just arrived?
- Should I comment on what someone else is doing?
- Do I want to invite someone to do something together?
- Or should I stay quiet and focus on my task?
- Have I ALREADY been talking a lot? Maybe it's time to be quiet.`,
        options: { temperature: 0.6, max_tokens: 200, top_p: 0.9 },
      });
      stages.push(stage3);
      socialContext = stage3.response;
    }

    // ──────────────────────────────────────────────────────
    //  STAGE 4: COMMIT & VALIDATE  (Validator Agent)
    //    "Produce the final coherent JSON decision"
    // ──────────────────────────────────────────────────────
    const lightContext = perception.environment.isDark
      ? 'The room is DARK. Set lightAction to "on" if staying, or null if leaving.'
      : 'Lights are on. Set lightAction to null unless you are the LAST person leaving (then "off").';

    const validatorStage = await this._runStage({
      name: 'Commit & Validate',
      agent: 'Validator',
      icon: '✅',
      systemPrompt: `You are the final decision validator for ${persona.fullName}. 
You MUST output ONLY valid JSON — no other text, no explanation.
Your job: translate the character's natural reasoning into a concrete action from the list below.
Match the INTENT of the reasoning to the CLOSEST available action. Think about what the character wants to DO, not their exact words.
CRITICAL: The "action" must be an EXACT id from the available actions list. Pick the best semantic match.
CRITICAL: "speech" must match the chosen action — don't say "time for breakfast" if your action is going to bed.
CRITICAL: "speechTarget" must be someone in your room, or null. Only set it to a NAME from the people present.
CRITICAL: If your action starts with "go_to_", set speech to null and speechTarget to null — you're leaving, not talking.
CRITICAL: If the reasoning mentions wanting to go somewhere else, leave the room, or needing something in another room — pick a go_to_* navigation action.
CRITICAL: Do NOT repeat the same action you just did. Pick something DIFFERENT.
CRITICAL: Do NOT start speech with your own name "${member.name}". You are ${member.name} speaking TO someone else. Never say "David, can you..." when you ARE David. Address others by their name, not yourself.
If nobody is in the room, speech MUST be null and speechTarget MUST be null.
Navigation actions (go_to_*) are REAL options — use them when the character wants to move between rooms.`,
      userPrompt: `MY DELIBERATION:
${stage2.response}

${socialContext ? `MY SOCIAL REASONING:\n${socialContext}` : 'Nobody is in the room — no speech.'}

AVAILABLE ACTIONS (use EXACT id):
${interactionList}

### Do Something Creative (NOT on the list above)
If your reasoning leads to something a real person would do but it's NOT on the list, you can invent an action:
Set "action" to: createAction("short description of what you're doing")
Examples: createAction("Make shadow puppets on the wall"), createAction("Stack couch cushions into a fort"), createAction("Teach Jack to tie his shoes")
Use this ONLY when no listed action fits your intent. Prefer listed actions when one matches.
${recentActionsList.length > 0 ? `\n⚠ AVOID these recent actions: ${[...new Set(recentActionsList.slice(-5))].join(', ')}` : ''}
${personaState?.lastDecision?.interactionId ? `\n🚫 LAST ACTION was "${personaState.lastDecision.interactionId}" — you MUST pick something different!` : ''}

PEOPLE IN MY ROOM: ${peopleInRoom.length > 0 ? peopleInRoom.map(p => p.name).join(', ') : 'NOBODY — set speech to null!'}

LIGHTS: ${lightContext}

Output ONLY this JSON:
{
  "thought": "2-3 sentence summary of your complete reasoning chain",
  "action": "exact_action_id OR createAction(\\"description\\")",
  "details": "freeform description of what you're actually doing — be specific and in-character",
  "speech": "what you say out loud, or null",
  "speechTarget": "name of person, or null",
  "speechTone": "warm, annoyed, tired, excited, casual, stern, playful, etc.",
  "emotion": "current emotion word",
  "emotionalShift": number between -20 and +20 (how this action changes your mood: positive=better, negative=worse, 0=neutral),
  "nextIntention": "what you're loosely planning to do after this, or null",
  "lightAction": "on" or "off" or null
}`,
      options: { temperature: 0.2, max_tokens: 300, top_p: 0.9 },
    });
    stages.push(validatorStage);

    // Parse the final JSON — use displayedInteractions for correct numeric index mapping
    const finalDecision = this._parseFinalDecision(validatorStage.response, displayedInteractions);

    // Post-process: strip redundant lightAction
    if (finalDecision) {
      const currentRoomLit = perception.environment.roomLights[member.currentRoom];
      const isNight = perception.environment.isNight;
      if (finalDecision.lightAction === 'on' && (currentRoomLit !== false || !isNight)) {
        // Light already on, or it's daytime — no need to turn on
        finalDecision.lightAction = null;
      } else if (finalDecision.lightAction === 'off' && currentRoomLit !== true) {
        // Light already off — no need to turn off
        finalDecision.lightAction = null;
      }

      // Post-process: strip self-addressing from speech
      // e.g. "David, could you..." when David IS the speaker
      if (finalDecision.speech && typeof finalDecision.speech === 'string') {
        const selfAddressPattern = new RegExp(`^${member.name}[,?!]\\s*`, 'i');
        if (selfAddressPattern.test(finalDecision.speech)) {
          finalDecision.speech = finalDecision.speech.replace(selfAddressPattern, '');
          // Capitalize first letter
          finalDecision.speech = finalDecision.speech.charAt(0).toUpperCase() + finalDecision.speech.slice(1);
        }
      }
    }

    return this._buildResult(stages, finalDecision, pipelineStart, 'full', pipelineId);
  }

  // ═══════════════════════════════════════════════════════════════
  //  CONVERSATION PIPELINE — Respond to speech (2-3 calls)
  // ═══════════════════════════════════════════════════════════════

  async _conversationPipeline(member, persona, perception, availableInteractions, personaState, conversationContext, gameTime, stages, pipelineId) {
    const pipelineStart = Date.now();
    const peopleInRoom = perception.visible.peopleInRoom;
    const memoryNarrative = narrateMemories(personaState, 5);
    const moodNarrative = narrateMood(member.name, personaState.mood, personaState.moodIntensity, personaState.stressLevel, member.needs);

    // ── Inner state for richer conversation context ──
    const socialEnergyNarrative = narrateSocialEnergy(
      member.name,
      personaState.socialBattery || 0.5,
      member.needs?.social || 50,
      persona.personality?.extraversion || 0.5,
      (personaState.conversations || []).length
    );
    const emotionalCascadeSummary = summarizeEmotionalCascade(personaState);
    const nextIntentionHint = personaState.nextIntention
      ? `\nWhat I was planning to do next: ${personaState.nextIntention}`
      : '';
    const emotionHint = emotionalCascadeSummary
      ? `\nRecent emotional state: ${emotionalCascadeSummary}`
      : '';

    const timeStr = gameTime.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York'
    });

    // ── Determine current action to preserve ──
    // When replying in conversation, the character should KEEP doing what they're
    // doing and only generate a speech reply. This prevents the cascade:
    //   conversation reply → new action → finish quickly → new CHOOSING → more speech
    const currentActionId = member.currentInteraction?.id || null;
    const currentActionLabel = member.activityLabel || 'idle';

    // ── Conversation winding down? ──
    // After turn 3+, hint that the conversation is getting long
    const turnNumber = conversationContext.turnNumber || 1;
    const windDownHint = turnNumber >= 3
      ? `\nThis conversation has gone on for ${turnNumber} turns. Consider wrapping up naturally — say goodbye, or just give a short acknowledgment.`
      : '';

    // ── STAGE 1: Think about the conversation ──
    const stage1 = await this._runStage({
      name: 'Process Conversation',
      agent: 'Social Agent',
      icon: '💬',
      systemPrompt: `You ARE ${persona.fullName} (${persona.age}, ${persona.role}).
How you talk: ${persona.speechStyle}
Your personality: ${persona.traits.slice(0, 4).join(', ')}
${persona.catchPhrases ? `Things you tend to say: ${persona.catchPhrases.slice(0, 3).join(' | ')}` : ''}
Someone is talking to you. Think about what they said, how you feel, and what you want to say back.
Be natural and in-character. Don't force it — if you don't have much to say, keep it short.
Keep replies CONCISE — 1-2 sentences like real conversation, not paragraphs.
If the conversation is wrapping up, just say bye or acknowledge briefly.
NATURAL SPEECH RULES:
- Do NOT start your reply with the other person's name. Real people don't say "Sarah, could you..." in every single sentence.
- Do NOT start your reply with your own name. You are YOU — don't address yourself.
- Speak like a real ${persona.age}-year-old ${persona.role} actually talks — informal, direct, unscripted.
- Short replies feel more like real conversation than long ones.
Think through your response in 2-3 sentences. No JSON.`,
      userPrompt: `${conversationContext.from} just spoke to me:

CONVERSATION SO FAR (turn ${turnNumber}):
${conversationContext.fullThread}

${conversationContext.from} said: "${conversationContext.lastText}" (${conversationContext.lastEmotion})

${moodNarrative}
${socialEnergyNarrative}
What I'm currently doing: ${currentActionLabel}${nextIntentionHint}${emotionHint}
${memoryNarrative}
${windDownHint}

How does this make me feel? What do I want to say back?
Keep my reply short and natural — like a real person, not a speech.
Think as ${persona.name} — authentic, real.`,
      options: { temperature: 0.9, max_tokens: 150, top_p: 0.9 },
    });
    stages.push(stage1);

    if (!stage1.response) {
      return this._buildResult(stages, null, pipelineStart, 'conversation', pipelineId);
    }

    // ── STAGE 2: Commit to JSON response ──
    // CRITICAL FIX: Do NOT ask the LLM to pick a new action.
    // The character KEEPS their current activity and only produces speech.
    // This prevents conversation replies from churning through actions.

    // If we have a valid current action, lock it in. Otherwise offer a small list.
    let actionInstruction;
    let validationInteractions; // For _parseFinalDecision index mapping

    if (currentActionId) {
      // Character is doing something — force them to keep it
      actionInstruction = `Your current action is "${currentActionId}" (${currentActionLabel}). KEEP THIS ACTION — do not change it. Set "action" to "${currentActionId}".`;
      // Create a tiny list with just the current action for validation
      const currentInteraction = availableInteractions.find(i => i.id === currentActionId);
      validationInteractions = currentInteraction
        ? [currentInteraction]
        : [{ id: currentActionId, label: currentActionLabel }];
    } else {
      // Character is idle — let them pick from a very small subset
      const idleActions = availableInteractions.filter(i => !i._isNavigation).slice(0, 8);
      validationInteractions = idleActions;
      const idleList = idleActions.map((ia, i) => `${i + 1}. ${ia.id}`).join('\n');
      actionInstruction = `You are idle. Pick an action:\n${idleList}`;
    }

    const stage2 = await this._runStage({
      name: 'Commit Response',
      agent: 'Validator',
      icon: '✅',
      systemPrompt: `You are the decision validator for ${persona.fullName}. Output ONLY valid JSON — no other text.
CRITICAL: speechTarget MUST be "${conversationContext.from}" since they spoke to you.
CRITICAL: speech MUST be a short, natural reply (1-2 sentences max).
CRITICAL: Keep your reply CONCISE. Real people don't give speeches in casual conversation.
CRITICAL: Do NOT start speech with your own name "${member.name}". You are ${member.name} talking TO ${conversationContext.from}. Never address yourself.
CRITICAL: Don't start every sentence with "${conversationContext.from}'s name". People don't say someone's name in every line.`,
      userPrompt: `MY THINKING ABOUT THIS CONVERSATION:
${stage1.response}

REPLYING TO: ${conversationContext.from} who said "${conversationContext.lastText}"

ACTION: ${actionInstruction}

PEOPLE IN ROOM: ${peopleInRoom.map(p => p.name).join(', ')}

Your speech MUST be your reply to ${conversationContext.from}.
Keep it to 1-2 sentences — short and natural.

Output ONLY this JSON:
{
  "thought": "brief internal reasoning",
  "action": "${currentActionId || 'pick_from_list'}",
  "speech": "your short reply to ${conversationContext.from}",
  "speechTarget": "${conversationContext.from}",
  "emotion": "your emotion word",
  "lightAction": null
}`,
      options: { temperature: 0.5, max_tokens: 250, top_p: 0.9 },
    });
    stages.push(stage2);

    const finalDecision = this._parseFinalDecision(stage2.response, validationInteractions);

    // If the LLM still picked something invalid but we had a locked action, force it
    if (finalDecision && !finalDecision.valid && currentActionId) {
      finalDecision.action = currentActionId;
      finalDecision.valid = true;
    }

    // Post-process: strip self-addressing from speech
    // e.g. "Sarah, I was just thinking..." when Sarah IS the speaker
    if (finalDecision?.speech && typeof finalDecision.speech === 'string') {
      const selfAddressPattern = new RegExp(`^${member.name}[,?!]\\s*`, 'i');
      if (selfAddressPattern.test(finalDecision.speech)) {
        finalDecision.speech = finalDecision.speech.replace(selfAddressPattern, '');
        finalDecision.speech = finalDecision.speech.charAt(0).toUpperCase() + finalDecision.speech.slice(1);
      }
    }

    return this._buildResult(stages, finalDecision, pipelineStart, 'conversation', pipelineId);
  }

  // ═══════════════════════════════════════════════════════════════
  //  BACKGROUND THINKING — Reflection while performing tasks
  // ═══════════════════════════════════════════════════════════════

  /**
   * Background thinking — character reflects while doing an activity.
   * Can generate: internal thoughts, spontaneous speech, agenda updates.
   *
   * @returns {{ stages, result, totalElapsed, totalTokens, pipelineType, pipelineId }}
   */
  async backgroundThink(member, allMembers, gameTime, roomLights, personaState, recentEvents, agenda) {
    const pipelineId = `bg_${++this.pipelineCount}`;
    const stages = [];
    const pipelineStart = Date.now();

    const persona = getPersona(member.name);
    const perception = buildPerception(member, allMembers, gameTime, roomLights, recentEvents);
    const peopleInRoom = perception.visible.peopleInRoom;
    const conversations = buildConversationSummary(personaState);

    const timeStr = gameTime.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York'
    });

    const agendaStr = agenda?.plan?.length > 0
      ? `My remaining plans: ${agenda.plan.filter(i => !i.done).map(i => `${i.time} ${i.activity}`).join(', ')}`
      : 'No specific plan.';

    // ── STAGE 1: Inner Monologue ──
    const bgNeedsNarrative = narrateNeeds(member.name, member.needs, perception.environment.hour);
    const bgMoodNarrative = narrateMood(member.name, personaState.mood, personaState.moodIntensity, personaState.stressLevel, member.needs);
    const bgMemoryNarrative = narrateMemories(personaState, 5);
    const bgLongTermPatterns = getLongTermPatterns(personaState);
    const bgDailySummary = getDailySummaryNarrative(personaState);

    // Relationship context for people nearby
    const bgRelationshipContext = peopleInRoom.length > 0
      ? narrateRelationships(
          member.name,
          persona.relationships || {},
          Object.fromEntries(peopleInRoom.map(p => [p.name, getMemoriesInvolving(personaState, p.name, 30)])),
          perception.environment.hour
        )
      : '';

    // Build personality-specific thought prompts
    let thoughtStyle = '';
    if (persona.age < 10) {
      thoughtStyle = `You think like a kid — your thoughts jump from topic to topic. 
One second you're thinking about lunch, the next you're thinking about dinosaurs or if clouds are made of cotton. 
You don't analyze — you daydream, wonder, and get excited or worried about random things.`;
    } else if (persona.age >= 10 && persona.age < 18) {
      thoughtStyle = `Teen mind: your thoughts oscillate between deep existential questions, random observations, 
social anxieties, creative ideas, and wondering what everyone thinks of you. Sometimes a song gets stuck in your head. 
Sometimes you think about something someone said three days ago and it suddenly bothers you.`;
    } else if (persona.role === 'mother') {
      thoughtStyle = `Your thoughts are a constant running checklist interwoven with emotions: 
did the kids eat, is the laundry done, what's for dinner, when did I last sit down, is Jack being too quiet (suspicious), 
should I check on Lily, I need to talk to Dave about... You carry the mental load of the whole household.`;
    } else if (persona.role === 'father') {
      thoughtStyle = `Your mind drifts between work concerns, household tasks you noticed but haven't addressed, 
wondering if the kids are okay, thinking about that project in the garage, and occasionally just... 
appreciating a quiet moment. You plan in the background. You notice things but don't always say them.`;
    } else {
      thoughtStyle = `Think naturally — what crosses your mind? Not analysis. Just... thoughts.`;
    }

    const stage1 = await this._runStage({
      name: 'Inner Reflection',
      agent: 'Reflector',
      icon: '💭',
      systemPrompt: `You ARE ${persona.fullName} (${persona.age}, ${persona.role}).
You're doing something with your hands. Your mind wanders.
${thoughtStyle}
${persona.quirks ? `Your quirks: ${persona.quirks.slice(0, 2).join('. ')}.` : ''}

Keep it real. Sometimes thoughts are mundane. Sometimes they surprise you.
Sometimes you think about someone you care about. Sometimes you just think about food.

Output valid JSON:
{
  "innerThought": "your stream of consciousness (1-2 sentences)",
  "wantToSpeak": true/false,
  "speech": "what you want to say out loud (or null)",
  "speechTarget": "who to talk to (or null)",
  "planUpdate": "any change to your plans (or null)",
  "mood": "current emotion word",
  "emotionalShift": number between -10 and +10 (how this reflection changes your mood)
}`,
      userPrompt: `It's ${timeStr}. I'm doing: ${member.activityLabel || 'nothing'}
${member.interactionTimer && member.interactionDuration ? `Progress: ${Math.round((member.interactionTimer / member.interactionDuration) * 100)}% done` : ''}

${peopleInRoom.length > 0 ? `People nearby: ${peopleInRoom.map(p => `${p.name} (${p.activity || p.state})`).join(', ')}` : 'I am alone.'}
${perception.audible.length > 0 ? `I hear: ${perception.audible.map(s => s.description).join('; ')}` : ''}
${bgRelationshipContext ? `\n${bgRelationshipContext}` : ''}

${bgNeedsNarrative}
${bgMoodNarrative}
${bgMemoryNarrative ? `\n${bgMemoryNarrative}` : ''}
${bgDailySummary ? `\nMy day so far: ${bgDailySummary}` : ''}
${bgLongTermPatterns ? `\nThings I've noticed about myself: ${bgLongTermPatterns}` : ''}
${agendaStr}
${conversations ? `Recent conversations: ${conversations}` : ''}

${perception.environment.sleepingMembers.length > 0 ? `⚠ ${perception.environment.sleepingMembers.join(', ')} sleeping nearby — be quiet` : ''}

What am I thinking about? Let my mind wander naturally.
${peopleInRoom.length === 0 ? 'I am alone — speech must be null and speechTarget must be null.' : ''}`,
      options: { temperature: 0.8, max_tokens: 200, top_p: 0.95 },
    });
    stages.push(stage1);

    let result = null;
    if (stage1.response) {
      result = this._parseBackgroundThought(stage1.response);
    }

    return {
      stages,
      result,
      totalElapsed: Date.now() - pipelineStart,
      totalTokens: this._sumTokens(stages),
      pipelineType: 'background',
      pipelineId,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  INFORMATION-SEEKING — Character actively asks questions
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check if a character should seek information from others.
   * Called during deliberation when knowledge gaps are detected.
   */
  shouldSeekInfo(needs, agenda, gameTime) {
    const hour = gameTime.getHours() + gameTime.getMinutes() / 60;
    const gaps = [];

    // Near meal time and hungry but don't know if food is ready
    if ((hour >= 6.5 && hour < 8) || (hour >= 11.5 && hour < 13) || (hour >= 17.5 && hour < 19)) {
      if ((needs?.hunger || 100) < 60) {
        gaps.push({ topic: 'meal', question: 'when is food going to be ready' });
      }
    }

    // Agenda is empty or all done
    if (!agenda?.plan || agenda.plan.filter(i => !i.done).length === 0) {
      gaps.push({ topic: 'plans', question: 'what should I do' });
    }

    return gaps;
  }

  // ═══════════════════════════════════════════════════════════════
  //  INTERNAL HELPERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get character-specific reasoning style instructions for the Deliberator.
   * Each character's inner monologue has a distinct cognitive pattern.
   */
  _getCharacterReasoningStyle(persona) {
    const name = persona.name;
    const role = persona.role;

    // Character-specific cognitive styles per goals.md Principle 3
    if (name === 'Dad' || role === 'father') {
      return `HOW YOU THINK:
Think methodically. Consider the practical implications. You weigh options.
You're patient — you don't rush to judgment. When you're not sure, you observe
for a moment. You solve problems; you don't dwell on them. Your inner voice is
calm and measured, like working through a repair step by step.`;
    }
    if (name === 'Mom' || role === 'mother') {
      return `HOW YOU THINK:
Your brain is a running household checklist. You notice EVERYTHING — the mess on the
counter, whether the kids have eaten, what needs doing before bedtime. You carry the
mental load of the whole house and sometimes resent it. Your inner voice switches between
"mom mode" (organizing, managing, anticipating) and rare stolen moments of "just Sarah"
where you remember you're a person too. Sometimes you push through exhaustion. Sometimes
you finally sit down and feel guilty about sitting down.`;
    }
    if (name === 'Emma') {
      return `HOW YOU THINK:
Think in fragments. Your mind jumps between things. You're self-aware to a 
fault — you can see when you're being dramatic and you do it anyway. Your 
inner voice is sarcastic, even toward yourself. "Great, another exciting day
of... this." You notice things about people that others miss. Your mood and 
desire for independence shape your choices more than logic or duty.`;
    }
    if (name === 'Jack') {
      return `HOW YOU THINK:
Think FAST. One thought crashing into the next. You don't plan — you 
DO. Everything is exciting or boring, nothing in between. Your inner voice
is loud, enthusiastic, and easily distracted. "OOOH WHAT'S THAT" in the 
middle of thinking about something else entirely. You don't weigh pros and
cons — you feel what you want and go for it.`;
    }
    if (name === 'Lily') {
      return `HOW YOU THINK:
Think quietly. With wonder. You notice the beautiful things — how the light
looks through the window, how the flowers smell in the garden. You feel 
things deeply. When you're processing something emotional, you go quiet 
and still. You talk to Mr. Whiskers in your head when you need comfort.
Your inner voice often asks questions. "Why is Mommy sad?" "What if the 
thunder comes back?"`;
    }

    // Fallback for any future characters
    return '';
  }

  /**
   * Run a single stage of the pipeline.
   */
  async _runStage({ name, agent, icon, systemPrompt, userPrompt, options }) {
    const start = Date.now();
    let response = null;
    let error = null;
    let tokens = 0;

    try {
      response = await this.llmClient.reason(systemPrompt, userPrompt, options);
      tokens = this._estimateTokens(systemPrompt + userPrompt + (response || ''));
    } catch (err) {
      error = err.message;
      console.error(`[Pipeline:${name}] Error: ${err.message}`);
    }

    return {
      name,
      agent,
      icon,
      systemPrompt,
      userPrompt,
      response,
      error,
      elapsed: Date.now() - start,
      tokens,
    };
  }

  /**
   * Parse the final JSON decision from the Validator stage.
   */
  _parseFinalDecision(rawResponse, availableInteractions) {
    if (!rawResponse) return null;

    try {
      let jsonStr = rawResponse.trim();

      // Find the first { and last }
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }

      const parsed = JSON.parse(jsonStr);

      // ── Check for createAction() pattern ──
      let actionId = parsed.action;
      let isCreatedAction = false;
      let actionDescription = null;

      if (actionId != null) {
        actionId = String(actionId).trim();

        // Detect createAction("description") pattern
        const createMatch = actionId.match(/^createAction\s*\(\s*["'](.+?)["']\s*\)/i);
        if (createMatch) {
          isCreatedAction = true;
          actionDescription = createMatch[1].trim();
          console.log(`[Pipeline:Validator] createAction detected: "${actionDescription}"`);
        }
      }

      if (isCreatedAction) {
        // Created action — classify and return as special result
        const { classifyCreatedAction } = require('./ActionClassifier');
        const classified = classifyCreatedAction(actionDescription);

        return {
          thought: String(parsed.thought || 'No reasoning provided.'),
          action: classified.id,
          isCreatedAction: true,
          actionDescription,
          createdActionData: classified,
          details: parsed.details ? String(parsed.details).substring(0, 300) : null,
          speech: parsed.speech && parsed.speech !== 'null' && parsed.speech !== 'None'
            ? String(parsed.speech).substring(0, 200) : null,
          speechTarget: parsed.speechTarget && parsed.speechTarget !== 'null' && parsed.speechTarget !== 'None'
            ? String(parsed.speechTarget) : null,
          speechTone: parsed.speechTone ? String(parsed.speechTone) : null,
          emotion: String(parsed.emotion || 'neutral'),
          emotionalShift: typeof parsed.emotionalShift === 'number' 
            ? Math.max(-20, Math.min(20, parsed.emotionalShift)) : 0,
          nextIntention: parsed.nextIntention && parsed.nextIntention !== 'null'
            ? String(parsed.nextIntention).substring(0, 200) : null,
          lightAction: ['on', 'off'].includes(parsed.lightAction) ? parsed.lightAction : null,
          valid: true,
          raw: parsed,
        };
      }

      // ── Standard action ID parsing ──
      if (actionId != null) {
        actionId = actionId.replace(/^\d+\.\s*/, '');       // Strip "12. " prefix
        actionId = actionId.replace(/^["']|["']$/g, '');     // Strip quotes
        if (/^\d+$/.test(actionId)) {                        // Numeric index
          const idx = parseInt(actionId, 10) - 1;
          if (idx >= 0 && idx < availableInteractions.length) {
            actionId = availableInteractions[idx].id;
          }
        }
        if (actionId.includes(' — ') || actionId.includes(' - ')) {
          actionId = actionId.split(/\s[—-]\s/)[0].trim();
        }
      }

      const validAction = availableInteractions.some(i => i.id === actionId);

      return {
        thought: String(parsed.thought || 'No reasoning provided.'),
        action: validAction ? actionId : null,
        details: parsed.details ? String(parsed.details).substring(0, 300) : null,
        speech: parsed.speech && parsed.speech !== 'null' && parsed.speech !== 'None'
          ? String(parsed.speech).substring(0, 200) : null,
        speechTarget: parsed.speechTarget && parsed.speechTarget !== 'null' && parsed.speechTarget !== 'None'
          ? String(parsed.speechTarget) : null,
        speechTone: parsed.speechTone ? String(parsed.speechTone) : null,
        emotion: String(parsed.emotion || 'neutral'),
        emotionalShift: typeof parsed.emotionalShift === 'number'
          ? Math.max(-20, Math.min(20, parsed.emotionalShift)) : 0,
        nextIntention: parsed.nextIntention && parsed.nextIntention !== 'null'
          ? String(parsed.nextIntention).substring(0, 200) : null,
        lightAction: ['on', 'off'].includes(parsed.lightAction) ? parsed.lightAction : null,
        valid: validAction,
        raw: parsed,
      };
    } catch (err) {
      console.error(`[Pipeline:Validator] Failed to parse: ${err.message}`);
      console.error(`[Pipeline:Validator] Raw: ${rawResponse?.substring(0, 300)}`);
      return null;
    }
  }

  /**
   * Parse background thought JSON.
   */
  _parseBackgroundThought(rawResponse) {
    if (!rawResponse) return null;

    try {
      let jsonStr = rawResponse.trim();
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }

      const parsed = JSON.parse(jsonStr);

      return {
        innerThought: String(parsed.innerThought || parsed.thought || ''),
        wantToSpeak: !!parsed.wantToSpeak,
        speech: parsed.speech && parsed.speech !== 'null' && parsed.speech !== 'None'
          ? String(parsed.speech).substring(0, 200) : null,
        speechTarget: parsed.speechTarget && parsed.speechTarget !== 'null' && parsed.speechTarget !== 'None'
          ? String(parsed.speechTarget) : null,
        planUpdate: parsed.planUpdate && parsed.planUpdate !== 'null'
          ? String(parsed.planUpdate) : null,
        mood: String(parsed.mood || 'content'),
        emotionalShift: typeof parsed.emotionalShift === 'number'
          ? Math.max(-10, Math.min(10, parsed.emotionalShift)) : 0,
      };
    } catch (err) {
      // If not valid JSON, treat the whole response as a thought
      return {
        innerThought: rawResponse.substring(0, 200),
        wantToSpeak: false,
        speech: null,
        speechTarget: null,
        planUpdate: null,
        mood: 'content',
        emotionalShift: 0,
      };
    }
  }

  /**
   * Build the result object for pipeline output.
   */
  _buildResult(stages, finalDecision, pipelineStart, pipelineType, pipelineId) {
    return {
      stages,
      finalDecision,
      totalElapsed: Date.now() - pipelineStart,
      totalTokens: this._sumTokens(stages),
      pipelineType,
      pipelineId,
    };
  }

  /**
   * Format needs compactly for prompts.
   */
  _formatNeedsCompact(needs) {
    if (!needs) return 'Unknown';
    return Object.entries(needs)
      .map(([key, val]) => {
        const level = val > 70 ? 'good' : val > 40 ? 'moderate' : val > 20 ? 'low' : 'CRITICAL';
        return `${key}: ${Math.round(val)}% (${level})`;
      })
      .join(', ');
  }

  /**
   * Score how much an interaction helps urgent needs.
   */
  _getNeedsScore(interaction, urgentKeys) {
    if (!interaction.needsEffects || urgentKeys.size === 0) return 0;
    let score = 0;
    for (const [need, amount] of Object.entries(interaction.needsEffects)) {
      if (urgentKeys.has(need) && amount > 0) score += amount;
    }
    return score;
  }

  _estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  _sumTokens(stages) {
    return stages.reduce((sum, s) => sum + (s.tokens || 0), 0);
  }
}

module.exports = ReasoningPipeline;
