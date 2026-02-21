/**
 * NeedsNarrator.js — Personality-filtered body sensation narration.
 *
 * Translates raw need numbers (0-100) into first-person body sensation
 * descriptions THROUGH the character's personality. The LLM never sees
 * "hunger: 28" — it sees "Your stomach is growling. You haven't eaten
 * since breakfast and that was just toast."
 *
 * This is the key to non-deterministic behavior: characters don't
 * optimize numbers. They FEEL sensations filtered through personality.
 *
 * Per goals.md:
 *   - Jack ignores bladder until emergency, ignores hygiene, treats food as always urgent
 *   - Emma ignores social (introvert), sacrifices sleep for reading, food low priority when drawing
 *   - Lily's social need for MOM is huge, comfort very important, stops eating if upset
 *   - Dad's coffee overrides morning needs, work suppresses hunger, falls asleep at low energy
 *   - Mom ignores hunger caring for others, hygiene matters to identity, dramatic energy crashes
 *
 * CommonJS module (server-side).
 */

const { getPersona } = require('./PersonaManager');

// ── Character-specific need quirks (from goals.md) ──────────────
const CHARACTER_QUIRKS = {
  Dad: {
    energy: {
      style: 'steady',
      quirk: 'Falls asleep on the couch when energy drops below 30 regardless of what he\'s doing.',
      morningOverride: 'Coffee is sacred — don\'t talk to Dad before coffee.',
      suppressedBy: null,
    },
    hunger: {
      style: 'moderate',
      quirk: 'Work focus suppresses hunger during work hours. Barely notices he\'s hungry until someone mentions food.',
      workHoursSuppression: true,
    },
    social: {
      style: 'introverted-moderate',
      quirk: 'Social need spikes after 5 PM when work is done. Craves family interaction in the evening.',
      suppressedDuring: [8, 17], // work hours
    },
    bladder: { style: 'normal', quirk: 'Methodical — uses the bathroom on a schedule.' },
    hygiene: { style: 'normal', quirk: 'Showers every morning without fail. It\'s part of the routine.' },
    fun: { style: 'dry', quirk: 'Finds fixing things satisfying. Dad jokes ARE his fun.' },
    comfort: { style: 'stoic', quirk: 'Doesn\'t complain much about discomfort. Endures silently.' },
  },
  Mom: {
    energy: {
      style: 'bursts-and-crashes',
      quirk: 'Fine at 75, struggling at 65, barely functioning at 50. Energy crashes are dramatic and sudden.',
      crashThreshold: 65,
    },
    hunger: {
      style: 'self-neglecting',
      quirk: 'Always feeds everyone else first. Forgets to eat while taking care of the family. By 2 PM she realizes she\'s had nothing since a piece of toast.',
    },
    social: {
      style: 'needs-adult-conversation',
      quirk: 'Social need is specifically for ADULT conversation, not just kid interaction. A whole day of "Mommy, Mommy, Mommy" doesn\'t satisfy it.',
    },
    hygiene: {
      style: 'identity',
      quirk: 'Hygiene and appearance matter to her sense of self. Feels wrong if she hasn\'t showered by 8 AM.',
    },
    bladder: { style: 'normal', quirk: 'Holds it because there\'s always something more important to do.' },
    fun: { style: 'rare-moments', quirk: 'Fun feels guilty when chores aren\'t done. Gets enjoyment from cooking and garden.' },
    comfort: { style: 'aware', quirk: 'Notices physical discomfort but pushes through until evening.' },
  },
  Emma: {
    energy: {
      style: 'night-owl',
      quirk: 'Miserable before 10 AM. Comes alive at night. Sacrifices sleep for reading — stays up past bedtime with a book.',
      morningMisery: true,
    },
    hunger: {
      style: 'distracted',
      quirk: 'Food is low priority when drawing or reading. Can go hours without eating if absorbed. Prefers making her own choices about what to eat.',
    },
    social: {
      style: 'introvert-in-denial',
      quirk: 'Ignores social need. Says she wants to be alone. Actually lonely but won\'t admit it. Social battery drains slow but refills slow too.',
    },
    hygiene: {
      style: 'independent',
      quirk: 'Hates being TOLD to shower but does it on her own schedule. Will push back if nagged.',
    },
    bladder: { style: 'normal', quirk: 'Normal awareness.' },
    fun: { style: 'absorbing', quirk: 'Reading and drawing are deeply satisfying. Repetitive tasks bore her fast.' },
    comfort: { style: 'particular', quirk: 'Very particular about her personal space. Needs her own corner.' },
  },
  Lily: {
    energy: {
      style: 'gentle',
      quirk: 'Moderate energy. Gets cranky when tired but recovers with naps. Needs her nightlight to sleep.',
    },
    hunger: {
      style: 'emotional-eater',
      quirk: 'Stops eating if upset. Suspicious of new foods. Eats well when happy and surrounded by family.',
    },
    social: {
      style: 'mommy-dependent',
      quirk: 'Social need for MOM specifically is HUGE. Runs to Mom when sad, scared, excited, bored. Also attached to Dad when scared. Clingy when tired.',
    },
    hygiene: {
      style: 'enjoys-baths',
      quirk: 'Enjoys bath time if she has bath toys. Needs help with hair. Forgets to brush teeth without reminders.',
    },
    bladder: { style: 'normal', quirk: 'Can handle it normally but frightened to go alone at night.' },
    fun: { style: 'imaginative', quirk: 'Creates entire worlds with art supplies. Mr. Whiskers is always having adventures.' },
    comfort: {
      style: 'very-sensitive',
      quirk: 'Notices physical discomfort intensely. Wet clothes are MISERABLE. Needs Clover the bunny to feel safe.',
    },
  },
  Jack: {
    energy: {
      style: 'explosive',
      quirk: 'Never stops moving. Runs on fumes. Has explosive energy but crashes hard — goes from 100 to asleep in minutes.',
    },
    hunger: {
      style: 'always-urgent',
      quirk: 'Food is ALWAYS urgent to Jack, even when it isn\'t. "CAN I HAVE A SNACK?" every 30 minutes. Won\'t eat vegetables except corn.',
    },
    social: {
      style: 'desperate-for-attention',
      quirk: 'Extroverted and lonely fast. Pesters everyone for attention. Barges into rooms. Makes sound effects to get noticed.',
    },
    hygiene: {
      style: 'zero-awareness',
      quirk: 'Completely ignores hygiene. Would never shower voluntarily. Actively fights bath time. Hides under the bed.',
    },
    bladder: {
      style: 'ignores-until-emergency',
      quirk: 'Will ignore bladder until it\'s a SCREAMING EMERGENCY. Then panics. "I GOTTA GO RIGHT NOW!"',
    },
    fun: { style: 'constant-need', quirk: 'Boredom is his worst enemy. Starts destroying things for entertainment when bored.' },
    comfort: { style: 'oblivious', quirk: 'Doesn\'t notice discomfort. Runs around covered in mud without caring.' },
  },
};

