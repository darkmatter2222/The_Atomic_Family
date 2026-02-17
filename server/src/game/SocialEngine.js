/**
 * SocialEngine.js — Inter-character communication and social interactions.
 *
 * Manages conversations between family members, command/response patterns,
 * speech queueing, and social event generation (arguments, comfort, etc.).
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

const MAX_GLOBAL_LOG = 100;    // Global conversation log limit
const SPEECH_DISPLAY_MS = 5000; // How long speech bubbles last (5 seconds)

class SocialEngine {
  constructor() {
    this.globalConversationLog = [];  // All conversations for the whole family
    this.speechQueue = [];            // Pending speech bubbles to broadcast
    this.activeEvents = [];           // Currently active interrupt events
  }

  /**
   * Process speech from an LLM decision.
   * Records conversation, queues speech bubble, and notifies relevant characters.
   *
   * @param {string} speakerName - Who is speaking
   * @param {string|null} targetName - Who they're speaking to (null = room)
   * @param {string} text - What they said
   * @param {string} emotion - Emotional tone
   * @param {string} room - Room where speech occurred
   * @param {object} personaStates - Map of all persona states
   */
  processSpeech(speakerName, targetName, text, emotion, room, personaStates) {
    if (!text || text.trim().length === 0) return;

    const timestamp = Date.now();
    const entry = {
      id: `speech_${timestamp}_${speakerName}`,
      timestamp,
      speaker: speakerName,
      target: targetName || 'everyone',
      text: text.trim(),
      emotion: emotion || 'neutral',
      room,
      type: this._classifySpeechType(text, speakerName),
    };

    // Add to global log
    this.globalConversationLog.push(entry);
    if (this.globalConversationLog.length > MAX_GLOBAL_LOG) {
      this.globalConversationLog = this.globalConversationLog.slice(-MAX_GLOBAL_LOG);
    }

    // Add to relevant persona states (speaker + target + people in room)
    if (personaStates[speakerName]) {
      addConversation(
        personaStates[speakerName],
        speakerName,
        targetName || 'room',
        text,
        emotion
      );
    }

    if (targetName && personaStates[targetName]) {
      addConversation(
        personaStates[targetName],
        speakerName,
        targetName,
        text,
        emotion
      );
    }

    // Queue speech bubble for broadcast
    this.speechQueue.push({
      ...entry,
      expiresAt: timestamp + SPEECH_DISPLAY_MS,
    });

    return entry;
  }

  /**
   * Check for and generate interrupt events based on current situation.
   *
   * @param {Array} family - All family members
   * @param {object} personaStates - Map of persona states
   * @param {Date} gameTime - Current game time
   * @returns {Array} - New events that occurred
   */
  checkForInterruptEvents(family, personaStates, gameTime) {
    const newEvents = [];

    // Check if any child is crying (low comfort + high neuroticism → might cry)
    for (const member of family) {
      if (member.role === 'son' || member.role === 'daughter') {
        const persona = getPersona(member.name);
        if (!persona) continue;

        const comfort = member.needs?.comfort || 50;
        const social = member.needs?.social || 50;
        const neuroticism = persona.personality?.neuroticism || 0.5;

        // Chance of crying based on needs and personality
        if (comfort < 15 && neuroticism > 0.5 && Math.random() < 0.01) {
          const event = {
            id: 'child_crying',
            timestamp: Date.now(),
            source: member.name,
            room: member.currentRoom,
            hearingRange: '2_rooms',
            description: `${member.name} is crying in the ${ROOM_MAP[member.currentRoom]?.name || member.currentRoom}`,
          };
          this.activeEvents.push(event);
          newEvents.push(event);
        }
      }
    }

    // Expire old events (older than 30 seconds)
    this.activeEvents = this.activeEvents.filter(e =>
      Date.now() - e.timestamp < 30000
    );

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
   * Classify the type of speech for UI rendering.
   */
  _classifySpeechType(text, speakerName) {
    const lower = text.toLowerCase();
    const persona = getPersona(speakerName);
    const isParent = persona?.role === 'father' || persona?.role === 'mother';

    if (lower.includes('!') && (lower.includes('stop') || lower.includes('no') || lower.includes('enough'))) {
      return 'command';
    }
    if (isParent && (lower.includes('bedtime') || lower.includes('wash') || lower.includes('clean') || lower.includes('time to'))) {
      return 'command';
    }
    if (lower.endsWith('?')) return 'question';
    if (lower.includes('!') && lower === lower.toUpperCase()) return 'yell';
    if (lower.includes('love') || lower.includes('hug') || lower.includes('thank')) return 'affection';
    if (lower.includes('sorry') || lower.includes('apologize')) return 'apology';
    if (lower.includes('not fair') || lower.includes('why do I') || lower.includes('stupid')) return 'complaint';
    return 'statement';
  }

  /**
   * Get the full conversation log (up to MAX_GLOBAL_LOG entries).
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
    }));
  }

  /**
   * Serialize social state for broadcast to clients.
   */
  serialize() {
    const now = Date.now();
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
        })),
      recentConversations: this.globalConversationLog.slice(-10).map(c => ({
        speaker: c.speaker,
        target: c.target,
        text: c.text,
        emotion: c.emotion,
        type: c.type,
        timestamp: c.timestamp,
      })),
      activeEvents: this.activeEvents.map(e => ({
        id: e.id,
        source: e.source,
        room: e.room,
        description: e.description,
        timestamp: e.timestamp,
      })),
    };
  }
}

module.exports = SocialEngine;
