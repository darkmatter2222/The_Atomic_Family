/**
 * AgenticEngine.js — Master agentic reasoning coordinator.
 *
 * Each family member has their own reasoning loop powered by an LLM.
 * The engine:
 *   1. Detects when a character needs a decision (enters CHOOSING state)
 *   2. Builds a perception + prompt for that character
 *   3. Calls the LLM asynchronously
 *   4. Parses the response into an action + speech
 *   5. Applies the decision to the game simulation
 *
 * At high game speeds (≥100x) or when the LLM is down, falls back to the
 * existing weighted-random interaction picker.
 *
 * CommonJS module (server-side).
 */

const LLMClient = require('./LLMClient');
const SocialEngine = require('./SocialEngine');
const {
  createPersonaState,
  addMemory,
  updateMood,
  recordDecision,
  serializePersonaState,
  getAllPersonaNames,
  PERSONA_MAP,
} = require('./PersonaManager');
const {
  buildSystemPrompt,
  buildUserPrompt,
  parseDecision,
  getFilteredInteractions,
} = require('./ReasoningPrompt');
const { buildPerception } = require('./EnvironmentPerception');

// ── Constants ─────────────────────────────────────────────────────
const REASONING_TIMEOUT_MS = 12000;  // 12s real-time timeout per decision
const MIN_REASONING_INTERVAL_MS = 5000; // Don't reason more than once per 5s real time per character
const MAX_GAME_SPEED_FOR_LLM = 10;  // Don't use LLM above this speed multiplier
const STAGGER_DELAY_MS = 500;        // Stagger reasoning calls by 500ms

class AgenticEngine {
  constructor(options = {}) {
    this.llmClient = new LLMClient(options.llm || {});
    this.socialEngine = new SocialEngine();

    // Per-character persona state (dynamic: mood, memory, conversations)
    this.personaStates = {};

    // Track pending reasoning requests
    this.pendingDecisions = new Map(); // memberName → { promise, startTime }

    // Track last reasoning time per character
    this.lastReasoningTime = {};       // memberName → Date.now()

    // Stagger counter for spreading LLM calls
    this.staggerCounter = 0;

    // Recent global events
    this.recentEvents = [];

    // Statistics
    this.stats = {
      totalDecisions: 0,
      llmDecisions: 0,
      fallbackDecisions: 0,
      llmErrors: 0,
      avgReasoningTimeMs: 0,
    };

    // Whether the engine is enabled
    this.enabled = true;

    console.log('[AgenticEngine] Initialized');
  }

