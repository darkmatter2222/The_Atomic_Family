/**
 * GameSimulation.js — Server-side authoritative game loop.
 *
 * Maintains the family, game clock, and room-light state.
 * Ticks the AI at a fixed rate and broadcasts state to all
 * connected Socket.IO clients.
 *
 * The client is a passive renderer — it receives state and sends commands.
 */

const { createFamily, updateFamilyMember, commandFamilyMember, STATE } = require('./FamilyMemberAI');
const { HOUSE_LAYOUT } = require('./HouseLayout');
const AgenticEngine = require('./AgenticEngine');
const { recordMemory } = require('./MemoryManager');

// ── Helpers ──────────────────────────────────────────────────────

function getEasternTime() {
  const str = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  return new Date(str);
}

// ═════════════════════════════════════════════════════════════════
//  GameSimulation class
// ═════════════════════════════════════════════════════════════════

class GameSimulation {
  constructor(io) {
    this.io = io;

    // ── Family state ──
    this.family = createFamily();

    // ── Game clock ──
    this.gameTime = getEasternTime();
    this.gameSpeed = 1;        // 1x, 10x, 100x, 1000x
    this.paused = false;
    this.syncToReal = false;

    // ── Initialize needs based on current game time ──
    // If starting mid-day, decay needs to reflect time awake
    const startHour = this.gameTime.getHours() + this.gameTime.getMinutes() / 60;
    const wakeTimes = { Dad: 6.0, Mom: 6.0, Emma: 8.5, Lily: 7.5, Jack: 6.5 };
    this.family = this.family.map(m => {
      const wakeTime = wakeTimes[m.name] || 7;
      let hoursAwake = 0;
      if (startHour >= wakeTime && startHour < 23) {
        hoursAwake = startHour - wakeTime;
      } else if (startHour < 5) {
        hoursAwake = (24 - wakeTime) + startHour; // past midnight
      }
      if (hoursAwake > 0) {
        const { decayNeeds } = require('./InteractionData');
        const decayed = decayNeeds(m.needs, hoursAwake, startHour, m.name);
        // ── Cap minimum needs — characters would have eaten, rested, etc. during the day ──
        // Without this, Lily's comfort hits 0 by evening because 12hrs of pure decay
        // simulates a day where she never sat on the couch, got a hug, or played.
        const needsFloor = { energy: 20, hunger: 15, hydration: 20, hygiene: 25,
                             bladder: 15, fun: 20, social: 20, comfort: 25 };
        for (const [key, floor] of Object.entries(needsFloor)) {
          if (decayed[key] !== undefined && decayed[key] < floor) {
            decayed[key] = floor;
          }
        }
        return { ...m, needs: decayed };
      }
      return m;
    });

    // ── Room lights ──
    this.roomLights = {};
    HOUSE_LAYOUT.rooms.forEach(r => { this.roomLights[r.id] = true; });
    this.roomLights._exterior = true;
    this.lightsAuto = true;

    // ── Agentic AI engine ──
    this.agenticEngine = new AgenticEngine();
    this.agenticEngine.initializePersonas(this.family);
    this.agenticEngine.checkLLMAvailability();

    // ── Tick control ──
    this.tickRate = 10;                  // ticks per second
    this.lastTick = Date.now();
    this.interval = null;

    // ── Broadcast throttle ──
    this.broadcastInterval = null;
  }

  /**
   * Start the simulation loop.
   */
  start() {
    console.log(`[GameSimulation] Starting at ${this.tickRate} tps`);
    this.lastTick = Date.now();

    // Main simulation tick
    this.interval = setInterval(() => this.tick(), 1000 / this.tickRate);

    // Broadcast state to all clients at the same rate
    this.broadcastInterval = setInterval(() => this.broadcast(), 1000 / this.tickRate);
  }

  /**
   * Stop the simulation loop.
   */
  stop() {
    if (this.interval) clearInterval(this.interval);
    if (this.broadcastInterval) clearInterval(this.broadcastInterval);
    this.interval = null;
    this.broadcastInterval = null;
    console.log('[GameSimulation] Stopped');
  }

