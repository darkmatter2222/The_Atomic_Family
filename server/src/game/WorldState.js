/**
 * WorldState.js — Physical world state tracking for the simulation.
 *
 * Per goals.md, the physical environment has persistent state:
 *   - Food: cooking progress, freshness, leftovers, dishes in sink
 *   - Mess: rooms accumulate clutter from activities, need cleaning
 *   - Laundry: clothes cycle through worn → hamper → washer → dryer → folded
 *   - Bathroom: single-occupancy, queue awareness
 *
 * CommonJS module (server-side).
 */

// ── Food State ──────────────────────────────────────────────────

const FOOD_QUALITY_DECAY = {
  home_cooked: { freshHours: 2, staleHours: 6 },    // Hot meal → good → stale
  grilled:     { freshHours: 1.5, staleHours: 5 },   // Grilled food cools faster
  reheated:    { freshHours: 1, staleHours: 3 },      // Already reheated once
  cold:        { freshHours: 4, staleHours: 12 },     // Cold food lasts longer
  junk:        { freshHours: 24, staleHours: 48 },    // Packaged food lasts
};

// ── Mess Thresholds ─────────────────────────────────────────────

const MESS_DESCRIPTIONS = {
  0:  'spotless',
  20: 'tidy',
  40: 'a little messy',
  60: 'messy',
  80: 'very messy',
  100: 'disaster zone',
};

// Activities that create mess in a room
const MESS_GENERATORS = {
  cooking:       15,    // Cooking makes kitchen messy
  eating:        8,     // Eating leaves dishes
  creative:      12,    // Arts & crafts scatter supplies
  entertainment: 5,     // Toys, controllers left out
  outdoor:       3,     // Mud tracked in
};

// Activities that clean mess
const MESS_CLEANERS = {
  'clean_kitchen':     -30,
  'clean_living_room': -25,
  'tidy_bedroom':      -20,
  'do_dishes':         -20,
  'vacuum':            -15,
  'sweep':             -15,
};

// ── Laundry States ──────────────────────────────────────────────

const LAUNDRY_STATES = ['worn', 'hamper', 'washing', 'drying', 'clean', 'folded'];

// ── World State Class ───────────────────────────────────────────

