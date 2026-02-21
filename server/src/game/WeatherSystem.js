/**
 * WeatherSystem.js — Weather simulation and its effects on gameplay.
 *
 * Per goals.md (lines 2215-2220, 1671-1672):
 * - Weather is a first-class driver of behavior
 * - Rain sends everyone inside
 * - Heat increases comfort decay
 * - Thunderstorms: Lily panics, everyone inside, power might flicker
 * - Beautiful evening: spontaneous family time outside
 *
 * Weather changes smoothly across the day. Probability-based events.
 *
 * CommonJS module (server-side).
 */

// ── Weather types and their properties ─────────────────────────
const WEATHER_TYPES = {
  clear:        { label: 'Clear',          outdoor: true,  comfortMod: 0,   moodMod: 0.05 },
  partly_cloudy:{ label: 'Partly Cloudy',  outdoor: true,  comfortMod: 0,   moodMod: 0 },
  cloudy:       { label: 'Overcast',       outdoor: true,  comfortMod: -1,  moodMod: -0.02 },
  rain:         { label: 'Raining',        outdoor: false, comfortMod: -2,  moodMod: -0.05 },
  heavy_rain:   { label: 'Heavy Rain',     outdoor: false, comfortMod: -3,  moodMod: -0.08 },
  thunderstorm: { label: 'Thunderstorm',   outdoor: false, comfortMod: -5,  moodMod: -0.12 },
  hot:          { label: 'Hot & Sunny',    outdoor: true,  comfortMod: -3,  moodMod: -0.03 },
  beautiful:    { label: 'Beautiful',      outdoor: true,  comfortMod: 2,   moodMod: 0.1 },
};

// ── Transition probabilities by time of day ────────────────────
// Each hour bracket has different weather tendencies
const WEATHER_TENDENCIES = {
  // Morning tends to be clear or partly cloudy
  morning:   { clear: 0.35, partly_cloudy: 0.25, cloudy: 0.15, rain: 0.10, heavy_rain: 0.03, thunderstorm: 0.02, hot: 0.05, beautiful: 0.05 },
  // Afternoon: heat builds, storms more likely
  afternoon: { clear: 0.20, partly_cloudy: 0.20, cloudy: 0.15, rain: 0.12, heavy_rain: 0.05, thunderstorm: 0.05, hot: 0.13, beautiful: 0.10 },
  // Evening: storms calm, beautiful evenings possible
  evening:   { clear: 0.30, partly_cloudy: 0.25, cloudy: 0.15, rain: 0.08, heavy_rain: 0.02, thunderstorm: 0.01, hot: 0.04, beautiful: 0.15 },
  // Night: calm
  night:     { clear: 0.40, partly_cloudy: 0.25, cloudy: 0.20, rain: 0.08, heavy_rain: 0.02, thunderstorm: 0.02, hot: 0.01, beautiful: 0.02 },
};