/**
 * Generate a personality-filtered, first-person body sensation narrative
 * for the character's current needs state.
 *
 * @param {string} name - Character name (Dad, Mom, Emma, Lily, Jack)
 * @param {object} needs - Raw needs values { energy, hunger, hygiene, social, fun, comfort, bladder }
 * @param {number} gameHour - Current game hour (0-24 float)
 * @param {object} context - { lastMeal, currentActivity, recentConversations, mood, weather }
 * @returns {string} First-person body sensation narrative
 */
function narrateNeeds(name, needs, gameHour, context = {}) {
  const persona = getPersona(name);
  const quirks = CHARACTER_QUIRKS[name] || {};
  if (!persona || !needs) return 'You feel... okay. Nothing specific stands out.';

  const lines = [];

  // ── Energy ──
  lines.push(_narrateEnergy(name, needs.energy || 50, gameHour, quirks.energy, persona));

  // ── Hunger ──
  lines.push(_narrateHunger(name, needs.hunger || 50, gameHour, quirks.hunger, persona, context));

  // ── Physical (Hygiene + Comfort + Weather) ──
  lines.push(_narratePhysical(name, needs.hygiene || 50, needs.comfort || 50, gameHour, quirks.hygiene, quirks.comfort, persona, context.weather));

  // ── Bladder (only mention if relevant) ──
  const bladderLine = _narrateBladder(name, needs.bladder || 50, quirks.bladder, persona);
  if (bladderLine) lines.push(bladderLine);

  // ── Social ──
  lines.push(_narrateSocial(name, needs.social || 50, gameHour, quirks.social, persona, context));

  // ── Fun / Boredom ──
  lines.push(_narrateFun(name, needs.fun || 50, quirks.fun, persona, context));

  // ── Anti-optimization directive ──
  lines.push(_buildAntiOptimizationDirective(name, quirks));

  return lines.filter(Boolean).join('\n\n');
}

// ── Individual need narrators ────────────────────────────────────

