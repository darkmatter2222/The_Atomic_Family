/**
 * SocialEngine.js — Inter-character communication, conversation threads,
 * and social interrupts.
 *
 * CONVERSATION THREADS:
 *   When character A speaks TO character B, a ConversationThread is created.
 *   B is flagged as "needs to respond" — their next reasoning cycle will
 *   include the conversation context and be prompted to reply. This creates
 *   natural multi-turn dialogues.
 *
 *   Threads have a max turn count and will end naturally when characters
 *   move apart or the topic runs its course.
 *
 * INTERRUPTS:
 *   Speech directed at a character can interrupt their current activity.
 *   Parents calling children has high interrupt priority. Children whining
 *   or crying alerts parents. Repeated calls escalate priority.
 *
 * CommonJS module (server-side).
 */

const {
  addConversation,
  getPersona,
  getNickname,
  resolveCharacterName,
  SOCIAL_DYNAMICS,
  INTERRUPT_EVENTS,
} = require('./PersonaManager');

const { ROOM_MAP, getAdjacentRooms } = require('./EnvironmentPerception');
const logger = require('./SimulationLogger');

const MAX_GLOBAL_LOG = 200;       // Global conversation log limit
const SPEECH_DISPLAY_MS = 6000;   // How long speech bubbles last
const MAX_THREAD_TURNS = 4;       // Max back-and-forth turns per thread (was 6 — caused infinite loops)
const THREAD_TIMEOUT_MS = 45000;  // Thread expires after 45s of no activity
const THREAD_RETAIN_MS = 600000;  // Keep expired threads for 10 minutes
const THREAD_RESPONSE_WINDOW_MS = 15000; // How long to wait for a reply (15s — was 30s, too slow)
const MAX_ACTIVE_THREADS = 6;     // Max concurrent threads (was 10 — too many simultaneous conversations)
const INTERRUPT_COOLDOWN_MS = 15000; // Min time between interrupts to same person (was 10s)
const CONVERSATION_PAIR_COOLDOWN_MS = 120000; // 2 min cooldown between two characters starting a NEW conversation
const MIN_SPEECH_INTERVAL_MS = 8000;  // Min 8s between speech acts for the same character

class SocialEngine {
  constructor() {
    this.globalConversationLog = [];  // All speech acts for the whole family
    this.speechQueue = [];            // Pending speech bubbles to broadcast
    this.activeEvents = [];           // Currently active interrupt events

    // ── Conversation threads ──
    this.threads = new Map();         // threadId → ConversationThread
    this.nextThreadId = 1;

    // ── Per-character conversation state ──
    this.characterConvState = {};     // memberName → { pendingReply, activeThreadId, … }

    // ── Conversation pair cooldowns ──
    // After two characters finish a conversation, prevent them from immediately starting another
    this.pairCooldowns = new Map();   // "nameA_nameB" → timestamp when cooldown expires

    // ── Per-character speech rate limiting ──
    this.lastSpeechTime = {};         // memberName → Date.now() of last speech

    // ── Child distress cooldown (prevent spam) ──
    this.lastDistressAt = {};         // memberName → Date.now() of last distress event
  }

  /**
   * Initialize conversation state for all characters.
   */
  initializeCharacters(family) {
    for (const member of family) {
      this.characterConvState[member.name] = {
        pendingReply: null,           // { threadId, from, text, emotion, timestamp }
        activeThreadId: null,         // Thread this character is currently in
        lastInterruptedAt: 0,         // Timestamp of last interrupt
        unansweredCalls: 0,           // How many times they've been called without answering
      };
    }
  }

