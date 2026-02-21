/**
 * AgenticEngine.js — Master agentic reasoning coordinator.
 *
 * Each family member has a CLUSTER of specialized agents that deliberate
 * through multiple LLM calls before committing to a decision:
 *
 *   1. Observer + Assessor — perceive environment, analyze needs
 *   2. Deliberator — weigh options, reason through trade-offs
 *   3. Social Agent — handle interpersonal reasoning (if people present)
 *   4. Validator — ensure action-speech coherence, output JSON
 *   5. Reflector — background thinking during activities
 *
 * Pipeline types:
 *   - Full Pipeline (4-5 calls): Deep deliberation for new decisions
 *   - Conversation Pipeline (2-3 calls): Respond to speech
 *   - Background Pipeline (1-2 calls): Think while performing a task
 *
 * Also provides:
 *   - Daily agenda planning via LLM at start of each day
 *   - Full thought-chain logging with pipeline stages
 *   - Token usage tracking (per-character, per-minute)
 *   - Background thinking (characters think while performing activities)
 *   - Collision avoidance — characters avoid standing on each other
 *
 * CommonJS module (server-side).
 */

const LLMClient = require('./LLMClient');
const SocialEngine = require('./SocialEngine');
const ReasoningPipeline = require('./ReasoningPipeline');
const logger = require('./SimulationLogger');
const {
  createPersonaState,
  addMemory,
  updateMood,
  recordDecision,
  serializePersonaState,
  getAllPersonaNames,
  resolveCharacterName,
  updateDynamicRelationship,
  tickDynamicRelationships,
  PERSONA_MAP,
} = require('./PersonaManager');
const {
  buildSystemPrompt,
  buildUserPrompt,
  buildAgendaPrompt,
  parseDecision,
  parseAgenda,
  getFilteredInteractions,
} = require('./ReasoningPrompt');
const { buildPerception } = require('./EnvironmentPerception');
const { recordMemory, recordSocialMemory, processNewDay } = require('./MemoryManager');
const {
  isDueSummaryUpdate,
  updateDailySummary,
  queueRelationshipUpdate,
  processRelationshipUpdates,
  getAllRelationshipNarratives,
  resetDailyTracking,
  archiveDailySummaries,
  isDuePatternExtraction,
  extractLongTermPatterns,
} = require('./DailySummaryManager');

// ── Constants ─────────────────────────────────────────────────────
const REASONING_TIMEOUT_MS = 25000;       // 25s real-time timeout per decision
const MIN_REASONING_INTERVAL_MS = 2000;   // Reason every 2s per character (was 5s)
const MAX_GAME_SPEED_FOR_LLM = 10;       // Don't use LLM above this speed multiplier
const STAGGER_DELAY_MS = 400;            // Stagger reasoning calls by 400ms
const MAX_THOUGHT_LOG = 200;             // Keep last N thought entries per character
const TOKEN_WINDOW_MS = 60000;           // 1-minute window for tokens-per-minute

class AgenticEngine {
  constructor(options = {}) {
    this.llmClient = new LLMClient(options.llm || {});
    this.socialEngine = new SocialEngine();
    this.pipeline = new ReasoningPipeline(this.llmClient);

    // Per-character persona state (dynamic: mood, memory, conversations)
    this.personaStates = {};

    // Track pending reasoning requests
    this.pendingDecisions = new Map(); // memberName → { promise, startTime }

    // Resolved decisions waiting to be picked up by GameSimulation
    this.resolvedDecisions = new Map(); // memberName → decision (or null)

    // Track last reasoning time per character
    this.lastReasoningTime = {};       // memberName → Date.now()

    // ── Background thinking tracking ──
    this.lastBackgroundThinkTime = {};  // memberName → Date.now()
    this.pendingBackgroundThinks = new Map(); // memberName → Promise
    this.backgroundThinkInterval = 25000;  // 25s real-time between background thinks

    // Stagger counter for spreading LLM calls
    this.staggerCounter = 0;

    // Sequential agenda generation lock
    this._agendaGenerating = false;

    // Recent global events
    this.recentEvents = [];

    // ── Daily agendas per character ──
    this.agendas = {};                 // memberName → { plan, completed, generatedForDay }

    // ── Thought chain log — full pipeline stages ──
    this.thoughtLog = {};              // memberName → [{ id, timestamp, stages[], parsedDecision, elapsed, tokenEstimate, pipelineType }]
    this.nextThoughtId = 1;

    // ── Token tracking ──
    this.tokenHistory = {};            // memberName → [{ timestamp, tokens }]
    this.tokenTotals = {};             // memberName → total tokens
    this.globalTokenTotal = 0;

    // Statistics
    this.stats = {
      totalDecisions: 0,
      llmDecisions: 0,
      fallbackDecisions: 0,
      llmErrors: 0,
      avgReasoningTimeMs: 0,
      tokensPerMinute: 0,
      tokensByCharacter: {},
      totalTokens: 0,
      pipelinesRun: 0,
      backgroundThinks: 0,
    };

    // Whether the engine is enabled
    this.enabled = true;

    // ── Room time tracking (when each character entered their current room) ──
    this.roomEntryTime = {};       // memberName → { room, enteredAt (Date.now()) }

    // ── Speech deduplication — prevent background thinking parroting ──
    this.recentSpeechTexts = [];   // [{ text, speaker, timestamp }] — global recent speech

    // ── Hourly reflection tracking ──
    this.lastReflectionHour = {};  // memberName → last hour reflected (0-23)

    // ── Daily log reset tracking ──
    this.lastDayKey = null;

    console.log('[AgenticEngine] Initialized');
  }

  /**
   * Initialize persona states for all family members.
   */
  initializePersonas(family) {
    for (const member of family) {
      this.personaStates[member.name] = createPersonaState(member.name);
      this.lastReasoningTime[member.name] = 0;
      this.agendas[member.name] = { plan: [], completed: [], generatedForDay: null, gameTime: null };
      this.thoughtLog[member.name] = [];
      this.tokenHistory[member.name] = [];
      this.tokenTotals[member.name] = 0;
      this.roomEntryTime[member.name] = { room: member.currentRoom || 'living_room', enteredAt: Date.now() };
    }
    // Initialize SocialEngine per-character conversation state
    this.socialEngine.initializeCharacters(family);
    console.log(`[AgenticEngine] Initialized ${family.length} persona states`);
  }

  /**
   * Check LLM availability on startup.
   */
  async checkLLMAvailability() {
    const available = await this.llmClient.checkHealth();
    console.log(`[AgenticEngine] LLM server: ${available ? 'AVAILABLE' : 'UNAVAILABLE'} at ${this.llmClient.host}:${this.llmClient.port}`);
    return available;
  }