  /**
   * Initialize persona states for all family members.
   * Call this once after family is created.
   */
  initializePersonas(family) {
    for (const member of family) {
      this.personaStates[member.name] = createPersonaState(member.name);
      this.lastReasoningTime[member.name] = 0;
    }
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
   *
   * Checks for characters that need decisions, manages social events,
   * and updates persona states.
   *
   * @param {Array} family - Current family state
   * @param {Date} gameTime - Current game time
   * @param {number} gameSpeed - Current game speed multiplier
   * @param {object} roomLights - Room light states
   * @returns {Array<object>} - Decisions to apply [{ memberName, decision }]
   */
  tick(family, gameTime, gameSpeed, roomLights) {
    // Update moods for all characters
    for (const member of family) {
      if (this.personaStates[member.name]) {
        updateMood(this.personaStates[member.name], member.needs);
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

        // At high speed, skip LLM and use fallback
        if (gameSpeed > MAX_GAME_SPEED_FOR_LLM || !this.enabled) {
          decisionsToApply.push({ memberName: member.name, decision: null, fallback: true });
          continue;
        }

        // Start async reasoning (staggered)
        this._startReasoning(member, family, gameTime, roomLights);
      }
    }

    return decisionsToApply;
  }

  /**
   * Apply a completed LLM decision to the character.
   * Called by GameSimulation when a decision resolves.
   *
   * @param {string} memberName
   * @param {object} decision - Parsed decision from LLM
   * @param {Array} family - Current family state
   * @param {object} roomLights - Room light states
   */
  applyDecision(memberName, decision, family, roomLights) {
    const personaState = this.personaStates[memberName];
    if (!personaState) return;

    if (decision) {
      // Record the thought
      personaState.lastThought = decision.thought;
      personaState.currentGoal = decision.action;

      // Record the decision
      recordDecision(personaState, decision.action, decision.thought);

      // Handle speech
      if (decision.speech) {
        const member = family.find(m => m.name === memberName);
        const room = member?.currentRoom || 'unknown';
        personaState.pendingSpeech = {
          text: decision.speech,
          target: decision.speechTarget,
          emotion: decision.emotion || 'neutral',
          timestamp: Date.now(),
        };
        this.socialEngine.processSpeech(
          memberName,
          decision.speechTarget,
          decision.speech,
          decision.emotion,
          room,
          this.personaStates
        );
      } else {
        personaState.pendingSpeech = null;
      }

      // Handle light actions
      if (decision.lightAction && roomLights) {
        const member = family.find(m => m.name === memberName);
        if (member) {
          const currentRoom = member.currentRoom;
          if (decision.lightAction === 'on' && roomLights[currentRoom] === false) {
            roomLights[currentRoom] = true;
            addMemory(personaState, 'action', `Turned on the light in ${currentRoom}`, 1);
          } else if (decision.lightAction === 'off' && roomLights[currentRoom] === true) {
            roomLights[currentRoom] = false;
            addMemory(personaState, 'action', `Turned off the light in ${currentRoom}`, 1);
          }
        }
      }

      // Update emotion
      personaState.mood = decision.emotion || personaState.mood;

      this.stats.llmDecisions++;
    }

    this.stats.totalDecisions++;
  }

  /**
   * Start an async reasoning call for a character.
   */
  _startReasoning(member, family, gameTime, roomLights) {
    const name = member.name;
    this.lastReasoningTime[name] = Date.now();
    this.staggerCounter++;

    const personaState = this.personaStates[name];
    if (!personaState) return;

    // Build prompts
    const systemPrompt = buildSystemPrompt(name);
    const userPrompt = buildUserPrompt(
      member, family, gameTime, roomLights,
      personaState, this.recentEvents
    );

    // Get filtered interactions for validation
    const perception = buildPerception(member, family, gameTime, roomLights, this.recentEvents);
    const availableInteractions = getFilteredInteractions(member.role, gameTime, perception);

    const startTime = Date.now();

    // Make async LLM call
    const promise = this.llmClient.reason(systemPrompt, userPrompt, {
      temperature: 0.7,
      max_tokens: 256,
      top_p: 0.9,
    }).then(rawResponse => {
      const elapsed = Date.now() - startTime;
      this._updateAvgTime(elapsed);

      if (!rawResponse) {
        console.log(`[AgenticEngine] No response for ${name} (${elapsed}ms)`);
        return null;
      }

      const decision = parseDecision(rawResponse, availableInteractions);

      if (decision && decision.valid) {
        console.log(`[AgenticEngine] ${name} decided: ${decision.action} ("${decision.thought}") [${elapsed}ms]`);
        return decision;
      } else {
        console.log(`[AgenticEngine] Invalid decision for ${name}, falling back [${elapsed}ms]`);
        if (decision) {
          // Still save the thought even if action was invalid
          personaState.lastThought = decision.thought;
        }
        return null;
      }
    }).catch(err => {
      console.error(`[AgenticEngine] LLM error for ${name}: ${err.message}`);
      this.stats.llmErrors++;
      return null;
    }).finally(() => {
      this.pendingDecisions.delete(name);
    });

    this.pendingDecisions.set(name, { promise, startTime });
    return promise;
  }

  /**
   * Get a pending decision promise for a member (used by GameSimulation).
   */
  getPendingDecision(memberName) {
    return this.pendingDecisions.get(memberName)?.promise || null;
  }

  /**
   * Check if a member has a pending decision.
   */
  hasPendingDecision(memberName) {
    return this.pendingDecisions.has(memberName);
  }

  /**
   * Get serializable state for broadcast to clients.
   */
  serialize() {
    const personaData = {};
    for (const [name, state] of Object.entries(this.personaStates)) {
      personaData[name] = serializePersonaState(state);
    }

    return {
      enabled: this.enabled,
      llmAvailable: this.llmClient.available,
      personaStates: personaData,
      social: this.socialEngine.serialize(),
      stats: { ...this.stats },
    };
  }

  /**
   * Get serializable persona state for a single member.
   */
  getPersonaState(memberName) {
    return this.personaStates[memberName] || null;
  }

  /**
   * Enable/disable the agentic engine.
   */
  setEnabled(enabled) {
    this.enabled = !!enabled;
    console.log(`[AgenticEngine] ${this.enabled ? 'Enabled' : 'Disabled'}`);
  }

  /**
   * Update rolling average reasoning time.
   */
  _updateAvgTime(elapsed) {
    const alpha = 0.2;
    this.stats.avgReasoningTimeMs =
      this.stats.avgReasoningTimeMs === 0
        ? elapsed
        : this.stats.avgReasoningTimeMs * (1 - alpha) + elapsed * alpha;
  }
}

module.exports = AgenticEngine;