  /**
   * Process speech from an LLM decision.
   * This is the main entry point — it checks if this is a new conversation
   * or a reply in an existing thread.
   *
   * @returns {object} - { entry, thread, interrupt }
   */
  processSpeech(speakerName, targetName, text, emotion, room, personaStates, family) {
    if (!text || text.trim().length === 0) return {};

    // ── Speech rate limiting — prevent conversation machine-gun ──
    const now = Date.now();
    const lastSpoke = this.lastSpeechTime[speakerName] || 0;
    if (now - lastSpoke < MIN_SPEECH_INTERVAL_MS) {
      // Too soon — suppress this speech entirely
      return {};
    }
    this.lastSpeechTime[speakerName] = now;

    // ── Resolve target name (LLM may use nicknames like "Daddy" or "Jack Thomas Atomic") ──
    if (targetName && targetName !== 'everyone' && targetName !== 'room') {
      const resolved = resolveCharacterName(targetName);
      if (resolved) {
        targetName = resolved;
      } else {
        // Unknown target — treat as room-wide speech
        logger.logEvent({
          type: 'unknown_target',
          message: `${speakerName} tried to speak to unknown "${targetName}", treating as room speech`,
          data: { speaker: speakerName, target: targetName, room },
        });
        targetName = 'everyone';
      }
    }

    // Self-targeting guard — can't talk to yourself
    if (targetName === speakerName) {
      targetName = 'everyone';
    }

    const timestamp = Date.now();
    const speechType = this._classifySpeechType(text, speakerName);

    // Get speaker position for logging
    const speakerMember = family?.find(m => m.name === speakerName);
    const targetMember = family?.find(m => m.name === targetName);

    const entry = {
      id: `speech_${timestamp}_${speakerName}`,
      timestamp,
      speaker: speakerName,
      target: targetName || 'everyone',
      text: text.trim(),
      emotion: emotion || 'neutral',
      room,
      type: speechType,
      threadId: null,
    };

    let thread = null;
    let interrupt = null;

    // ── Detect farewell phrases — end existing threads ──
    const isFarewell = this._isFarewell(text);

    // ── Check if this is a reply to an existing thread ──
    const speakerState = this.characterConvState[speakerName];
    if (speakerState?.pendingReply && targetName && targetName !== 'everyone') {
      const existingThread = this.threads.get(speakerState.pendingReply.threadId);
      if (existingThread && existingThread.isActive() &&
          existingThread.participants.includes(speakerName)) {
        // Verify the reply target is actually in the thread
        const threadTarget = existingThread.participants.find(p => p !== speakerName);
        if (threadTarget === targetName || existingThread.participants.includes(targetName)) {
          // ── Check if participants are still in the same room ──
          if (!this._areInSameRoom(speakerName, threadTarget, family)) {
            // They've moved apart — end the thread
            existingThread.endedManually = true;
            speakerState.pendingReply = null;
            speakerState.activeThreadId = null;
            this._setPairCooldown(speakerName, threadTarget);
            logger.logConversation({
              conversationId: existingThread.id,
              action: 'ended',
              speaker: speakerName,
              target: threadTarget,
              text: '(moved apart)',
              emotion: 'neutral',
              room,
              turnNumber: existingThread.turns.length,
              threadLength: existingThread.turns.length,
              speakerPosition: speakerMember?.position,
            });
          } else {
            // This is a valid reply in an existing conversation
            thread = existingThread;
            thread.addTurn(speakerName, text, emotion);
            entry.threadId = thread.id;

            // Clear the pending reply for speaker
            speakerState.pendingReply = null;

            // If farewell, end the thread
            if (isFarewell) {
              thread.endedManually = true;
              speakerState.activeThreadId = null;
              this._setPairCooldown(speakerName, threadTarget);
              // Clear the other participant's state too
              const otherState = this.characterConvState[threadTarget];
              if (otherState) {
                otherState.pendingReply = null;
                otherState.activeThreadId = null;
              }
              logger.logConversation({
                conversationId: thread.id,
                action: 'ended',
                speaker: speakerName,
                target: threadTarget,
                text: '(farewell)',
                emotion,
                room,
                turnNumber: thread.turns.length,
                threadLength: thread.turns.length,
                speakerPosition: speakerMember?.position,
              });
            } else if (!thread.isOver()) {
              // Now the OTHER person needs to reply
              // BUT: Don't force-interrupt — let them respond naturally
              if (this.characterConvState[threadTarget]) {
                this.characterConvState[threadTarget].pendingReply = {
                  threadId: thread.id,
                  from: speakerName,
                  text: text.trim(),
                  emotion,
                  timestamp,
                  forceInterrupt: false,  // Subsequent turns: no forced interrupt
                  _alreadyForced: false,
                };
                this.characterConvState[threadTarget].activeThreadId = thread.id;
              }
            } else {
              // Thread is over (max turns reached) — set pair cooldown
              this._setPairCooldown(speakerName, threadTarget);
              // Clear both participants' conversation state
              speakerState.activeThreadId = null;
              const otherState = this.characterConvState[threadTarget];
              if (otherState) {
                otherState.pendingReply = null;
                otherState.activeThreadId = null;
              }
              logger.logConversation({
                conversationId: thread.id,
                action: 'ended',
                speaker: speakerName,
                target: threadTarget,
                text: '(max turns reached)',
                emotion,
                room,
                turnNumber: thread.turns.length,
                threadLength: thread.turns.length,
              });
            }

            logger.logConversation({
              conversationId: thread.id,
              action: 'reply',
              speaker: speakerName,
              target: threadTarget,
              text: text.trim(),
              emotion,
              room,
              turnNumber: thread.turns.length,
              threadLength: thread.turns.length,
              speakerPosition: speakerMember?.position,
            });
          }
        }
      }
    }

    // ── If not a reply, start a new thread (if target is in the SAME ROOM) ──
    if (!thread && targetName && targetName !== 'everyone' && targetName !== 'room') {
      // ── Pair cooldown — don't start new conversations with someone you just talked to ──
      const pairKey = [speakerName, targetName].sort().join('_');
      const cooldownExpires = this.pairCooldowns.get(pairKey) || 0;
      if (Date.now() < cooldownExpires) {
        // Cooldown active — convert to general statement (no new thread)
        targetName = 'everyone';
        entry.target = 'everyone';
      } else if (!this._areInSameRoom(speakerName, targetName, family)) {
        // Cross-room speech — log it but don't create a thread
        logger.logEvent({
          type: 'cross_room_speech',
          message: `${speakerName} tried to talk to ${targetName} from another room — blocked`,
          data: { speaker: speakerName, target: targetName, speakerRoom: room,
                  targetRoom: targetMember?.currentRoom || 'unknown' },
        });
        // Convert to announcement instead
        targetName = 'everyone';
        entry.target = 'everyone';
        entry.type = 'shout';
      } else {
        thread = this._startThread(speakerName, targetName, text, emotion, room);
        entry.threadId = thread.id;

        // Flag the target to respond with force-interrupt (first turn of new conversation)
        if (this.characterConvState[targetName]) {
          this.characterConvState[targetName].pendingReply = {
            threadId: thread.id,
            from: speakerName,
            text: text.trim(),
            emotion,
            timestamp,
            forceInterrupt: true,   // First turn: force interrupt
            _alreadyForced: false,
          };
          this.characterConvState[targetName].activeThreadId = thread.id;
        }

        // Check if this should interrupt the target
        interrupt = this._checkInterrupt(speakerName, targetName, text, speechType, room, family);
      }
    }

    // ── Room-wide speech — everyone in the room "hears" it ──
    if (!targetName || targetName === 'everyone' || targetName === 'room') {
      const hearers = this._getCharactersInRoom(room, family, speakerName);
      // Only process if someone is actually in the room
      if (hearers.length > 0) {
        for (const hearer of hearers) {
          if (personaStates[hearer]) {
            addConversation(personaStates[hearer], speakerName, 'everyone', text, emotion);
          }
        }
      }
    }

    // Add to global log
    this.globalConversationLog.push(entry);
    if (this.globalConversationLog.length > MAX_GLOBAL_LOG) {
      this.globalConversationLog = this.globalConversationLog.slice(-MAX_GLOBAL_LOG);
    }

    // Add to relevant persona states
    if (personaStates[speakerName]) {
      addConversation(personaStates[speakerName], speakerName, targetName || 'room', text, emotion);
    }
    if (targetName && targetName !== 'everyone' && targetName !== 'room' && personaStates[targetName]) {
      addConversation(personaStates[targetName], speakerName, targetName, text, emotion);
    }

    // Queue speech bubble for broadcast
    this.speechQueue.push({
      ...entry,
      expiresAt: timestamp + SPEECH_DISPLAY_MS,
    });

    // Log the speech with positions
    logger.logSpeech({
      speaker: speakerName,
      target: targetName || 'everyone',
      text: text.trim(),
      emotion,
      room,
      speechType,
      conversationId: thread ? thread.id : null,
      speakerPosition: speakerMember?.position,
      targetPosition: targetMember?.position,
    });

    return { entry, thread, interrupt };
  }