  /**
   * Main tick method — called from GameSimulation.tick().
   */
  tick(family, gameTime, gameSpeed, roomLights) {
    // Periodic health check (non-blocking)
    if (this.enabled && Date.now() - this.llmClient.lastHealthCheck > this.llmClient.healthCheckInterval) {
      this.llmClient.checkHealth().catch(() => {});
    }

    // Update moods for all characters
    for (const member of family) {
      if (this.personaStates[member.name]) {
        // Set social context flag for social battery computation
        const otherPeopleInRoom = family.filter(
          f => f.name !== member.name && f.currentRoom === member.currentRoom && f.state !== 'SLEEPING'
        );
        this.personaStates[member.name]._currentlyWithPeople = otherPeopleInRoom.length > 0;

        updateMood(this.personaStates[member.name], member.needs);
        // Tick dynamic relationship dimensions (patience recovery, sentiment drift)
        tickDynamicRelationships(this.personaStates[member.name], 1.0 / 10); // ~10 tps

        // ── Track room changes for room-time awareness ──
        const roomEntry = this.roomEntryTime[member.name];
        if (roomEntry && roomEntry.room !== member.currentRoom) {
          this.roomEntryTime[member.name] = { room: member.currentRoom, enteredAt: Date.now() };
        }
      }
    }

    // Check for interrupt events
    const newEvents = this.socialEngine.checkForInterruptEvents(
      family, this.personaStates, gameTime
    );
    if (newEvents.length > 0) {
      this.recentEvents.push(...newEvents);
    }

    // Expire old events
    this.recentEvents = this.recentEvents.filter(e =>
      Date.now() - e.timestamp < 60000
    );

    // ── Conversation interrupts: force characters who were just spoken to
    //    into CHOOSING so they can reply through the LLM ──
    //    GUARD: Only interrupt IDLE characters immediately.
    //    PERFORMING/WALKING characters will naturally respond when their action
    //    finishes and they enter CHOOSING on their own — the pendingReply
    //    will be picked up then. This prevents the cascade:
    //      interrupt → CHOOSING → new action → speech → interrupt → repeat
    //    Skip characters already in CHOOSING or THINKING (prevents spam).
    const needingResponse = this.socialEngine.getCharactersNeedingResponse();
    for (const resp of needingResponse) {
      const member = family.find(m => m.name === resp.name);
      if (!member) continue;

      // Only interrupt IDLE characters immediately
      // PERFORMING and WALKING characters keep their pendingReply and respond naturally
      if (member.state === 'idle') {
        const idx = family.indexOf(member);
        if (idx >= 0) {
          // Force into CHOOSING so the next reasoning cycle picks up the conversation
          family[idx] = {
            ...member,
            state: 'choosing',
            activityLabel: `💬 Responding to ${resp.from}...`,
            interactionTimer: 0,
            currentInteraction: null,
            path: null,
            pathIndex: 0,
          };

          // Clear rate limit so reasoning starts IMMEDIATELY this tick
          // (prevents regular AI CHOOSING handler from intercepting)
          this.lastReasoningTime[resp.name] = 0;

          // Mark force-interrupt as consumed so it's not retried
          this.socialEngine.markForceConsumed(resp.name);

          logger.logStateTransition({
            character: resp.name,
            from: member.state,
            to: 'choosing',
            reason: `Interrupted to respond to ${resp.from}: "${resp.text.substring(0, 60)}"`,
            conversationId: resp.threadId,
            triggerSpeaker: resp.from,
            position: member.position,
          });
        }
      } else if (member.state === 'choosing') {
        // Already choosing — just make sure the conversation context is picked up
        this.lastReasoningTime[resp.name] = 0;
        this.socialEngine.markForceConsumed(resp.name);
      } else if (member.state === 'walking' || member.state === 'performing') {
        // Character is busy — interrupt PERFORMING characters to let them reply
        // while preserving their current activity. The conversation pipeline will
        // lock to currentActionId so they keep doing what they're doing and just
        // add speech. For WALKING characters, defer — they'll arrive and respond.
        if (member.state === 'performing') {
          const idx = family.indexOf(member);
          if (idx >= 0) {
            // Force into CHOOSING but KEEP currentInteraction so conversation
            // pipeline can lock to it — character responds WITHOUT losing activity
            family[idx] = {
              ...member,
              state: 'choosing',
              activityLabel: `💬 Responding to ${resp.from}...`,
              // PRESERVE interaction state — don't clear these:
              // currentInteraction, interactionTimer, interactionDuration stay intact
            };

            this.lastReasoningTime[resp.name] = 0;
            this.socialEngine.markForceConsumed(resp.name);

            logger.logStateTransition({
              character: resp.name,
              from: 'performing',
              to: 'choosing',
              reason: `Interrupted (performing) to respond to ${resp.from}: "${resp.text.substring(0, 60)}"`,
              conversationId: resp.threadId,
              triggerSpeaker: resp.from,
              position: member.position,
            });
          }
        } else {
          // WALKING — defer, they'll respond when they arrive
          const convState = this.socialEngine.characterConvState?.[resp.name];
          if (convState?.pendingReply) {
            convState.pendingReply.forceInterrupt = false;  // 45s timeout now
            convState.pendingReply._alreadyForced = true;   // stop retrying
          }
        }
      }
      // If thinking: don't touch — they're mid-reasoning and will pick up on next cycle
    }

    // Generate daily agendas if needed
    this._checkAgendas(family, gameTime, gameSpeed, roomLights);

    // ── Hourly reflection — creates a summary memory every in-game hour ──
    this._doHourlyReflections(family, gameTime);

    // ── Daily log reset — clears dailyLog at start of new day ──
    this._resetDailyLogsIfNewDay(gameTime);

    // Update tokens-per-minute stat
    this._updateTokenStats();

    // Process members that need decisions
    const decisionsToApply = [];
    for (const member of family) {
      if (member.state !== 'choosing' && member.state !== 'thinking') continue;

      // If already thinking and there's a pending decision, check for results
      if (member.state === 'thinking' && this.pendingDecisions.has(member.name)) {
        const pending = this.pendingDecisions.get(member.name);

        // Check for real-time timeout
        if (Date.now() - pending.startTime > REASONING_TIMEOUT_MS) {
          console.log(`[AgenticEngine] Timeout for ${member.name}, falling back`);
          this.pendingDecisions.delete(member.name);
          this.stats.fallbackDecisions++;
          decisionsToApply.push({ memberName: member.name, decision: null, fallback: true });
        }
        continue;
      }

      // If in CHOOSING state, start a new reasoning cycle
      if (member.state === 'choosing') {
        // Rate limit: don't reason too frequently
        const timeSinceLast = Date.now() - (this.lastReasoningTime[member.name] || 0);
        if (timeSinceLast < MIN_REASONING_INTERVAL_MS) continue;

        // At high speed, LLM disabled, or LLM unavailable — skip and use fallback
        if (gameSpeed > MAX_GAME_SPEED_FOR_LLM || !this.enabled || this.llmClient.available === false) {
          decisionsToApply.push({ memberName: member.name, decision: null, fallback: true });
          continue;
        }

        // Start async reasoning
        this._startReasoning(member, family, gameTime, roomLights);
      }
    }

    return decisionsToApply;
  }