  /**
   * One simulation tick: advance clock, update AI, auto-lights.
   */
  tick() {
    const now = Date.now();
    const realDelta = (now - this.lastTick) / 1000;
    this.lastTick = now;

    if (this.paused) return;

    // ── Advance game clock ──
    if (this.syncToReal) {
      this.gameTime = getEasternTime();
    } else {
      const clampedDelta = Math.min(realDelta, 0.2);
      this.gameTime = new Date(
        this.gameTime.getTime() + clampedDelta * 1000 * this.gameSpeed
      );
    }

    // ── Compute dt for AI (already scaled by speed) ──
    const effectiveSpeed = this.syncToReal ? 1 : this.gameSpeed;
    const dt = Math.min(realDelta, 0.2) * effectiveSpeed;

    const gameHour = this.gameTime.getHours() + this.gameTime.getMinutes() / 60;

    // ── Agentic reasoning FIRST — intercepts CHOOSING before regular AI picks randomly ──
    //    Also handles conversation interrupts (forces addressed characters into CHOOSING)
    this._tickAgentic();

    // ── Background thinking — characters reflect while performing tasks ──
    this.agenticEngine.doBackgroundThinking(this.family, this.gameTime, this.gameSpeed, this.roomLights);

    // ── Update each family member ──
    this.family = this.family.map(member =>
      updateFamilyMember(member, dt, gameHour)
    );

    // ── Parent-presence comfort boost for distressed children ──
    // When a parent is in the same room as a child with low comfort,
    // the child's comfort recovers — being near a caregiver is naturally soothing.
    // Rate must exceed the fastest comfort decay (Lily: 5.6 * 1.3 = 7.28/hr) to actually help.
    const parentRooms = new Set(
      this.family.filter(m => m.role === 'father' || m.role === 'mother').map(m => m.currentRoom)
    );
    const gameHoursElapsed = dt / 3600;
    for (const child of this.family) {
      if ((child.role === 'son' || child.role === 'daughter') &&
          child.needs && child.needs.comfort < 50 &&
          parentRooms.has(child.currentRoom)) {
        // +20 comfort per game-hour while parent is present (net +12.7/hr for Lily)
        child.needs.comfort = Math.min(50, child.needs.comfort + 20 * gameHoursElapsed);
      }
    }

    // ── Resolve character collisions (nudge overlapping characters) ──
    this._resolveCollisions();

    // ── Smart per-room light management ──
    //    Instead of toggling ALL rooms at once, manage lights based on:
    //    1. Occupancy: turn off lights in empty rooms at night
    //    2. Turn on lights when someone enters a dark room at night
    //    3. Keep exterior/hallway lights on during evening hours
    if (this.lightsAuto) {
      const isNightTime = gameHour >= 18 || gameHour < 6.5;
      const isDaytime = !isNightTime;

      // Build room occupancy map
      const roomOccupancy = {};
      for (const m of this.family) {
        const room = m.currentRoom || 'unknown';
        roomOccupancy[room] = (roomOccupancy[room] || 0) + 1;
      }

      for (const roomId of Object.keys(this.roomLights)) {
        const occupied = (roomOccupancy[roomId] || 0) > 0;

        if (isDaytime) {
          // During day: all lights off (natural light)
          if (this.roomLights[roomId] !== false) {
            this.roomLights[roomId] = false;
          }
        } else {
          // At night: lights on in occupied rooms, off in empty rooms
          // Exception: hallway and porch stay on for safety
          const keepOn = roomId === 'hallway' || roomId === '_exterior';
          if (keepOn) {
            this.roomLights[roomId] = true;
          } else if (occupied) {
            // Someone is in this room — turn on lights
            if (!this.roomLights[roomId]) {
              this.roomLights[roomId] = true;
            }
          } else {
            // No one in this room at night — turn off after a short delay
            // (instant for simulation purposes)
            if (this.roomLights[roomId]) {
              this.roomLights[roomId] = false;
            }
          }
        }
      }
    }

    // ── Bedtime enforcement ──
    //    Characters past their bedtime get forced to sleep.
    //    Jack: 20:00, Lily: 20:30, Emma: 21:30, Adults: 23:00
    this._enforceBedtimes(gameHour);

    // ── Morning wake routine ──
    //    Wake sleeping characters at their wake time
    this._enforceWakeUp(gameHour);
  }