  /**
   * Start a new conversation thread between two characters.
   */
  _startThread(initiator, target, text, emotion, room) {
    const threadId = `conv_${this.nextThreadId++}`;
    const thread = new ConversationThread(threadId, initiator, target, room);
    thread.addTurn(initiator, text, emotion);

    this.threads.set(threadId, thread);

    // Cleanup old threads if too many
    if (this.threads.size > MAX_ACTIVE_THREADS) {
      this._cleanupThreads();
    }

    // Update speaker's active thread
    if (this.characterConvState[initiator]) {
      this.characterConvState[initiator].activeThreadId = threadId;
    }

    logger.logConversation({
      conversationId: threadId,
      action: 'started',
      speaker: initiator,
      target,
      text,
      emotion,
      room,
      turnNumber: 1,
      threadLength: 1,
    });

    return thread;
  }

  /**
   * Check if speech should interrupt the target character.
   * Returns an interrupt object or null.
   */
  _checkInterrupt(speakerName, targetName, text, speechType, room, family) {
    const targetState = this.characterConvState[targetName];
    if (!targetState) return null;

    // Cooldown check
    if (Date.now() - targetState.lastInterruptedAt < INTERRUPT_COOLDOWN_MS) return null;

    const speaker = getPersona(speakerName);
    const target = getPersona(targetName);
    if (!speaker || !target) return null;

    const targetMember = family?.find(m => m.name === targetName);
    if (!targetMember) return null;

    // Don't interrupt if already idle/choosing
    if (['idle', 'choosing'].includes(targetMember.state)) return null;

    let shouldInterrupt = false;
    let reason = '';

    // Parent calling a child — high priority
    if ((speaker.role === 'father' || speaker.role === 'mother') &&
        (target.role === 'son' || target.role === 'daughter')) {
      if (speechType === 'command' || speechType === 'yell') {
        shouldInterrupt = true;
        reason = `Parent ${speakerName} called ${targetName} with authority`;
      } else if (speechType === 'question') {
        if (targetState.unansweredCalls > 0) {
          shouldInterrupt = true;
          reason = `Parent ${speakerName} called ${targetName} again (${targetState.unansweredCalls + 1}x)`;
        }
      }
    }

    // Direct address in the same room
    if (!shouldInterrupt && this._areInSameRoom(speakerName, targetName, family)) {
      if (speechType === 'command' || speechType === 'yell') {
        shouldInterrupt = true;
        reason = `${speakerName} commanded/yelled at ${targetName} in the same room`;
      }
    }

    // Repeated unanswered calls escalate
    if (!shouldInterrupt) {
      targetState.unansweredCalls = (targetState.unansweredCalls || 0) + 1;
      if (targetState.unansweredCalls >= 2) {
        shouldInterrupt = true;
        reason = `${speakerName} called ${targetName} ${targetState.unansweredCalls} times without response`;
      }
    }

    if (shouldInterrupt) {
      targetState.lastInterruptedAt = Date.now();
      targetState.unansweredCalls = 0;

      const interrupt = {
        interrupter: speakerName,
        interrupted: targetName,
        reason,
        interruptedAction: targetMember.activityLabel || targetMember.state,
        room,
        timestamp: Date.now(),
      };

      this.activeEvents.push({
        id: `interrupt_${Date.now()}_${speakerName}`,
        timestamp: Date.now(),
        source: speakerName,
        target: targetName,
        room,
        description: reason,
        hearingRange: 'same_room',
        type: 'interrupt',
      });

      logger.logInterrupt({
        interrupter: speakerName,
        interrupted: targetName,
        reason,
        interruptedAction: targetMember.activityLabel || targetMember.state,
        room,
      });

      return interrupt;
    }

    return null;
  }