function _narrateEnergy(name, value, gameHour, quirk, persona) {
  const style = quirk?.style || 'normal';
  let desc = '';

  if (value > 80) {
    if (style === 'explosive') desc = `You're BUZZING with energy — you feel like you could run a marathon and then run it again backwards. Your whole body wants to MOVE.`;
    else if (style === 'night-owl' && gameHour < 10) desc = `You're... awake. Barely. Your body is technically at full energy but your brain hasn't started yet. Mornings are the worst.`;
    else if (style === 'steady') desc = `You feel alert and focused. Good energy. Clear head. Ready for whatever needs doing.`;
    else if (style === 'bursts-and-crashes') desc = `You're feeling great right now — riding a wave of energy. Enjoy it while it lasts because you know the crash is coming later.`;
    else desc = `You feel well-rested and energetic. Good to go.`;
  } else if (value > 60) {
    if (style === 'explosive') desc = `Still got plenty of juice! You're bouncing around but not at MAX SPEED. Maybe 80% speed. Which is still faster than most people.`;
    else if (style === 'night-owl' && gameHour >= 20) desc = `Now THIS is when you come alive. Evening energy is your thing. You could stay up for hours.`;
    else if (style === 'night-owl' && gameHour < 10) desc = `Every muscle in your body wants to go back to bed. You're dragging yourself through the morning like a zombie.`;
    else if (style === 'bursts-and-crashes') desc = `You feel a slight dip but you're powering through. Keep moving, keep the momentum going — if you sit down you might not get back up.`;
    else desc = `You feel fine. Normal energy. A slight afternoon heaviness, maybe.`;
  } else if (value > 40) {
    if (style === 'explosive') desc = `You're... slowing down? That's weird. Your body is telling you stuff but you don't want to listen. Maybe you need a snack or something.`;
    else if (style === 'bursts-and-crashes') desc = `Oh no. You can feel the crash coming. That familiar heaviness in your limbs, that fog settling in your head. You need to push through this or you'll collapse on the couch and lose the whole afternoon.`;
    else if (style === 'steady') desc = `You notice you're getting a little tired. Nothing serious, but your focus is wandering. Maybe a coffee would help.`;
    else desc = `You're getting tired. Your body feels a bit heavy.`;
  } else if (value > 20) {
    if (style === 'explosive') desc = `You went from 100 to 10 in like five minutes. Your whole body feels like it's made of concrete. You could fall asleep standing up.`;
    else if (style === 'bursts-and-crashes') desc = `The crash hit you like a truck. Your eyelids are heavy, your arms feel like lead, and everything seems like too much effort. You NEED to sit down or you might fall down.`;
    else if (style === 'steady') desc = `You're genuinely tired now. ${quirk?.quirk?.includes('Falls asleep') ? 'You could feel yourself nodding off if you sat down...' : 'You should rest soon.'}`;
    else if (style === 'night-owl') desc = `Even you, the night owl, are running on fumes. Your body is done. Your eyes burn.`;
    else desc = `You're exhausted. Everything feels like too much effort.`;
  } else {
    if (style === 'explosive') desc = `You hit the wall. One second you were running, the next you're lying on the floor. Your body literally will not move anymore. Sleep. NOW.`;
    else if (style === 'bursts-and-crashes') desc = `You can barely keep your eyes open. The world is swimming. You need to stop everything and sleep — your body is shutting down whether you want it to or not.`;
    else desc = `You can barely stay awake. Your body is shutting down. You need sleep more than anything.`;
  }

  return `YOUR ENERGY:\n${desc}`;
}

