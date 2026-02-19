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
  FAMILY_DATA,
} = require('./PersonaManager');

const { buildPerception, getTimeOfDayLabel } = require('./EnvironmentPerception');
const {
  getInteractionsForRole,
  filterByTimeWindow,
  getCriticalNeeds,
  getLowestNeed,
} = require('./InteractionData');
const { getFilteredInteractions, formatNeeds } = require('./ReasoningPrompt');

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
    const availableInteractions = getFilteredInteractions(member.role, gameTime, perception);
    const schedule = getCurrentScheduleEntry(member.name, gameTime);
    const needs = member.needs;
    const criticalNeeds = getCriticalNeeds(needs, 30);
    const lowestNeed = getLowestNeed(needs);
    const memories = buildMemorySummary(personaState);
    const conversations = buildConversationSummary(personaState);
    const dailySummary = buildDailySummary(personaState);
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
    // ──────────────────────────────────────────────────────
    const stage1 = await this._runStage({
      name: 'Observe & Assess',
      agent: 'Observer + Assessor',
      icon: '👁️',
      systemPrompt: `You are the inner awareness of ${persona.fullName}, a ${persona.age}-year-old ${persona.role}. 
Analyze your current situation briefly and honestly. Think about what you perceive and what matters most right now.
Respond in 3-5 short sentences. Be specific about your needs and surroundings. No JSON.`,
      userPrompt: `It's ${timeStr} on ${dayStr} (${perception.environment.timeOfDay}).
I'm in the ${perception.visible.roomName}.
${peopleInRoom.length > 0 ? `People here: ${peopleInRoom.map(p => `${p.name} (${p.activity || p.state})`).join(', ')}` : 'I am alone.'}
${perception.audible.length > 0 ? `I hear: ${perception.audible.map(s => s.description).join('; ')}` : ''}

My needs:
${this._formatNeedsCompact(needs)}
${criticalNeeds.length > 0 ? `\n⚠ CRITICAL: ${criticalNeeds.map(n => `${n.key} at ${Math.round(n.value)}%`).join(', ')}` : ''}

My mood: ${personaState.mood} (stress: ${Math.round(personaState.stressLevel * 100)}%)
${member.activityLabel ? `Currently doing: ${member.activityLabel}` : 'Currently idle.'}

Recent memory: ${memories}

What's happening right now? What do I need most? What opportunities or concerns do I see?`,
      options: { temperature: 0.6, max_tokens: 200, top_p: 0.9 },
    });
    stages.push(stage1);

    if (!stage1.response) {
      return this._buildResult(stages, null, pipelineStart, 'full', pipelineId);
    }

    // ──────────────────────────────────────────────────────
    // STAGE 2: DELIBERATE  (Deliberator Agent)
    //   "What are my options? What's the best choice?"
    // ──────────────────────────────────────────────────────

    // Sort interactions by need relevance
    const urgentKeys = new Set(criticalNeeds.map(n => n.key));
    const sortedInteractions = [...availableInteractions].sort((a, b) => {
      return this._getNeedsScore(b, urgentKeys) - this._getNeedsScore(a, urgentKeys);
    });

    const interactionList = sortedInteractions
      .slice(0, 18)
      .map((ia, i) => `${i + 1}. ${ia.id} — ${ia.label} [${ia.category}] (${ia.duration.min}-${ia.duration.max}min)`)
      .join('\n');

    // Anti-repetition context
    const recentActions = personaState.recentInteractions?.slice(-5) || [];
    const recentActionsStr = recentActions.length > 0
      ? `\n⚠ I just did: ${recentActions.join(', ')} — I should try something DIFFERENT!`
      : '';

    // Agenda context
    const agendaStr = agenda?.plan?.length > 0
      ? `My plan: ${agenda.plan.filter(i => !i.done).map(i => `${i.time} ${i.activity}`).join(', ')}`
      : 'No plan yet.';

    const stage2 = await this._runStage({
      name: 'Deliberate',
      agent: 'Deliberator',
      icon: '🤔',
      systemPrompt: `You are the decision-making mind of ${persona.fullName} (${persona.age}, ${persona.role}).
Personality: ${persona.traits.slice(0, 4).join(', ')}.
Values: ${persona.values.slice(0, 3).join(', ')}.
Consider your needs, time of day, social context, and personality to reason through options.
Think step by step. Weigh 2-3 options clearly. Then state your preferred choice and why.
Also consider: should you talk to someone nearby? Ask a question? Respond to social situation?
No JSON — just your reasoning in 4-6 sentences.`,
      userPrompt: `MY SITUATION ASSESSMENT:
${stage1.response}

AVAILABLE ACTIONS:
${interactionList}
${recentActionsStr}

CONTEXT:
- Time: ${timeStr}
- ${agendaStr}
- Today so far: ${dailySummary}
- Recent conversations: ${conversations}
${peopleInRoom.length > 0 ? `- ${peopleInRoom.map(p => p.name).join(', ')} ${peopleInRoom.length > 1 ? 'are' : 'is'} here with me` : '- Nobody else is here'}
${perception.environment.isDark ? '- The room is dark! I should turn on lights or move somewhere lit.' : ''}

Considering all of this, what should I do next? Think through 2-3 options and explain your reasoning. Which one best serves my current needs and situation?`,
      options: { temperature: 0.7, max_tokens: 300, top_p: 0.9 },
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
      const stage3 = await this._runStage({
        name: 'Social Reasoning',
        agent: 'Social Agent',
        icon: '💬',
        systemPrompt: `You are the social awareness of ${persona.fullName} (${persona.age}, ${persona.role}).
Speech style: ${persona.speechStyle}
${persona.role === 'father' || persona.role === 'mother' ? 'As a parent, you care about your children and engage with them actively.' : ''}
${persona.age < 10 ? 'You\'re a kid — be curious, playful, and sometimes silly.' : ''}
Think about whether you should say something, and if so, what and to whom.
Consider: Do I need information? Should I greet someone? React to something? Ask a question?
Only suggest speech if it would be NATURAL — don't force it.
If speaking, say WHO to address and WHAT to say. Keep speech under 2 sentences.
No JSON — just your social reasoning and suggested speech (or "stay quiet" if appropriate).`,
        userPrompt: `I've decided to: ${stage2.response}

People in the room with me:
${peopleInRoom.map(p => `- ${p.name} (${p.activity || p.state})${p.destination ? ` heading to ${p.destination}` : ''}`).join('\n')}

${perception.environment.sleepingMembers.length > 0 ? `⚠ Sleeping: ${perception.environment.sleepingMembers.join(', ')} — be quiet!` : ''}

Recent conversations:
${conversations}

Should I say something? If so, to whom and what? Consider:
- Do I need information I don't have (like when's dinner)?
- Should I greet someone who just arrived?
- Should I comment on what someone else is doing?
- Do I want to invite someone to do something together?
- Or should I stay quiet and focus on my task?`,
        options: { temperature: 0.8, max_tokens: 200, top_p: 0.9 },
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
Your job: take the reasoning and deliberation below, and produce a single coherent final decision.
CRITICAL: The "action" must be an EXACT id from the available actions list.
CRITICAL: "speech" must match the chosen action — don't say "time for breakfast" if your action is going to bed.
CRITICAL: "speechTarget" must be someone in your room, or null. Only set it to a NAME from the people present.
If nobody is in the room, speech MUST be null and speechTarget MUST be null.`,
      userPrompt: `MY DELIBERATION:
${stage2.response}

${socialContext ? `MY SOCIAL REASONING:\n${socialContext}` : 'Nobody is in the room — no speech.'}

AVAILABLE ACTIONS (use EXACT id):
${interactionList}

PEOPLE IN MY ROOM: ${peopleInRoom.length > 0 ? peopleInRoom.map(p => p.name).join(', ') : 'NOBODY — set speech to null!'}

LIGHTS: ${lightContext}

Output ONLY this JSON:
{
  "thought": "2-3 sentence summary of your complete reasoning chain",
  "action": "exact_action_id",
  "speech": "what you say out loud, or null",
  "speechTarget": "name of person, or null",
  "emotion": "current emotion word",
  "lightAction": "on" or "off" or null
}`,
      options: { temperature: 0.2, max_tokens: 200, top_p: 0.9 },
    });
    stages.push(validatorStage);

    // Parse the final JSON
    const finalDecision = this._parseFinalDecision(validatorStage.response, availableInteractions);

    return this._buildResult(stages, finalDecision, pipelineStart, 'full', pipelineId);
  }

  // ═══════════════════════════════════════════════════════════════
  //  CONVERSATION PIPELINE — Respond to speech (2-3 calls)
  // ═══════════════════════════════════════════════════════════════

  async _conversationPipeline(member, persona, perception, availableInteractions, personaState, conversationContext, gameTime, stages, pipelineId) {
    const pipelineStart = Date.now();
    const peopleInRoom = perception.visible.peopleInRoom;
    const memories = buildMemorySummary(personaState);

    const timeStr = gameTime.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York'
    });

    // ── STAGE 1: Think about the conversation ──
    const stage1 = await this._runStage({
      name: 'Process Conversation',
      agent: 'Social Agent',
      icon: '💬',
      systemPrompt: `You are the social mind of ${persona.fullName} (${persona.age}, ${persona.role}).
Speech style: ${persona.speechStyle}
Personality: ${persona.traits.slice(0, 4).join(', ')}
Someone is talking to you. Think about what they said, how you feel about it, and what you want to say back.
Consider your relationship, your personality, and what's happening. Be natural and in-character.
Think through your response in 3-4 sentences. No JSON.`,
      userPrompt: `${conversationContext.from} just spoke to me:

CONVERSATION SO FAR (turn ${conversationContext.turnNumber}):
${conversationContext.fullThread}

${conversationContext.from} said: "${conversationContext.lastText}" (${conversationContext.lastEmotion})

How does this make me feel? What do I want to say back? Should I continue the conversation or wind it down?
My mood: ${personaState.mood}
My current situation: ${member.activityLabel || 'idle'}
Recent memories: ${memories}

Think about your response naturally. What would ${persona.name} really say here?`,
      options: { temperature: 0.7, max_tokens: 200, top_p: 0.9 },
    });
    stages.push(stage1);

    if (!stage1.response) {
      return this._buildResult(stages, null, pipelineStart, 'conversation', pipelineId);
    }

    // ── STAGE 2: Commit to JSON response ──
    const interactionList = availableInteractions
      .slice(0, 15)
      .map((ia, i) => `${i + 1}. ${ia.id} — ${ia.label}`)
      .join('\n');

    const stage2 = await this._runStage({
      name: 'Commit Response',
      agent: 'Validator',
      icon: '✅',
      systemPrompt: `You are the decision validator for ${persona.fullName}. Output ONLY valid JSON — no other text.
CRITICAL: speechTarget MUST be "${conversationContext.from}" since they spoke to you.
CRITICAL: speech MUST be a natural reply to what they said.`,
      userPrompt: `MY THINKING ABOUT THIS CONVERSATION:
${stage1.response}

REPLYING TO: ${conversationContext.from} who said "${conversationContext.lastText}"

AVAILABLE ACTIONS: 
${interactionList}

PEOPLE IN ROOM: ${peopleInRoom.map(p => p.name).join(', ')}

Choose an action (continue what you're doing, or change). 
Your speech MUST be your reply to ${conversationContext.from}.

Output ONLY this JSON:
{
  "thought": "brief internal reasoning",
  "action": "exact_action_id",
  "speech": "your reply to ${conversationContext.from}",
  "speechTarget": "${conversationContext.from}",
  "emotion": "your emotion word",
  "lightAction": null
}`,
      options: { temperature: 0.3, max_tokens: 200, top_p: 0.9 },
    });
    stages.push(stage2);

    const finalDecision = this._parseFinalDecision(stage2.response, availableInteractions);
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
    const stage1 = await this._runStage({
      name: 'Inner Reflection',
      agent: 'Reflector',
      icon: '💭',
      systemPrompt: `You are the inner thoughts of ${persona.fullName} (${persona.age}, ${persona.role}).
You are currently doing something. Your mind wanders while your hands are busy.
Think naturally about: what you'll do next, how you're feeling, observations about others nearby, 
things you're looking forward to, worries or plans.
${persona.age < 10 ? 'You think like a kid — sometimes random, sometimes deep, often about play and fun.' : ''}
${persona.role === 'father' || persona.role === 'mother' ? 'As a parent, you often think about the kids and family.' : ''}

Output valid JSON:
{
  "innerThought": "what you're thinking about (1-2 sentences, stream-of-consciousness)",
  "wantToSpeak": true/false,
  "speech": "what you want to say out loud (or null)",
  "speechTarget": "who to talk to (or null)",
  "planUpdate": "any change to your plans (or null)",
  "mood": "current emotion word"
}`,
      userPrompt: `It's ${timeStr}. I'm currently: ${member.activityLabel || 'idle'}
${member.interactionTimer && member.interactionDuration ? `Progress: ${Math.round((member.interactionTimer / member.interactionDuration) * 100)}% done` : ''}

${peopleInRoom.length > 0 ? `People nearby: ${peopleInRoom.map(p => `${p.name} (${p.activity || p.state})`).join(', ')}` : 'I am alone.'}
${perception.audible.length > 0 ? `I hear: ${perception.audible.map(s => s.description).join('; ')}` : ''}

My needs: ${this._formatNeedsCompact(member.needs)}
My mood: ${personaState.mood}
${agendaStr}
${conversations ? `Recent conversations: ${conversations}` : ''}

${perception.environment.sleepingMembers.length > 0 ? `⚠ ${perception.environment.sleepingMembers.join(', ')} sleeping nearby — be quiet` : ''}

What am I thinking about while doing this? Would I naturally say something to someone nearby?
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

      // Robust action ID parsing
      let actionId = parsed.action;
      if (actionId != null) {
        actionId = String(actionId).trim();
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
        speech: parsed.speech && parsed.speech !== 'null' && parsed.speech !== 'None'
          ? String(parsed.speech).substring(0, 200) : null,
        speechTarget: parsed.speechTarget && parsed.speechTarget !== 'null' && parsed.speechTarget !== 'None'
          ? String(parsed.speechTarget) : null,
        emotion: String(parsed.emotion || 'neutral'),
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