  /**
   * Get which characters need to be force-interrupted to respond to a conversation.
   * Called from AgenticEngine to force characters into CHOOSING state.
   *
   * IMPORTANT: Only returns characters for the FIRST turn of a new conversation
   * (forceInterrupt === true). Subsequent turns are handled naturally when the
   * character enters CHOOSING on their own. This eliminates interrupt spam.
   *
   * @returns {Array<{name, reason, threadId, from, text}>}
   */
  getCharactersNeedingResponse() {
    const result = [];
    const now = Date.now();

    for (const [name, state] of Object.entries(this.characterConvState)) {
      if (!state.pendingReply) continue;

      // Timeout pending replies — but give non-forced replies LONGER to respond
      // (they need to finish their current activity first)
      const timeoutMs = state.pendingReply.forceInterrupt
        ? THREAD_RESPONSE_WINDOW_MS   // 15s for forced interrupts
        : THREAD_RESPONSE_WINDOW_MS * 3; // 45s for natural turn-taking

      if (now - state.pendingReply.timestamp >= timeoutMs) {
        const thread = this.threads.get(state.pendingReply.threadId);
        if (thread) {
          thread.timedOut = true;
          this._setPairCooldown(name, state.pendingReply.from);
          logger.logConversation({
            conversationId: thread.id,
            action: 'ended',
            speaker: name,
            target: state.pendingReply.from,
            text: '(no response — timed out)',
            emotion: 'neutral',
            room: thread.room,
            turnNumber: thread.turns.length,
            threadLength: thread.turns.length,
          });
        }
        state.pendingReply = null;
        state.activeThreadId = null;
        continue;
      }

      // Only force-interrupt for new conversation starts (forceInterrupt === true)
      // and only once per pending reply (_alreadyForced guard)
      if (!state.pendingReply.forceInterrupt) continue;
      if (state.pendingReply._alreadyForced) continue;

      // NOTE: Do NOT set _alreadyForced here — AgenticEngine sets it
      // only after the interrupt is actually applied (character was interruptible).
      // This allows retry on next tick if the character was in choosing/thinking.

      result.push({
        name,
        reason: `respond to ${state.pendingReply.from}`,
        threadId: state.pendingReply.threadId,
        from: state.pendingReply.from,
        text: state.pendingReply.text,
        emotion: state.pendingReply.emotion,
      });
    }

    return result;
  }