class WorldState {
  constructor() {
    // ── Food tracking ──
    this.foods = [];        // { id, name, quality, cookedBy, cookedAt, room, servings }
    this.dishesInSink = 0;  // Accumulates from eating, reduced by washing
    this.nextFoodId = 1;

    // ── Room mess levels ──
    this.roomMess = {
      kitchen: 10,
      living_room: 5,
      bedroom_master: 5,
      bedroom_kids_shared: 25,   // Kids' room starts messy (realistic)
      bedroom_kids_single: 15,
      bathroom: 5,
      laundry: 5,
      garage: 20,
      hallway: 0,
      backyard: 0,
    };

    // ── Laundry system ──
    this.laundry = {
      hamper: 0,           // Dirty clothes count
      washer: null,        // { startedAt, loadSize } or null
      dryer: null,         // { startedAt, loadSize } or null
      cleanPile: 0,        // Clean clothes waiting to be folded
      washerDone: false,
      dryerDone: false,
    };

    // ── Bathroom occupancy ──
    this.bathroomOccupant = null;   // Name of character using bathroom, or null
    this.bathroomQueue = [];        // Names waiting to use bathroom
    this.bathroomOccupiedSince = null;

    // ── Item carrying / inventory ──
    // Per goals.md: characters can carry items between rooms
    // { characterName: { item: string, pickedUpAt: number, fromRoom: string } | null }
    this.carrying = {};

    // ── Door states ──
    // Per goals.md: doors can be open or closed, affecting visibility and sound
    // { doorId: { open: boolean, lastChangedBy: string, lastChangedAt: number } }
    this.doors = {
      bathroom_door:       { open: true, lastChangedBy: null, lastChangedAt: 0 },
      master_bedroom_door: { open: true, lastChangedBy: null, lastChangedAt: 0 },
      kids_shared_door:    { open: true, lastChangedBy: null, lastChangedAt: 0 },
      kids_single_door:    { open: true, lastChangedBy: null, lastChangedAt: 0 },
      garage_door:         { open: true, lastChangedBy: null, lastChangedAt: 0 },
      front_door:          { open: false, lastChangedBy: null, lastChangedAt: 0 },
      back_door:           { open: false, lastChangedBy: null, lastChangedAt: 0 },
    };

    // ── Hot water system ──
    // Per goals.md: finite hot water tank — long showers drain it
    this.hotWater = {
      tankLevel: 1.0,         // 0.0 = empty, 1.0 = full
      recoveryRate: 0.002,    // per game-second recovery
      usageRate: 0.008,       // per game-second usage during shower
      usingHotWater: null,    // character name currently using hot water
    };

    // ── Clothing system ──
    // Per goals.md: characters have clothing states (dressed, pajamas, swimwear)
    this.clothing = {
      Dad:  { current: 'pajamas', changed: false },
      Mom:  { current: 'pajamas', changed: false },
      Emma: { current: 'pajamas', changed: false },
      Lily: { current: 'pajamas', changed: false },
      Jack: { current: 'pajamas', changed: false },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  FOOD SYSTEM
  // ═══════════════════════════════════════════════════════════════

  /**
   * Register a cooked/prepared food item.
   */
  addFood(name, quality, cookedBy, room = 'kitchen', servings = 4) {
    const food = {
      id: this.nextFoodId++,
      name,
      quality,    // 'home_cooked', 'grilled', 'reheated', 'cold', 'junk'
      cookedBy,
      cookedAt: Date.now(),
      room,
      servings,
      consumed: 0,
    };
    this.foods.push(food);
    return food;
  }

  /**
   * Get available food, sorted by freshness.
   */
  getAvailableFood(gameHour) {
    const now = Date.now();
    return this.foods
      .filter(f => f.servings > f.consumed)
      .map(f => {
        const ageHours = (now - f.cookedAt) / 3600000;
        const decay = FOOD_QUALITY_DECAY[f.quality] || FOOD_QUALITY_DECAY.cold;
        let freshness = 'fresh';
        if (ageHours > decay.staleHours) freshness = 'spoiled';
        else if (ageHours > decay.freshHours) freshness = 'stale';
        return { ...f, freshness, ageHours };
      })
      .filter(f => f.freshness !== 'spoiled')
      .sort((a, b) => a.cookedAt - b.cookedAt); // Oldest first (eat before it goes bad)
  }

  /**
   * Consume a serving of food. Returns the food quality or null if not found.
   */
  consumeFood(foodId) {
    const food = this.foods.find(f => f.id === foodId);
    if (!food || food.consumed >= food.servings) return null;
    food.consumed++;
    this.dishesInSink++;
    return food.quality;
  }

  /**
   * Wash dishes. Returns how many were cleaned.
   */
  washDishes() {
    const cleaned = this.dishesInSink;
    this.dishesInSink = 0;
    return cleaned;
  }

  // ═══════════════════════════════════════════════════════════════
  //  MESS SYSTEM
  // ═══════════════════════════════════════════════════════════════

  /**
   * Add mess to a room from an activity category.
   */
  addMess(room, activityCategory) {
    const messAmount = MESS_GENERATORS[activityCategory] || 0;
    if (messAmount > 0 && this.roomMess[room] !== undefined) {
      this.roomMess[room] = Math.min(100, this.roomMess[room] + messAmount);
    }
  }

  /**
   * Clean a room (reduce mess from a cleaning activity).
   */
  cleanRoom(room, activityId) {
    const cleanAmount = MESS_CLEANERS[activityId] || -10;
    if (this.roomMess[room] !== undefined) {
      this.roomMess[room] = Math.max(0, this.roomMess[room] + cleanAmount);
    }
  }

  /**
   * Get the mess level description for a room.
   */
  getRoomMessDescription(room) {
    const level = this.roomMess[room] || 0;
    let desc = 'spotless';
    for (const [threshold, label] of Object.entries(MESS_DESCRIPTIONS)) {
      if (level >= parseInt(threshold)) desc = label;
    }
    return { level, description: desc };
  }

  /**
   * Natural mess decay — rooms slowly get messier from entropy and slightly
   * cleaner in high-traffic areas (people moving things).
   * Called once per game hour.
   */
  tickMess(gameHoursElapsed) {
    // Kids' rooms slowly get messier (entropy)
    this.roomMess.bedroom_kids_shared = Math.min(100,
      this.roomMess.bedroom_kids_shared + 1.5 * gameHoursElapsed);

    // Kitchen gets messy from general use
    this.roomMess.kitchen = Math.min(100,
      this.roomMess.kitchen + 0.5 * gameHoursElapsed);
  }

  // ═══════════════════════════════════════════════════════════════
  //  LAUNDRY SYSTEM
  // ═══════════════════════════════════════════════════════════════

  /**
   * Add dirty clothes to hamper. Called when characters change or after activities.
   */
  addDirtyClothes(count = 1) {
    this.laundry.hamper += count;
  }

  /**
   * Start a wash cycle. Returns false if washer is already running.
   */
  startWasher() {
    if (this.laundry.washer) return false;
    if (this.laundry.hamper <= 0) return false;

    const loadSize = Math.min(this.laundry.hamper, 8); // Max 8 items per load
    this.laundry.hamper -= loadSize;
    this.laundry.washer = { startedAt: Date.now(), loadSize };
    this.laundry.washerDone = false;
    return true;
  }

  /**
   * Move washed clothes to dryer. Returns false if dryer busy or washer not done.
   */
  startDryer() {
    if (!this.laundry.washerDone) return false;
    if (this.laundry.dryer) return false;

    this.laundry.dryer = {
      startedAt: Date.now(),
      loadSize: this.laundry.washer.loadSize,
    };
    this.laundry.washer = null;
    this.laundry.washerDone = false;
    this.laundry.dryerDone = false;
    return true;
  }

  /**
   * Take out dried clothes (adds to clean pile for folding).
   */
  unloadDryer() {
    if (!this.laundry.dryerDone) return false;
    this.laundry.cleanPile += this.laundry.dryer.loadSize;
    this.laundry.dryer = null;
    this.laundry.dryerDone = false;
    return true;
  }

  /**
   * Fold clean clothes.
   */
  foldClothes() {
    const folded = this.laundry.cleanPile;
    this.laundry.cleanPile = 0;
    return folded;
  }

  /**
   * Tick laundry timers. Washer cycle: 30 game-min, dryer cycle: 45 game-min.
   */
  tickLaundry(gameMinutesElapsed) {
    if (this.laundry.washer && !this.laundry.washerDone) {
      const elapsed = (Date.now() - this.laundry.washer.startedAt) / 60000;
      if (elapsed >= 30) { // 30 game-minutes for wash cycle
        this.laundry.washerDone = true;
      }
    }
    if (this.laundry.dryer && !this.laundry.dryerDone) {
      const elapsed = (Date.now() - this.laundry.dryer.startedAt) / 60000;
      if (elapsed >= 45) { // 45 game-minutes for dry cycle
        this.laundry.dryerDone = true;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  BATHROOM OCCUPANCY
  // ═══════════════════════════════════════════════════════════════

  /**
   * Try to enter the bathroom. Returns true if entered, false if occupied.
   */
  enterBathroom(characterName) {
    if (this.bathroomOccupant) {
      // Already occupied — add to queue
      if (!this.bathroomQueue.includes(characterName)) {
        this.bathroomQueue.push(characterName);
      }
      return false;
    }
    this.bathroomOccupant = characterName;
    this.bathroomOccupiedSince = Date.now();
    return true;
  }

  /**
   * Leave the bathroom. Next in queue gets in.
   */
  leaveBathroom(characterName) {
    if (this.bathroomOccupant !== characterName) return null;
    this.bathroomOccupant = null;
    this.bathroomOccupiedSince = null;

    // Next person in queue
    if (this.bathroomQueue.length > 0) {
      const next = this.bathroomQueue.shift();
      this.bathroomOccupant = next;
      this.bathroomOccupiedSince = Date.now();
      return next; // Return who just entered
    }
    return null;
  }

  /**
   * Check if bathroom is occupied and who's waiting.
   */
  getBathroomStatus() {
    return {
      occupied: !!this.bathroomOccupant,
      occupant: this.bathroomOccupant,
      queue: [...this.bathroomQueue],
      waitTime: this.bathroomOccupiedSince
        ? (Date.now() - this.bathroomOccupiedSince) / 1000
        : 0,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  PERCEPTION INTEGRATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get environment description for a room — used by EnvironmentPerception.
   */
  getRoomEnvironment(room) {
    const mess = this.getRoomMessDescription(room);
    const env = { messLevel: mess.level, messDescription: mess.description };

    if (room === 'kitchen') {
      const availableFood = this.getAvailableFood();
      env.availableFood = availableFood.length;
      env.dishesInSink = this.dishesInSink;
      if (this.dishesInSink > 5) {
        env.kitchenNote = 'The sink is piling up with dirty dishes.';
      }
      if (availableFood.length > 0) {
        env.foodNote = `There's ${availableFood.map(f => `${f.name} (${f.freshness})`).join(', ')} available.`;
      }
    }

    if (room === 'laundry') {
      env.hamper = this.laundry.hamper;
      env.washerRunning = !!this.laundry.washer && !this.laundry.washerDone;
      env.washerDone = this.laundry.washerDone;
      env.dryerRunning = !!this.laundry.dryer && !this.laundry.dryerDone;
      env.dryerDone = this.laundry.dryerDone;
      env.cleanPile = this.laundry.cleanPile;
      if (this.laundry.hamper > 5) {
        env.laundryNote = 'The hamper is overflowing.';
      }
      if (this.laundry.washerDone) {
        env.laundryNote = (env.laundryNote || '') + ' The washer is done — needs to be moved to the dryer.';
      }
      if (this.laundry.dryerDone) {
        env.laundryNote = (env.laundryNote || '') + ' The dryer is done — clothes need folding.';
      }
    }

    if (room === 'bathroom') {
      const status = this.getBathroomStatus();
      env.bathroomOccupied = status.occupied;
      env.bathroomOccupant = status.occupant;
      env.bathroomQueue = status.queue;
    }

    return env;
  }

  // ═══════════════════════════════════════════════════════════════
  //  ITEM CARRYING SYSTEM
  // ═══════════════════════════════════════════════════════════════

  /**
   * Character picks up an item.
   * @param {string} characterName
   * @param {string} item — item description (e.g., "plate of food", "coffee mug", "book")
   * @param {string} fromRoom — room where item was picked up
   */
  pickUpItem(characterName, item, fromRoom) {
    this.carrying[characterName] = {
      item,
      pickedUpAt: Date.now(),
      fromRoom,
    };
  }

  /**
   * Character puts down/uses item.
   * @param {string} characterName
   * @returns {object|null} The item that was put down, or null
   */
  putDownItem(characterName) {
    const held = this.carrying[characterName] || null;
    this.carrying[characterName] = null;
    return held;
  }

  /**
   * Get what a character is carrying.
   * @param {string} characterName
   * @returns {object|null} { item, pickedUpAt, fromRoom } or null
   */
  getCarrying(characterName) {
    return this.carrying[characterName] || null;
  }

  // ═══════════════════════════════════════════════════════════════
  //  DOOR STATE SYSTEM
  // ═══════════════════════════════════════════════════════════════

  /**
   * Open or close a door.
   * @param {string} doorId — e.g. 'bathroom_door'
   * @param {boolean} open
   * @param {string} changedBy — character name
   */
  setDoorState(doorId, open, changedBy = null) {
    if (this.doors[doorId]) {
      this.doors[doorId].open = !!open;
      this.doors[doorId].lastChangedBy = changedBy;
      this.doors[doorId].lastChangedAt = Date.now();
    }
  }

  /**
   * Check if a door is open.
   * @param {string} doorId
   * @returns {boolean}
   */
  isDoorOpen(doorId) {
    return this.doors[doorId]?.open ?? true;
  }

  /**
   * Get all door states.
   */
  getDoorStates() {
    return { ...this.doors };
  }

  // ═══════════════════════════════════════════════════════════════
  //  HOT WATER SYSTEM
  // ═══════════════════════════════════════════════════════════════

  /**
   * Start using hot water (shower/bath).
   * @param {string} characterName
   */
  startHotWater(characterName) {
    this.hotWater.usingHotWater = characterName;
  }

  /**
   * Stop using hot water.
   */
  stopHotWater() {
    this.hotWater.usingHotWater = null;
  }

  /**
   * Tick hot water system.
   * @param {number} deltaSeconds — game seconds elapsed
   * @returns {boolean} true if water went cold during this tick
   */
  tickHotWater(deltaSeconds) {
    if (this.hotWater.usingHotWater) {
      this.hotWater.tankLevel = Math.max(0, this.hotWater.tankLevel - this.hotWater.usageRate * deltaSeconds);
      if (this.hotWater.tankLevel <= 0) {
        return true; // Water went cold!
      }
    } else {
      // Recover when not in use
      this.hotWater.tankLevel = Math.min(1.0, this.hotWater.tankLevel + this.hotWater.recoveryRate * deltaSeconds);
    }
    return false;
  }

  /**
   * Get hot water status description.
   */
  getHotWaterStatus() {
    const level = this.hotWater.tankLevel;
    if (level > 0.7) return 'plenty';
    if (level > 0.4) return 'warm';
    if (level > 0.15) return 'lukewarm';
    return 'cold';
  }

  // ═══════════════════════════════════════════════════════════════
  //  CLOTHING SYSTEM
  // ═══════════════════════════════════════════════════════════════

  /**
   * Change a character's clothing state.
   * @param {string} characterName
   * @param {string} outfit — 'casual', 'pajamas', 'swimwear', 'formal'
   */
  changeClothing(characterName, outfit) {
    if (this.clothing[characterName]) {
      this.clothing[characterName].current = outfit;
      this.clothing[characterName].changed = true;
    }
  }

  /**
   * Get a character's current clothing.
   * @param {string} characterName
   * @returns {string} outfit name
   */
  getClothing(characterName) {
    return this.clothing[characterName]?.current || 'casual';
  }

  /**
   * Reset clothing changed flag (for daily reset).
   */
  resetClothingFlags() {
    for (const name of Object.keys(this.clothing)) {
      this.clothing[name].changed = false;
      this.clothing[name].current = 'pajamas'; // Everyone starts in PJs
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  ERRAND / CHORE SYSTEM (goals.md #24)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Initialize errand/chore tracking.
   */
  _initChores() {
    if (this.chores) return;
    this.chores = {
      // Standing chores — repeating daily tasks
      standing: [
        { id: 'make_beds', assignee: null, room: 'master_bedroom', frequency: 'daily', lastDone: null, priority: 3 },
        { id: 'load_dishwasher', assignee: null, room: 'kitchen', frequency: 'daily', lastDone: null, priority: 5 },
        { id: 'wipe_counters', assignee: null, room: 'kitchen', frequency: 'daily', lastDone: null, priority: 4 },
        { id: 'take_out_trash', assignee: null, room: 'kitchen', frequency: 'daily', lastDone: null, priority: 6 },
        { id: 'vacuum_living', assignee: null, room: 'living_room', frequency: 'weekly', lastDone: null, priority: 4 },
        { id: 'clean_bathroom', assignee: null, room: 'bathroom', frequency: 'weekly', lastDone: null, priority: 5 },
        { id: 'mow_lawn', assignee: null, room: '_exterior', frequency: 'weekly', lastDone: null, priority: 3 },
        { id: 'do_laundry', assignee: null, room: 'laundry', frequency: 'every_2_days', lastDone: null, priority: 5 },
        { id: 'water_plants', assignee: null, room: '_exterior', frequency: 'every_2_days', lastDone: null, priority: 2 },
        { id: 'tidy_kids_room', assignee: null, room: 'kids_bedroom', frequency: 'daily', lastDone: null, priority: 3 },
      ],
      // One-off errands assigned dynamically
      errands: [],
      // Completed log for today
      completedToday: [],
    };
  }

  /**
   * Assign a chore to a family member.
   * @param {string} choreId
   * @param {string} assignee — character name
   */
  assignChore(choreId, assignee) {
    this._initChores();
    const chore = this.chores.standing.find(c => c.id === choreId);
    if (chore) {
      chore.assignee = assignee;
      return true;
    }
    return false;
  }

  /**
   * Mark a chore as completed.
   * @param {string} choreId
   * @param {string} characterName — who did it
   */
  completeChore(choreId, characterName) {
    this._initChores();
    const chore = this.chores.standing.find(c => c.id === choreId);
    if (chore) {
      chore.lastDone = Date.now();
      this.chores.completedToday.push({
        choreId,
        doneBy: characterName,
        timestamp: Date.now(),
      });
      return true;
    }
    // Check errands
    const errandIdx = this.chores.errands.findIndex(e => e.id === choreId);
    if (errandIdx >= 0) {
      const errand = this.chores.errands.splice(errandIdx, 1)[0];
      this.chores.completedToday.push({
        choreId: errand.id,
        doneBy: characterName,
        timestamp: Date.now(),
      });
      return true;
    }
    return false;
  }

  /**
   * Add a one-off errand.
   * @param {object} errand — { id, label, assignee, room, priority, description }
   */
  addErrand(errand) {
    this._initChores();
    this.chores.errands.push({
      ...errand,
      addedAt: Date.now(),
    });
  }

  /**
   * Get chores needing attention (overdue or unstarted today).
   * @param {string} [forCharacter] — filter to chores assigned to this person (or unassigned)
   * @returns {Array}
   */
  getPendingChores(forCharacter) {
    this._initChores();
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const twoDaysMs = 2 * oneDayMs;
    const oneWeekMs = 7 * oneDayMs;

    return this.chores.standing.filter(chore => {
      // Filter by character if specified
      if (forCharacter && chore.assignee && chore.assignee !== forCharacter) return false;

      // Check if overdue based on frequency
      if (!chore.lastDone) return true; // Never done
      const elapsed = now - chore.lastDone;
      if (chore.frequency === 'daily' && elapsed > oneDayMs) return true;
      if (chore.frequency === 'every_2_days' && elapsed > twoDaysMs) return true;
      if (chore.frequency === 'weekly' && elapsed > oneWeekMs) return true;
      return false;
    }).concat(
      this.chores.errands.filter(e => !forCharacter || !e.assignee || e.assignee === forCharacter)
    ).sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Reset the daily completed log (call at midnight).
   */
  resetDailyChores() {
    this._initChores();
    this.chores.completedToday = [];
  }

  /**
   * Build a chore summary for LLM prompts.
   * @param {string} characterName
   * @returns {string}
   */
  getChoreNarrative(characterName) {
    const pending = this.getPendingChores(characterName);
    if (pending.length === 0) return '';

    const mine = pending.filter(c => c.assignee === characterName);
    const unassigned = pending.filter(c => !c.assignee);

    const parts = [];
    if (mine.length > 0) {
      parts.push(`My chores: ${mine.map(c => c.id.replace(/_/g, ' ')).join(', ')}`);
    }
    if (unassigned.length > 0 && (characterName === 'Mom' || characterName === 'Dad')) {
      parts.push(`Household tasks nobody's claimed: ${unassigned.slice(0, 3).map(c => c.id.replace(/_/g, ' ')).join(', ')}`);
    }
    return parts.join('. ');
  }

  // ═══════════════════════════════════════════════════════════════
  //  SERIALIZATION
  // ═══════════════════════════════════════════════════════════════

  serialize() {
    // Initialize chores lazily for serialization
    this._initChores();
    return {
      foods: this.foods.filter(f => f.servings > f.consumed).map(f => ({
        name: f.name, quality: f.quality, servings: f.servings - f.consumed,
      })),
      dishesInSink: this.dishesInSink,
      roomMess: { ...this.roomMess },
      laundry: {
        hamper: this.laundry.hamper,
        washerRunning: !!this.laundry.washer && !this.laundry.washerDone,
        washerDone: this.laundry.washerDone,
        dryerRunning: !!this.laundry.dryer && !this.laundry.dryerDone,
        dryerDone: this.laundry.dryerDone,
        cleanPile: this.laundry.cleanPile,
      },
      bathroom: this.getBathroomStatus(),
      carrying: Object.fromEntries(
        Object.entries(this.carrying).filter(([, v]) => v).map(([k, v]) => [k, v.item])
      ),
      doors: Object.fromEntries(
        Object.entries(this.doors).map(([k, v]) => [k, v.open])
      ),
      hotWater: {
        level: Math.round(this.hotWater.tankLevel * 100),
        status: this.getHotWaterStatus(),
      },
      clothing: Object.fromEntries(
        Object.entries(this.clothing).map(([k, v]) => [k, v.current])
      ),
      chores: {
        pending: this.getPendingChores().slice(0, 5).map(c => ({ id: c.id, assignee: c.assignee, priority: c.priority })),
        completedToday: this.chores.completedToday.length,
        errands: this.chores.errands.length,
      },
    };
  }
}

module.exports = WorldState;
