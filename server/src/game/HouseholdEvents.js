/**
 * HouseholdEvents.js — Random environmental and household events.
 *
 * Per goals.md (lines 2221-2233, 2316):
 * - Power outage, plumbing issues, smoke alarm, something breaks
 * - Doorbell, phone call, package delivery
 * - Spider in the bathroom, doorbell interrupts dinner
 * - Accidents: spills (Jack 15%), scraped knees, bumped heads, bed-wetting
 *
 * Events fire probabilistically and create recentEvents entries that
 * flow into the perception → reasoning pipeline.
 *
 * CommonJS module (server-side).
 */

// ── Event Definitions ──────────────────────────────────────────
const EVENT_TYPES = {
  // Household emergencies
  smoke_alarm: {
    label: 'Smoke alarm goes off',
    description: 'The smoke alarm starts BLARING. Someone burned something!',
    hearingRange: 'whole_house',
    room: 'kitchen',
    probability: 0.003, // Per tick when someone is cooking
    triggerCondition: 'cooking',
    duration: 120, // seconds of event relevance
    responses: {
      Mom: 'opens windows and fans the smoke detector',
      Dad: 'grabs a towel to fan the alarm',
      Emma: 'covers her ears',
      Lily: 'runs to Mom scared',
      Jack: 'thinks it\'s AWESOME and LOUD',
    },
  },

  doorbell: {
    label: 'Doorbell rings',
    description: 'DING-DONG! Someone\'s at the front door.',
    hearingRange: 'whole_house',
    room: '_exterior',
    probability: 0.0004, // Per tick, roughly once every ~7 game hours
    triggerCondition: 'daytime', // 8am-8pm
    duration: 60,
    responses: {
      Mom: 'heads to the door',
      Dad: 'looks up from what he\'s doing',
      Jack: 'races to the door screaming WHO IS IT',
      Lily: 'peeks from behind a parent',
      Emma: 'ignores it',
    },
  },

  phone_ring: {
    label: 'Phone rings',
    description: 'The phone is ringing in the kitchen.',
    hearingRange: '2_rooms',
    room: 'kitchen',
    probability: 0.0005,
    triggerCondition: 'daytime',
    duration: 30,
    responses: {
      Mom: 'answers the phone',
      Dad: 'lets it ring, waiting for Sarah to get it',
    },
  },

  package_delivery: {
    label: 'Package at the door',
    description: 'A delivery truck pulls up. There\'s a package on the porch!',
    hearingRange: 'adjacent',
    room: '_exterior',
    probability: 0.0003,
    triggerCondition: 'daytime',
    duration: 120,
    responses: {
      Jack: 'IS IT FOR ME?! IS IT A TOY?!',
      Lily: 'Ooh what did we get?!',
    },
  },

  power_flicker: {
    label: 'Power flickers',
    description: 'The lights flicker and the power goes out for a moment. Everything goes dark, then comes back on.',
    hearingRange: 'whole_house',
    room: null, // affects whole house
    probability: 0.0001,
    triggerCondition: 'always',
    duration: 30,
    responses: {
      Lily: 'screams and grabs the nearest person',
      Jack: 'WOAH COOL!',
      Mom: 'checks if the oven is still on',
      Dad: 'checks the breaker box',
      Emma: 'sighs as her phone loses wifi for a second',
    },
  },

  // Minor household events
  spider_sighting: {
    label: 'Spider spotted',
    description: 'There\'s a spider on the wall!',
    hearingRange: 'same_room',
    room: 'bathroom', // most common spot
    probability: 0.0002,
    triggerCondition: 'always',
    duration: 60,
    responses: {
      Lily: 'SCREAMS and runs out of the room',
      Jack: 'tries to catch it',
      Mom: 'gets a cup and a piece of paper',
      Dad: 'squishes it (sorry, spider)',
      Emma: 'takes a picture of it',
    },
  },

  toilet_clog: {
    label: 'Toilet clogged',
    description: 'The toilet is clogged. Water is rising. This is bad.',
    hearingRange: 'adjacent',
    room: 'bathroom',
    probability: 0.0001,
    triggerCondition: 'always',
    duration: 300,
    responses: {
      Dad: 'gets the plunger. This is a Dad job.',
      Mom: 'yells for Dave',
      Jack: 'It wasn\'t me! (It was definitely him.)',
    },
  },

  loud_noise_outside: {
    label: 'Loud noise outside',
    description: 'A loud noise from outside — maybe a car backfiring or a neighbor\'s lawnmower.',
    hearingRange: '2_rooms',
    room: '_exterior',
    probability: 0.0003,
    triggerCondition: 'daytime',
    duration: 15,
  },

  // ── Serendipitous micro-events ─────────────────────────────────
  // These create spontaneous family moments and conversation sparks.

  found_lost_item: {
    label: 'Lost item found!',
    description: 'Someone found something that\'s been missing for days — behind the couch cushions.',
    hearingRange: 'same_room',
    room: 'living_room',
    probability: 0.0003,
    triggerCondition: 'daytime',
    duration: 90,
    responses: {
      Jack: 'MY DINOSAUR!! I FOUND MY DINOSAUR!! MOOOOM!',
      Lily: 'I found my purple crayon! I looked EVERYWHERE!',
      Emma: 'Finally. My earbuds have been missing for a week.',
      Mom: 'Oh! I\'ve been looking for that recipe card forever.',
      Dad: 'So that\'s where the remote went.',
    },
  },

  funny_commercial: {
    label: 'Hilarious TV moment',
    description: 'Something on TV is unexpectedly hilarious — a funny commercial, a silly moment, a bloopers reel.',
    hearingRange: 'same_room',
    room: 'living_room',
    probability: 0.0005,
    triggerCondition: 'daytime',
    duration: 30,
    responses: {
      Jack: 'HAHAHA DID YOU SEE THAT?! DAD, DID YOU SEE THAT??',
      Lily: 'giggling and covering her mouth',
      Emma: 'snorts, then pretends she didn\'t',
      Dad: 'laughs genuinely — that got him',
      Mom: 'laughs despite herself while trying to fold laundry',
    },
  },

  song_comes_on: {
    label: 'Perfect song comes on',
    description: 'A song comes on the radio that someone loves — maybe a throwback, maybe a current hit.',
    hearingRange: '2_rooms',
    room: 'kitchen',
    probability: 0.0004,
    triggerCondition: 'daytime',
    duration: 180,
    responses: {
      Mom: 'starts singing along under her breath, then louder',
      Dad: 'drums his fingers on the counter — this is a good one',
      Emma: 'turns it up without asking',
      Lily: 'starts moving her hips immediately',
      Jack: 'DANCE PARTY! DANCE PARTY! makes everyone stop what they\'re doing',
    },
  },

  nice_weather_surprise: {
    label: 'Perfect weather beckons',
    description: 'The light coming through the window is golden and perfect. It looks AMAZING outside.',
    hearingRange: 'same_room',
    room: 'living_room',
    probability: 0.0003,
    triggerCondition: 'daytime',
    duration: 300,
    responses: {
      Jack: 'MOM CAN WE GO OUTSIDE? PLEASE? RIGHT NOW? CAN WE?',
      Lily: 'tugs on whoever\'s sleeve — "can we go in the backyard?"',
      Dad: 'peers out the window and considers taking a walk',
      Mom: 'opens the windows to let the fresh air in',
      Emma: 'moves her drawing stuff to the porch',
    },
  },

  old_photo_found: {
    label: 'Old photo discovered',
    description: 'Someone found an old family photo tucked in a drawer or a book — the kids are so young!',
    hearingRange: 'same_room',
    room: '_any',
    probability: 0.0002,
    triggerCondition: 'always',
    duration: 120,
    responses: {
      Mom: 'aches with sudden nostalgia. "Look how little you all were..."',
      Dad: 'grins. "Emma\'s first bike. She cried for an hour before she pedaled."',
      Emma: 'embarrassed but smiling — "okay that\'s actually cute"',
      Jack: 'WHO IS THAT? IS THAT ME? I\'M SO SMALL!!',
      Lily: 'wants to show everyone in the house',
    },
  },

  something_burning_smell: {
    label: 'Something smells burnt',
    description: 'A faint burnt smell drifts through the house — did someone forget something on the stove?',
    hearingRange: '2_rooms',
    room: 'kitchen',
    probability: 0.0003,
    triggerCondition: 'cooking',
    duration: 60,
    responses: {
      Mom: 'immediately heads to the kitchen — her cooking sense is tingling',
      Dad: 'sniffs the air and frowns',
      Jack: 'IS IT FIRE? IS THE HOUSE ON FIRE?',
      Lily: 'grabs Mom\'s hand',
    },
  },

  compliment_moment: {
    label: 'Spontaneous compliment opportunity',
    description: 'One of the kids does something sweet or impressive right in front of a parent.',
    hearingRange: 'same_room',
    room: '_any',
    probability: 0.0004,
    triggerCondition: 'daytime',
    duration: 60,
    responses: {
      Dad: 'notices and says something genuine: "Hey, that\'s really good."',
      Mom: 'lights up and squeezes the kid\'s shoulder',
    },
  },

  jack_superhero_entrance: {
    label: 'Jack makes a dramatic entrance',
    description: 'Jack bursts into the room wearing his cape, making explosion sounds. BOOM. CRASHHH. WHOOSH.',
    hearingRange: 'adjacent',
    room: '_any',
    probability: 0.0005,
    triggerCondition: 'daytime',
    duration: 45,
    responses: {
      Dad: 'holds up his fist for a bump without looking up',
      Mom: 'jumps slightly, then laughs',
      Emma: '"Jack, I swear to god—"',
      Lily: 'immediately wants to join the superhero game',
    },
  },

  art_project_displayed: {
    label: 'Someone shows off their artwork',
    description: 'Lily brings her painting to show everyone, or Emma leaves her sketchbook open to a really impressive page.',
    hearingRange: 'same_room',
    room: 'living_room',
    probability: 0.0003,
    triggerCondition: 'daytime',
    duration: 90,
    responses: {
      Mom: 'genuinely impressed. "Oh honey, this is beautiful."',
      Dad: '"You\'re gonna be a real artist someday."',
      Jack: 'immediately wants to draw something to show too',
      Emma: 'if it\'s Lily\'s art: compliments her sincerely for once',
    },
  },

  spilled_snack_chaos: {
    label: 'Snack disaster',
    description: 'A bag of chips or a bowl of popcorn goes flying. Snacks EVERYWHERE.',
    hearingRange: 'same_room',
    room: 'living_room',
    probability: 0.0003,
    triggerCondition: 'always',
    duration: 60,
    responses: {
      Jack: '...oh no. (pause) FIVE SECOND RULE!',
      Lily: 'JACK! You\'re gonna get us in trouble!',
      Emma: 'stares. "I\'m not cleaning that up."',
      Mom: 'sighs. Gets paper towels.',
      Dad: 'makes eye contact with Mom. This is his life now.',
    },
  },
};