function _getTimeBracket(hour) {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// ── Character-specific weather reactions ────────────────────────
const WEATHER_REACTIONS = {
  thunderstorm: {
    Lily: { fear: 0.8, seek: 'parent', label: 'Lily is scared of the thunder' },
    Jack: { excitement: 0.6, label: 'Jack thinks the lightning is AWESOME' },
    Mom: { concern: 0.7, label: 'Sarah is worried about the kids' },
    Dad: { calm: 0.9, label: 'Dave checks the windows' },
    Emma: { annoyance: 0.3, label: 'Emma puts on headphones' },
  },
  hot: {
    Jack: { energy: -0.1, label: 'Jack wants to go to the pool' },
    Lily: { comfort: -0.2, label: 'Lily is fanning herself' },
    Mom: { concern: 0.4, label: 'Sarah reminds everyone to drink water' },
    Dad: { label: 'Dave turns up the AC' },
    Emma: { label: 'Emma stays in her room where it\'s cool' },
  },
  beautiful: {
    Mom: { mood: 0.15, label: 'Sarah loves this kind of weather' },
    Dad: { mood: 0.1, label: 'Dave suggests grilling tonight' },
    Lily: { excitement: 0.7, label: 'Lily wants to go outside RIGHT NOW' },
    Jack: { excitement: 0.8, label: 'Jack is bouncing off the walls' },
    Emma: { mood: 0.05, label: 'Even Emma admits it\'s nice out' },
  },
  rain: {
    Lily: { boredom: 0.3, label: 'Lily stares out the window at the rain' },
    Jack: { boredom: 0.5, label: 'Jack is SO BORED' },
    Mom: { label: 'Sarah makes hot chocolate' },
    Dad: { label: 'Good day for indoor projects' },
    Emma: { mood: 0.05, label: 'Emma likes the sound of rain while reading' },
  },
};

class WeatherSystem {
  constructor() {
    this.currentWeather = 'clear';
    this.temperature = 78; // Fahrenheit (summer default)
    this.lastChangeHour = 0;
    this.changeInterval = 2 + Math.random() * 3; // 2-5 hours between potential changes
    this.pendingEvents = []; // Weather-triggered events
  }

  /**
   * Tick the weather system. Call every game tick.
   * @param {number} gameHour - Current game hour (0-24 float)
   * @param {number} gameHoursElapsed - Hours elapsed this tick
   */
  tick(gameHour, gameHoursElapsed) {
    // Check if it's time for a potential weather change
    const hoursSinceChange = gameHour - this.lastChangeHour;
    if (hoursSinceChange < 0) {
      // Day rollover
      this.lastChangeHour = gameHour;
    }

    if (Math.abs(hoursSinceChange) >= this.changeInterval) {
      this._tryWeatherChange(gameHour);
      this.lastChangeHour = gameHour;
      this.changeInterval = 2 + Math.random() * 3;
    }

    // Update temperature based on time of day
    this._updateTemperature(gameHour);
  }

  _tryWeatherChange(hour) {
    const bracket = _getTimeBracket(hour);
    const tendencies = WEATHER_TENDENCIES[bracket];
    const current = this.currentWeather;

    // Weighted random selection with inertia (current weather 40% more likely to persist)
    const weights = { ...tendencies };
    if (weights[current]) weights[current] *= 1.4;

    const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0);
    let roll = Math.random() * totalWeight;

    for (const [weather, weight] of Object.entries(weights)) {
      roll -= weight;
      if (roll <= 0) {
        if (weather !== current) {
          const oldWeather = current;
          this.currentWeather = weather;
          console.log(`[Weather] Changed from ${oldWeather} to ${weather} at hour ${hour.toFixed(1)}`);

          // Generate weather change event
          this.pendingEvents.push({
            type: 'weather_change',
            from: oldWeather,
            to: weather,
            timestamp: Date.now(),
            hearingRange: weather === 'thunderstorm' ? 'whole_house' : 'adjacent',
            description: this._describeWeatherChange(oldWeather, weather),
          });
        }
        return;
      }
    }
  }

  _updateTemperature(hour) {
    // Temperature curve: coolest at 5am (~68°F), hottest at 2pm (~92°F)
    const base = 80;
    const amplitude = 12;
    // Cosine curve peaking at 14:00 (2pm)
    const tempCurve = base + amplitude * Math.cos((hour - 14) * Math.PI / 12);

    // Weather modifiers
    const weatherTempMod = {
      clear: 0, partly_cloudy: -2, cloudy: -5, rain: -8,
      heavy_rain: -10, thunderstorm: -8, hot: 8, beautiful: 3,
    };
    this.temperature = Math.round(tempCurve + (weatherTempMod[this.currentWeather] || 0));
  }

  _describeWeatherChange(from, to) {
    const descriptions = {
      'clear→rain': 'Dark clouds roll in and it starts to rain.',
      'clear→thunderstorm': 'The sky darkens suddenly — a storm is coming.',
      'rain→thunderstorm': 'Thunder rumbles. The rain gets heavier.',
      'thunderstorm→rain': 'The thunder fades, but rain continues.',
      'rain→clear': 'The rain stops. Sun breaks through the clouds.',
      'clear→hot': 'The sun beats down — it\'s getting really hot.',
      'clear→beautiful': 'Perfect weather. A gentle breeze, golden light.',
      'cloudy→rain': 'The clouds finally open up. Rain.',
    };
    const key = `${from}→${to}`;
    return descriptions[key] || `The weather changes from ${WEATHER_TYPES[from]?.label || from} to ${WEATHER_TYPES[to]?.label || to}.`;
  }

  /**
   * Get comfort modifier from current weather for outdoor characters.
   * Indoor characters get 0 (AC/heating assumed).
   */
  getComfortModifier(isOutdoor) {
    if (!isOutdoor) return 0;
    return WEATHER_TYPES[this.currentWeather]?.comfortMod || 0;
  }

  /**
   * Can characters go outside right now?
   */
  isOutdoorSafe() {
    return WEATHER_TYPES[this.currentWeather]?.outdoor ?? true;
  }

  /**
   * Get character-specific weather reactions (for LLM context).
   */
  getCharacterReaction(characterName) {
    const reactions = WEATHER_REACTIONS[this.currentWeather];
    if (!reactions) return null;
    return reactions[characterName] || null;
  }

  /**
   * Consume pending weather events (for broadcasting).
   */
  consumeEvents() {
    const events = [...this.pendingEvents];
    this.pendingEvents = [];
    return events;
  }

  /**
   * Get a narrated weather description for the LLM.
   */
  describe() {
    const w = WEATHER_TYPES[this.currentWeather];
    if (!w) return '';
    return `Weather: ${w.label}, ${this.temperature}°F.`;
  }

  /**
   * Serialize for broadcast.
   */
  serialize() {
    return {
      weather: this.currentWeather,
      label: WEATHER_TYPES[this.currentWeather]?.label || this.currentWeather,
      temperature: this.temperature,
      outdoor: this.isOutdoorSafe(),
    };
  }
}

module.exports = WeatherSystem;
