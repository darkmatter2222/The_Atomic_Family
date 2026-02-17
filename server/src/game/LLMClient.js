/**
 * LLMClient.js — HTTP client for the vLLM inference server.
 *
 * Makes OpenAI-compatible chat completion calls to the local GPU server.
 * Includes retry logic, timeout, and graceful fallback when the LLM is
 * unavailable.
 *
 * CommonJS module (server-side).
 */

const http = require('http');
const https = require('https');

// ── Configuration (from environment / defaults) ───────────────────
const LLM_HOST    = process.env.LLM_HOST || process.env.SSH_HOST || '192.168.86.48';
const LLM_PORT    = parseInt(process.env.LLM_PORT || '8000', 10);
const LLM_MODEL   = process.env.LLM_MODEL || 'Qwen/Qwen2.5-3B-Instruct';
const LLM_TIMEOUT = parseInt(process.env.LLM_TIMEOUT || '15000', 10); // 15s default

class LLMClient {
  constructor(options = {}) {
    this.host    = options.host    || LLM_HOST;
    this.port    = options.port    || LLM_PORT;
    this.model   = options.model   || LLM_MODEL;
    this.timeout = options.timeout || LLM_TIMEOUT;
    this.available = null;  // null = unknown, true/false after check
    this.lastHealthCheck = 0;
    this.healthCheckInterval = 30000; // 30s between health checks
    this.requestCount = 0;
    this.errorCount = 0;
  }

  /**
   * Check if the LLM server is reachable.
   * Caches result for healthCheckInterval ms.
   */
  async checkHealth() {
    const now = Date.now();
    if (now - this.lastHealthCheck < this.healthCheckInterval && this.available !== null) {
      return this.available;
    }

    try {
      const response = await this._httpGet('/health');
      this.available = response && response.status === 'ok';
      this.lastHealthCheck = now;
      return this.available;
    } catch (err) {
      this.available = false;
      this.lastHealthCheck = now;
      return false;
    }
  }

  /**
   * Send a chat completion request to the LLM.
   *
   * @param {Array<{role:string, content:string}>} messages
   * @param {object} options - temperature, max_tokens, top_p
   * @returns {Promise<string|null>} The generated text, or null on failure
   */
  async chatCompletion(messages, options = {}) {
    const body = {
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.max_tokens ?? 512,
      top_p: options.top_p ?? 0.9,
      stop: options.stop || null,
    };

    try {
      this.requestCount++;
      const result = await this._httpPost('/v1/chat/completions', body);
      if (result && result.choices && result.choices.length > 0) {
        return result.choices[0].message.content;
      }
      return null;
    } catch (err) {
      this.errorCount++;
      console.error(`[LLMClient] Chat completion failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Convenience: Send system + user messages and get response.
   */
  async reason(systemPrompt, userPrompt, options = {}) {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
    return this.chatCompletion(messages, options);
  }

  /**
   * Get stats for monitoring.
   */
  getStats() {
    return {
      host: `${this.host}:${this.port}`,
      model: this.model,
      available: this.available,
      requests: this.requestCount,
      errors: this.errorCount,
    };
  }

  // ── Internal HTTP helpers ─────────────────────────────────────

  _httpGet(path) {
    return new Promise((resolve, reject) => {
      const req = http.get({
        hostname: this.host,
        port: this.port,
        path,
        timeout: 5000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
  }

  _httpPost(path, body) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const options = {
        hostname: this.host,
        port: this.port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: this.timeout,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
            return;
          }
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error(`Invalid JSON response: ${data.substring(0, 200)}`)); }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`LLM request timeout after ${this.timeout}ms`));
      });

      req.write(payload);
      req.end();
    });
  }
}

module.exports = LLMClient;