// ── Accident Probabilities ─────────────────────────────────────
// Per goals.md: Jack spill probability 15% when carrying things
const ACCIDENT_PROBABILITIES = {
  // Spill while eating/drinking (per eating interaction)
  spill: {
    Jack: 0.15,   // "clumsy child + full glass + running speed"
    Lily: 0.06,
    Emma: 0.02,
    Dad: 0.01,
    Mom: 0.005,
  },

  // Scraped knee while playing outside (per outdoor play session)
  scraped_knee: {
    Jack: 0.08,
    Lily: 0.04,
    Emma: 0.01,
  },

  // Burn while cooking (per cooking interaction, modified by skill)
  // Refined per goals.md: severity tiers, character-specific, multi-type
  cooking_burn: {
    base: 0.05, // Modified by 1 - (cookingSkill / 150)
    types: ['stovetop_splash', 'oven_grab', 'steam_burn', 'grease_pop'],
  },

  // Trip/fall while running (per running/active play)
  trip: {
    Jack: 0.10,
    Lily: 0.03,
  },

  // Bed-wetting (per night, Jack only, higher if drank a lot)
  bed_wetting: {
    Jack: 0.08, // Base probability, increased by evening hydration
  },
};

/**
 * Check for accidents during an activity.
 *
 * @param {string} characterName - Who's doing the activity
 * @param {string} activityCategory - Category of the current activity
 * @param {object} options - { skills, needs, isOutdoor, timeOfDay }
 * @returns {object|null} Accident event or null
 */