  /**
   * Apply a completed LLM decision to the character.
   */
  applyDecision(memberName, decision, family, roomLights) {
    const personaState = this.personaStates[memberName];
    if (!personaState) return false;

    if (decision) {
      // ── Anti-repetition guard ──
      // If the last action is the same as this one, reject and force fallback
      // Created actions are unique by ID, so they naturally pass this check
      const recent = personaState.recentInteractions?.slice(-1) || [];
      if (recent.length >= 1 && recent[0] === decision.action && !decision.isCreatedAction) {
        console.log(`[AgenticEngine] ${memberName} tried "${decision.action}" 2nd time in a row — rejected, forcing variety`);
        personaState.lastThought = decision.thought;
        this.socialEngine.markResponded(memberName);
        return false; // Tell GameSimulation to use fallback instead
      }

      // ── Category-level anti-repetition ──
      // If the last 3 actions are all in the same functional category (e.g., eating/snacking),
      // reject this one if it's ALSO in that category. Prevents loops like:
      // get_snack_fridge → get_pantry_item → get_drink_fridge → get_snack_fridge
      if (!decision.isCreatedAction) {
        const { INTERACTION_MAP } = require('./InteractionData');
        const recentThree = personaState.recentInteractions?.slice(-3) || [];
        if (recentThree.length >= 3) {
          const getCategoryKey = (actionId) => {
            const ia = INTERACTION_MAP[actionId];
            if (!ia) return actionId;
            // Group similar categories: eating+cooking = food, all social = social, etc.
            const cat = ia.category || '';
            if (cat === 'eating' || cat === 'cooking' || cat === 'snacking') return 'food';
            if (cat === 'cleaning') return 'cleaning';
            if (cat === 'social' || cat === 'conversation') return 'social';
            return cat || actionId;
          };
          const recentCats = recentThree.map(getCategoryKey);
          const decisionCat = getCategoryKey(decision.action);
          if (recentCats.every(c => c === decisionCat)) {
            console.log(`[AgenticEngine] ${memberName} tried "${decision.action}" — 4th "${decisionCat}" in a row — rejected, forcing variety`);
            personaState.lastThought = decision.thought;
            this.socialEngine.markResponded(memberName);
            return false;
          }
        }
      }

      personaState.lastThought = decision.thought;
      personaState.currentGoal = decision.isCreatedAction ? decision.actionDescription : decision.action;

      // ── Created action logging ──
      if (decision.isCreatedAction) {
        const { logCreatedAction } = require('./ActionClassifier');
        logCreatedAction(memberName, decision.actionDescription, decision.createdActionData);
        console.log(`[AgenticEngine] ${memberName} CREATED action: "${decision.actionDescription}" → ${decision.createdActionData.category} (${decision.createdActionData.icon})`);
      }

      // ── Room validation guard ──
      // Ensure the chosen action belongs to the character's current room (or _any)
      // For created actions, use the classified room instead
      const { INTERACTION_MAP } = require('./InteractionData');
      const chosenInteraction = decision.isCreatedAction ? decision.createdActionData : INTERACTION_MAP[decision.action];
      const memberForRoom = family.find(m => m.name === memberName);
      if (chosenInteraction && memberForRoom) {
        const actionRoom = chosenInteraction.room;
        const charRoom = memberForRoom.currentRoom;
        if (actionRoom !== '_any' && actionRoom !== charRoom) {
          console.log(`[AgenticEngine] ${memberName} chose "${decision.action}" (room: ${actionRoom}) but is in ${charRoom} — allowing walk`);
          // We allow it — the AI system will walk the character to the right room
          // This is intentional: picking a kitchen action from the living room means "go to kitchen"
        }
      }

      recordDecision(personaState, decision.action, decision.thought);

      // Mark agenda item as completed if it matches
      this._markAgendaCompleted(memberName, decision.action, decision.thought);

      // Handle speech
      if (decision.speech) {
        const member = family.find(m => m.name === memberName);
        const room = member?.currentRoom || 'unknown';

        // ── Navigation departure guard ──
        // If leaving the room (go_to_*), suppress speech — you're about to walk away
        if (decision.action && decision.action.startsWith('go_to_')) {
          console.log(`[AgenticEngine] ${memberName} suppressed speech — leaving room (${decision.action})`);
          decision.speech = null;
          decision.speechTarget = null;
        }

        // ── Alone-in-room guard ──
        // If nobody else is in the room, suppress speech entirely
        // (no talking to walls — this is a realism fix)
        const othersInRoom = family.filter(m =>
          m.name !== memberName && m.currentRoom === room
        );
        if (othersInRoom.length === 0 && decision.speechTarget) {
          console.log(`[AgenticEngine] ${memberName} tried to talk but is alone in ${room} — suppressed`);
          decision.speech = null;
          decision.speechTarget = null;
        }

        // ── Sleeping room guard ──
        // If someone in the room is sleeping, suppress speech to avoid waking them
        const sleepersInRoom = othersInRoom.filter(m =>
          m.activityLabel && m.activityLabel.toLowerCase().includes('sleep')
        );
        if (sleepersInRoom.length > 0) {
          console.log(`[AgenticEngine] ${memberName} suppressed speech in ${room} — ${sleepersInRoom.map(m => m.name).join(', ')} sleeping`);
          decision.speech = null;
          decision.speechTarget = null;
        }

        // Resolve speech target name (LLM may use nicknames)
        let resolvedTarget = decision.speechTarget;
        if (resolvedTarget) {
          resolvedTarget = resolveCharacterName(resolvedTarget) || resolvedTarget;

          // ── Cross-room targeting guard ──
          // Strip speech target if the target is NOT in the same room
          const targetMember = family.find(m => m.name === resolvedTarget);
          if (targetMember && targetMember.currentRoom !== room) {
            console.log(`[AgenticEngine] ${memberName} tried to talk to ${resolvedTarget} in ${targetMember.currentRoom} from ${room} — stripped target`);
            resolvedTarget = null;
            // Keep the speech as a general statement, just remove the target
          }

          // ── Conversation cooldown guard ──
          // Don't start new conversations with someone we just finished talking to
          if (resolvedTarget && this.socialEngine.isPairOnCooldown(memberName, resolvedTarget)) {
            console.log(`[AgenticEngine] ${memberName} tried to talk to ${resolvedTarget} but pair is on cooldown — stripped target`);
            resolvedTarget = null;
          }
        }

        // Final check — if speech still exists after guards
        if (decision.speech) {
          // ── Speech deduplication guard (for main pipeline too) ──
          const normalizedSpeech = decision.speech.toLowerCase().trim();
          const now = Date.now();
          this.recentSpeechTexts = this.recentSpeechTexts.filter(s => now - s.timestamp < 300000);
          const isDupeSpeech = this.recentSpeechTexts.some(s => s.text === normalizedSpeech);
          if (isDupeSpeech) {
            console.log(`[AgenticEngine] ${memberName} suppressed duplicate speech: "${decision.speech.substring(0, 50)}..."`);
            decision.speech = null;
            decision.speechTarget = null;
            resolvedTarget = null;
          } else {
            this.recentSpeechTexts.push({ text: normalizedSpeech, speaker: memberName, timestamp: now });
          }
        }

        if (decision.speech) {
          personaState.pendingSpeech = {
            text: decision.speech,
            target: resolvedTarget,
            emotion: decision.emotion || 'neutral',
            timestamp: Date.now(),
          };
          // Pass family so SocialEngine can check room proximity for interrupts
          const result = this.socialEngine.processSpeech(
            memberName, resolvedTarget, decision.speech,
            decision.emotion, room, this.personaStates, family
          );

          // ── Record social memory for BOTH participants (asymmetric emotions) ──
          if (resolvedTarget && this.personaStates[resolvedTarget]) {
            recordSocialMemory(
              personaState,
              this.personaStates[resolvedTarget],
              `${memberName} said to ${resolvedTarget}: "${decision.speech}"`,
              decision.emotion || 'neutral',
              'neutral', // target's emotion — will be updated when they respond
              { location: room, importance: 3 }
            );

            // Update dynamic relationship dimension
            const sentimentDelta = _speechSentiment(decision.speech, decision.emotion);
            updateDynamicRelationship(personaState, resolvedTarget, sentimentDelta);
            updateDynamicRelationship(this.personaStates[resolvedTarget], memberName, sentimentDelta * 0.5);

            // Queue relationship narrative updates for both participants
            queueRelationshipUpdate(memberName, resolvedTarget, {
              interaction: `${memberName} said: "${decision.speech}"`,
              emotion: decision.emotion || 'neutral',
              conversationSnippet: decision.speech,
            });
            queueRelationshipUpdate(resolvedTarget, memberName, {
              interaction: `${memberName} said to me: "${decision.speech}"`,
              emotion: 'neutral',
              conversationSnippet: decision.speech,
            });
          } else {
            // Speech to nobody specific or general statement
            recordMemory(personaState, 'action',
              `Said aloud: "${decision.speech}"`,
              decision.emotion || 'neutral',
              { location: room, importance: 2 }
            );
          }
        } else {
          personaState.pendingSpeech = null;
        }
      } else {
        personaState.pendingSpeech = null;
      }

      // Always mark responded to clear pending conversation state
      // (even if no speech was generated — prevents pendingReply from persisting)
      this.socialEngine.markResponded(memberName);

      // Handle light actions
      if (decision.lightAction && roomLights) {
        const member = family.find(m => m.name === memberName);
        if (member) {
          const currentRoom = member.currentRoom;
          if (decision.lightAction === 'on' && roomLights[currentRoom] === false) {
            roomLights[currentRoom] = true;
            recordMemory(personaState, 'action', `Turned on the light in ${currentRoom}`, 'neutral', { location: currentRoom, importance: 1 });
          } else if (decision.lightAction === 'off' && roomLights[currentRoom] === true) {
            roomLights[currentRoom] = false;
            recordMemory(personaState, 'action', `Turned off the light in ${currentRoom}`, 'neutral', { location: currentRoom, importance: 1 });
          }
        }
      }

      personaState.mood = decision.emotion || personaState.mood;

      // ── Enhanced output fields (per goals.md Principle 5) ──
      // Store details as enriched activity description
      if (decision.details) {
        personaState.currentActivityDetails = decision.details;
      }
      // Store speech tone for future rendering
      if (decision.speechTone && personaState.pendingSpeech) {
        personaState.pendingSpeech.tone = decision.speechTone;
      }
      // Apply emotional shift to mood intensity
      if (decision.emotionalShift && decision.emotionalShift !== 0) {
        const shift = decision.emotionalShift / 100; // Normalize -20..+20 to -0.2..+0.2
        personaState.moodIntensity = Math.max(0, Math.min(1, 
          (personaState.moodIntensity || 0.5) + shift
        ));
        // Large negative shifts increase stress
        if (decision.emotionalShift < -5) {
          personaState.stressLevel = Math.min(1,
            (personaState.stressLevel || 0) + Math.abs(shift) * 0.5
          );
        }
      }

      // ── Emotional Cascade Buffer (per goals.md Step 5) ──
      // Rolling buffer of recent emotional shifts — feeds into next Deliberator as cumulative emotional context
      if (!personaState.emotionalCascadeBuffer) personaState.emotionalCascadeBuffer = [];
      const cascadeEntry = {
        shift: decision.emotionalShift || 0,
        emotion: decision.emotion || personaState.mood || 'neutral',
        reason: decision.thought || decision.details || decision.action || 'unknown',
        action: decision.action || null,
        timestamp: Date.now(),
      };
      personaState.emotionalCascadeBuffer.push(cascadeEntry);
      // Keep only last 12 entries (roughly 2-3 game hours of decisions)
      if (personaState.emotionalCascadeBuffer.length > 12) {
        personaState.emotionalCascadeBuffer = personaState.emotionalCascadeBuffer.slice(-12);
      }
      // Store next intention for future pipeline context
      if (decision.nextIntention) {
        personaState.nextIntention = decision.nextIntention;
      }

      this.stats.llmDecisions++;
    } else {
      // No valid decision — also clear pending conversation state
      this.socialEngine.markResponded(memberName);
    }

    this.stats.totalDecisions++;
    return true; // Decision accepted
  }

