/**
 * SimulationLogger.js — Rolling file logger for all LLM / agentic activity.
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
 *   - State transitions (character state changes driven by conversation)
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
  logSpeech({ speaker, target, text, emotion, room, speechType, conversationId }) {
    this._write({
      event: 'speech',
      speaker,
      target,
      text,
      emotion,
      room,
      speechType,
      conversationId: conversationId || null,
    });
  }

  /**
   * Log a conversation thread event (new thread, reply, thread ended).
   */
  logConversation({ conversationId, action, speaker, target, text, emotion, room, turnNumber, threadLength }) {
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
  logStateTransition({ character, from, to, reason, conversationId, triggerSpeaker }) {
    this._write({
      event: 'state_transition',
      character,
      from,
      to,
      reason,
      conversationId: conversationId || null,
      triggerSpeaker: triggerSpeaker || null,
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