  /**
   * Mark a force-interrupt as consumed (called by AgenticEngine after
   * successfully interrupting the character into CHOOSING).
   * Prevents the same interrupt from being returned again.
   */
  markForceConsumed(name) {
    const state = this.characterConvState[name];
    if (state?.pendingReply) {
      state.pendingReply._alreadyForced = true;
    }
  }

  /**
   * Set a cooldown between two characters to prevent immediate conversation restarts.
   * After a conversation ends (by any means), they can't start a NEW thread for CONVERSATION_PAIR_COOLDOWN_MS.
   */
  _setPairCooldown(nameA, nameB) {
    if (!nameA || !nameB) return;
    const pairKey = [nameA, nameB].sort().join('_');
    this.pairCooldowns.set(pairKey, Date.now() + CONVERSATION_PAIR_COOLDOWN_MS);
  }

  /**
   * Check if a conversation pair is still on cooldown.
   */
  isPairOnCooldown(nameA, nameB) {
    const pairKey = [nameA, nameB].sort().join('_');
    return Date.now() < (this.pairCooldowns.get(pairKey) || 0);
  }

  /**
   * Get the conversation context for a character who needs to reply.
   * Returns formatted text for the LLM prompt.
   */
  getConversationContext(memberName) {
    const state = this.characterConvState[memberName];
    if (!state?.pendingReply) return null;

    const thread = this.threads.get(state.pendingReply.threadId);
    if (!thread || !thread.isActive()) return null;

    const turns = thread.turns.map(t => {
      return `  ${t.speaker}: "${t.text}" (${t.emotion})`;
    }).join('\n');

    return {
      threadId: thread.id,
      from: state.pendingReply.from,
      lastText: state.pendingReply.text,
      lastEmotion: state.pendingReply.emotion,
      turnNumber: thread.turns.length + 1,
      fullThread: turns,
      topic: thread.topic || 'general conversation',
      initiator: thread.initiator,
      participants: thread.participants,
    };
  }