function _narrateHunger(name, value, gameHour, quirk, persona, context) {
  const style = quirk?.style || 'normal';
  let desc = '';

  if (value > 70) {
    if (style === 'always-urgent') desc = `You ate recently but honestly you could eat again. Is there anything good in the kitchen? Maybe cookies? ARE THERE COOKIES LEFT?`;
    else if (style === 'self-neglecting') desc = `You're not hungry — wait, actually, when did you last eat? You think about it and... you ate. Yes. You're fine.`;
    else desc = `Your stomach is satisfied. No hunger.`;
  } else if (value > 50) {
    if (style === 'always-urgent') desc = `You're STARVING. Okay maybe not starving but you could DEFINITELY eat something right now. Like a big something. Or twelve small somethings.`;
    else if (style === 'self-neglecting') desc = `You're starting to notice your stomach. But the kids need... and the laundry is... okay you'll eat later.`;
    else if (style === 'distracted' && context.currentActivity) desc = `Your stomach is sending vague signals but you're absorbed in what you're doing. Food can wait.`;
    else if (style === 'emotional-eater' && context.mood === 'upset') desc = `You don't want food right now. Your tummy feels tight and wrong.`;
    else desc = `You're getting a bit hungry. Nothing urgent, but food is starting to sound good.`;
  } else if (value > 30) {
    if (style === 'always-urgent') desc = `HELLO?? You are STARVING. You haven't eaten in FOREVER (it was 90 minutes ago). Your stomach is making loud angry noises and everyone can hear it. You NEED food.`;
    else if (style === 'self-neglecting') desc = `Your head is starting to pound a little. Low blood sugar. When DID you last eat? You've been running around taking care of everyone and you forgot about yourself again.`;
    else if (style === 'distracted') desc = `Your stomach growls and you realize you've been ignoring it. How long has it been? You should probably eat something... but you're in the middle of something...`;
    else if (style === 'emotional-eater') desc = `You feel empty — but is that hunger or feelings? Maybe both. You want something warm and comforting.`;
    else desc = `You're definitely hungry. Your stomach is growling and it's getting distracting.`;
  } else if (value > 10) {
    if (style === 'always-urgent') desc = `YOU NEED FOOD RIGHT NOW THIS INSTANT. This is a CODE RED. Your stomach is a black hole. Everything smells like food. You would eat ANYTHING.`;
    else if (style === 'self-neglecting') desc = `You're almost dizzy with hunger. How did you let this happen? You've been taking care of everyone but yourself. You need to eat RIGHT NOW before you can't function.`;
    else desc = `You're very hungry. It's hard to think about anything else. You need to eat soon.`;
  } else {
    desc = `You are DESPERATELY hungry. Your body is running on empty. You need food immediately.`;
  }

  return `YOUR STOMACH:\n${desc}`;
}

function _narratePhysical(name, hygiene, comfort, gameHour, hygieneQuirk, comfortQuirk, persona, weather) {
  const hStyle = hygieneQuirk?.style || 'normal';
  const cStyle = comfortQuirk?.style || 'normal';
  const parts = [];

  // Hygiene
  if (hygiene > 80) {
    if (hStyle === 'identity') parts.push(`You feel clean and put-together. This matters to you — it\'s part of who you are.`);
    else if (hStyle === 'zero-awareness') parts.push(`You... don\'t think about this. Ever.`);
    else parts.push(`You feel clean and fresh.`);
  } else if (hygiene > 50) {
    if (hStyle === 'identity') parts.push(`You\'re starting to feel a little less... yourself. When did you last shower? You should freshen up soon.`);
    else if (hStyle === 'zero-awareness') parts.push(`You\'re covered in something. Dirt? Marker? Who cares, you\'re having fun.`);
    else if (hStyle === 'enjoys-baths') parts.push(`You could use a bath. You think about the warm water and bubbles and bath toys...`);
    else if (hStyle === 'independent') parts.push(`You could use a shower but you\'ll do it when YOU decide, thanks.`);
    else parts.push(`You could use a shower soon.`);
  } else if (hygiene > 25) {
    if (hStyle === 'identity') parts.push(`This is bothering you a LOT. You feel gross and it\'s affecting your mood. You NEED to shower. Like now.`);
    else if (hStyle === 'zero-awareness') parts.push(`You are objectively dirty. Like, really dirty. There\'s mud on your knees, something sticky on your hands, and you don\'t care AT ALL. Mom will, though.`);
    else if (hStyle === 'independent') parts.push(`Okay, you probably should shower. But NOT because anyone told you to.`);
    else parts.push(`You feel dirty and uncomfortable. You should clean up.`);
  } else {
    if (hStyle === 'zero-awareness') parts.push(`You are SO dirty that even YOU noticed. That\'s saying something. Mom is going to have a FIT.`);
    else parts.push(`You feel disgusting. You desperately need to clean up.`);
  }

  // Comfort — now weather-linked per goals.md
  if (comfort > 70) {
    if (cStyle === 'very-sensitive') parts.push(`You feel cozy and safe. Clover is nearby. Everything is soft and warm.`);
    else if (cStyle !== 'oblivious') parts.push(`You\'re physically comfortable.`);
    // Weather adds texture even when comfortable
    if (weather) {
      const weatherComfort = _getWeatherComfortNote(name, weather, true);
      if (weatherComfort) parts.push(weatherComfort);
    }
  } else if (comfort > 40) {
    if (cStyle === 'very-sensitive') parts.push(`Something feels... off. Maybe your clothes are scratchy, or you\'ve been sitting the wrong way. You keep fidgeting.`);
    else if (cStyle === 'oblivious') {} // Jack doesn't notice
    else parts.push(`You\'re a little uncomfortable but managing.`);
    if (weather) {
      const weatherComfort = _getWeatherComfortNote(name, weather, false);
      if (weatherComfort) parts.push(weatherComfort);
    }
  } else if (comfort > 20) {
    if (cStyle === 'very-sensitive') parts.push(`You are REALLY uncomfortable and it\'s all you can think about. Your clothes feel wrong, the chair is hard, everything is bad. You want to curl up on the couch with a blanket.`);
    else if (cStyle === 'stoic') parts.push(`You\'re uncomfortable but you don\'t say anything. Just endure it.`);
    else parts.push(`You\'re quite uncomfortable. Hard to focus.`);
    if (weather) {
      const weatherComfort = _getWeatherComfortNote(name, weather, false);
      if (weatherComfort) parts.push(weatherComfort);
    }
  } else {
    parts.push(`PHYSICALLY MISERABLE. Everything hurts or feels wrong.`);
    if (weather) {
      const weatherComfort = _getWeatherComfortNote(name, weather, false);
      if (weatherComfort) parts.push(weatherComfort);
    }
  }

  return `PHYSICALLY:\n${parts.join(' ')}`;
}

