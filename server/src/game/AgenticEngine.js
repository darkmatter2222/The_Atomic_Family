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
 * Enhanced features:
 *   - Daily agenda planning via LLM at start of each day
 *   - Full thought-chain logging with prompts + raw responses
 *   - Token usage tracking (per-character, per-minute)
 *   - More frequent reasoning (2s interval)
 *   - Collision avoidance — characters avoid standing on each other
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
  buildAgendaPrompt,
  parseDecision,
  parseAgenda,
  getFilteredInteractions,
} = require('./ReasoningPrompt');
const { buildPerception } = require('./EnvironmentPerception');

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

    // Per-character persona state (dynamic: mood, memory, conversations)
    this.personaStates = {};

    // Track pending reasoning requests
    this.pendingDecisions = new Map(); // memberName → { promise, startTime }

    // Resolved decisions waiting to be picked up by GameSimulation
    this.resolvedDecisions = new Map(); // memberName → decision (or null)

    // Track last reasoning time per character
    this.lastReasoningTime = {};       // memberName → Date.now()

    // Stagger counter for spreading LLM calls
    this.staggerCounter = 0;

    // Sequential agenda generation lock
    this._agendaGenerating = false;

    // Recent global events
    this.recentEvents = [];

    // ── Daily agendas per character ──
    this.agendas = {};                 // memberName → { plan, completed, generatedForDay }

    // ── Thought chain log — full prompts + responses ──
    this.thoughtLog = {};              // memberName → [{ id, timestamp, systemPrompt, userPrompt, rawResponse, parsedDecision, elapsed, tokenEstimate }]
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
    };

    // Whether the engine is enabled
    this.enabled = true;

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
   */
  tick(family, gameTime, gameSpeed, roomLights) {
    // Periodic health check (non-blocking)
    if (this.enabled && Date.now() - this.llmClient.lastHealthCheck > this.llmClient.healthCheckInterval) {
      this.llmClient.checkHealth().catch(() => {});
    }

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

    // Generate daily agendas if needed
    this._checkAgendas(family, gameTime, gameSpeed, roomLights);

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
    if (!personaState) return;

    if (decision) {
      personaState.lastThought = decision.thought;
      personaState.currentGoal = decision.action;
      recordDecision(personaState, decision.action, decision.thought);

      // Mark agenda item as completed if it matches
      this._markAgendaCompleted(memberName, decision.action, decision.thought);

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
          memberName, decision.speechTarget, decision.speech,
          decision.emotion, room, this.personaStates
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

    const agenda = this.agendas[name];
    const systemPrompt = buildSystemPrompt(name);
    const userPrompt = buildUserPrompt(
      member, family, gameTime, roomLights,
      personaState, this.recentEvents, agenda
    );

    const perception = buildPerception(member, family, gameTime, roomLights, this.recentEvents);
    const availableInteractions = getFilteredInteractions(member.role, gameTime, perception);

    const startTime = Date.now();
    const thoughtId = this.nextThoughtId++;

    const promise = this.llmClient.reason(systemPrompt, userPrompt, {
      temperature: 0.7,
      max_tokens: 300,
      top_p: 0.9,
    }).then(rawResponse => {
      const elapsed = Date.now() - startTime;
      this._updateAvgTime(elapsed);

      // Estimate token usage
      const promptTokens = this._estimateTokens(systemPrompt + userPrompt);
      const responseTokens = rawResponse ? this._estimateTokens(rawResponse) : 0;
      const totalTokens = promptTokens + responseTokens;
      this._recordTokens(name, totalTokens);

      if (!rawResponse) {
        this._logThought(name, thoughtId, systemPrompt, userPrompt, null, null, elapsed, 0);
        console.log(`[AgenticEngine] No response for ${name} (${elapsed}ms)`);
        return null;
      }

      const decision = parseDecision(rawResponse, availableInteractions);

      // Log full thought chain
      this._logThought(name, thoughtId, systemPrompt, userPrompt, rawResponse, decision, elapsed, totalTokens);

      if (decision && decision.valid) {
        console.log(`[AgenticEngine] ${name} decided: ${decision.action} ("${decision.thought}") [${elapsed}ms] [~${totalTokens} tok]`);
        return decision;
      } else {
        console.log(`[AgenticEngine] Invalid decision for ${name}, falling back [${elapsed}ms]`);
        if (decision) {
          personaState.lastThought = decision.thought;
        }
        return null;
      }
    }).catch(err => {
      console.error(`[AgenticEngine] LLM error for ${name}: ${err.message}`);
      this.stats.llmErrors++;
      this._logThought(name, thoughtId, systemPrompt, userPrompt, `ERROR: ${err.message}`, null, Date.now() - startTime, 0);
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

      // Generate agenda if: new day or no agenda yet (between 5-8 AM or first time ever)
      const needsAgenda = !agenda.generatedForDay ||
        (agenda.generatedForDay !== dayKey && hour >= 5 && hour < 8);

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
        temperature: 0.8,
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
      }

      this._logThought(member.name, this.nextThoughtId++, systemPrompt, agendaPrompt, rawResponse, { type: 'agenda', plan }, elapsed, tokens);

    } catch (err) {
      console.error(`[AgenticEngine] Agenda generation error for ${member.name}: ${err.message}`);
    }
  }

  _markAgendaCompleted(memberName, action, thought) {
    const agenda = this.agendas[memberName];
    if (!agenda || !agenda.plan) return;

    for (const item of agenda.plan) {
      if (item.done) continue;
      const actionLower = (action || '').toLowerCase();
      const activityLower = (item.activity || '').toLowerCase();
      if (actionLower.includes(activityLower.split(' ')[0]) ||
          activityLower.includes(actionLower.replace(/_/g, ' ').split(' ')[0])) {
        item.done = true;
        item.completedAt = Date.now();
        agenda.completed.push({ ...item, completedAt: Date.now() });
        break;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  THOUGHT CHAIN LOGGING
  // ═══════════════════════════════════════════════════════════════

  _logThought(memberName, id, systemPrompt, userPrompt, rawResponse, parsedDecision, elapsed, tokenEstimate) {
    if (!this.thoughtLog[memberName]) this.thoughtLog[memberName] = [];

    this.thoughtLog[memberName].push({
      id,
      timestamp: Date.now(),
      systemPrompt,
      userPrompt,
      rawResponse,
      parsedDecision,
      elapsed,
      tokenEstimate,
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
      thought: e.parsedDecision?.thought || (e.parsedDecision?.type === 'agenda' ? 'Planning the day...' : 'Processing...'),
      action: e.parsedDecision?.action || e.parsedDecision?.type || null,
      speech: e.parsedDecision?.speech || null,
      emotion: e.parsedDecision?.emotion || null,
      elapsed: e.elapsed,
      tokens: e.tokenEstimate,
      valid: e.parsedDecision?.valid ?? null,
      character: e.character,
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
        thought: e.parsedDecision?.thought || (e.parsedDecision?.type === 'agenda' ? 'Planning the day...' : 'Processing...'),
        action: e.parsedDecision?.action || e.parsedDecision?.type || null,
        speech: e.parsedDecision?.speech || null,
        emotion: e.parsedDecision?.emotion || null,
        elapsed: e.elapsed,
        tokens: e.tokenEstimate,
        valid: e.parsedDecision?.valid ?? null,
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

module.exports = AgenticEngine;
