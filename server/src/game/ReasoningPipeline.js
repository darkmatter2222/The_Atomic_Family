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
    // Build "my own recent speech" for anti-repetition
    const myRecentSpeech = (personaState?.conversations || [])
      .filter(c => c.speaker === member.name)
      .slice(-5)
      .map(c => `"${c.text}"`)
      .join('\n');
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
    const agendaUndonePlan = agenda?.plan?.filter(i => !i.done) || [];
    const agendaStr = agendaUndonePlan.length > 0
      ? `Plans I made for today (NOT YET DONE — these compete with immediate impulses): ${agendaUndonePlan.map(i => `${i.time} ${i.activity}`).join(' | ')}`
      : 'No specific plan today.';

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
If you're absorbed in what you're currently doing — it's going well, you're almost done, or you're 
just ENJOYING it — you might resist switching. A book keeps you reading. Cooking demands your 
attention. Half-finished things have gravitational pull. Let yourself stay absorbed sometimes.

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
    //   Runs if other people are present OR if character is a young child (who talk to themselves).
    //   "What should I say?"
    // ──────────────────────────────────────────────────────
    let socialContext = null;
    const isYoungChild = persona.age < 10;
    const hasPeople = peopleInRoom.length > 0;
    if (hasPeople || isYoungChild) {
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
${persona.role === 'father' || persona.role === 'mother' ? `As a parent, you naturally talk to your kids and partner throughout the day. You check in on them, comment on what they're doing, ask questions, give instructions, share observations, make jokes. Parents DON'T silently move through the house ignoring their family — they ENGAGE. This is a house full of people you love.` : ''}
${persona.age < 10 ? 'You talk like a kid — excited, unfiltered, sometimes too loud. You talk ALL THE TIME. Kids your age narrate their day, ask questions constantly, and share every thought.' : ''}
${persona.age >= 10 && persona.age < 18 ? 'You talk like a teenager — sometimes casual, sometimes sharp, sometimes unexpectedly sincere. You might be quiet around parents but chatty with siblings, or vice versa.' : ''}

SPEECH IS NATURAL — families talk constantly. Not every word is a deep conversation.
Quick comments, observations, questions, greetings, reactions — this is the TEXTURE of family life.
"How's it going?" "What are you drawing?" "Anyone hungry?" "Can you help me with this?" 
"That smells good." "Did you finish your homework?" "Look at this!" 
If someone else is in the room, there's usually SOME interaction — even if it's brief.
Silence is okay sometimes, but silence should be the EXCEPTION, not the default.
Keep speech short — 1-2 sentences max. Real conversation is concise.
If speaking, say WHO and WHAT — and make it sound like YOU, not a script.
VARIETY: Don't start every sentence with "Hey [name]". Real people vary their openers — jump into the topic, make an observation, ask directly, or just say what's on your mind. Only sometimes use a greeting.
No JSON — just your social reasoning and what you might say.`,
        userPrompt: `I've decided to: ${stage2.response}

MY CURRENT ACTIVITY: ${member.activityLabel || 'idle'}${member.interactionTimer && member.interactionDuration ? ` (${Math.round((member.interactionTimer / member.interactionDuration) * 100)}% done)` : ''}
What I'm doing shapes what I'd naturally say. If I'm cooking, I'd mention food or timing.
If I'm reading, I'd reference the book. If I'm working on something, I'd comment on it.
My words should FLOW FROM my activity — not appear from nowhere.

${hasPeople ? `People in the room with me:
${peopleInRoom.map(p => `- ${p.name} (${p.activity || p.state})${p.destination ? ` heading to ${p.destination}` : ''}`).join('\n')}` : `I'm alone right now.${isYoungChild ? `\nBut I'm a little kid — I talk to myself, narrate what I'm doing, call out to Mommy or Daddy, make sound effects, sing, or just think out loud. Kids my age don't stay silent when they're playing alone!` : ''}`}

${perception.environment.sleepingMembers.length > 0 ? `⚠ Sleeping: ${perception.environment.sleepingMembers.join(', ')} — be quiet!` : ''}

Recent conversations:
${conversations}
${myRecentSpeech ? `\n⚠ THINGS I ALREADY SAID (DO NOT REPEAT THESE — say something NEW or stay silent):\n${myRecentSpeech}\n` : ''}
${recentConvWarning}

${hasPeople ? `With ${peopleInRoom.length} other ${peopleInRoom.length === 1 ? 'person' : 'people'} here, what would I naturally say?
IMPORTANT: If I recently said something similar, I should either bring up a DIFFERENT topic or stay quiet. Don't ask the same question twice. Don't make the same comment again.
Consider:
- A quick comment about what I'm doing or what they're doing
- A question — "How's it going?" "Need any help?" "What are you up to?"
- A reaction to something I see — "Nice drawing!" "Smells good." "You look tired."
- Something from my current activity — offering, inviting, commenting
- An observation about the house, the time, the day
- A parenting moment — check-in, reminder, encouragement, instruction
- Just a warm greeting if we haven't talked in a while
Only stay silent if I'm deeply focused AND the other person seems busy too.` : `Even though I'm alone, would I talk to myself? Call out for someone? Make a comment about what I'm doing? Narrate my play? Sing?
If so, set speechTarget to "room" or "everyone" — it's just me thinking out loud.
If I genuinely have nothing to say, that's fine too.`}`,
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
CRITICAL: "speech" must be ACTUAL SPOKEN WORDS — dialogue you say aloud to another person. NOT a description of what you plan to say or think about saying. WRONG: "I think I'll talk to Lily about my feelings." RIGHT: "Lily, are you okay?" If you wouldn't literally say it out loud, set speech to null.
CRITICAL: "speechTarget" must be someone in your room, or null. Only set it to a NAME from the people present.
CRITICAL: If your action starts with "go_to_", set speech to null and speechTarget to null — you're leaving, not talking.
CRITICAL: If the reasoning mentions wanting to go somewhere else, leave the room, or needing something in another room — pick a go_to_* navigation action.
CRITICAL: Do NOT repeat the same action you just did. Pick something DIFFERENT.
CRITICAL: Do NOT start speech with your own name "${member.name}". You are ${member.name} speaking TO someone else. Never say "David, can you..." when you ARE David. Address others by their name, not yourself.
CRITICAL: Adults in a couple address each other by name ("Dave", "Sarah") or a term of endearment ("babe") — NEVER by parenting role. "Mom" and "Dad" are what the CHILDREN call them. Sarah calls her husband "babe" or "Dave". David calls his wife "babe" or "Sarah".
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

        // Post-process: strip inner-monologue patterns from speech
        // e.g. "I think I'll talk to Lily about my feelings." — that's thinking, not talking
        const innerMonologueRe = /^(I think I'?ll |I'm going to |Maybe I'?ll |I'?ll probably |I should |I want to )/i;
        if (innerMonologueRe.test(finalDecision.speech)) {
          finalDecision.speech = null; // This is internal monologue, not spoken dialogue
        }

        // Post-process: strip role-title address from adult-to-adult speech
        // e.g. "Mom, could you..." or "Hey Dad, sure thing" when spouses talk to each other
        if (finalDecision.speech && (member.role === 'father' || member.role === 'mother')) {
          // Match "Dad," "Mom," "Hey Dad," "Oh Mom!" etc. at start of speech
          const roleAddressRe = /^(hey\s+|oh\s+|so\s+|well\s+|um\s+|okay\s+)?(Mom|Mommy|Dad|Daddy)[,!?.\s]+/i;
          if (roleAddressRe.test(finalDecision.speech)) {
            finalDecision.speech = finalDecision.speech.replace(roleAddressRe, '');
            if (finalDecision.speech) {
              finalDecision.speech = finalDecision.speech.charAt(0).toUpperCase() + finalDecision.speech.slice(1);
            }
          }
        }

        // Post-process: validate speech target matches speech content
        // If speech addresses "Mommy/Mom/Dad" but target is a sibling (or vice versa), fix the target
        if (finalDecision.speech && finalDecision.speechTarget) {

          // Strip spouse terms from children's speech ("hon", "babe", "honey" → inappropriate for kids)
          if (member.role !== 'father' && member.role !== 'mother') {
            finalDecision.speech = finalDecision.speech.replace(/\b(hon|babe|honey|sweetheart|darling)\b[,.]?\s*/gi, '');
            if (finalDecision.speech) {
              finalDecision.speech = finalDecision.speech.charAt(0).toUpperCase() + finalDecision.speech.slice(1);
            }
          }
          const speechLower = finalDecision.speech.toLowerCase();
          const targetName = finalDecision.speechTarget;
          const roleNames = { 'Mom': 'Mom', 'Dad': 'Dad', 'Mommy': 'Mom', 'Daddy': 'Dad', 'Mama': 'Mom' };
          const familyNames = peopleInRoom.map(p => p.name);

          // Check if speech addresses someone other than the target by name
          for (const person of familyNames) {
            if (person === targetName) continue;
            // Speech starts with another person's name — likely misdirected
            const nameRe = new RegExp(`^${person}[,!?\\s]`, 'i');
            if (nameRe.test(finalDecision.speech)) {
              finalDecision.speechTarget = person;
              break;
            }
          }
          // Check for "Mommy/Mom" address — redirect to Mom if she's in room
          if (/^(mommy|mama|mom)[,!?\s]/i.test(finalDecision.speech) && targetName !== 'Mom') {
            if (familyNames.includes('Mom')) {
              finalDecision.speechTarget = 'Mom';
            }
          }
          // Check for "Daddy/Dad" address — redirect to Dad if he's in room
          if (/^(daddy|dad)[,!?\s]/i.test(finalDecision.speech) && targetName !== 'Dad') {
            if (familyNames.includes('Dad')) {
              finalDecision.speechTarget = 'Dad';
            }
          }
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
    // After turn 4+, hint that the conversation is getting long
    const turnNumber = conversationContext.turnNumber || 1;
    const windDownHint = turnNumber >= 5
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
- NEVER repeat something you already said earlier in this conversation. Read the thread above — if you said it already, say something DIFFERENT.
- ADVANCE the conversation. React to what THEY just said, don't just re-state your own earlier point.
- Don't start every reply with "Hey [name]". Vary how you talk — sometimes just answer, sometimes ask back, sometimes make a comment.
Think through your response in 2-3 sentences. No JSON.`,
      userPrompt: `${conversationContext.from} just spoke to me:

CONVERSATION SO FAR (turn ${turnNumber}):
${conversationContext.fullThread}

${conversationContext.from} said: "${conversationContext.lastText}" (${conversationContext.lastEmotion})

⚠ IMPORTANT: Read the conversation above carefully. Do NOT repeat anything I already said. If I mentioned a topic already, move ON to something new or respond to what THEY said. Repeating yourself in a conversation is unnatural.

${moodNarrative}
${socialEnergyNarrative}
What I was in the middle of: ${currentActionLabel}
(${conversationContext.from} just spoke to me — am I glad for the company, mildly distracted, or annoyed at the interruption? Does being mid-task color how I respond?)${nextIntentionHint}${emotionHint}
${memoryNarrative}
${windDownHint}

How does this make me feel? What do I want to say back?
Keep my reply short and natural — like a real person, not a speech.
My reply should ADVANCE the conversation — react to their words, answer their question, or bring up something new.
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
CRITICAL: speech must be ACTUAL SPOKEN WORDS — what you literally say aloud. NOT a description of what you plan to say.
CRITICAL: Keep your reply CONCISE. Real people don't give speeches in casual conversation.
CRITICAL: Do NOT start speech with your own name "${member.name}". You are ${member.name} talking TO ${conversationContext.from}. Never address yourself.
CRITICAL: Don't start every sentence with "${conversationContext.from}'s name". People don't say someone's name in every line.
CRITICAL: Adults in a couple use names or "babe" — NEVER "Mom" or "Dad" when addressing their partner.`,
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

      // Strip inner-monologue patterns — thinking is not speaking
      const innerMonologueRe = /^(I think I'?ll |I'm going to |Maybe I'?ll |I'?ll probably |I should |I want to )/i;
      if (innerMonologueRe.test(finalDecision.speech)) {
        finalDecision.speech = null;
      }

      // Strip role-title address in adult-to-adult speech ("Mom," / "Hey Dad,")
      if (finalDecision.speech && (member.role === 'father' || member.role === 'mother')) {
        const roleAddressRe = /^(hey\s+|oh\s+|so\s+|well\s+|um\s+|okay\s+)?(Mom|Mommy|Dad|Daddy)[,!?.\s]+/i;
        if (roleAddressRe.test(finalDecision.speech)) {
          finalDecision.speech = finalDecision.speech.replace(roleAddressRe, '');
          if (finalDecision.speech) {
            finalDecision.speech = finalDecision.speech.charAt(0).toUpperCase() + finalDecision.speech.slice(1);
          }
        }
      }

      // Strip spouse terms from children's speech ("hon", "babe", "honey")
      if (finalDecision.speech && member.role !== 'father' && member.role !== 'mother') {
        finalDecision.speech = finalDecision.speech.replace(/\b(hon|babe|honey|sweetheart|darling)\b[,.]?\s*/gi, '');
        if (finalDecision.speech) {
          finalDecision.speech = finalDecision.speech.charAt(0).toUpperCase() + finalDecision.speech.slice(1);
        }
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

    // Build recent own-speech list for anti-repetition
    const bgRecentSpeech = (personaState.conversations || [])
      .filter(c => c.speaker === member.name && c.text)
      .slice(-5)
      .map(c => `"${c.text}"`)
      .join(', ');

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
You are currently: ${member.activityLabel || 'relaxing'}.
Your mind wanders WHILE you do this — thoughts arise FROM the activity itself.
What does this task feel like? What does it remind you of? Is it going well, frustrating, pleasant?
The activity anchors your inner monologue. Let thoughts emerge from what you're physically doing.
${thoughtStyle}
${persona.quirks ? `Your quirks: ${persona.quirks.slice(0, 2).join('. ')}.` : ''}

Keep it real. Sometimes thoughts are mundane. Sometimes they surprise you.
Sometimes you think about someone you care about. Sometimes you just think about food.

SPEECH VARIETY: If you speak, DON'T start with "Hey". Real people vary their openers: just jump into the topic, make a comment, ask directly, call someone's name, say "So...", "You know what?", "Guess what", or just state what's on your mind.

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
      userPrompt: `It's ${timeStr}. I'm in the middle of: ${member.activityLabel || 'nothing in particular'}
${member.interactionTimer && member.interactionDuration ? `Progress: ${Math.round((member.interactionTimer / member.interactionDuration) * 100)}% done — what crosses my mind while doing this?` : 'My hands are busy and my mind can wander.'}

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
${bgRecentSpeech ? `\n⚠ THINGS I ALREADY SAID RECENTLY (DO NOT REPEAT): ${bgRecentSpeech}\nIf I want to speak, say something DIFFERENT from the above.` : ''}

${perception.environment.sleepingMembers.length > 0 ? `⚠ ${perception.environment.sleepingMembers.join(', ')} sleeping nearby — be quiet` : ''}

What am I thinking about? Let my mind wander naturally.
${peopleInRoom.length === 0 ? 'I am alone — speech must be null and speechTarget must be null.' : `People are here with me. Would I naturally say something? A comment, a question, asking someone to join, reacting to what they're doing? In a family, spontaneous little remarks are the NORM — "How you doing?" "What are you up to?" "This is nice." Set wantToSpeak to true if I'd say something.`}`,
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

    // Character-specific cognitive styles per goals.md
    if (name === 'Dad' || role === 'father') {
      return `HOW YOU THINK (Dave's inner voice):
Calm, practical, dry humor even in your own head. You think in steps — "first this, then that."
You notice what needs fixing and mentally queue it. Your brain goes: coffee → check on 
things → spot a problem → plan the fix → maybe a dad joke about it.
Inner monologue example: "That cabinet door is loose again. I could fix it now... nah, Sarah
will remind me three more times first. Fair enough. What's Jack getting into?"
You're not dramatic. You're steady. When things get chaotic, you get calmer.
You hum classic rock when you're content. You tap doorframes.`;
    }
    if (name === 'Mom' || role === 'mother') {
      return `HOW YOU THINK (Sarah's inner voice):
Your brain runs on THREE tracks at once: what needs doing NOW, what the kids need, and what 
you're trying to push down so you can keep functioning. The mental load is real.
Inner monologue example: "Okay — laundry in the dryer, Jack hasn't eaten, there's a sticky 
spot on the counter that's driving me crazy, and I haven't sat down since 6 AM. I deserve
five minutes. But if I sit down I won't get back up. And then—ugh. Fine. Counter first."
You notice EVERYTHING. The unwashed cup. The shoes by the door. The child who's too quiet.
Sometimes you resent being the only one who sees it all. Sometimes you just... do it anyway.`;
    }
    if (name === 'Emma') {
      return `HOW YOU THINK (Emma's inner voice):
Sarcastic. Self-aware. Your inner monologue has the energy of an eye-roll.
Inner monologue example: "Great. Another thrilling day in this house. I could draw... or 
read... or stare at the ceiling wondering when I'll be old enough to leave. JK. Sort of.
Actually, that new sketch isn't terrible. Maybe I'll finish it."
You process emotions through art and snark. When something actually matters to you,
your inner voice gets quiet and sincere — and that scares you a little.
You notice things about people that others miss. You pretend not to care.`;
    }
    if (name === 'Jack') {
      return `HOW YOU THINK (Jack's inner voice):
FAST. One thought CRASHES into the next. No sentence finishes before another—
"I wanna go outside—wait what's that—IS THAT A BUG—no I'm HUNGRY—
MOM CAN I HAVE—ooh the TV is on—DINOSAURS!"
You feel things BIG. Hungry? STARVING. Bored? THE MOST BORED EVER. Happy? BEST DAY EVER.
You don't have an inner debate about what to do. You just DO the thing your brain 
lands on. Planning? What's planning? You run on impulse and enthusiasm.`;
    }
    if (name === 'Lily') {
      return `HOW YOU THINK (Lily's inner voice):
Gentle. Wondering. Your mind moves like a daydream — soft questions, feelings, images.
Inner monologue example: "The light is making pretty shapes on the floor... like little
dancers. I wonder if Mr. Whiskers can see them too. Where's Mommy? She was in the 
kitchen but I didn't hear her for a bit. Maybe I should draw her a picture of the 
light-dancers. That would make her smile."
You feel EVERYTHING deeply. A cross word from someone can cloud your whole afternoon.
A hug from Mommy can fix everything. You ask "why?" because you genuinely want to know.`;
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