/**
 * Generate a weather-linked comfort note per goals.md.
 * Weather affects how comfort FEELS.
 */
function _getWeatherComfortNote(name, weather, isComfortable) {
  if (!weather || !weather.description) return null;
  const desc = (weather.description || '').toLowerCase();

  // Rainy
  if (desc.includes('rain') || desc.includes('storm')) {
    if (isComfortable) {
      const cozy = {
        Dad: 'The rain outside makes indoors feel extra cozy.',
        Mom: 'Rain on the roof — a good day to be inside.',
        Emma: 'The sound of rain is actually really nice. Good reading weather.',
        Lily: 'The rain is making tap-tap-tap sounds! Cozy inside.',
        Jack: 'It\'s raining. BORING. But the couch is warm.',
      };
      return cozy[name] || null;
    } else {
      return desc.includes('storm') ? 'The storm outside isn\'t helping.' : null;
    }
  }

  // Hot
  if (desc.includes('hot') || desc.includes('heat') || desc.includes('scorching')) {
    if (!isComfortable) {
      const hot = {
        Dad: 'The heat isn\'t helping. Even inside it feels stuffy.',
        Mom: 'It\'s so hot. The AC can only do so much.',
        Emma: 'Ugh, it\'s sweltering. Nothing feels right.',
        Lily: 'It\'s TOO HOT. Everything is sticky and gross.',
        Jack: 'You\'re sweaty. But that\'s fine. MORE WATER.',
      };
      return hot[name] || 'The heat is making things worse.';
    }
  }

  // Cold
  if (desc.includes('cold') || desc.includes('freezing') || desc.includes('chilly')) {
    if (isComfortable) {
      return name === 'Lily' ? 'Wrapped up warm — the cold outside makes the blanket feel extra snuggly.' : null;
    } else {
      const cold = {
        Lily: 'It\'s COLD and you can\'t get warm. Where\'s your blanket?',
        Jack: 'Brrr. Your fingers are cold.',
        Emma: 'The cold seeping in through the window doesn\'t help.',
      };
      return cold[name] || null;
    }
  }

  // Sunny / nice
  if (desc.includes('sunny') || desc.includes('clear') || desc.includes('pleasant')) {
    if (isComfortable) {
      const sunny = {
        Lily: 'The sunshine coming through the window feels warm on your skin!',
        Jack: 'The sun is SO BRIGHT and AWESOME!',
      };
      return sunny[name] || null;
    }
  }

  return null;
}

function _narrateBladder(name, value, quirk, persona) {
  const style = quirk?.style || 'normal';

  // Only mention bladder when it's actually relevant
  if (value > 70) return null; // Fine, not worth mentioning

  if (value > 50) {
    if (style === 'ignores-until-emergency') return null; // Jack doesn't notice yet
    return null; // Most people don't think about it at this level
  }

  if (value > 30) {
    if (style === 'ignores-until-emergency') return null; // STILL doesn't notice
    return `URGENCY:\nYou should probably use the bathroom soon. Starting to feel it.`;
  }

  if (value > 15) {
    if (style === 'ignores-until-emergency') return `URGENCY:\nOh. OH. You REALLY need to pee. Like RIGHT NOW. Why didn't you go earlier?! WHERE IS THE BATHROOM? You're doing the potty dance and everyone can see it.`;
    return `URGENCY:\nYou really need to use the bathroom. This is getting urgent. If the bathroom is occupied, this is a problem.`;
  }

  // Critical
  if (style === 'ignores-until-emergency') return `URGENCY:\nEMERGENCY!! EMERGENCY!! You are ABOUT TO HAVE AN ACCIDENT. You need the bathroom THIS SECOND. You're running, you're panicking, you're yelling "I GOTTA GO! I GOTTA GO!" and banging on the door if it's closed. This is a CRISIS.`;
  return `URGENCY:\nThis is an EMERGENCY. You need the bathroom RIGHT NOW. Drop everything and go.`;
}