  /**
   * Broadcast full game state to all connected clients.
   */
  broadcast() {
    const state = {
      family: this.family.map(m => this.serializeMember(m)),
      gameTime: this.gameTime.toISOString(),
      gameSpeed: this.gameSpeed,
      paused: this.paused,
      syncToReal: this.syncToReal,
      roomLights: this.roomLights,
      lightsAuto: this.lightsAuto,
      agenticState: this.agenticEngine.serialize(),
    };
    this.io.volatile.emit('gameState', state);
  }

  /**
   * Send full state to a single socket (on connect).
   */
  sendFullState(socket) {
    const state = {
      family: this.family.map(m => this.serializeMember(m)),
      gameTime: this.gameTime.toISOString(),
      gameSpeed: this.gameSpeed,
      paused: this.paused,
      syncToReal: this.syncToReal,
      roomLights: this.roomLights,
      lightsAuto: this.lightsAuto,
      agenticState: this.agenticEngine.serialize(),
    };
    socket.emit('gameState', state);
  }

  /**
   * Serialize a family member for transmission.
   * Sends everything the client needs for rendering + UI.
   * Strips out internal pathfinding arrays to save bandwidth.
   */
  serializeMember(m) {
    // Attach persona state data for richer client display
    const ps = this.agenticEngine.personaStates[m.name];

    return {
      name: m.name,
      role: m.role,
      position: m.position,
      state: m.state,
      animFrame: m.animFrame,
      facingRight: m.facingRight,
      currentRoom: m.currentRoom,
      activityLabel: m.activityLabel,
      activityAnim: m.activityAnim,
      activityAnimFrame: m.activityAnimFrame,
      targetFurniture: m.targetFurniture,
      needs: m.needs,
      skills: m.skills,
      relationships: m.relationships,
      walkSpeed: m.walkSpeed,
      interactionDuration: m.interactionDuration || 0,
      interactionTimer: m.interactionTimer || 0,
      currentInteraction: m.currentInteraction ? {
        id: m.currentInteraction.id,
        label: m.currentInteraction.label,
        category: m.currentInteraction.category,
        animation: m.currentInteraction.animation,
        furnitureId: m.currentInteraction.furnitureId,
      } : null,
      // Persona state for richer UI (mood, thought bubble, speech bubble)
      mood: ps?.mood || 'content',
      moodIntensity: ps?.moodIntensity || 0.5,
      stressLevel: ps?.stressLevel || 0,
      lastThought: ps?.lastThought || null,
      internalMonologue: ps?.internalMonologue || null,
      activeSpeech: ps?.pendingSpeech || null,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  Client commands (received via Socket.IO)
  // ═══════════════════════════════════════════════════════════════

  /** Command a character to perform an interaction */
  command(memberName, interactionId) {
    this.family = this.family.map(m =>
      m.name === memberName ? commandFamilyMember(m, interactionId) : m
    );
  }

  /** Set simulation speed */
  setSpeed(speed) {
    const allowed = [1, 10, 100, 1000];
    if (allowed.includes(speed)) {
      this.gameSpeed = speed;
      this.syncToReal = false;
    }
  }

  /** Toggle pause */
  togglePause() {
    this.paused = !this.paused;
  }

  /** Set pause state explicitly */
  setPaused(paused) {
    this.paused = !!paused;
  }

  /** Sync to real Eastern time */
  setSyncToReal(sync) {
    this.syncToReal = !!sync;
    if (sync) this.gameTime = getEasternTime();
  }

  /** Override the game hour (from time slider) */
  setTimeOverride(hour) {
    const h = Math.floor(hour);
    const min = Math.floor((hour - h) * 60);
    this.gameTime.setHours(h, min, 0, 0);
    this.syncToReal = false;
  }

  /** Toggle a room's lights */
  toggleRoomLight(roomId) {
    if (this.roomLights[roomId] !== undefined) {
      this.roomLights[roomId] = !this.roomLights[roomId];
      this.lightsAuto = false;
    }
  }

  /** Set all lights on or off */
  setAllLights(on) {
    for (const key of Object.keys(this.roomLights)) {
      this.roomLights[key] = !!on;
    }
    this.lightsAuto = false;
  }

  /** Toggle auto-lights mode */
  toggleLightsAuto() {
    this.lightsAuto = !this.lightsAuto;
  }

  /** Enable/disable agentic AI */
  setAgenticEnabled(enabled) {
    this.agenticEngine.setEnabled(enabled);
  }

  /** Get agentic engine stats */
  getAgenticStats() {
    return this.agenticEngine.stats;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Bedtime & Wake enforcement
  // ═══════════════════════════════════════════════════════════════

  /**
   * Bedtime rules from personas.json houseRules:
   *   Jack: 20:00, Lily: 20:30, Emma: 21:30
   *   Adults: when energy < 20 after 22:00, or forced at 23:00
   *
   * Parents announce bedtime ~15 min before enforcement.
   */
  _enforceBedtimes(gameHour) {
    const bedtimes = {
      Jack: 20.0,
      Lily: 20.5,
      Emma: 21.5,
      Dad: 23.0,
      Mom: 23.0,
    };

    // ── Parent bedtime announcements (speech) ──
    // Triggers once per child per night: a parent says "time for bed" 
    if (!this._bedtimeAnnouncements) this._bedtimeAnnouncements = {};
    const today = this.gameTime.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
    if (this._bedtimeAnnouncementDay !== today) {
      this._bedtimeAnnouncements = {};
      this._bedtimeAnnouncementDay = today;
    }

    const kidBedtimes = [
      { name: 'Jack', hour: 20.0, message: "Jack, it's 8 o'clock — time for bed, buddy!" },
      { name: 'Lily', hour: 20.5, message: "Lily sweetie, it's 8:30 — bedtime!" },
      { name: 'Emma', hour: 21.5, message: "Emma, it's 9:30 — time to head to bed." },
    ];

    for (const kid of kidBedtimes) {
      // Announce ~5 min before bedtime (announce window: bedtime-0.08 to bedtime)
      const announceTime = kid.hour - 0.08; // ~5 min before
      if (gameHour >= announceTime && gameHour < kid.hour + 0.2 && !this._bedtimeAnnouncements[kid.name]) {
        // Pick a parent to announce (prefer one who is idle/choosing)
        const parent = this.family.find(m =>
          (m.role === 'father' || m.role === 'mother') &&
          (m.state === 'idle' || m.state === 'choosing' || m.state === 'performing') &&
          !(m.activityLabel && m.activityLabel.toLowerCase().includes('sleep'))
        );
        if (parent) {
          const personaState = this.agenticEngine.personaStates[parent.name];
          if (personaState) {
            personaState.pendingSpeech = {
              text: kid.message,
              target: kid.name,
              emotion: 'caring',
              timestamp: Date.now(),
            };
            // Process through social engine for proper conversation tracking
            this.agenticEngine.socialEngine.processSpeech(
              parent.name, kid.name, kid.message, 'caring',
              parent.currentRoom, this.agenticEngine.personaStates, this.family
            );
            this._bedtimeAnnouncements[kid.name] = true;
          }
        }
      }
    }

    for (let i = 0; i < this.family.length; i++) {
      const member = this.family[i];
      const bedtime = bedtimes[member.name];
      if (!bedtime) continue;

      // Already sleeping — skip
      if (member.activityLabel && member.activityLabel.toLowerCase().includes('sleep')) continue;

      // Check if past bedtime
      const pastBedtime = gameHour >= bedtime || gameHour < 5; // 5 AM = new day cutoff

      if (!pastBedtime) continue;

      // Adults get a softer enforcement — only if energy is low OR very late
      if (member.role === 'father' || member.role === 'mother') {
        const energy = member.needs?.energy || 50;
        const veryLate = gameHour >= 23.5 || gameHour < 5;
        if (energy > 20 && !veryLate) continue;
      }

      // ── Kids get STRONGER enforcement — interrupt ANY state (except sleeping) ──
      // After 30 min past bedtime, force them to bed regardless of state
      const isKid = member.role === 'son' || member.role === 'daughter';
      const veryPastBedtime = gameHour >= bedtime + 0.5 || gameHour < 5;

      if (isKid && veryPastBedtime) {
        // Force kids to bed regardless — cancel walking, thinking, performing
        const sleepInteractions = {
          Jack: 'kids_sleep_night_3',
          Lily: 'kids_sleep_night_1',
          Emma: 'kids_sleep_night_2',
        };
        const sleepAction = sleepInteractions[member.name];
        if (sleepAction) {
          // Cancel any pending LLM decisions
          if (this.agenticEngine.pendingDecisions.has(member.name)) {
            this.agenticEngine.pendingDecisions.delete(member.name);
            this.agenticEngine.resolvedDecisions.delete(member.name);
          }
          this.family[i] = commandFamilyMember(this.family[i], sleepAction);
          const personaState = this.agenticEngine.personaStates[member.name];
          if (personaState) {
            recordMemory(personaState, 'action', `Was sent to bed — past bedtime`, 'tired', { importance: 3 });
          }
          continue; // Skip the normal enforcement below
        }
      }

      // Grace period: only enforce if they're idle/choosing (don't interrupt performing/walking/thinking)
      if (member.state !== 'idle' && member.state !== 'choosing') continue;

      // Force them to their bed
      const sleepInteractions = {
        Jack: 'kids_sleep_night_3',
        Lily: 'kids_sleep_night_1',
        Emma: 'kids_sleep_night_2',
        Dad: 'sleep_night',
        Mom: 'sleep_night',
      };

      const sleepAction = sleepInteractions[member.name];
      if (sleepAction) {
        this.family[i] = commandFamilyMember(this.family[i], sleepAction);
        // Add memory about going to bed
        const personaState = this.agenticEngine.personaStates[member.name];
        if (personaState) {
          recordMemory(personaState, 'action', `Went to bed for the night`, 'tired', { importance: 3 });
        }
      }
    }
  }

  /**
   * Wake up characters at their ideal wake time.
   * Only wakes characters who are currently performing a sleep interaction.
   */
  _enforceWakeUp(gameHour) {
    const wakeTimes = {
      Jack: 6.5,
      Lily: 7.5,
      Emma: 8.5,
      Dad: 6.0,
      Mom: 6.0,
    };

    for (let i = 0; i < this.family.length; i++) {
      const member = this.family[i];
      const wakeTime = wakeTimes[member.name];
      if (!wakeTime) continue;

      // Only wake if sleeping
      if (!member.activityLabel || !member.activityLabel.toLowerCase().includes('sleep')) continue;
      if (member.state !== 'performing') continue;

      // Check if past wake time
      if (gameHour >= wakeTime && gameHour < 20) { // Don't wake in the evening
        // Force out of performing by setting timer to max
        this.family[i] = {
          ...member,
          interactionTimer: member.interactionDuration,
          state: 'idle',
          currentInteraction: null,
          activityLabel: null,
          activityAnim: null,
          idleTimer: 0,
          idleDuration: 1,
        };

        // Add wake memory
        const personaState = this.agenticEngine.personaStates[member.name];
        if (personaState) {
          recordMemory(personaState, 'action', `Woke up for the day`, 'contentment', { importance: 3 });
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Collision resolution
  // ═══════════════════════════════════════════════════════════════

  /**
   * Nudge characters apart when they overlap.
   * Only affects stationary characters (PERFORMING, IDLE, THINKING).
   * Walking characters are left alone — they'll resolve naturally.
   */
  _resolveCollisions() {
    const MIN_DIST = 0.6;       // Characters shouldn't be closer than this
    const NUDGE = 0.35;         // How far to push apart per tick
    const stationaryStates = new Set(['performing', 'idle', 'thinking', 'choosing']);

    for (let i = 0; i < this.family.length; i++) {
      const a = this.family[i];
      if (!stationaryStates.has(a.state)) continue;

      for (let j = i + 1; j < this.family.length; j++) {
        const b = this.family[j];
        if (!stationaryStates.has(b.state)) continue;

        const dx = a.position.x - b.position.x;
        const dz = a.position.z - b.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < MIN_DIST && dist > 0.001) {
          // Push apart along the line between them
          const nx = dx / dist;
          const nz = dz / dist;
          const pushDist = (MIN_DIST - dist) * 0.5 + NUDGE * 0.1;

          this.family[i] = {
            ...this.family[i],
            position: {
              ...this.family[i].position,
              x: a.position.x + nx * pushDist,
              z: a.position.z + nz * pushDist,
            }
          };
          this.family[j] = {
            ...this.family[j],
            position: {
              ...this.family[j].position,
              x: b.position.x - nx * pushDist,
              z: b.position.z - nz * pushDist,
            }
          };
        } else if (dist <= 0.001) {
          // Exactly overlapping — push in a deterministic direction
          this.family[i] = {
            ...this.family[i],
            position: {
              ...this.family[i].position,
              x: a.position.x + NUDGE,
            }
          };
          this.family[j] = {
            ...this.family[j],
            position: {
              ...this.family[j].position,
              x: b.position.x - NUDGE,
            }
          };
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  Agentic reasoning integration
  // ═══════════════════════════════════════════════════════════════

  /**
   * Called every tick to manage agentic reasoning.
   * Runs BEFORE updateFamilyMember so it can intercept CHOOSING → THINKING
   * before the regular AI picks a random interaction.
   *
   * Flow:
   *  1. CHOOSING members with agentic enabled → start LLM reasoning → THINKING
   *  2. THINKING members with resolved promise → apply decision → command
   *  3. THINKING members with timed-out promise → fallback → CHOOSING
   */
  _tickAgentic() {
    // Get decisions/fallbacks from the engine tick
    // NOTE: engine.tick() may modify this.family members directly (for conversation interrupts)
    const results = this.agenticEngine.tick(
      this.family, this.gameTime, this.gameSpeed, this.roomLights
    );

    // Process immediate fallback decisions (high speed, engine disabled, etc.)
    for (const { memberName, fallback } of results) {
      if (fallback) {
        const idx = this.family.findIndex(m => m.name === memberName);
        if (idx >= 0 && this.family[idx].state === 'thinking') {
          // Return to CHOOSING so the regular AI can pick
          this.family[idx] = { ...this.family[idx], state: 'choosing', activityLabel: null, _thinkingRealStart: null };
        }
        // If still in CHOOSING, just leave it — regular AI will handle
      }
    }

    // Transition CHOOSING → THINKING for members the engine is now reasoning for
    for (let i = 0; i < this.family.length; i++) {
      const member = this.family[i];
      if (member.state === 'choosing' && this.agenticEngine.hasPendingDecision(member.name)) {
        this.family[i] = {
          ...member,
          state: 'thinking',
          activityLabel: '🧠 Multi-agent deliberation...',
          activityAnim: null,
          _thinkingRealStart: Date.now(),
        };
      }
    }

    // Check THINKING members for resolved or timed-out promises
    for (let i = 0; i < this.family.length; i++) {
      const member = this.family[i];
      if (member.state !== 'thinking') continue;

      if (this.agenticEngine.hasPendingDecision(member.name)) {
        // Still pending — nothing to do (timeout handled by AgenticEngine.tick)
        continue;
      }

      // Promise has resolved (stored in resolvedDecisions map)
      const resolved = this.agenticEngine.getResolvedDecision(member.name);

      if (resolved === undefined) {
        // Neither pending nor resolved yet — promise microtask hasn't run.
        // Stay in THINKING, will resolve next tick.
        continue;
      }

      if (resolved && resolved.valid) {
        // Apply via the agentic engine (speech, memory, lights, etc.)
        const accepted = this.agenticEngine.applyDecision(member.name, resolved, this.family, this.roomLights);
        if (accepted === false) {
          // Anti-repetition or other guard rejected — fallback to regular AI
          this.family[i] = { ...this.family[i], state: 'choosing', activityLabel: null, _thinkingRealStart: null };
          this.agenticEngine.stats.fallbackDecisions++;
        } else {
          // If character was interrupted from PERFORMING and the conversation pipeline
          // chose the SAME action they were already doing, restore them to PERFORMING
          // without restarting the activity timer. This preserves activity continuity.
          const wasPerforming = member.currentInteraction?.id && 
            resolved.action === member.currentInteraction.id &&
            member.interactionTimer > 0;
          
          if (wasPerforming) {
            // Restore to performing — keep interaction state, just update activity label
            this.family[i] = {
              ...member,
              state: 'performing',
              activityLabel: member.currentInteraction.label || member.activityLabel,
              _thinkingRealStart: null,
            };
          } else if (resolved.isCreatedAction && resolved.createdActionData) {
            this.family[i] = commandFamilyMember(this.family[i], resolved.action, resolved.createdActionData);
          } else {
            this.family[i] = commandFamilyMember(this.family[i], resolved.action);
          }
        }
      } else {
        // No valid decision — return to CHOOSING for regular AI fallback
        this.family[i] = { ...this.family[i], state: 'choosing', activityLabel: null, _thinkingRealStart: null };
        this.agenticEngine.stats.fallbackDecisions++;
        // Clear conversation state so we don't keep retrying failed responses
        this.agenticEngine.socialEngine.markResponded(member.name);
      }
    }
  }
}

module.exports = GameSimulation;