  /**
   * Get the full thread data for a given threadId.
   * Used by the client modal when clicking on a speech entry.
   */
  getThreadById(threadId) {
    const thread = this.threads.get(threadId);
    if (!thread) return null;

    return {
      id: thread.id,
      participants: thread.participants,
      initiator: thread.initiator,
      room: thread.room,
      startedAt: thread.startedAt,
      lastActivityAt: thread.lastActivityAt,
      turns: thread.turns.map(t => ({
        speaker: t.speaker,
        text: t.text,
        emotion: t.emotion,
        timestamp: t.timestamp,
      })),
      isActive: thread.isActive(),
      isOver: thread.isOver(),
      topic: thread.topic,
    };
  }

  /**
   * Mark that a character has responded.
   */
  markResponded(memberName) {
    const state = this.characterConvState[memberName];
    if (state) {
      state.unansweredCalls = 0;
      state.pendingReply = null;
    }
  }

  /**
   * Check for and generate interrupt events based on current situation.
   */
  checkForInterruptEvents(family, personaStates, gameTime) {
    const newEvents = [];

    // Check if any child is crying
    for (const member of family) {
      if (member.role === 'son' || member.role === 'daughter') {
        const persona = getPersona(member.name);
        if (!persona) continue;

        // Children don't cry audibly while sleeping — suppress distress events
        const isSleeping = member.activityLabel && member.activityLabel.toLowerCase().includes('sleep');
        if (isSleeping) continue;

        const comfort = member.needs?.comfort || 50;
        const social = member.needs?.social || 50;
        const neuroticism = persona.personality?.neuroticism || 0.5;

        // 60-second cooldown — prevent distress spam flooding the log
        const lastDistress = this.lastDistressAt[member.name] || 0;
        if (Date.now() - lastDistress < 60000) continue;

        if (comfort < 15 && neuroticism > 0.5 && Math.random() < 0.01) {
          this.lastDistressAt[member.name] = Date.now();
          const event = {
            id: 'child_crying',
            timestamp: Date.now(),
            source: member.name,
            room: member.currentRoom,
            hearingRange: '2_rooms',
            description: `${member.name} is crying in the ${ROOM_MAP[member.currentRoom]?.name || member.currentRoom}`,
            type: 'distress',
          };
          this.activeEvents.push(event);
          newEvents.push(event);

          logger.logEvent({
            type: 'child_distress',
            message: event.description,
            data: { character: member.name, room: member.currentRoom, comfort, social },
          });
        }
      }
    }

    // ── Expire old events (30s) ──
    this.activeEvents = this.activeEvents.filter(e =>
      Date.now() - e.timestamp < 30000
    );

    // ── Expire dead threads ──
    this._cleanupThreads();

    return newEvents;
  }

  /**
   * Get pending speech bubbles and clear expired ones.
   */
  getAndClearSpeechQueue() {
    const now = Date.now();
    const pending = this.speechQueue.filter(s => s.expiresAt > now);
    this.speechQueue = this.speechQueue.filter(s => s.expiresAt > now);
    return pending;
  }

  /**
   * Get recent conversations involving a specific character.
   */
  getConversationsForMember(memberName, limit = 10) {
    return this.globalConversationLog
      .filter(c => c.speaker === memberName || c.target === memberName || c.target === 'everyone')
      .slice(-limit);
  }

  /**
   * Get all recent conversations.
   */
  getRecentConversations(limit = 20) {
    return this.globalConversationLog.slice(-limit);
  }

  /**
   * Get active events.
   */
  getActiveEvents() {
    return this.activeEvents.filter(e => Date.now() - e.timestamp < 30000);
  }