function _narrateSocial(name, value, gameHour, quirk, persona, context) {
  const style = quirk?.style || 'normal';
  let desc = '';

  if (value > 70) {
    if (style === 'introvert-in-denial') desc = `You're perfectly content being alone. Actually, you PREFER it. Stop asking. You have a book and that's all the company you need (you think).`;
    else if (style === 'desperate-for-attention') desc = `You're happy! Someone played with you recently and you feel great about it. But... it's been five minutes... is anyone around?`;
    else desc = `You feel socially fulfilled. Connected. Good recent interactions.`;
  } else if (value > 50) {
    if (style === 'introvert-in-denial') desc = `You're fine. Totally fine. You don't need anyone. ...But it HAS been quiet for a while. Maybe you'll wander to where people are. Just to get a snack. Not because you're lonely.`;
    else if (style === 'desperate-for-attention') desc = `You want someone to PLAY with you. Or TALK to you. Or LOOK at you. Anyone?? You're going to go find someone.`;
    else if (style === 'mommy-dependent') desc = `Where's Mommy? You want to show her something. Or just be near her. She makes everything better.`;
    else if (style === 'needs-adult-conversation') desc = `You've been talking to the kids all day. You love them but you need a real conversation with another adult. With Dave. Or honestly even just a phone call with a friend.`;
    else desc = `You could use some social interaction. A conversation would be nice.`;
  } else if (value > 25) {
    if (style === 'introvert-in-denial') desc = `You're... actually kind of lonely. Don't tell anyone. You keep checking your phone but nobody texted. Maybe you should go to the living room. Just to... watch TV. Near other people. That's all.`;
    else if (style === 'desperate-for-attention') desc = `NOBODY IS PAYING ATTENTION TO YOU! This is UNACCEPTABLE! You're going to go find someone and MAKE them play with you. Or talk. Or wrestle. Or SOMETHING.`;
    else if (style === 'mommy-dependent') desc = `You NEED Mommy. Where IS she? You feel small and alone and a little scared. You're going to go find her right now.`;
    else if (style === 'needs-adult-conversation') desc = `You are STARVING for adult conversation. The only words spoken to you today have been "Mommy" and "Can I have a snack?" You might scream.`;
    else desc = `You're feeling lonely. You really need to connect with someone.`;
  } else {
    if (style === 'introvert-in-denial') desc = `Okay, you're lonely. Really lonely. You hate admitting it but you need people. The quiet that you normally love feels oppressive. You HAVE to go talk to someone.`;
    else if (style === 'desperate-for-attention') desc = `YOU ARE SO LONELY IT HURTS. You're going to DO something. Break something. Scream. ANYTHING to get someone to LOOK at you and PAY ATTENTION.`;
    else if (style === 'mommy-dependent') desc = `You're crying. Or about to. You need Mommy. Everything feels wrong and scary without her nearby.`;
    else desc = `You're desperately lonely. You need human connection.`;
  }

  return `EMOTIONALLY:\n${desc}`;
}

function _narrateFun(name, value, quirk, persona, context) {
  const style = quirk?.style || 'normal';
  let desc = '';

  if (value > 70) {
    if (style === 'constant-need') desc = `You're having SO MUCH FUN right now. Everything is AWESOME. You're making sound effects while you play.`;
    else if (style === 'absorbing') desc = `You're deeply engaged. Time is flying by. This is satisfying in a way that fills something inside you.`;
    else desc = `You're content and entertained. Life is good.`;
  } else if (value > 40) {
    if (style === 'constant-need') desc = `It's fine but you could be having MORE fun. There's gotta be something better to do. What about dinosaurs? Or the trampoline?`;
    else if (style === 'absorbing') desc = `This is getting repetitive. You need something new to engage with — something that challenges your mind.`;
    else if (style === 'rare-moments') desc = `You haven't had a moment for yourself in a while. All work and no play.`;
    else desc = `You're a bit understimulated. Could use something more engaging.`;
  } else if (value > 15) {
    if (style === 'constant-need') desc = `I'm BORED. SO BORED. There is NOTHING to do. You've been sitting around forever (it's been 20 minutes). If someone doesn't play with you soon you're going to START something.`;
    else if (style === 'absorbing') desc = `God you're bored. This aching, restless boredom that makes your skin crawl. You need to draw something, read something, CREATE something. NOW.`;
    else if (style === 'rare-moments') desc = `When was the last time you did something just for FUN? You can't even remember. You deserve a break.`;
    else desc = `You're really bored. Nothing sounds interesting. Restless.`;
  } else {
    if (style === 'constant-need') desc = `BORED BORED BORED BORED BORED. This is UNBEARABLE. You are going to start kicking things or pulling things off shelves unless something HAPPENS. You can't just SIT here!`;
    else if (style === 'absorbing') desc = `You are crawling out of your skin with boredom. This is miserable. You're a black hole of sarcasm because nothing is worth your time.`;
    else desc = `You are miserably bored. Desperate for stimulation.`;
  }

  return `BOREDOM:\n${desc}`;
}