function checkForAccident(characterName, activityCategory, options = {}) {
  const { skills = {}, needs = {}, isOutdoor = false } = options;

  // Spills during eating/drinking
  if (activityCategory === 'eating' || activityCategory === 'cooking') {
    const spillChance = ACCIDENT_PROBABILITIES.spill[characterName] || 0;
    if (spillChance > 0 && Math.random() < spillChance) {
      return {
        type: 'accident',
        subtype: 'spill',
        character: characterName,
        description: _describeSpill(characterName),
        hearingRange: 'adjacent',
        room: null, // set by caller
        mess: 10 + Math.random() * 15, // mess points
        needsEffect: { hygiene: -5 },
        timestamp: Date.now(),
      };
    }
  }

  // Cooking burns (skill-gated, severity-tiered per goals.md)
  if (activityCategory === 'cooking') {
    const cookingSkill = skills.cooking || 20;
    const burnChance = ACCIDENT_PROBABILITIES.cooking_burn.base * (1 - cookingSkill / 150);
    if (burnChance > 0 && Math.random() < burnChance) {
      // Pick burn type
      const burnTypes = ACCIDENT_PROBABILITIES.cooking_burn.types;
      const burnType = burnTypes[Math.floor(Math.random() * burnTypes.length)];

      // Severity scales with low skill — beginners get worse burns
      const severityRoll = Math.random();
      const skillPenalty = (100 - cookingSkill) / 100; // 0.0 (expert) to 1.0 (novice)
      const severity = severityRoll * 0.5 + skillPenalty * 0.5 > 0.6 ? 'serious' : 'minor';

      const pronoun = (characterName === 'Mom' || characterName === 'Emma' || characterName === 'Lily') ? 'her' : 'his';

      const burnDescriptions = {
        stovetop_splash: {
          minor: `${characterName} splashed a bit of hot liquid on ${pronoun} hand. Stings!`,
          serious: `${characterName} got a nasty splash of boiling water. That's going to blister.`,
        },
        oven_grab: {
          minor: `${characterName} touched the hot oven rack without a mitt. Ouch!`,
          serious: `${characterName} grabbed a hot pan barehanded! ${pronoun === 'her' ? 'She' : 'He'} yelps in pain.`,
        },
        steam_burn: {
          minor: `${characterName} got a puff of steam in ${pronoun} face opening a pot.`,
          serious: `${characterName} got scalded by steam. The pot lid came off too fast!`,
        },
        grease_pop: {
          minor: `Hot grease popped and got ${characterName}'s arm. Small red mark.`,
          serious: `Grease popped and spattered ${characterName}'s hand badly. That needs cold water NOW.`,
        },
      };

      const comfortHit = severity === 'serious' ? -20 : -8;
      const energyHit = severity === 'serious' ? -10 : -3;

      return {
        type: 'accident',
        subtype: 'cooking_burn',
        burnType,
        severity,
        character: characterName,
        description: burnDescriptions[burnType]?.[severity] || `${characterName} burned ${pronoun} hand on the stove!`,
        hearingRange: severity === 'serious' ? '2_rooms' : 'adjacent',
        room: 'kitchen',
        needsEffect: { comfort: comfortHit, energy: energyHit },
        triggersAlarm: severity === 'serious' && burnType === 'grease_pop',
        timestamp: Date.now(),
      };
    }
  }

  // Scraped knees while playing outside
  if (isOutdoor && (activityCategory === 'active' || activityCategory === 'fun')) {
    const scrapeChance = ACCIDENT_PROBABILITIES.scraped_knee[characterName] || 0;
    if (scrapeChance > 0 && Math.random() < scrapeChance) {
      return {
        type: 'accident',
        subtype: 'scraped_knee',
        character: characterName,
        description: _describeScrape(characterName),
        hearingRange: characterName === 'Jack' || characterName === 'Lily' ? '2_rooms' : 'same_room',
        room: '_exterior',
        needsEffect: { comfort: -10, fun: -5 },
        timestamp: Date.now(),
      };
    }
  }

  // Tripping while running
  if (activityCategory === 'active') {
    const tripChance = ACCIDENT_PROBABILITIES.trip[characterName] || 0;
    if (tripChance > 0 && Math.random() < tripChance) {
      return {
        type: 'accident',
        subtype: 'trip',
        character: characterName,
        description: `${characterName} tripped and fell!`,
        hearingRange: 'adjacent',
        room: null,
        needsEffect: { comfort: -8 },
        timestamp: Date.now(),
      };
    }
  }

  return null;
}

