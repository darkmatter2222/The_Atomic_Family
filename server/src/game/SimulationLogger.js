/**
 * SimulationLogger.js — Rolling file logger for ALL simulation activity.
 *
 * Writes structured JSON-lines to a rolling log file. When the file exceeds
 * MAX_FILE_SIZE it is rotated (renamed to .1, oldest deleted) and a new
 * file is started. Keeps at most MAX_FILES rotated copies.
 *
 * Logged events:
 *   - LLM reasoning requests (full system + user prompt, raw response, parsed decision)
 *   - Agenda generation (prompt, raw response, parsed plan)
 *   - Speech / dialogue (speaker, target, text, emotion, room)
 *   - Conversation threads (multi-turn exchanges between characters)
 *   - Interrupts (who interrupted whom, reason)
 *   - State transitions (ALL character state changes)
 *   - Room changes (character entering/leaving rooms)
 *   - Activity start/end (interactions beginning/completing)
 *   - Light changes (auto, player, AI character)
 *   - Bedtime/wake enforcement
 *   - Speech suppression (guards that block speech)
 *   - Decision rejections (anti-repetition, fallbacks)
 *   - Needs critical thresholds
 *   - Speed/pause changes
 *   - Errors (LLM timeouts, parse failures)
 *
 * File format:  One JSON object per line (JSON-Lines / .jsonl)
 * Location:     server/logs/simulation.log  (gitignored)
 *
 * CommonJS module (server-side).
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'simulation.log');
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_FILES = 3;                     // keep simulation.log, .1, .2

class SimulationLogger {
  constructor() {
    // Ensure log directory exists
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    this._stream = null;
    this._currentSize = 0;
    this._openStream();

    console.log(`[SimulationLogger] Logging to ${LOG_FILE} (max ${MAX_FILE_SIZE / 1024 / 1024}MB × ${MAX_FILES} files)`);
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Log an LLM reasoning call (decision or agenda).
   */
  logLLMCall({ character, type, systemPrompt, userPrompt, rawResponse, parsedDecision, elapsed, tokens, valid, error }) {
    this._write({
      event: 'llm_call',
      character,
      type,           // 'decision' | 'agenda'
      systemPrompt,
      userPrompt,
      rawResponse,
      parsedDecision,
      elapsed,
      tokens,
      valid,
      error: error || null,
    });
  }

  /**
   * Log a speech act (character speaking).
   */
  logSpeech({ speaker, target, text, emotion, room, speechType, conversationId, speakerPosition, targetPosition }) {
    this._write({
      event: 'speech',
      speaker,
      target,
      text,
      emotion,
      room,
      speechType,
      conversationId: conversationId || null,
      speakerPos: speakerPosition ? { x: Math.round(speakerPosition.x * 10) / 10, z: Math.round(speakerPosition.z * 10) / 10 } : null,
      targetPos: targetPosition ? { x: Math.round(targetPosition.x * 10) / 10, z: Math.round(targetPosition.z * 10) / 10 } : null,
    });
  }

  /**
   * Log a conversation thread event (new thread, reply, thread ended).
   */
  logConversation({ conversationId, action, speaker, target, text, emotion, room, turnNumber, threadLength, speakerPosition }) {
    this._write({
      event: 'conversation',
      conversationId,
      action,         // 'started' | 'reply' | 'ended' | 'interrupted'
      speaker,
      target,
      text,
      emotion,
      room,
      turnNumber,
      threadLength,
      speakerPos: speakerPosition ? { x: Math.round(speakerPosition.x * 10) / 10, z: Math.round(speakerPosition.z * 10) / 10 } : null,
    });
  }

  /**
   * Log a conversation interrupt.
   */
  logInterrupt({ interrupter, interrupted, reason, interruptedAction, room, conversationId }) {
    this._write({
      event: 'interrupt',
      interrupter,
      interrupted,
      reason,
      interruptedAction,
      room,
      conversationId: conversationId || null,
    });
  }

  /**
   * Log a character state transition driven by social context.
   */
  logStateTransition({ character, from, to, reason, conversationId, triggerSpeaker, position }) {
    this._write({
      event: 'state_transition',
      character,
      from,
      to,
      reason,
      conversationId: conversationId || null,
      triggerSpeaker: triggerSpeaker || null,
      position: position ? { x: Math.round(position.x * 10) / 10, z: Math.round(position.z * 10) / 10 } : null,
    });
  }

  /**
   * Log agenda generation and results.
   */
  logAgenda({ character, plan, raw, elapsed, tokens, error }) {
    this._write({
      event: 'agenda',
      character,
      plan,
      raw,
      elapsed,
      tokens,
      error: error || null,
    });
  }

  /**
   * Log a generic event (fallback, errors, etc.)
   */
  logEvent({ type, message, data }) {
    this._write({
      event: type || 'generic',
      message,
      ...data,
    });
  }

  /**
   * Log activity chain / plan debugging events.
   * event: 'plan_set' | 'plan_check' | 'plan_step_walk' | 'plan_step_place' | 'plan_step_fail' | 'plan_complete'
   */
  logPlanChain({ event, character, interactionId, effectivePlan, remainingPlan, nextStep, reason, dest }) {
    this._write({
      event,
      character,
      interactionId: interactionId || null,
      effectivePlan: effectivePlan || null,
      remainingPlan: remainingPlan || null,
      nextStep: nextStep || null,
      reason: reason || null,
      dest: dest ? { x: Math.round(dest.x * 10) / 10, z: Math.round(dest.z * 10) / 10 } : null,
    });
  }

  // ── New comprehensive logging methods ──────────────────────────

  /**
   * Log a room change (character entering a new room).
   */
  logRoomChange({ character, fromRoom, toRoom, position }) {
    this._write({
      event: 'room_change',
      character,
      fromRoom,
      toRoom,
      position: position ? { x: Math.round(position.x * 10) / 10, z: Math.round(position.z * 10) / 10 } : null,
    });
  }

  /**
   * Log an activity starting (character begins performing an interaction).
   */
  logActivityStart({ character, interactionId, label, category, room, furniture, duration }) {
    this._write({
      event: 'activity_start',
      character,
      interactionId,
      label,
      category,
      room,
      furniture: furniture || null,
      duration: duration ? Math.round(duration) : null,
    });
  }

  /**
   * Log an activity ending (character finishes performing an interaction).
   */
  logActivityEnd({ character, interactionId, label, category, room, position }) {
    this._write({
      event: 'activity_end',
      character,
      interactionId,
      label,
      category,
      room,
      position: position ? { x: Math.round(position.x * 10) / 10, z: Math.round(position.z * 10) / 10 } : null,
    });
  }

  /**
   * Log a light state change.
   */
  logLightChange({ room, newState, trigger, character }) {
    this._write({
      event: 'light_change',
      room,
      newState,        // 'on' | 'off'
      trigger,         // 'auto' | 'player' | 'character'
      character: character || null,
    });
  }

  /**
   * Log a bedtime or wake enforcement event.
   */
  logBedtimeWake({ character, action, gameHour, trigger }) {
    this._write({
      event: 'bedtime_wake',
      character,
      action,          // 'bedtime_enforced' | 'bedtime_announced' | 'woke_up'
      gameHour: Math.round(gameHour * 100) / 100,
      trigger: trigger || null,
    });
  }

  /**
   * Log a speech suppression event (guards that block speech).
   */
  logSpeechSuppressed({ character, reason, target, room, speechSnippet }) {
    this._write({
      event: 'speech_suppressed',
      character,
      reason,
      target: target || null,
      room: room || null,
      speechSnippet: speechSnippet ? speechSnippet.substring(0, 80) : null,
    });
  }

  /**
   * Log a decision rejection (anti-repetition or other guard).
   */
  logDecisionRejected({ character, action, reason, details }) {
    this._write({
      event: 'decision_rejected',
      character,
      action,
      reason,
      details: details || null,
    });
  }

  /**
   * Log a needs critical threshold crossing.
   */
  logNeedsCritical({ character, need, value, threshold }) {
    this._write({
      event: 'needs_critical',
      character,
      need,
      value: Math.round(value * 10) / 10,
      threshold,
    });
  }

  /**
   * Log a simulation control change (speed, pause, etc.)
   */
  logSimControl({ action, value, previousValue }) {
    this._write({
      event: 'sim_control',
      action,          // 'speed_change' | 'pause' | 'resume' | 'sync_real' | 'time_override'
      value,
      previousValue: previousValue !== undefined ? previousValue : null,
    });
  }

  /**
   * Log a fallback AI decision (non-LLM random pick).
   */
  logFallbackDecision({ character, interactionId, label, category, reason }) {
    this._write({
      event: 'fallback_decision',
      character,
      interactionId,
      label,
      category,
      reason: reason || 'regular_ai',
    });
  }

  /**
   * Flush and close the stream (for graceful shutdown).
   */
  close() {
    if (this._stream) {
      this._stream.end();
      this._stream = null;
    }
  }

  // ── Internal ────────────────────────────────────────────────────

  _write(obj) {
    obj.ts = new Date().toISOString();

    const line = JSON.stringify(obj) + '\n';
    const lineBytes = Buffer.byteLength(line, 'utf8');

    // Rotate if needed
    if (this._currentSize + lineBytes > MAX_FILE_SIZE) {
      this._rotate();
    }

    try {
      this._stream.write(line);
      this._currentSize += lineBytes;
    } catch (err) {
      console.error(`[SimulationLogger] Write error: ${err.message}`);
    }
  }

  _openStream() {
    try {
      // Get current file size if it exists
      if (fs.existsSync(LOG_FILE)) {
        const stat = fs.statSync(LOG_FILE);
        this._currentSize = stat.size;
        // Rotate immediately if already over limit
        if (this._currentSize >= MAX_FILE_SIZE) {
          this._rotateFiles();
          this._currentSize = 0;
        }
      } else {
        this._currentSize = 0;
      }

      this._stream = fs.createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf8' });
      this._stream.on('error', (err) => {
        console.error(`[SimulationLogger] Stream error: ${err.message}`);
      });
    } catch (err) {
      console.error(`[SimulationLogger] Failed to open log file: ${err.message}`);
    }
  }

  _rotate() {
    // Close current stream
    if (this._stream) {
      this._stream.end();
      this._stream = null;
    }

    this._rotateFiles();
    this._currentSize = 0;
    this._openStream();

    // Write a rotation marker
    this._write({ event: 'log_rotated', previousFileRotated: true });
  }

  _rotateFiles() {
    try {
      // Delete oldest
      const oldest = `${LOG_FILE}.${MAX_FILES}`;
      if (fs.existsSync(oldest)) fs.unlinkSync(oldest);

      // Shift existing .N → .N+1
      for (let i = MAX_FILES - 1; i >= 1; i--) {
        const src = `${LOG_FILE}.${i}`;
        const dst = `${LOG_FILE}.${i + 1}`;
        if (fs.existsSync(src)) fs.renameSync(src, dst);
      }

      // Move current → .1
      if (fs.existsSync(LOG_FILE)) {
        fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
      }
    } catch (err) {
      console.error(`[SimulationLogger] Rotation error: ${err.message}`);
    }
  }
}

// Singleton — one logger for the entire server
module.exports = new SimulationLogger();