  /**
   * Start an async multi-agent reasoning pipeline for a character.
   * Instead of a single LLM call, runs 4-5 specialized agent stages:
   *   1. Observer + Assessor → summarize situation & needs
   *   2. Deliberator → weigh options with chain-of-thought
   *   3. Social Agent → interpersonal reasoning (if people present)
   *   4. Validator → coherent JSON output with action-speech match
   */
  _startReasoning(member, family, gameTime, roomLights) {
    const name = member.name;
    this.lastReasoningTime[name] = Date.now();
    this.staggerCounter++;

    const personaState = this.personaStates[name];
    if (!personaState) return;

    // Attach room time info so the pipeline can access it
    personaState._roomTimeMinutes = this.getRoomTimeMinutes(name);

    const agenda = this.agendas[name];
    const conversationContext = this.socialEngine.getConversationContext(name);

    const startTime = Date.now();
    const thoughtId = this.nextThoughtId++;

    const pipelineType = conversationContext ? 'conversation' : 'full';
    console.log(`[AgenticEngine] ${name} starting ${pipelineType} pipeline (thought #${thoughtId})`);

    const promise = this.pipeline.fullPipeline(
      member, family, gameTime, roomLights,
      personaState, this.recentEvents, agenda, conversationContext
    ).then(result => {
      const elapsed = result.totalElapsed;
      const totalTokens = result.totalTokens;
      this._updateAvgTime(elapsed);
      this._recordTokens(name, totalTokens);

      const stageCount = result.stages.length;
      const stageNames = result.stages.map(s => s.name).join(' → ');
      this.stats.pipelinesRun = (this.stats.pipelinesRun || 0) + 1;

      // Log full pipeline with all stages
      this._logThought(name, thoughtId, result.stages, result.finalDecision, elapsed, totalTokens, result.pipelineType, result.pipelineId);

      // Log to rolling file
      logger.logLLMCall({
        character: name,
        type: `pipeline:${result.pipelineType}`,
        systemPrompt: result.stages.map(s => `[${s.name}] ${s.systemPrompt}`).join('\n---\n'),
        userPrompt: result.stages.map(s => `[${s.name}] ${s.userPrompt}`).join('\n---\n'),
        rawResponse: result.stages.map(s => `[${s.name}] ${s.response || s.error || 'no response'}`).join('\n---\n'),
        parsedDecision: result.finalDecision,
        elapsed,
        tokens: totalTokens,
        valid: result.finalDecision?.valid || false,
        error: result.stages.find(s => s.error)?.error || null,
      });

      if (result.finalDecision && result.finalDecision.valid) {
        const actionLabel = result.finalDecision.isCreatedAction
          ? `CREATED: "${result.finalDecision.actionDescription}" (${result.finalDecision.createdActionData?.category})`
          : result.finalDecision.action;
        console.log(`[AgenticEngine] ${name} decided: ${actionLabel} ("${result.finalDecision.thought}") [${stageCount} stages: ${stageNames}] [${elapsed}ms] [~${totalTokens} tok]`);
        return result.finalDecision;
      } else {
        console.log(`[AgenticEngine] ${name} pipeline produced invalid/no decision [${stageCount} stages] [${elapsed}ms] — falling back`);
        if (result.finalDecision) {
          personaState.lastThought = result.finalDecision.thought;
        }
        return null;
      }
    }).catch(err => {
      console.error(`[AgenticEngine] Pipeline error for ${name}: ${err.message}`);
      this.stats.llmErrors++;
      this._logThought(name, thoughtId, [{ name: 'Error', agent: 'System', icon: '❌', error: err.message, elapsed: Date.now() - startTime }], null, Date.now() - startTime, 0, 'error', null);
      logger.logLLMCall({ character: name, type: 'pipeline:error', systemPrompt: '', userPrompt: '', rawResponse: `ERROR: ${err.message}`, parsedDecision: null, elapsed: Date.now() - startTime, tokens: 0, valid: false, error: err.message });
      return null;
    }).then(decision => {
      this.resolvedDecisions.set(name, decision);
      this.pendingDecisions.delete(name);
      return decision;
    });

    this.pendingDecisions.set(name, { promise, startTime });
    return promise;
  }