/**
 * Check for bed-wetting (called during nighttime processing).
 *
 * @param {string} characterName
 * @param {number} hydrationLevel - Current hydration need (higher = more hydrated = more risk)
 * @returns {object|null}
 */
function checkForBedWetting(characterName, hydrationLevel) {
  const baseChance = ACCIDENT_PROBABILITIES.bed_wetting[characterName];
  if (!baseChance) return null;

  // Higher hydration (well-hydrated = bladder more full) increases risk
  // hydrationLevel is 0-100, where 100 = fully hydrated
  const hydrationBonus = Math.max(0, (hydrationLevel - 60) / 100); // 0-0.4 bonus
  const chance = baseChance + hydrationBonus;

  if (Math.random() < chance) {
    return {
      type: 'accident',
      subtype: 'bed_wetting',
      character: characterName,
      description: `${characterName} had an accident. The bed needs to be changed.`,
      hearingRange: 'adjacent',
      room: 'kids_bedroom',
      needsEffect: { hygiene: -30, comfort: -25, bladder: 100 },
      needsParent: true,
      timestamp: Date.now(),
    };
  }
  return null;
}

/**
 * Roll for random environmental events.
 * Call each tick. Returns array of triggered events.
 *
 * @param {number} hour - Current game hour
 * @param {Array} family - All family members
 * @param {object} worldState - WorldState instance (for cooking/bathroom context)
 * @returns {Array} Triggered events
 */