  /**
   * Get active conversation threads.
   */
  getActiveThreads() {
    const active = [];
    for (const [id, thread] of this.threads) {
      if (thread.isActive()) {
        active.push({
          id: thread.id,
          participants: thread.participants,
          turns: thread.turns.length,
          room: thread.room,
          startedAt: thread.startedAt,
          lastActivityAt: thread.lastActivityAt,
        });
      }
    }
    return active;
  }

  /**
   * Classify the type of speech for UI rendering and interrupt logic.
   */
  _classifySpeechType(text, speakerName) {
    const lower = text.toLowerCase().trim();
    const persona = getPersona(speakerName);
    const isParent = persona?.role === 'father' || persona?.role === 'mother';

    // Commands (imperative)
    if (isParent && (lower.includes('come here') || lower.includes('come downstairs') ||
        lower.includes('dinner') || lower.includes('time to') || lower.includes('bedtime') ||
        lower.includes('wash') || lower.includes('clean') || lower.includes('homework') ||
        lower.includes('right now') || lower.includes('immediately'))) {
      return 'command';
    }
    if (lower.includes('!') && (lower.includes('stop') || lower.includes('no') || lower.includes('enough'))) {
      return 'command';
    }

    // Yelling (ALL CAPS + exclamation)
    if (lower.includes('!') && text === text.toUpperCase() && text.length > 3) return 'yell';

    // Questions
    if (lower.endsWith('?') || (lower.includes('?') && !lower.includes('!'))) return 'question';

    // Affection
    if (lower.includes('love you') || lower.includes('hug') || lower.includes('thank') || lower.includes('proud of')) return 'affection';

    // Apology
    if (lower.includes('sorry') || lower.includes('apologize') || lower.includes('my bad')) return 'apology';

    // Complaint
    if (lower.includes('not fair') || lower.includes('why do i') || lower.includes('stupid') || lower.includes('boring') || lower.includes('i don\'t want')) return 'complaint';

    // Farewell
    if (this._isFarewell(text)) return 'farewell';

    // Greeting
    if (lower.match(/^(hey|hi|hello|morning|good morning|good evening|what's up)/)) return 'greeting';

    return 'statement';
  }

  /**
   * Detect farewell/goodbye phrases that should end a conversation.
   */
  _isFarewell(text) {
    const lower = text.toLowerCase().trim();
    const farewellPhrases = [
      'bye', 'goodbye', 'good bye', 'see you', 'gotta go', 'talk later',
      'nice talking', 'catch you later', 'later!', 'goodnight', 'good night',
      'nighty night', 'sweet dreams', 'sleep well', 'take care',
      'i\'m heading', 'i should go', 'anyway, i', 'well, i\'m off',
    ];
    return farewellPhrases.some(p => lower.includes(p));
  }

  /**
   * Check if two characters are in the same room.
   */
  _areInSameRoom(nameA, nameB, family) {
    if (!family) return false;
    const a = family.find(m => m.name === nameA);
    const b = family.find(m => m.name === nameB);
    return a && b && a.currentRoom === b.currentRoom;
  }

  /**
   * Get characters in the same room.
   */
  _getCharactersInRoom(room, family, excludeName) {
    if (!family) return [];
    return family
      .filter(m => m.name !== excludeName && m.currentRoom === room)
      .map(m => m.name);
  }

  /**
   * Cleanup dead/expired threads.
   * Keeps threads much longer so the UI can fetch them for the conversation modal.
   */
  _cleanupThreads() {
    const now = Date.now();
    const toDelete = [];
    for (const [id, thread] of this.threads) {
      // Only delete threads that have been inactive for a long time
      // (10 minutes instead of 60s — prevents conversation modal from breaking)
      if (!thread.isActive() && now - thread.lastActivityAt > THREAD_RETAIN_MS) {
        toDelete.push(id);
      }
    }
    // Cap total threads to prevent memory leaks
    const MAX_THREADS = 200;
    if (this.threads.size - toDelete.length > MAX_THREADS) {
      // Delete oldest threads beyond the cap
      const sortedThreads = [...this.threads.entries()]
        .sort((a, b) => a[1].lastActivityAt - b[1].lastActivityAt);
      const excess = this.threads.size - toDelete.length - MAX_THREADS;
      for (let i = 0; i < excess; i++) {
        if (!toDelete.includes(sortedThreads[i][0])) {
          toDelete.push(sortedThreads[i][0]);
        }
      }
    }
    for (const id of toDelete) {
      this.threads.delete(id);
    }
  }

  /**
   * Get the full conversation log.
   */
  getConversationLog() {
    return this.globalConversationLog.map(c => ({
      speaker: c.speaker,
      target: c.target,
      text: c.text,
      emotion: c.emotion,
      type: c.type,
      room: c.room,
      timestamp: c.timestamp,
      threadId: c.threadId || null,
    }));
  }

  /**
   * Serialize social state for broadcast to clients.
   */
  serialize() {
    const now = Date.now();

    // Conversation threads — send summaries of active/recent threads
    const activeThreads = [];
    for (const [id, thread] of this.threads) {
      if (thread.isActive() || (now - thread.lastActivityAt < 30000)) {
        activeThreads.push({
          id: thread.id,
          participants: thread.participants,
          turns: thread.turns.map(t => ({
            speaker: t.speaker,
            text: t.text,
            emotion: t.emotion,
            timestamp: t.timestamp,
          })),
          room: thread.room,
          startedAt: thread.startedAt,
          lastActivityAt: thread.lastActivityAt,
          isActive: thread.isActive(),
        });
      }
    }

    return {
      activeSpeech: this.speechQueue
        .filter(s => s.expiresAt > now)
        .map(s => ({
          speaker: s.speaker,
          target: s.target,
          text: s.text,
          emotion: s.emotion,
          type: s.type,
          expiresAt: s.expiresAt,
          threadId: s.threadId || null,
        })),
      recentConversations: this.globalConversationLog.slice(-20).map(c => ({
        speaker: c.speaker,
        target: c.target,
        text: c.text,
        emotion: c.emotion,
        type: c.type,
        timestamp: c.timestamp,
        threadId: c.threadId || null,
      })),
      activeEvents: this.activeEvents.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        room: e.room,
        description: e.description,
        timestamp: e.timestamp,
        type: e.type,
      })),
      activeThreads,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
//  ConversationThread — Tracks a multi-turn conversation
// ═══════════════════════════════════════════════════════════════════

class ConversationThread {
  constructor(id, initiator, target, room) {
    this.id = id;
    this.participants = [initiator, target];
    this.initiator = initiator;
    this.room = room;
    this.turns = [];
    this.startedAt = Date.now();
    this.lastActivityAt = Date.now();
    this.topic = null;
    this.timedOut = false;
    this.endedManually = false;
  }

  addTurn(speaker, text, emotion) {
    this.turns.push({
      speaker,
      text,
      emotion: emotion || 'neutral',
      timestamp: Date.now(),
    });
    this.lastActivityAt = Date.now();

    if (!this.topic && this.turns.length === 1) {
      this.topic = this._detectTopic(text);
    }
  }

  isActive() {
    if (this.timedOut || this.endedManually) return false;
    if (this.turns.length >= MAX_THREAD_TURNS) return false;
    if (Date.now() - this.lastActivityAt > THREAD_TIMEOUT_MS) return false;
    return true;
  }

  isOver() {
    return !this.isActive();
  }

  _detectTopic(text) {
    const lower = text.toLowerCase();
    if (lower.includes('dinner') || lower.includes('eat') || lower.includes('food') || lower.includes('hungry')) return 'food';
    if (lower.includes('play') || lower.includes('game') || lower.includes('fun')) return 'play';
    if (lower.includes('homework') || lower.includes('school') || lower.includes('read')) return 'education';
    if (lower.includes('bed') || lower.includes('sleep') || lower.includes('tired')) return 'bedtime';
    if (lower.includes('clean') || lower.includes('chore') || lower.includes('mess')) return 'chores';
    if (lower.includes('pool') || lower.includes('swim') || lower.includes('outside')) return 'outdoors';
    if (lower.includes('love') || lower.includes('miss') || lower.includes('feel')) return 'feelings';
    return 'general';
  }
}

module.exports = SocialEngine;