  // ═══════════════════════════════════════════════════════════════
  //  BACKGROUND THINKING — Characters reflect while performing
  // ═══════════════════════════════════════════════════════════════

  /**
   * Trigger background thinking for performing characters.
   * Called from the main tick loop. Characters doing activities will
   * periodically reflect via the Reflector Agent, generating:
   *   - Internal thoughts (stored as memories)
   *   - Spontaneous speech (processed through social engine)
   *   - Plan/agenda updates
   *
   * @param {Array} family - All family members
   * @param {Date} gameTime - Current game time
   * @param {number} gameSpeed - Current speed multiplier
   * @param {Object} roomLights - Room light states
   */
  doBackgroundThinking(family, gameTime, gameSpeed, roomLights) {
    if (!this.enabled || this.llmClient.available === false) return;
    if (gameSpeed > MAX_GAME_SPEED_FOR_LLM) return;

    const now = Date.now();

    for (const member of family) {
      // Only think while performing (not sleeping)
      if (member.state !== 'performing') continue;
      if (member.activityLabel && member.activityLabel.toLowerCase().includes('sleep')) continue;

      // Don't start if already has a pending background think or decision
      if (this.pendingBackgroundThinks.has(member.name)) continue;
      if (this.pendingDecisions.has(member.name)) continue;

      // Rate limit background thinking
      const lastThink = this.lastBackgroundThinkTime[member.name] || 0;
      if (now - lastThink < this.backgroundThinkInterval) continue;

      this.lastBackgroundThinkTime[member.name] = now;
      const thoughtId = this.nextThoughtId++;
      const personaState = this.personaStates[member.name];
      if (!personaState) continue;

      const agenda = this.agendas[member.name];

      console.log(`[AgenticEngine] ${member.name} background thinking (thought #${thoughtId})`);

      const bgPromise = this.pipeline.backgroundThink(
        member, family, gameTime, roomLights,
        personaState, this.recentEvents, agenda
      ).then(result => {
        this._recordTokens(member.name, result.totalTokens);
        this.stats.backgroundThinks = (this.stats.backgroundThinks || 0) + 1;

        // Log the background thought
        this._logThought(member.name, thoughtId, result.stages, result.result ? { thought: result.result.innerThought, type: 'background', mood: result.result.mood } : null, result.totalElapsed, result.totalTokens, 'background', result.pipelineId);

        if (result.result) {
          const bg = result.result;

          // Store as memory
          if (bg.innerThought) {
            addMemory(personaState, 'thought', `[While ${member.activityLabel}] ${bg.innerThought}`, 2);
          }

          // Update mood
          if (bg.mood) {
            personaState.mood = bg.mood;
          }

          // ── Emotional shift from reflection → cascade buffer ──
          if (bg.emotionalShift && bg.emotionalShift !== 0) {
            const shiftMagnitude = Math.abs(bg.emotionalShift) / 20; // Normalize to 0-0.5 range (half weight of actions)
            if (bg.emotionalShift > 0) {
              personaState.moodIntensity = Math.min(1, (personaState.moodIntensity || 0.5) + shiftMagnitude * 0.3);
              personaState.stressLevel = Math.max(0, (personaState.stressLevel || 0) - shiftMagnitude * 0.2);
            } else {
              personaState.stressLevel = Math.min(1, (personaState.stressLevel || 0) + shiftMagnitude * 0.3);
              personaState.moodIntensity = Math.max(0, (personaState.moodIntensity || 0.5) - shiftMagnitude * 0.2);
            }
            // Add to emotional cascade buffer
            if (!personaState.emotionalCascadeBuffer) personaState.emotionalCascadeBuffer = [];
            personaState.emotionalCascadeBuffer.push({
              action: `reflecting while ${member.activityLabel || 'idle'}`,
              emotion: bg.mood || 'content',
              shift: bg.emotionalShift,
              timestamp: Date.now(),
            });
            if (personaState.emotionalCascadeBuffer.length > 12) {
              personaState.emotionalCascadeBuffer.shift();
            }
          }

          // Handle spontaneous speech
          if (bg.wantToSpeak && bg.speech && bg.speechTarget) {
            const room = member.currentRoom;
            const othersInRoom = family.filter(m => m.name !== member.name && m.currentRoom === room);

            // Only speak if target is actually in the room
            const targetInRoom = othersInRoom.some(m => m.name === bg.speechTarget);

            // Check conversation cooldown — don't start new conversations via background think
            const onCooldown = this.socialEngine.isPairOnCooldown(member.name, bg.speechTarget);

            // ── Speech deduplication — prevent parroting the same line repeatedly ──
            const normalizedSpeech = bg.speech.toLowerCase().trim();
            const now = Date.now();
            // Expire old entries (older than 5 minutes)
            this.recentSpeechTexts = this.recentSpeechTexts.filter(s => now - s.timestamp < 300000);
            const isDuplicate = this.recentSpeechTexts.some(s => s.text === normalizedSpeech);

            if (targetInRoom && !onCooldown && !isDuplicate) {
              // Record this speech for deduplication
              this.recentSpeechTexts.push({ text: normalizedSpeech, speaker: member.name, timestamp: now });

              personaState.pendingSpeech = {
                text: bg.speech,
                target: bg.speechTarget,
                emotion: bg.mood || 'content',
                timestamp: Date.now(),
              };
              this.socialEngine.processSpeech(
                member.name, bg.speechTarget, bg.speech,
                bg.mood || 'content', room, this.personaStates, family
              );
              console.log(`[AgenticEngine] ${member.name} says (background): "${bg.speech}" → ${bg.speechTarget}`);
            }
          }

          // Handle plan updates
          if (bg.planUpdate) {
            addMemory(personaState, 'thought', `Updated plans: ${bg.planUpdate}`, 2);
          }
        }

        this.pendingBackgroundThinks.delete(member.name);
      }).catch(err => {
        console.error(`[AgenticEngine] Background think error for ${member.name}: ${err.message}`);
        this.pendingBackgroundThinks.delete(member.name);
      });

      this.pendingBackgroundThinks.set(member.name, bgPromise);
    }

    // ── Periodic daily summary updates (every 30 game minutes per character) ──
    this._checkDailySummaryUpdates(family, gameTime);

    // ── Process pending relationship narrative updates ──
    processRelationshipUpdates(this.personaStates, this.llmClient, gameTime);
  }