function rollEnvironmentalEvents(hour, family, worldState) {
  const events = [];
  const isDaytime = hour >= 8 && hour <= 20;

  for (const [eventId, eventDef] of Object.entries(EVENT_TYPES)) {
    // Check trigger condition
    if (eventDef.triggerCondition === 'daytime' && !isDaytime) continue;

    // Special: cooking-triggered events
    if (eventDef.triggerCondition === 'cooking') {
      const someoneCooking = family.some(m =>
        m.activityLabel && m.activityLabel.toLowerCase().includes('cook')
      );
      if (!someoneCooking) continue;
    }

    // Probabilistic roll
    if (Math.random() < eventDef.probability) {
      const event = {
        id: `evt_${eventId}_${Date.now()}`,
        type: eventDef.label ? 'household_event' : 'event',
        subtype: eventId,
        description: eventDef.description,
        hearingRange: eventDef.hearingRange,
        room: eventDef.room,
        responses: eventDef.responses || {},
        timestamp: Date.now(),
        duration: eventDef.duration,
      };
      events.push(event);
      console.log(`[HouseholdEvent] ${eventDef.label} triggered at hour ${hour.toFixed(1)}`);
    }
  }

  return events;
}

// ── Helper descriptions ────────────────────────────────────────

function _describeSpill(name) {
  const spills = {
    Jack: [
      'Jack knocked over his glass! Juice everywhere!',
      'Jack\'s milk goes flying across the table!',
      'Jack bumped his plate and food went everywhere.',
    ],
    Lily: [
      'Lily accidentally tipped over her cup.',
      'Oops! Lily\'s drink spilled.',
    ],
    Emma: ['Emma\'s glass slipped. Small mess.'],
    Dad: ['Dave knocked over his coffee. Quick cleanup.'],
    Mom: ['Sarah\'s mug tipped — coffee on the counter.'],
  };
  const options = spills[name] || [`${name} spilled something.`];
  return options[Math.floor(Math.random() * options.length)];
}