/**
 * Build the anti-optimization directive that prevents the LLM
 * from always addressing the most critical need first.
 */
function _buildAntiOptimizationDirective(name, quirks) {
  const directives = [
    `You do NOT always address your most critical need first. Real people:`,
    `- Ignore hunger because they're having fun`,
    `- Stay up too late because the book is good`,
    `- Skip showers because they're lazy today`,
    `- Hold their bladder because they don't want to stop playing`,
    `- Choose social interaction over food because they're lonely`,
    `- Do chores when tired because they promised they would`,
    ``,
    `Your personality determines how you weigh these tradeoffs, not an optimization algorithm.`,
  ];

  // Character-specific anti-optimization
  const characterDirectives = {
    Jack: `Jack-specific: You ALWAYS think you're starving even when you just ate. You NEVER think about hygiene — that's a Mom problem. You ignore having to pee until it's a screaming emergency. You'd rather keep playing than do ANYTHING responsible.`,
    Emma: `Emma-specific: You sacrifice sleep for reading without a second thought. You barely think about food when you're drawing. You'll claim you don't need people while actively being lonely. You do things on YOUR schedule, not anyone else's.`,
    Lily: `Lily-specific: If you're upset, eating is impossible — your tummy feels wrong. You NEED Mommy more than food, more than sleep, more than anything. Comfort matters to you intensely — if your clothes are wet or scratchy or wrong, it's ALL you can think about.`,
    Dad: `Dad-specific: Before coffee, you are non-functional and don't even try to make decisions. During work hours, hunger doesn't register — you'll look up at 2 PM and realize you skipped lunch. After 5 PM, you desperately want family time. Below 30% energy, you will fall asleep on the couch, period.`,
    Mom: `Mom-specific: You will ALWAYS feed the kids before feeding yourself. You will ignore your own hunger, tiredness, and needs to make sure everyone else is taken care of. But when you crash, you crash HARD — there's no gradual decline, just a cliff.`,
  };

  if (characterDirectives[name]) {
    directives.push(characterDirectives[name]);
  }

  return directives.join('\n');
}

/**
 * Get a brief mood description that factors in personality.
 */
function narrateMood(name, mood, moodIntensity, stressLevel, needs) {
  const persona = getPersona(name);
  if (!persona) return `Mood: ${mood}`;

  const intensityWord = moodIntensity > 0.8 ? 'overwhelmingly' :
                        moodIntensity > 0.5 ? 'clearly' :
                        moodIntensity > 0.3 ? 'slightly' : 'vaguely';

  const stressDesc = stressLevel > 0.7 ? 'The stress is almost unbearable.' :
                     stressLevel > 0.5 ? 'You\'re stressed and it\'s coloring everything.' :
                     stressLevel > 0.3 ? 'A low hum of stress in the background.' :
                     'Relatively calm.';

  // Find what's driving the mood
  const lowestNeed = Object.entries(needs || {}).sort((a, b) => a[1] - b[1])[0];
  let driver = '';
  if (lowestNeed && lowestNeed[1] < 30) {
    const needDrivers = {
      energy: 'mostly because you\'re exhausted',
      hunger: 'mostly because you\'re hungry',
      hygiene: 'partly because you feel grimy',
      social: 'partly from loneliness',
      fun: 'partly from boredom',
      comfort: 'partly from physical discomfort',
      bladder: 'partly because you really need the bathroom',
    };
    driver = needDrivers[lowestNeed[0]] || '';
  }

  return `You feel ${intensityWord} ${mood}${driver ? ` — ${driver}` : ''}. ${stressDesc}`;
}

/**
 * Narrate the character's social energy / social battery as natural language.
 * Social battery is SEPARATE from social need:
 * - Social need = how much you WANT social contact (decays when alone)
 * - Social battery = how much social ENERGY you have for interaction
 *
 * An introvert can be lonely (need=low) but also drained (battery=low).
 * An extrovert can be socially fulfilled (need=high) and still full of energy (battery=high).
 *
 * @param {string} name - Character name
 * @param {number} socialBattery - 0-1 range (0=drained, 1=fully charged)
 * @param {number} socialNeed - 0-100 range (current social need value)
 * @param {number} extraversion - 0-1 range (from persona personality)
 * @param {number} recentConversationCount - number of conversations in recent memory
 * @returns {string|null} - Narrative string or null if not noteworthy
 */
