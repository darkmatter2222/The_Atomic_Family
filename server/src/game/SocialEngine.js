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
  SOCIAL_DYNAMICS,
  INTERRUPT_EVENTS,
} = require('./PersonaManager');

const { ROOM_MAP, getAdjacentRooms } = require('./EnvironmentPerception');
const logger = require('./SimulationLogger');

const MAX_GLOBAL_LOG = 200;       // Global conversation log limit
const SPEECH_DISPLAY_MS = 6000;   // How long speech bubbles last
const MAX_THREAD_TURNS = 8;       // Max back-and-forth turns per thread
const THREAD_TIMEOUT_MS = 60000;  // Thread expires after 60s of no activity
const THREAD_RESPONSE_WINDOW_MS = 15000; // How long to wait for a reply
const MAX_ACTIVE_THREADS = 10;    // Max concurrent threads
const INTERRUPT_COOLDOWN_MS = 10000; // Min time between interrupts to same person

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

    const timestamp = Date.now();
    const speechType = this._classifySpeechType(text, speakerName);

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

    // ── Check if this is a reply to an existing thread ──
    const speakerState = this.characterConvState[speakerName];
    if (speakerState?.pendingReply && targetName) {
      const existingThread = this.threads.get(speakerState.pendingReply.threadId);
      if (existingThread && existingThread.isActive() &&
          (existingThread.participants.includes(targetName) || existingThread.participants.includes(speakerName))) {
        // This is a reply in an existing conversation
        thread = existingThread;
        thread.addTurn(speakerName, text, emotion);
        entry.threadId = thread.id;

        // Clear the pending reply
        speakerState.pendingReply = null;

        // Now the OTHER person needs to reply (if thread isn't over)
        if (!thread.isOver()) {
          const otherParticipant = thread.participants.find(p => p !== speakerName);
          if (otherParticipant && this.characterConvState[otherParticipant]) {
            this.characterConvState[otherParticipant].pendingReply = {
              threadId: thread.id,
              from: speakerName,
              text: text.trim(),
              emotion,
              timestamp,
            };
            this.characterConvState[otherParticipant].activeThreadId = thread.id;
          }
        }

        logger.logConversation({
          conversationId: thread.id,
          action: 'reply',
          speaker: speakerName,
          target: targetName,
          text: text.trim(),
          emotion,
          room,
          turnNumber: thread.turns.length,
          threadLength: thread.turns.length,
        });
      }
    }

    // ── If not a reply, start a new thread (if target is a specific person) ──
    if (!thread && targetName && targetName !== 'everyone' && targetName !== 'room') {
      thread = this._startThread(speakerName, targetName, text, emotion, room);
      entry.threadId = thread.id;

      // Flag the target to respond
      if (this.characterConvState[targetName]) {
        this.characterConvState[targetName].pendingReply = {
          threadId: thread.id,
          from: speakerName,
          text: text.trim(),
          emotion,
          timestamp,
        };
        this.characterConvState[targetName].activeThreadId = thread.id;
      }

      // Check if this should interrupt the target
      interrupt = this._checkInterrupt(speakerName, targetName, text, speechType, room, family);
    }

    // ── Room-wide speech — everyone in the room "hears" it ──
    if (!targetName || targetName === 'everyone' || targetName === 'room') {
      const hearers = this._getCharactersInRoom(room, family, speakerName);
      for (const hearer of hearers) {
        if (personaStates[hearer]) {
          addConversation(personaStates[hearer], speakerName, 'everyone', text, emotion);
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

    // Log the speech
    logger.logSpeech({
      speaker: speakerName,
      target: targetName || 'everyone',
      text: text.trim(),
      emotion,
      room,
      speechType,
      conversationId: thread ? thread.id : null,
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
   * Get which characters need to respond to a conversation this tick.
   * Called from AgenticEngine to force characters into CHOOSING state.
   *
   * @returns {Array<{name, reason, threadId, from, text}>}
   */
  getCharactersNeedingResponse() {
    const result = [];
    const now = Date.now();

    for (const [name, state] of Object.entries(this.characterConvState)) {
      if (!state.pendingReply) continue;

      if (now - state.pendingReply.timestamp < THREAD_RESPONSE_WINDOW_MS) {
        result.push({
          name,
          reason: `respond to ${state.pendingReply.from}`,
          threadId: state.pendingReply.threadId,
          from: state.pendingReply.from,
          text: state.pendingReply.text,
          emotion: state.pendingReply.emotion,
        });
      } else {
        // Timed out waiting for response
        const thread = this.threads.get(state.pendingReply.threadId);
        if (thread) {
          thread.timedOut = true;
          logger.logConversation({
            conversationId: thread.id,
            action: 'ended',
            speaker: name,
            target: state.pendingReply.from,
            text: '(no response)',
            emotion: 'neutral',
            room: thread.room,
            turnNumber: thread.turns.length,
            threadLength: thread.turns.length,
          });
        }
        state.pendingReply = null;
        state.activeThreadId = null;
      }
    }

    return result;
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

        const comfort = member.needs?.comfort || 50;
        const social = member.needs?.social || 50;
        const neuroticism = persona.personality?.neuroticism || 0.5;

        if (comfort < 15 && neuroticism > 0.5 && Math.random() < 0.01) {
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
   * Classify the type of speech for UI rendering.
   */
  _classifySpeechType(text, speakerName) {
    const lower = text.toLowerCase();
    const persona = getPersona(speakerName);
    const isParent = persona?.role === 'father' || persona?.role === 'mother';

    if (lower.includes('!') && (lower.includes('stop') || lower.includes('no') || lower.includes('enough'))) {
      return 'command';
    }
    if (isParent && (lower.includes('come here') || lower.includes('come downstairs') ||
        lower.includes('dinner') || lower.includes('time to') || lower.includes('bedtime') ||
        lower.includes('wash') || lower.includes('clean') || lower.includes('homework'))) {
      return 'command';
    }
    if (lower.endsWith('?') || lower.includes('?')) return 'question';
    if (lower.includes('!') && lower === lower.toUpperCase() && lower.length > 3) return 'yell';
    if (lower.includes('love') || lower.includes('hug') || lower.includes('thank') || lower.includes('proud')) return 'affection';
    if (lower.includes('sorry') || lower.includes('apologize')) return 'apology';
    if (lower.includes('not fair') || lower.includes('why do I') || lower.includes('stupid') || lower.includes('boring')) return 'complaint';
    return 'statement';
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
   */
  _cleanupThreads() {
    const toDelete = [];
    for (const [id, thread] of this.threads) {
      if (!thread.isActive()) {
        toDelete.push(id);
      }
    }
    // Keep recently-dead threads for 30s so UI can still fetch them
    const now = Date.now();
    for (const id of toDelete) {
      const thread = this.threads.get(id);
      if (thread && now - thread.lastActivityAt > 60000) {
        this.threads.delete(id);
      }
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