function _describeScrape(name) {
  const scrapes = {
    Jack: [
      'Jack tripped and scraped his knee! He\'s trying not to cry.',
      'Jack fell off the swing and scraped his elbow!',
      'Jack ran into something and bumped his head. OW!',
    ],
    Lily: [
      'Lily fell and scraped her knee. Tears incoming.',
      'Lily stumbled and hurt her hand.',
    ],
    Emma: ['Emma scraped her knee. She\'s fine. It\'s fine. Everything\'s fine.'],
  };
  const options = scrapes[name] || [`${name} got a scrape.`];
  return options[Math.floor(Math.random() * options.length)];
}

module.exports = {
  checkForAccident,
  checkForBedWetting,
  checkForIllness,
  rollEnvironmentalEvents,
  rollSleepInterruption,
  ACCIDENT_PROBABILITIES,
  EVENT_TYPES,
};

// ═══════════════════════════════════════════════════════════════
//  ILLNESS / SICKNESS SYSTEM (goals.md)
// ═══════════════════════════════════════════════════════════════

/**
 * Per goals.md: characters can get sick. Low hygiene and energy increase odds.
 * Illness debuffs multiple needs and restricts activities.
 *
 * Illness types: cold, stomach_bug, headache
 *
 * @param {object} member — family member state
 * @param {object} personaState — persona state
 * @param {number} gameHour — current hour
 * @returns {object|null} illness event or null
 */