function narrateSocialEnergy(name, socialBattery, socialNeed, extraversion, recentConversationCount) {
  // Don't clutter the prompt if social energy is neutral
  if (socialBattery > 0.35 && socialBattery < 0.65) return null;

  const isIntrovert = extraversion < 0.45;
  const isExtrovert = extraversion > 0.7;
  const convCount = recentConversationCount || 0;

  // Character-specific social energy descriptions
  const charDescriptions = {
    Dad: {
      drained: "You've been around people a lot. You need some quiet time — maybe the garage, or just sitting alone with your coffee. Your patience for small talk is paper-thin right now.",
      low: "Your social energy is getting low. You can handle necessary conversations — family stuff, kid questions — but you don't want to initiate anything deep right now.",
      high: "You've had good alone time. You're actually in the mood for family interaction — maybe check on the kids or find Sarah.",
      full: "You're recharged and genuinely want to connect. Evening Dad mode — this is when you shine. Family time feels appealing, not draining."
    },
    Mom: {
      drained: "You are DONE with being needed. Every 'Mommy!' makes you flinch. You need five minutes — FIVE MINUTES — where nobody asks you for anything. You love them but you are a human being and you are running on empty.",
      low: "Your patience is wearing thin. You can still handle the kids but you're shorter with them than usual. You need Dave to tag in, or just a quiet moment in the kitchen alone.",
      high: "You've had a breather and you're back in mom-mode. Checking on everyone, managing the household. Normal energy.",
      full: "You feel good. Recharged. Ready to handle whatever chaos the family throws at you. Maybe even looking forward to quality time with Dave tonight."
    },
    Emma: {
      drained: "You are COMPLETELY peopled out. If one more person talks to you, you will literally explode. You need your headphones, your book, and a locked door. Not being antisocial — being a person with limits.",
      low: "You're running low on social energy. You can handle Lily (barely) but if Mom asks how your day was, you might snap. You want to be alone but you also know you shouldn't completely disappear.",
      high: "You've had enough alone time. You wouldn't mind some company — not that you'd ever SAY that. Maybe Lily wants to draw together. Or you could go see what Dad's up to.",
      full: "Okay, you actually miss people right now. Your room is too quiet. You're going to pretend you're just getting a snack but really you want to be around someone. Just don't make it weird."
    },
    Lily: {
      drained: "You're tired from so much playing and talking. You want Mommy to just hold you quietly. No more questions. No more games. Just cuddles.",
      low: "You're getting quiet and clingy. You don't want to play with everyone — just be near Mommy or Daddy. Maybe draw by yourself for a bit.",
      high: "You want to show someone your drawing! Maybe Emmy will look at it? Or Mommy? You have enough energy to go find people.",
      full: "You want to play with EVERYONE! Emmy, Jack, Mommy, Daddy! Let's do something together! Can we play pretend? Can we draw? CAN WE??"
    },
    Jack: {
      drained: "Even you need a break sometimes. You're lying on the floor doing nothing and it's... actually kind of nice? For like two minutes. Then you'll need someone again.",
      low: "You're a little less ZOOM than usual. You could play alone for a bit. Maybe build something. But you'll start looking for someone to show it to pretty quickly.",
      high: "You want someone to play with! Wrestling? Tag? ANYTHING with another person! Being alone is BORING.",
      full: "WHERE IS EVERYONE?! Let's DO SOMETHING! You have ALL the energy for ALL the people! ZOOOOOM!"
    }
  };

  const charDesc = charDescriptions[name] || {
    drained: "You're socially drained. You need quiet time.",
    low: "Your social energy is getting low.",
    high: "You have energy for social interaction.",
    full: "You're socially charged and ready to connect."
  };

  let desc;
  if (socialBattery <= 0.15) desc = charDesc.drained;
  else if (socialBattery <= 0.35) desc = charDesc.low;
  else if (socialBattery >= 0.85) desc = charDesc.full;
  else desc = charDesc.high; // 0.65-0.85

  // Add context about recent conversation load
  if (convCount >= 5 && socialBattery < 0.4) {
    desc += isIntrovert
      ? ` You've had ${convCount} conversations recently and it shows.`
      : ` Even after ${convCount} conversations, you could use a moment to breathe.`;
  }

  return `SOCIAL ENERGY:\n${desc}`;
}

module.exports = {
  narrateNeeds,
  narrateMood,
  narrateSocialEnergy,
  CHARACTER_QUIRKS,
};