  /**
   * Check if any character is due for a daily summary narrative update.
   * Runs one update at a time to avoid LLM overload.
   */
  _checkDailySummaryUpdates(family, gameTime) {
    for (const member of family) {
      const personaState = this.personaStates[member.name];
      if (!personaState) continue;

      // Only update if due and not sleeping
      if (member.activityLabel && member.activityLabel.toLowerCase().includes('sleep')) continue;

      if (isDueSummaryUpdate(member.name, gameTime)) {
        updateDailySummary(member, personaState, gameTime, this.llmClient);
        return; // Only start one per tick cycle to preserve LLM bandwidth
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  DAILY AGENDA SYSTEM
  // ═══════════════════════════════════════════════════════════════

  _checkAgendas(family, gameTime, gameSpeed, roomLights) {
    if (!this.enabled || this.llmClient.available === false) return;
    if (gameSpeed > MAX_GAME_SPEED_FOR_LLM) return;

    // Only generate one agenda at a time across all characters
    if (this._agendaGenerating) return;

    const dayKey = gameTime.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
    const hour = gameTime.getHours() + gameTime.getMinutes() / 60;

    for (const member of family) {
      const agenda = this.agendas[member.name];
      if (!agenda) continue;

      // Generate agenda if: new day AND we haven't generated for this day yet
      // Allow generation at ANY time (not just 5-8 AM) — if someone doesn't have
      // an agenda yet, they should get one whenever they first become available
      const needsAgenda = !agenda.generatedForDay || agenda.generatedForDay !== dayKey;

      // Don't generate agendas for sleeping characters
      const isSleeping = member.activityLabel && member.activityLabel.toLowerCase().includes('sleep');
      if (isSleeping) continue;

      if (needsAgenda) {
        this._agendaGenerating = true;
        this._generateAgenda(member, family, gameTime, roomLights, dayKey)
          .finally(() => { this._agendaGenerating = false; });
        return; // Only start one agenda generation per tick cycle
      }
    }
  }

  async _generateAgenda(member, family, gameTime, roomLights, dayKey) {
    const personaState = this.personaStates[member.name];
    if (!personaState) return;

    try {
      const systemPrompt = buildSystemPrompt(member.name);
      const agendaPrompt = buildAgendaPrompt(member, gameTime, personaState);
      const startTime = Date.now();

      const rawResponse = await this.llmClient.reason(systemPrompt, agendaPrompt, {
        temperature: 0.7,
        max_tokens: 600,
        top_p: 0.9,
      });

      const elapsed = Date.now() - startTime;
      const tokens = rawResponse ? this._estimateTokens(systemPrompt + agendaPrompt + rawResponse) : 0;
      this._recordTokens(member.name, tokens);

      const plan = parseAgenda(rawResponse);

      if (plan && plan.length > 0) {
        this.agendas[member.name] = {
          plan,
          completed: [],
          generatedForDay: dayKey,
          gameTime: gameTime.toISOString(),
          _generating: false,
        };
        addMemory(personaState, 'thought', `Made a plan for today: ${plan.map(p => p.activity).join(', ')}`, 4);
        console.log(`[AgenticEngine] ${member.name} planned their day: ${plan.length} items`);

        logger.logAgenda({
          character: member.name,
          plan,
          raw: rawResponse,
          elapsed,
          tokens,
          error: null,
        });
      }

      this._logThought(member.name, this.nextThoughtId++,
        [{ name: 'Agenda Planning', agent: 'Planner', icon: '📋', systemPrompt, userPrompt: agendaPrompt, response: rawResponse, elapsed, tokens }],
        { type: 'agenda', plan }, elapsed, tokens, 'agenda', null);
      logger.logLLMCall({ character: member.name, type: 'agenda', systemPrompt, userPrompt: agendaPrompt, rawResponse, parsedDecision: { type: 'agenda', plan }, elapsed, tokens, valid: !!plan, error: null });

    } catch (err) {
      console.error(`[AgenticEngine] Agenda generation error for ${member.name}: ${err.message}`);
      logger.logLLMCall({ character: member.name, type: 'agenda', systemPrompt: '', userPrompt: '', rawResponse: '', parsedDecision: null, elapsed: 0, tokens: 0, valid: false, error: err.message });
    }
  }

  _markAgendaCompleted(memberName, action, thought) {
    const agenda = this.agendas[memberName];
    if (!agenda || !agenda.plan) return;

    const actionLower = (action || '').toLowerCase().replace(/_/g, ' ');
    const thoughtLower = (thought || '').toLowerCase();

    // Category mapping for fuzzy matching
    const categoryKeywords = {
      cooking: ['cook', 'breakfast', 'lunch', 'dinner', 'meal', 'grill', 'bake'],
      eating: ['eat', 'breakfast', 'lunch', 'dinner', 'snack', 'food'],
      sleeping: ['sleep', 'nap', 'bed', 'rest'],
      hygiene: ['shower', 'bath', 'brush', 'wash', 'teeth', 'clean'],
      exercise: ['exercise', 'soccer', 'swim', 'trampoline', 'bike', 'basketball', 'jog'],
      hobby: ['draw', 'paint', 'read', 'art', 'craft', 'music', 'guitar', 'piano'],
      entertainment: ['watch', 'tv', 'game', 'play', 'video'],
      chores: ['clean', 'laundry', 'vacuum', 'dishes', 'tidy', 'mow', 'yard'],
      relaxing: ['relax', 'coffee', 'sit', 'chill', 'wind down'],
      social: ['talk', 'chat', 'conversation', 'hang out', 'family'],
    };

    for (const item of agenda.plan) {
      if (item.done) continue;
      const activityLower = (item.activity || '').toLowerCase();

      // Direct word overlap check (more than 1 significant word must match)
      const activityWords = activityLower.split(/\s+/).filter(w => w.length > 2);
      const actionWords = actionLower.split(/\s+/).filter(w => w.length > 2);
      const thoughtWords = thoughtLower.split(/\s+/).filter(w => w.length > 3);

      let matchScore = 0;

      // Check action words against activity words
      for (const aw of actionWords) {
        if (activityWords.some(w => w.includes(aw) || aw.includes(w))) matchScore += 2;
      }

      // Check thought words against activity words
      for (const tw of thoughtWords) {
        if (activityWords.some(w => w.includes(tw) || tw.includes(w))) matchScore += 1;
      }

      // Check category keyword overlap
      for (const [, keywords] of Object.entries(categoryKeywords)) {
        const activityHasCategory = keywords.some(k => activityLower.includes(k));
        const actionHasCategory = keywords.some(k => actionLower.includes(k) || thoughtLower.includes(k));
        if (activityHasCategory && actionHasCategory) matchScore += 1;
      }

      if (matchScore >= 2) {
        item.done = true;
        item.completedAt = Date.now();
        agenda.completed.push({ ...item, completedAt: Date.now() });
        break;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  HOURLY REFLECTIONS & DAILY RESET
  // ═══════════════════════════════════════════════════════════════

  /**
   * Hourly reflection — once per game hour, create a memory summarizing
   * what the character did in the last hour. This gives characters a
   * sense of time passing and prevents them from losing track of the day.
   */
  _doHourlyReflections(family, gameTime) {
    const currentHour = gameTime.getHours();

    for (const member of family) {
      const personaState = this.personaStates[member.name];
      if (!personaState) continue;

      // Skip sleeping characters
      const isSleeping = member.activityLabel && member.activityLabel.toLowerCase().includes('sleep');
      if (isSleeping) continue;

      const lastHour = this.lastReflectionHour[member.name];
      if (lastHour === currentHour) continue; // Already reflected this hour

      // Initialize on first tick
      if (lastHour === undefined) {
        this.lastReflectionHour[member.name] = currentHour;
        continue;
      }

      this.lastReflectionHour[member.name] = currentHour;

      // Build reflection from recent daily log entries since last reflection
      // Use a counter: grab entries recorded since the last reflection (not real-time based)
      const log = personaState.dailyLog || [];
      const lastReflectedIndex = personaState._lastReflectedLogIndex || 0;
      const recentEntries = log.slice(lastReflectedIndex);
      personaState._lastReflectedLogIndex = log.length; // mark current position

      if (recentEntries.length === 0) continue;

      // Summarize activities
      const actions = [...new Set(recentEntries.map(e => (e.action || '').replace(/_/g, ' ')))];
      const summary = actions.slice(0, 5).join(', ');

      const timeLabel = gameTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York'
      });

      addMemory(personaState, 'reflection',
        `[Hourly reflection at ${timeLabel}] In the past hour I: ${summary}. (${recentEntries.length} activities total)`,
        4
      );
    }
  }

  /**
   * Reset daily logs at the start of a new day.
   * This ensures buildDailySummary starts fresh each day.
   * Archives Tier 2+3 narratives for Tier 4 pattern extraction before clearing.
   */
  _resetDailyLogsIfNewDay(gameTime) {
    const { resetDailyLog } = require('./PersonaManager');
    const dayKey = gameTime.toLocaleDateString('en-US', { timeZone: 'America/New_York' });

    if (this.lastDayKey && this.lastDayKey !== dayKey) {
      // Build a human-readable day label from the PREVIOUS day (the one we're archiving)
      const prevDayLabel = this.lastDayKey; // e.g. "6/15/2025"

      // New day — archive BEFORE clearing, then reset
      for (const [name, personaState] of Object.entries(this.personaStates)) {
        // ── Tier 4: Archive daily + relationship narratives before clearing ──
        archiveDailySummaries(personaState, prevDayLabel);

        // ── Tier 4: Extract long-term patterns if enough days archived ──
        if (isDuePatternExtraction(personaState) && this.llmClient?.available) {
          const member = this.family.find(m => m.name === name);
          if (member) {
            // Fire-and-forget: pattern extraction is background work
            extractLongTermPatterns(member, personaState, this.llmClient)
              .catch(err => console.error(`[LongTermMemory] Pattern extraction failed for ${name}: ${err.message}`));
          }
        }

        resetDailyLog(personaState);
        processNewDay(personaState); // MemoryManager: keep only emotionally significant overnight memories
        recordMemory(personaState, 'thought', `A new day has begun.`, 'contentment', { importance: 3 });
        // Reset daily summary narrative for the new day
        personaState.dailySummaryNarrative = null;
        personaState.relationshipNarratives = {};
        personaState.emotionalCascadeBuffer = []; // Reset emotional cascade for new day
        resetDailyTracking(name);
      }
      console.log(`[AgenticEngine] New day detected (${dayKey}), daily logs reset, Tier 4 archives updated, overnight memory processed`);
    }
    this.lastDayKey = dayKey;
  }

  // ═══════════════════════════════════════════════════════════════
  //  THOUGHT CHAIN LOGGING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Log a thought with full pipeline stage data.
   * @param {string} memberName
   * @param {number} id - Thought ID
   * @param {Array} stages - Array of pipeline stage results
   * @param {Object} parsedDecision - Final decision or background result
   * @param {number} elapsed - Total pipeline time
   * @param {number} tokenEstimate
   * @param {string} pipelineType - 'full', 'conversation', 'background', 'agenda', 'error'
   * @param {string} pipelineId - Unique pipeline run ID
   */
  _logThought(memberName, id, stages, parsedDecision, elapsed, tokenEstimate, pipelineType, pipelineId) {
    if (!this.thoughtLog[memberName]) this.thoughtLog[memberName] = [];

    this.thoughtLog[memberName].push({
      id,
      timestamp: Date.now(),
      stages: (stages || []).map(s => ({
        name: s.name,
        agent: s.agent,
        icon: s.icon,
        systemPrompt: s.systemPrompt || null,
        userPrompt: s.userPrompt || null,
        response: s.response || null,
        error: s.error || null,
        elapsed: s.elapsed || 0,
        tokens: s.tokens || 0,
      })),
      parsedDecision,
      elapsed,
      tokenEstimate,
      pipelineType: pipelineType || 'unknown',
      pipelineId: pipelineId || null,
      character: memberName,
    });

    if (this.thoughtLog[memberName].length > MAX_THOUGHT_LOG) {
      this.thoughtLog[memberName] = this.thoughtLog[memberName].slice(-MAX_THOUGHT_LOG);
    }
  }

  /**
   * Get a specific thought entry by ID (for the modal detail view).
   */
  getThoughtById(thoughtId) {
    for (const entries of Object.values(this.thoughtLog)) {
      const found = entries.find(e => e.id === thoughtId);
      if (found) return found;
    }
    return null;
  }

  /**
   * Get recent thoughts for a character (for the timeline).
   */
  getRecentThoughts(memberName, limit = 20) {
    const log = this.thoughtLog[memberName] || [];
    return log.slice(-limit).map(e => ({
      id: e.id,
      timestamp: e.timestamp,
      thought: e.parsedDecision?.thought || (e.parsedDecision?.type === 'agenda' ? 'Planning the day...' : e.parsedDecision?.innerThought || 'Processing...'),
      action: e.parsedDecision?.action || e.parsedDecision?.type || null,
      speech: e.parsedDecision?.speech || null,
      emotion: e.parsedDecision?.emotion || e.parsedDecision?.mood || null,
      elapsed: e.elapsed,
      tokens: e.tokenEstimate,
      valid: e.parsedDecision?.valid ?? null,
      character: e.character,
      pipelineType: e.pipelineType || 'unknown',
      stageCount: (e.stages || []).length,
    }));
  }

  // ═══════════════════════════════════════════════════════════════
  //  TOKEN TRACKING
  // ═══════════════════════════════════════════════════════════════

  _estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  _recordTokens(memberName, tokens) {
    const now = Date.now();
    if (!this.tokenHistory[memberName]) this.tokenHistory[memberName] = [];
    this.tokenHistory[memberName].push({ timestamp: now, tokens });
    this.tokenTotals[memberName] = (this.tokenTotals[memberName] || 0) + tokens;
    this.globalTokenTotal += tokens;

    // Keep last 5 minutes
    this.tokenHistory[memberName] = this.tokenHistory[memberName].filter(
      e => now - e.timestamp < 300000
    );
  }

  _updateTokenStats() {
    const now = Date.now();
    let totalRecentTokens = 0;
    const byCharacter = {};

    for (const [name, history] of Object.entries(this.tokenHistory)) {
      const recent = history.filter(e => now - e.timestamp < TOKEN_WINDOW_MS);
      const charTokens = recent.reduce((sum, e) => sum + e.tokens, 0);
      byCharacter[name] = charTokens;
      totalRecentTokens += charTokens;
    }

    this.stats.tokensPerMinute = totalRecentTokens;
    this.stats.tokensByCharacter = byCharacter;
    this.stats.totalTokens = this.globalTokenTotal;
  }

  // ═══════════════════════════════════════════════════════════════
  //  COLLISION AVOIDANCE
  // ═══════════════════════════════════════════════════════════════

  getOccupiedPositions(family, excludeName) {
    return family
      .filter(m => m.name !== excludeName)
      .map(m => ({ name: m.name, x: m.position.x, z: m.position.z }));
  }

  // ═══════════════════════════════════════════════════════════════
  //  EXISTING HELPERS
  // ═══════════════════════════════════════════════════════════════

  getPendingDecision(memberName) {
    return this.pendingDecisions.get(memberName)?.promise || null;
  }

  hasPendingDecision(memberName) {
    return this.pendingDecisions.has(memberName);
  }

  getResolvedDecision(memberName) {
    if (!this.resolvedDecisions.has(memberName)) return undefined;
    const decision = this.resolvedDecisions.get(memberName);
    this.resolvedDecisions.delete(memberName);
    return decision;
  }

  serialize() {
    const personaData = {};
    for (const [name, state] of Object.entries(this.personaStates)) {
      personaData[name] = serializePersonaState(state);
    }

    const agendaSummaries = {};
    for (const [name, agenda] of Object.entries(this.agendas)) {
      agendaSummaries[name] = {
        plan: (agenda.plan || []).map(item => ({
          time: item.time,
          activity: item.activity,
          duration: item.duration,
          done: item.done || false,
          completedAt: item.completedAt || null,
        })),
        completed: (agenda.completed || []).length,
        total: (agenda.plan || []).length,
        generatedForDay: agenda.generatedForDay,
      };
    }

    const thoughtSummaries = {};
    for (const [name, log] of Object.entries(this.thoughtLog)) {
      thoughtSummaries[name] = log.slice(-8).map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        thought: e.parsedDecision?.thought || (e.parsedDecision?.type === 'agenda' ? 'Planning the day...' : e.parsedDecision?.innerThought || 'Processing...'),
        action: e.parsedDecision?.action || e.parsedDecision?.type || null,
        speech: e.parsedDecision?.speech || null,
        emotion: e.parsedDecision?.emotion || e.parsedDecision?.mood || null,
        elapsed: e.elapsed,
        tokens: e.tokenEstimate,
        valid: e.parsedDecision?.valid ?? null,
        pipelineType: e.pipelineType || 'unknown',
        stageCount: (e.stages || []).length,
        stageNames: (e.stages || []).map(s => s.name),
      }));
    }

    return {
      enabled: this.enabled,
      llmAvailable: this.llmClient.available,
      personaStates: personaData,
      social: this.socialEngine.serialize(),
      stats: { ...this.stats },
      agendas: agendaSummaries,
      thoughtSummaries,
    };
  }

  getPersonaState(memberName) {
    return this.personaStates[memberName] || null;
  }

  /**
   * Get how many real-time minutes a character has been in their current room.
   */
  getRoomTimeMinutes(memberName) {
    const entry = this.roomEntryTime[memberName];
    if (!entry) return 0;
    return (Date.now() - entry.enteredAt) / 60000;
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    console.log(`[AgenticEngine] ${this.enabled ? 'Enabled' : 'Disabled'}`);
  }

  _updateAvgTime(elapsed) {
    const alpha = 0.2;
    this.stats.avgReasoningTimeMs =
      this.stats.avgReasoningTimeMs === 0
        ? elapsed
        : this.stats.avgReasoningTimeMs * (1 - alpha) + elapsed * alpha;
  }
}

/**
 * Estimate the sentiment of a speech act from emotion tag and text content.
 * Returns a value between -1 (hostile) and +1 (loving/warm).
 */
function _speechSentiment(text, emotion) {
  const positiveEmotions = { happy: 0.5, cheerful: 0.5, love: 0.8, grateful: 0.6, proud: 0.5, amused: 0.3, caring: 0.6 };
  const negativeEmotions = { angry: -0.7, frustrated: -0.5, annoyed: -0.4, sad: -0.2, worried: -0.1, disappointed: -0.4, sarcastic: -0.3 };

  let sentiment = positiveEmotions[emotion] || negativeEmotions[emotion] || 0;

  // Simple text-based adjustments
  if (text) {
    const lower = text.toLowerCase();
    if (lower.includes('love you') || lower.includes('thank')) sentiment += 0.3;
    if (lower.includes('sorry')) sentiment += 0.1;
    if (lower.includes('shut up') || lower.includes('hate') || lower.includes('stupid')) sentiment -= 0.4;
    if (lower.includes('!')) sentiment *= 1.1; // emphasis amplifies
  }

  return Math.max(-1, Math.min(1, sentiment));
}

module.exports = AgenticEngine;