function checkForIllness(member, personaState, gameHour) {
  // Already sick? Skip
  if (personaState._illness) return null;

  const needs = member.needs || {};
  const hygiene = needs.hygiene || 50;
  const energy = needs.energy || 50;

  // Base probability: very low (0.1% per tick-check)
  let probability = 0.001;

  // Low hygiene increases chance significantly
  if (hygiene < 25) probability += 0.003;
  else if (hygiene < 40) probability += 0.001;

  // Low energy (immune system weakened)
  if (energy < 20) probability += 0.002;
  else if (energy < 35) probability += 0.001;

  // Kids get sick more easily
  const age = member.name === 'Jack' ? 6 : member.name === 'Lily' ? 8 : member.name === 'Emma' ? 14 : 35;
  if (age < 10) probability *= 1.5;

  if (Math.random() > probability) return null;

  // Pick illness type
  const types = [
    { type: 'cold', duration: 120, label: 'has a cold', needsEffects: { energy: -0.3, comfort: -0.2, social: -0.1 } },
    { type: 'stomach_bug', duration: 60, label: 'has a stomach ache', needsEffects: { hunger: -0.4, comfort: -0.3, energy: -0.2 } },
    { type: 'headache', duration: 45, label: 'has a headache', needsEffects: { fun: -0.3, comfort: -0.2, energy: -0.1 } },
  ];
  const illness = types[Math.floor(Math.random() * types.length)];

  personaState._illness = {
    ...illness,
    startedAt: Date.now(),
    gameHourStarted: gameHour,
    recoversAtHour: gameHour + illness.duration / 60,
  };

  const descriptions = {
    Jack: { cold: 'Jack is sniffling and his nose is running.', stomach_bug: 'Jack says his tummy hurts.', headache: 'Jack says his head feels funny.' },
    Lily: { cold: 'Lily has the sniffles. She looks miserable.', stomach_bug: 'Lily doesn\'t feel well — her stomach hurts.', headache: 'Lily says her head hurts and she wants Mommy.' },
    Emma: { cold: 'Emma\'s voice is raspy. She\'s definitely coming down with something.', stomach_bug: 'Emma feels nauseous. Great. Just great.', headache: 'Emma has a splitting headache. She needs quiet.' },
    Dad: { cold: 'Dave has a cold. He\'ll be fine. He says he\'s fine. (He\'s not fine.)', stomach_bug: 'Dave\'s stomach is off. He\'s trying to power through it.', headache: 'Dave has a headache. He needs aspirin.' },
    Mom: { cold: 'Sarah has a cold but she\'s still running the household because who else will?', stomach_bug: 'Sarah\'s stomach is upset. She\'s still checking on everyone else first.', headache: 'Sarah has a headache from the chaos. Or maybe she\'s just sick.' },
  };

  return {
    type: 'illness',
    subtype: illness.type,
    character: member.name,
    description: descriptions[member.name]?.[illness.type] || `${member.name} ${illness.label}.`,
    needsEffects: illness.needsEffects,
    hearingRange: 'same_room',
    timestamp: Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════════
//  SLEEP INTERRUPTION EVENTS (goals.md)
// ═══════════════════════════════════════════════════════════════

/**
 * Per goals.md: sleeping characters can be woken by loud events.
 * Nightmares, needing the bathroom, and ambient noise.
 *
 * @param {object} member — sleeping family member
 * @param {number} gameHour
 * @returns {object|null} interruption event or null
 */
function rollSleepInterruption(member, gameHour) {
  // Only during sleeping hours
  if (gameHour >= 6 && gameHour < 20) return null;

  // Very low base probability per check (called each tick)
  let probability = 0.0005;

  // Kids more likely to have sleep interruptions
  if (member.name === 'Jack') probability = 0.001;    // Jack needs bathroom, nightmares
  if (member.name === 'Lily') probability = 0.0008;    // Lily gets nightmares, afraid of dark

  if (Math.random() > probability) return null;

  // Pick interruption type
  const types = {
    Jack: [
      { type: 'bathroom_need', description: 'Jack wakes up — he really needs to pee!', urgency: 'high' },
      { type: 'nightmare', description: 'Jack had a bad dream. He\'s scared.', urgency: 'medium' },
      { type: 'thirsty', description: 'Jack woke up thirsty. He wants water.', urgency: 'low' },
    ],
    Lily: [
      { type: 'nightmare', description: 'Lily had a nightmare! She\'s crying for Mommy.', urgency: 'high' },
      { type: 'scared_of_dark', description: 'Lily woke up and it\'s too dark. She\'s scared.', urgency: 'medium' },
      { type: 'bathroom_need', description: 'Lily needs to use the bathroom.', urgency: 'low' },
    ],
    Emma: [
      { type: 'insomnia', description: 'Emma can\'t sleep. Her brain won\'t shut off.', urgency: 'low' },
    ],
    Dad: [
      { type: 'noise', description: 'Dave heard a noise and woke up. Probably nothing.', urgency: 'low' },
    ],
    Mom: [
      { type: 'worry', description: 'Sarah woke up thinking about tomorrow\'s to-do list.', urgency: 'low' },
      { type: 'kid_check', description: 'Sarah woke up to check on the kids.', urgency: 'low' },
    ],
  };

  const options = types[member.name] || [{ type: 'noise', description: `${member.name} woke up.`, urgency: 'low' }];
  const event = options[Math.floor(Math.random() * options.length)];

  return {
    type: 'sleep_interruption',
    subtype: event.type,
    character: member.name,
    description: event.description,
    urgency: event.urgency,
    hearingRange: event.urgency === 'high' ? 'adjacent' : 'same_room',
    timestamp: Date.now(),
  };
}
