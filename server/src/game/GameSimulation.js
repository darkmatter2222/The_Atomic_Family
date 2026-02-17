/**
 * GameSimulation.js — Server-side authoritative game loop.
 *
 * Maintains the family, game clock, and room-light state.
 * Ticks the AI at a fixed rate and broadcasts state to all
 * connected Socket.IO clients.
 *
 * The client is a passive renderer — it receives state and sends commands.
 */

const { createFamily, updateFamilyMember, commandFamilyMember } = require('./FamilyMemberAI');
const { HOUSE_LAYOUT } = require('./HouseLayout');

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

    // ── Room lights ──
    this.roomLights = {};
    HOUSE_LAYOUT.rooms.forEach(r => { this.roomLights[r.id] = true; });
    this.roomLights._exterior = true;
    this.lightsAuto = true;

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

    // ── Update each family member ──
    this.family = this.family.map(member =>
      updateFamilyMember(member, dt, gameHour)
    );

    // ── Auto lights (dusk/dawn) ──
    if (this.lightsAuto) {
      const shouldBeOn = gameHour >= 18 || gameHour < 6.5;
      let changed = false;
      for (const key of Object.keys(this.roomLights)) {
        if (this.roomLights[key] !== shouldBeOn) {
          this.roomLights[key] = shouldBeOn;
          changed = true;
        }
      }
    }
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
    };
    socket.emit('gameState', state);
  }

  /**
   * Serialize a family member for transmission.
   * Sends everything the client needs for rendering + UI.
   * Strips out internal pathfinding arrays to save bandwidth.
   */
  serializeMember(m) {
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
      currentInteraction: m.currentInteraction ? {
        id: m.currentInteraction.id,
        label: m.currentInteraction.label,
        category: m.currentInteraction.category,
        animation: m.currentInteraction.animation,
        furnitureId: m.currentInteraction.furnitureId,
      } : null,
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
}

module.exports = GameSimulation;
