/**
 * EnvironmentPerception.js — What a character can see and hear.
 *
 * Provides spatial awareness: room adjacency, line-of-sight (same room),
 * sound propagation through doors, and environmental context (time of day,
 * lighting, weather).
 *
 * Enhanced with first-person narration: perception is described AS THE
 * CHARACTER EXPERIENCES IT, not as a data dump.
 *
 * CommonJS module (server-side).
 */

const { HOUSE_LAYOUT, getRoomAtPosition } = require('./HouseLayout');
const { getPersona } = require('./PersonaManager');

// ── Build adjacency map from doors ─────────────────────────────────
const ROOM_ADJACENCY = {};
for (const room of HOUSE_LAYOUT.rooms) {
  ROOM_ADJACENCY[room.id] = new Set();
}
// Also add exterior zones
ROOM_ADJACENCY['backyard'] = new Set();
ROOM_ADJACENCY['_exterior'] = new Set();

for (const door of HOUSE_LAYOUT.doors) {
  // Door data uses { from, to } not { connects }
  let a = door.from;
  let b = door.to;
  // Normalize exterior connections
  if (a === 'outside_back') a = 'backyard';
  if (b === 'outside_back') b = 'backyard';
  if (a === 'outside') a = '_exterior';
  if (b === 'outside') b = '_exterior';

  if (a && b && a !== b) {
    if (!ROOM_ADJACENCY[a]) ROOM_ADJACENCY[a] = new Set();
    if (!ROOM_ADJACENCY[b]) ROOM_ADJACENCY[b] = new Set();
    ROOM_ADJACENCY[a].add(b);
    ROOM_ADJACENCY[b].add(a);
  }
}

// ── Room lookup by ID ──────────────────────────────────────────────
const ROOM_MAP = {};
for (const room of HOUSE_LAYOUT.rooms) {
  ROOM_MAP[room.id] = room;
}

/**
 * Get all rooms adjacent to the given room (connected by a door).
 */
function getAdjacentRooms(roomId) {
  return Array.from(ROOM_ADJACENCY[roomId] || []);
}

/**
 * Check if two rooms are adjacent (share a door).
 */
function areRoomsAdjacent(roomA, roomB) {
  return ROOM_ADJACENCY[roomA]?.has(roomB) || false;
}

/**
 * Get what a character can SEE — people and objects in the same room.
 *
 * @param {object} member - The observing character
 * @param {Array} allMembers - All family members
 * @returns {object} - { peopleInRoom, furnitureInRoom, roomName }
 */
function getVisibleEnvironment(member, allMembers) {
  const myRoom = member.currentRoom || getRoomAtPosition(member.position.x, member.position.z);
  const roomDef = ROOM_MAP[myRoom];

  // People in the same room (excluding self)
  const peopleInRoom = allMembers
    .filter(m => m.name !== member.name)
    .filter(m => {
      const theirRoom = m.currentRoom || getRoomAtPosition(m.position.x, m.position.z);
      return theirRoom === myRoom;
    })
    .map(m => ({
      name: m.name,
      role: m.role,
      activity: m.activityLabel || (m.state === 'walking' ? 'walking' : 'idle'),
      state: m.state,
      targetFurniture: m.targetFurniture,
      // If they're walking, show where they're heading
      destination: m.state === 'walking' && m.currentInteraction?.room
        ? m.currentInteraction.room : null,
    }));

  // Furniture in this room
  const furnitureInRoom = HOUSE_LAYOUT.furniture
    .filter(f => f.room === myRoom)
    .map(f => f.id);

  return {
    room: myRoom,
    roomName: roomDef?.name || myRoom,
    peopleInRoom,
    furnitureInRoom,
  };
}

/**
 * Get what a character can HEAR — sounds from adjacent rooms.
 * Implements sound propagation per Appendix C of goals.md:
 *   - Normal speech: same room only
 *   - Raised voice: same room + adjacent
 *   - Shouting/crying: 2 rooms radius
 *   - Screaming/crash/alarm: entire house
 *   - Activities: adjacent rooms only (muffled)
 *
 * @param {object} member - The listening character
 * @param {Array} allMembers - All family members
 * @param {Array} recentEvents - Recent event log (includes speech events)
 * @returns {Array} - List of audible events/people
 */
function getAudibleEnvironment(member, allMembers, recentEvents = []) {
  const myRoom = member.currentRoom;
  const adjacent = getAdjacentRooms(myRoom);

  // ── Headphone check ─────────────────────────────────────────
  // Per goals.md: if character has headphones on, sound is blocked/dampened.
  // Emma "always has headphones on" during music/reading activities.
  const hearingLevel = _getHearingLevel(member);
  if (hearingLevel === 'deaf') return []; // Headphones fully on, hears nothing outside room

  // Build 2-room radius set (rooms reachable within 2 door hops)
  const twoRoomRadius = new Set(adjacent);
  for (const adjRoom of adjacent) {
    for (const farRoom of getAdjacentRooms(adjRoom)) {
      if (farRoom !== myRoom) twoRoomRadius.add(farRoom);
    }
  }
  // All interior rooms (for whole-house sounds)
  const allRooms = new Set(Object.keys(ROOM_ADJACENCY));

  const sounds = [];

  // People in adjacent rooms that are doing noisy things
  for (const m of allMembers) {
    if (m.name === member.name) continue;
    const theirRoom = m.currentRoom;
    if (theirRoom === myRoom) continue; // already visible, not just audible

    if (adjacent.includes(theirRoom)) {
      // Can hear muffled activity from adjacent rooms
      if (m.activityLabel) {
        const soundDesc = describeSoundFromActivity(m.activityLabel, m.name, theirRoom);
        if (soundDesc) {
          sounds.push({
            type: 'activity',
            source: m.name,
            room: theirRoom,
            description: soundDesc,
            muffled: true,
          });
        }
      }
    }
  }

  // Recent events/sounds with hearing range classification
  for (const event of recentEvents) {
    const eventAge = Date.now() - (event.timestamp || 0);
    if (eventAge > 60000) continue; // only events in the last 60 seconds
    if (event.room === myRoom && event.type !== 'speech') continue; // already visible

    const range = event.hearingRange || _classifySoundRange(event);
    const sourceRoom = event.room;

    let canHear = false;
    let muffled = true;

    switch (range) {
      case 'same_room':
        canHear = sourceRoom === myRoom;
        muffled = false;
        break;
      case 'adjacent':
        canHear = sourceRoom === myRoom || adjacent.includes(sourceRoom);
        muffled = sourceRoom !== myRoom;
        break;
      case '2_rooms':
        canHear = sourceRoom === myRoom || twoRoomRadius.has(sourceRoom);
        muffled = sourceRoom !== myRoom;
        break;
      case 'whole_house':
        canHear = allRooms.has(sourceRoom) || sourceRoom === myRoom;
        muffled = sourceRoom !== myRoom;
        break;
    }

    if (canHear) {
      sounds.push({
        type: event.type || 'event',
        eventId: event.id,
        source: event.source || event.speaker,
        description: event.description,
        room: sourceRoom,
        muffled,
      });
    }
  }

  // ── Apply hearing dampening ─────────────────────────────────
  // 'dampened' = headphones partially on or focused activity — only hear loud things
  if (hearingLevel === 'dampened') {
    return sounds.filter(s => {
      // Only hear whole-house level sounds (alarms, screaming, crashes)
      // or someone calling your name directly (type=speech with your name)
      if (s.type === 'alarm' || s.type === 'scream' || s.type === 'crash') return true;
      const desc = (s.description || '').toLowerCase();
      if (desc.includes(member.name.toLowerCase())) return true;
      // Also allow non-muffled (same-room) sounds through
      if (!s.muffled) return true;
      return false;
    });
  }

  return sounds;
}

/**
 * Classify the hearing range of an event based on its properties.
 * Used when an event doesn't have an explicit hearingRange set.
 */
function _classifySoundRange(event) {
  // Speech events
  if (event.type === 'speech') {
    const text = (event.text || event.description || '').toUpperCase();
    // All caps or exclamation marks = raised voice/shouting
    const exclamationCount = (text.match(/!/g) || []).length;
    const capsRatio = text.replace(/[^A-Z]/g, '').length / Math.max(text.length, 1);

    if (event.volume === 'shout' || exclamationCount >= 2 || capsRatio > 0.6) return 'whole_house';
    if (event.volume === 'raised' || exclamationCount >= 1) return '2_rooms';
    if (event.volume === 'whisper') return 'same_room';
    return 'adjacent'; // Normal speech carries to adjacent rooms
  }

  // Emotional events
  if (event.type === 'cry' || event.emotion === 'crying') return '2_rooms';
  if (event.type === 'scream') return 'whole_house';

  // Physical events
  if (event.type === 'crash' || event.type === 'bang') return 'whole_house';
  if (event.type === 'alarm') return 'whole_house';

  // Default: adjacent room
  return 'adjacent';
}

/**
 * Determine how well a character can currently hear.
 * Per goals.md: Emma with headphones on can't hear Jack spill milk.
 *
 * @returns {'normal'|'dampened'|'deaf'} Hearing level
 *   - normal: hears everything per standard propagation rules
 *   - dampened: only hears loud/whole-house sounds + own name
 *   - deaf: hears nothing from other rooms (but still sees same-room events)
 */
function _getHearingLevel(member) {
  const activity = (member.activityLabel || '').toLowerCase();
  const name = member.name;

  // Emma is characteristically headphones-always-on
  // When doing solo activities in her room, she's fully immersed
  if (name === 'Emma') {
    // Fully blocked — headphones at max volume
    const immersiveActivities = ['listen to music', 'listening to music', 'headphones'];
    if (immersiveActivities.some(a => activity.includes(a))) return 'deaf';

    // Dampened — headphones on but not maxed (reading, drawing, etc.)
    const focusedActivities = ['reading', 'drawing', 'sketching', 'art', 'writing', 'journaling'];
    if (focusedActivities.some(a => activity.includes(a))) return 'dampened';
  }

  // Anyone watching TV has dampened hearing (TV noise masks other sounds)
  if (activity.includes('tv') || activity.includes('watch') || activity.includes('movie')) {
    return 'dampened';
  }

  // Video games with sound
  if (activity.includes('video game') || activity.includes('gaming')) {
    return 'dampened';
  }

  // Sleeping is effectively deaf to quiet sounds
  if (activity.includes('sleep') || activity.includes('nap')) {
    return 'dampened'; // Only loud things wake you up
  }

  // Showering — water noise blocks most sounds
  if (activity.includes('shower')) {
    return 'dampened';
  }

  return 'normal';
}

/**
 * Get what a character can SEE in adjacent rooms through open doorways.
 * Per goals.md line 2312: visual awareness of adjacent rooms through open doors.
 *
 * Not full perception — just glimpses: who's visible, what they're doing.
 * Only works for open (non-closed) doors. Characters in hallways see more.
 *
 * @param {object} member - The observing character
 * @param {Array} allMembers - All family members
 * @returns {Array} - People glimpsed through doorways
 */
function getVisibleThroughDoors(member, allMembers) {
  const myRoom = member.currentRoom;
  const adjacent = getAdjacentRooms(myRoom);
  const glimpsed = [];

  // For each adjacent room connected by a door...
  for (const adjRoom of adjacent) {
    // Find the door connecting these rooms
    const door = HOUSE_LAYOUT.doors.find(d =>
      (d.from === myRoom && d.to === adjRoom) ||
      (d.to === myRoom && d.from === adjRoom)
    );

    // Skip if the door is explicitly marked as closed/hidden
    // (visible: false doors are internal/invisible walls, not open doors)
    if (door && door.visible === false) continue;

    // Who is in that adjacent room?
    const peopleInAdjacentRoom = allMembers
      .filter(m => m.name !== member.name)
      .filter(m => {
        const theirRoom = m.currentRoom || getRoomAtPosition(m.position.x, m.position.z);
        return theirRoom === adjRoom;
      });

    for (const person of peopleInAdjacentRoom) {
      const activity = (person.activityLabel || (person.state === 'walking' ? 'walking' : 'idle')).toLowerCase();
      // You can only see obvious/visible activities through a doorway
      // Can't see someone reading quietly — but can see them watching TV, cooking, playing
      const isVisibleActivity = !['reading', 'thinking', 'sitting quietly', 'idle', 'napping'].some(
        a => activity.includes(a)
      );

      if (isVisibleActivity || person.state === 'walking') {
        glimpsed.push({
          name: person.name,
          room: adjRoom,
          roomName: ROOM_MAP[adjRoom]?.name || adjRoom,
          activity: person.activityLabel || person.state,
          throughDoor: true,
        });
      }
    }
  }

  return glimpsed;
}

/**
 * Build a complete perception snapshot for a character.
 *
 * @param {object} member - The perceiving character
 * @param {Array} allMembers - All family members
 * @param {Date} gameTime - Current game time
 * @param {object} roomLights - Room light states
 * @param {Array} recentEvents - Recent event log
 * @returns {object} - Complete perception data
 */
function buildPerception(member, allMembers, gameTime, roomLights, recentEvents = [], worldState = null, weatherSystem = null) {
  const visible = getVisibleEnvironment(member, allMembers);
  const audible = getAudibleEnvironment(member, allMembers, recentEvents);
  const glimpsed = getVisibleThroughDoors(member, allMembers);

  const hour = gameTime.getHours() + gameTime.getMinutes() / 60;
  const isNight = hour >= 20 || hour < 6;
  const isDark = isNight && !roomLights[member.currentRoom];

  // Check if bathroom is occupied
  const bathroomOccupied = allMembers.some(m =>
    m.name !== member.name &&
    m.currentRoom === 'bathroom' &&
    m.state === 'performing'
  );

  // Who's sleeping
  const sleepingMembers = allMembers
    .filter(m => m.activityLabel && m.activityLabel.toLowerCase().includes('sleep'))
    .map(m => m.name);

  // Room occupancy counts
  const roomOccupancy = {};
  for (const m of allMembers) {
    const r = m.currentRoom || 'unknown';
    roomOccupancy[r] = (roomOccupancy[r] || 0) + 1;
  }

  // Lights status for visible rooms
  const visibleLights = {};
  visibleLights[member.currentRoom] = roomLights[member.currentRoom] ?? true;
  for (const adjRoom of getAdjacentRooms(member.currentRoom)) {
    visibleLights[adjRoom] = roomLights[adjRoom] ?? true;
  }

  return {
    self: {
      room: visible.room,
      roomName: visible.roomName,
      activity: member.activityLabel || null,
      state: member.state,
      memberName: member.name,
      destination: member.state === 'walking' && member.currentInteraction?.room
        ? member.currentInteraction.room : null,
    },
    visible,
    audible,
    glimpsed, // People seen through doorways into adjacent rooms
    environment: {
      hour,
      timeOfDay: getTimeOfDayLabel(hour),
      dayOfWeek: gameTime.toLocaleDateString('en-US', { weekday: 'long' }),
      isNight,
      isDark,
      roomLights: visibleLights,
      bathroomOccupied,
      sleepingMembers,
      roomOccupancy,
    },
    // Physical world state (mess, food, laundry, bathroom queue)
    physicalEnvironment: worldState ? worldState.getRoomEnvironment(visible.room) : null,
    // Recent environmental events for perception narration (goals.md)
    recentEvents: recentEvents.filter(e => {
      const age = Date.now() - (e.timestamp || 0);
      return age < 120000; // Last 2 minutes of events
    }).slice(-5),
    // Weather conditions
    weather: weatherSystem ? {
      description: weatherSystem.describe(),
      outdoor: weatherSystem.isOutdoorSafe(),
      characterReaction: weatherSystem.getCharacterReaction(member.name),
      comfortMod: weatherSystem.getComfortModifier(
        visible.room === '_exterior' || visible.room === 'backyard'
      ),
    } : null,
  };
}

/**
 * Convert an activity label into a more descriptive sound description.
 * Silent activities return null (can't be heard from adjacent rooms).
 */
function describeSoundFromActivity(activityLabel, name, room) {
  const label = activityLabel.toLowerCase();
  const roomName = ROOM_MAP[room]?.name || room;

  // Silent activities — can't be heard through walls
  const silentPatterns = ['reading', 'thinking', 'drawing', 'sitting quietly', 'napping', 'sleeping', 'resting', 'idle'];
  if (silentPatterns.some(p => label.includes(p))) return null;

  // Cooking/kitchen sounds
  if (label.includes('cook') || label.includes('fry') || label.includes('bake')) {
    return `Sounds of cooking (pots clanking, sizzling) from the ${roomName}`;
  }
  if (label.includes('microwave')) return `The microwave humming from the ${roomName}`;
  if (label.includes('dishes') || label.includes('wash')) return `Water running and dishes clanking from the ${roomName}`;

  // TV/media
  if (label.includes('watch') || label.includes('tv') || label.includes('movie')) {
    return `TV sounds from the ${roomName}`;
  }
  if (label.includes('video game') || label.includes('gaming')) return `Video game sounds from the ${roomName}`;

  // Music
  if (label.includes('guitar') || label.includes('piano') || label.includes('music') || label.includes('sing')) {
    return `Music coming from the ${roomName}`;
  }

  // Water
  if (label.includes('shower') || label.includes('bath')) return `Water running from the ${roomName}`;
  if (label.includes('brush teeth')) return `Water running briefly from the ${roomName}`;

  // Physical/loud
  if (label.includes('vacuum') || label.includes('mow')) return `Loud motor sounds from the ${roomName}`;
  if (label.includes('exercise') || label.includes('jump')) return `Thumping sounds from the ${roomName}`;
  if (label.includes('laundry')) return `The washing machine running from the ${roomName}`;

  // Talking
  if (label.includes('chat') || label.includes('talk') || label.includes('conversation')) {
    return `Muffled conversation from the ${roomName}`;
  }
  if (label.includes('phone') || label.includes('call')) return `${name} talking on the phone in the ${roomName}`;

  // Playing
  if (label.includes('play')) return `Sounds of playing from the ${roomName}`;

  // Default: generic activity sound
  return `Sounds of someone doing something in the ${roomName}`;
}

/**
 * Get a human-readable time-of-day label.
 */
function getTimeOfDayLabel(hour) {
  if (hour < 5)   return 'late night';
  if (hour < 7)   return 'early morning';
  if (hour < 9)   return 'morning';
  if (hour < 12)  return 'late morning';
  if (hour < 13)  return 'noon';
  if (hour < 15)  return 'early afternoon';
  if (hour < 17)  return 'afternoon';
  if (hour < 19)  return 'evening';
  if (hour < 21)  return 'night';
  return 'late night';
}

module.exports = {
  getAdjacentRooms,
  areRoomsAdjacent,
  getVisibleEnvironment,
  getVisibleThroughDoors,
  getAudibleEnvironment,
  buildPerception,
  narratePerception,
  getEavesdroppingAwareness,
  getBathroomQueueAwareness,
  getTimeOfDayLabel,
  getPoeticTimeDescription,
  ROOM_ADJACENCY,
  ROOM_MAP,
};

// ── First-person perception narration ──────────────────────────
// Turns raw perception data into felt experience.

/**
 * Narrate what a character perceives as a first-person experience.
 * Not a data dump — a felt, personality-filtered sensory description.
 *
 * @param {object} perception - Output of buildPerception()
 * @param {string} name - Character name
 * @returns {string} First-person environment narration
 */
function narratePerception(perception, name) {
  const persona = getPersona(name);
  const lines = [];

  // ─── Where you are ────────────────────────────────
  lines.push(_narrateLocation(perception, name, persona));

  // ─── Time and atmosphere ──────────────────────────
  lines.push(_narrateAtmosphere(perception, name, persona));

  // ─── Weather ──────────────────────────────────────
  const weatherDesc = _narrateWeather(perception, name);
  if (weatherDesc) lines.push(weatherDesc);

  // ─── Who's here with you ──────────────────────────
  const peopleDesc = _narratePeoplePresent(perception, name, persona);
  if (peopleDesc) lines.push(peopleDesc);

  // ─── What you glimpse through doorways ────────────
  const glimpseDesc = _narrateGlimpsedThroughDoors(perception, name);
  if (glimpseDesc) lines.push(glimpseDesc);

  // ─── What you hear from nearby ────────────────────
  const soundDesc = _narrateSounds(perception, name, persona);
  if (soundDesc) lines.push(soundDesc);

  // ─── Environmental details ────────────────────────
  const detailDesc = _narrateDetails(perception, name, persona);
  if (detailDesc) lines.push(detailDesc);

  // ─── Physical environment (mess, food, laundry) ───
  const physDesc = _narratePhysicalEnvironment(perception, name, persona);
  if (physDesc) lines.push(physDesc);
  // ─── Recent environmental events (household events, accidents, illness) ───
  const eventDesc = _narrateRecentEvents(perception, name);
  if (eventDesc) lines.push(eventDesc);
  return `WHERE YOU ARE AND WHAT YOU PERCEIVE:\n${lines.join('\n')}`;
}

// ── Narration sub-functions ────────────────────────────────────

function _narrateLocation(perception, name, persona) {
  const roomName = perception.self.roomName || perception.self.room;
  const roomId = perception.self.room;

  // Room flavor — what this room FEELS like (not looks like)
  const ROOM_FEELINGS = {
    kitchen: {
      Dad: 'The kitchen. Coffee machine, fridge, the usual. Functional.',
      Mom: 'Your kitchen. Your territory. Everything has a place.',
      Emma: 'The kitchen. It smells like whatever Mom\'s been cooking.',
      Lily: 'The kitchen! It smells nice in here. Mommy makes the best food!',
      Jack: 'The kitchen! Is there a SNACK?',
    },
    living_room: {
      Dad: 'The living room. Your spot on the couch is calling.',
      Mom: 'The living room. Someone left cushions on the floor again.',
      Emma: 'The living room. The couch is okay. TV\'s there.',
      Lily: 'The living room! The big couch is SO comfy.',
      Jack: 'The living room! THE COUCH IS A TRAMPOLINE! (Mommy says it\'s not.)',
    },
    master_bedroom: {
      Dad: 'Your bedroom. Office nook in the corner. Some quiet.',
      Mom: 'The master bedroom. Made the bed this morning. Just how you like it.',
      Emma: 'Mom and Dad\'s room. You knocked first.',
      Lily: 'Mommy and Daddy\'s room. It\'s big and safe.',
      Jack: 'Mom and Dad\'s room! The BIG bed!',
    },
    kids_bedroom: {
      Dad: 'The kids\' room. Controlled chaos. Some kind of toy explosion.',
      Mom: 'The kids\' room. You just cleaned this two hours ago. HOW.',
      Emma: 'The kids\' room. Not exactly a retreat.',
      Lily: 'Your room! Well, you share it with Jack. Your art corner is over there.',
      Jack: 'Your room! YOUR TOYS! YOUR FORT!',
    },
    emma_bedroom: {
      Dad: 'Emma\'s room. Her space. You respect the boundary.',
      Mom: 'Emma\'s room. She\'s drawn DO NOT ENTER on a piece of paper taped to the door. Lovely.',
      Emma: 'YOUR room. Your sanctuary. Your sketchbook, your books, your headphones. FINALLY.',
      Lily: 'Emmy\'s room! She has SO many cool drawings on the wall!',
      Jack: 'Emma\'s room. She\'s gonna yell at you for being in here.',
    },
    bathroom: {
      Dad: 'The bathroom. In and out, efficient.',
      Mom: 'The bathroom. Could use a wipe-down.',
      Emma: 'The bathroom. Door locked. Privacy.',
      Lily: 'The bathroom. You washed your hands!',
      Jack: 'The bathroom. Ugh. FINE.',
    },
    garage: {
      Dad: 'Your workshop. The air smells like sawdust and motor oil. Perfect.',
      Mom: 'The garage. Dave\'s domain. Organized in a way only he understands.',
      Emma: 'The garage. Dusty. Loud. No thanks.',
      Lily: 'The garage. Daddy\'s tools are cool but you\'re not allowed to touch them.',
      Jack: 'The garage! Can you touch the hammer? ...you\'re gonna touch the hammer.',
    },
    hallway: {
      default: 'The hallway. Just passing through.',
      Lily: 'The hallway. The floor is cold on your feet.',
      Jack: 'The hallway. It\'s like a RUNWAY. ZOOM.',
    },
    dining_room: {
      Dad: 'The dining room. Table\'s set — or should be.',
      Mom: 'The dining room. Your centerpiece looks nice today.',
      Emma: 'The dining room. Family dinner territory.',
      Lily: 'The dining room! Where everyone sits together!',
      Jack: 'The dining room. Can you eat NOW?',
    },
    _exterior: {
      Dad: 'The backyard. Fresh air, green grass, maybe the grill needs prepping.',
      Mom: 'The garden and backyard. The herbs are doing well this year.',
      Emma: 'Outside. The sun\'s kind of nice, actually.',
      Lily: 'Outside! The flowers! The butterflies! EVERYTHING!',
      Jack: 'OUTSIDE!!! FREEDOM!!!',
    },
  };

  const roomFeelings = ROOM_FEELINGS[roomId];
  if (roomFeelings) {
    return roomFeelings[name] || roomFeelings.default || `You're in the ${roomName}.`;
  }
  return `You're in the ${roomName}.`;
}

function _narrateAtmosphere(perception, name, persona) {
  const env = perception.environment;
  const hour = env.hour;
  const tod = env.timeOfDay;
  const isDark = env.isDark;
  const isNight = env.isNight;

  // Time awareness varies by character
  const TIME_AWARENESS = {
    Dad: () => {
      if (hour < 6.5) return 'It\'s still early. Before coffee. The house is quiet.';
      if (hour < 8) return `${tod}. Coffee time.`;
      if (hour >= 8 && hour < 17) return `Work hours. ${tod}.`;
      if (hour >= 17 && hour < 19) return 'Evening. Work\'s done.';
      if (hour >= 21) return 'Getting late. Couch is calling.';
      return `It's ${tod}.`;
    },
    Mom: () => {
      if (hour < 6.5) return 'Early. Everyone\'s still asleep. A moment of quiet before the storm.';
      if (hour < 8.5) return `Morning rush. Breakfast, kids, teeth, clothes, everything.`;
      if (hour >= 11 && hour < 13) return `Almost lunch. Need to figure out what to feed everyone.`;
      if (hour >= 17 && hour < 18.5) return 'Dinner prep time. Where did the afternoon go?';
      if (hour >= 21) return 'The kids are (hopefully) in bed. Your time.';
      return `It's ${tod}.`;
    },
    Emma: () => {
      if (hour < 9) return 'Too early. Your brain isn\'t awake yet. Nothing exists before 10 AM.';
      if (hour >= 21 && hour < 23) return 'The best time. Everyone\'s winding down. The house feels different at night.';
      if (hour >= 23) return 'Late. You should be in bed. You won\'t be. One more chapter.';
      return `It's ${tod}.`;
    },
    Lily: () => {
      if (hour < 7) return 'It\'s still sleepy-time dark.';
      if (hour >= 8 && hour < 12) return 'Morning time! The day is SO BIG!';
      if (hour >= 12 && hour < 14) return 'The sun is really bright! Is it lunchtime?';
      if (hour >= 19) return 'It\'s getting darker outside. Bedtime is coming (don\'t want it to).';
      return `It's ${tod}!`;
    },
    Jack: () => {
      if (hour < 7) return 'AWAKE! Is anyone else awake? HELLO?';
      if (hour >= 18 && hour < 20) return 'It\'s NOT bedtime yet. It\'s NOT.';
      if (hour >= 20) return 'You\'re NOT tired. You could stay up FOREVER.';
      return `It's ${tod}!`;
    },
  };

  const timeFunc = TIME_AWARENESS[name];
  let timeLine = timeFunc ? timeFunc() : `It's ${tod}.`;

  if (isDark) timeLine += ' The room is dark.';
  if (env.dayOfWeek) timeLine += ` ${env.dayOfWeek}.`;

  return timeLine;
}

function _narratePeoplePresent(perception, name, persona) {
  const people = perception.visible.peopleInRoom || [];
  if (people.length === 0) return 'You\'re alone in here.';

  const descs = people.map(p => _describePersonPresent(p, name));
  return `Who's here: ${descs.join('. ')}.`;
}

function _describePersonPresent(person, observerName) {
  const activity = (person.activity || 'idle').toLowerCase();
  const pName = person.name;

  // Describe what they're doing from the observer's perspective
  if (activity === 'idle' || activity === 'sitting quietly') {
    return `${pName} is here, not doing much`;
  }
  if (activity.includes('sleep') || activity.includes('nap')) {
    return `${pName} is sleeping`;
  }
  if (activity.includes('walk')) {
    const dest = person.destination;
    return dest ? `${pName} is heading toward the ${dest}` : `${pName} is walking through`;
  }
  if (activity.includes('cook') || activity.includes('bake')) {
    return `${pName} is cooking — you can hear pots and pans`;
  }
  if (activity.includes('read')) {
    return `${pName} is reading quietly`;
  }
  if (activity.includes('draw') || activity.includes('paint') || activity.includes('art')) {
    return `${pName} is working on some art`;
  }
  if (activity.includes('play')) {
    return `${pName} is playing`;
  }
  if (activity.includes('watch') || activity.includes('tv')) {
    return `${pName} is watching TV`;
  }
  if (activity.includes('phone') || activity.includes('device')) {
    return `${pName} is on their phone`;
  }
  if (activity.includes('clean') || activity.includes('tidy')) {
    return `${pName} is cleaning up`;
  }

  return `${pName} is ${activity}`;
}

/**
 * Narrate what characters are glimpsed through open doorways to adjacent rooms.
 * Per goals.md: visual awareness of adjacent rooms through open doors.
 */
function _narrateGlimpsedThroughDoors(perception, name) {
  const glimpsed = perception.glimpsed || [];
  if (glimpsed.length === 0) return null;

  // Cap at 3 to avoid prompt bloat
  const capped = glimpsed.slice(0, 3);

  const descs = capped.map(g => {
    const activity = (g.activity || 'something').toLowerCase();
    if (activity.includes('walk')) {
      return `Through the doorway to the ${g.roomName}, you can see ${g.name} walking through`;
    }
    if (activity.includes('cook')) {
      return `Through the doorway, ${g.name} is cooking in the ${g.roomName}`;
    }
    if (activity.includes('play')) {
      return `You can see ${g.name} playing in the ${g.roomName}`;
    }
    if (activity.includes('watch') || activity.includes('tv')) {
      return `${g.name} is watching TV in the ${g.roomName} — you can see the screen flickering`;
    }
    if (activity.includes('clean')) {
      return `Through the doorway, ${g.name} is cleaning in the ${g.roomName}`;
    }
    return `You can see ${g.name} in the ${g.roomName} (${activity})`;
  });

  return `Through the doorway: ${descs.join('. ')}.`;
}

function _narrateWeather(perception, name) {
  const weather = perception.weather;
  if (!weather || !weather.description) return null;

  const parts = [weather.description];
  if (weather.characterReaction && weather.characterReaction.label) {
    parts.push(weather.characterReaction.label);
  }
  if (!weather.outdoor) {
    parts.push('Can\'t go outside right now.');
  }
  return parts.join(' ');
}

function _narrateSounds(perception, name, persona) {
  const sounds = perception.audible || [];
  if (sounds.length === 0) return null;

  // Deduplicate by source+room (keep first / most specific)
  const seen = new Set();
  const unique = sounds.filter(s => {
    const key = `${s.source || ''}:${s.room || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Cap at 4 most relevant sounds to avoid wall-of-text
  const capped = unique.slice(0, 4);

  const descs = capped.map(s => {
    const roomName = ROOM_MAP[s.room]?.name || s.room;
    if (!s.muffled) {
      // Same room — clear sound
      return s.description;
    }
    // Muffled — describe distance feel
    const myRoom = perception.self.room;
    const adjacent = getAdjacentRooms(myRoom);
    if (adjacent.includes(s.room)) {
      // One room away — muffled but identifiable
      return `Through the wall, from the ${roomName}: ${s.description.toLowerCase()}`;
    }
    // Farther away — faint
    return `Faintly, from somewhere in the house: ${s.description.toLowerCase()}`;
  });

  return `What you hear: ${descs.join('. ')}.`;
}

/**
 * Check if a character is being talked ABOUT in a nearby conversation.
 * Per goals.md: eavesdropping awareness — characters who overhear their name
 * in adjacent-room conversations should know they're being discussed.
 *
 * @param {string} characterName - The listening character
 * @param {Array} audibleSounds - Output of getAudibleEnvironment
 * @returns {string|null} Eavesdropping awareness text or null
 */
function getEavesdroppingAwareness(characterName, audibleSounds) {
  if (!audibleSounds || audibleSounds.length === 0) return null;

  const nameLower = characterName.toLowerCase();
  const overheard = audibleSounds.filter(s => {
    if (!s.description) return false;
    const desc = s.description.toLowerCase();
    // Check if the character's name appears in the overheard sound
    return desc.includes(nameLower) && s.muffled; // Only if muffled (from another room)
  });

  if (overheard.length === 0) return null;

  const sources = [...new Set(overheard.map(s => s.source).filter(Boolean))];
  const rooms = [...new Set(overheard.map(s => ROOM_MAP[s.room]?.name || s.room).filter(Boolean))];

  if (sources.length > 0) {
    return `You think you heard ${sources.join(' and ')} mention your name from the ${rooms[0] || 'other room'}. Are they talking about you?`;
  }
  return `You think someone mentioned your name in another room. Eavesdropping instinct activated.`;
}

function _narrateDetails(perception, name, persona) {
  const env = perception.environment;
  const details = [];

  if (env.bathroomOccupied) {
    details.push('The bathroom is occupied');
  }

  if (env.sleepingMembers && env.sleepingMembers.length > 0) {
    const sleepers = env.sleepingMembers.filter(n => n !== name);
    if (sleepers.length > 0) {
      details.push(`${sleepers.join(' and ')} ${sleepers.length === 1 ? 'is' : 'are'} sleeping`);
    }
  }

  if (details.length === 0) return null;
  return details.join('. ') + '.';
}

/**
 * Narrate recent environmental events visible/audible to the character.
 * Per goals.md: accidents, illness, household events should appear in perception.
 */
function _narrateRecentEvents(perception, name) {
  const events = perception.recentEvents || [];
  if (events.length === 0) return null;

  // Filter to events that this character would notice
  const myRoom = perception.self.room;
  const adjacent = getAdjacentRooms(myRoom);

  const noticed = events.filter(e => {
    // Same room events always noticed
    if (e.room === myRoom) return true;
    // Adjacent room events noticed if they're loud enough
    if (adjacent.includes(e.room)) {
      const range = e.hearingRange || 'adjacent';
      return range !== 'same_room';
    }
    // Whole-house events
    if (e.hearingRange === 'whole_house') return true;
    return false;
  });

  if (noticed.length === 0) return null;

  const descs = noticed.slice(0, 3).map(e => {
    if (e.description) return e.description;
    if (e.type === 'illness') return `${e.character || 'Someone'} isn't feeling well.`;
    if (e.type === 'accident') return `There was an accident nearby.`;
    if (e.type === 'sleep_interruption') return `${e.character || 'Someone'} woke up.`;
    return `Something happened nearby.`;
  });

  return `Recent happenings: ${descs.join(' ')}`;
}

/**
 * Narrate the physical state of the room (mess, food, laundry, bathroom).
 * Personality-filtered: Mom notices mess more, kids less.
 */
function _narratePhysicalEnvironment(perception, name, persona) {
  const phys = perception.physicalEnvironment;
  if (!phys) return null;

  const details = [];

  // Mess level — personality-filtered perception threshold
  if (phys.messLevel !== undefined) {
    const MESS_NOTICE_THRESHOLD = {
      Mom: 15, Dad: 30, Emma: 40, Lily: 60, Jack: 80,
    };
    const threshold = MESS_NOTICE_THRESHOLD[name] || 30;
    if (phys.messLevel >= threshold) {
      const messAdj = phys.messLevel >= 70 ? 'a total disaster'
        : phys.messLevel >= 50 ? 'really messy'
        : phys.messLevel >= 30 ? 'kind of messy'
        : 'a little untidy';
      const MESS_REACTIONS = {
        Mom: `This room is ${messAdj}. It needs to be cleaned up.`,
        Dad: phys.messLevel >= 50 ? `This place is ${messAdj}. Should probably do something about that.` : null,
        Emma: phys.messLevel >= 60 ? `Ugh, it's ${messAdj} in here.` : null,
        Lily: phys.messLevel >= 70 ? `It's really messy in here!` : null,
        Jack: null, // Jack doesn't notice mess
      };
      const reaction = MESS_REACTIONS[name];
      if (reaction) details.push(reaction);
    }
  }

  // Kitchen-specific: food and dishes
  if (phys.foodAvailable) {
    details.push(`There's ${phys.foodAvailable} available to eat.`);
  }
  if (phys.dishesInSink > 0) {
    const dishDesc = phys.dishesInSink >= 6 ? 'a pile of dirty dishes in the sink'
      : phys.dishesInSink >= 3 ? 'several dirty dishes in the sink'
      : 'a couple dishes in the sink';
    details.push(dishDesc[0].toUpperCase() + dishDesc.slice(1) + '.');
  }

  // Laundry room status
  if (phys.laundryStatus) {
    const ls = phys.laundryStatus;
    if (ls.includes('washer running') || ls.includes('dryer running')) {
      details.push(`The ${ls}.`);
    } else if (ls.includes('clean pile') || ls.includes('hamper full')) {
      details.push(`Laundry situation: ${ls}.`);
    }
  }

  // Bathroom occupancy
  if (phys.bathroomOccupant) {
    details.push(`The bathroom is occupied by ${phys.bathroomOccupant}.`);
  }
  if (phys.bathroomQueue && phys.bathroomQueue > 0) {
    details.push(`${phys.bathroomQueue} ${phys.bathroomQueue === 1 ? 'person is' : 'people are'} waiting for the bathroom.`);
  }

  if (details.length === 0) return null;
  return details.join(' ');
}

// ═══════════════════════════════════════════════════════════════
//  BATHROOM QUEUE AWARENESS (goals.md #23)
// ═══════════════════════════════════════════════════════════════

/**
 * Builds a character-specific awareness string about the bathroom queue.
 * Includes their position, wait estimate, and personality-colored reaction.
 *
 * @param {string} characterName
 * @param {object} bathroomStatus — from WorldState.getBathroomStatus()
 * @returns {string|null}
 */
function getBathroomQueueAwareness(characterName, bathroomStatus) {
  if (!bathroomStatus || !bathroomStatus.occupied) return null;

  const { occupant, queue, waitTime } = bathroomStatus;

  // Am I in the bathroom?
  if (occupant === characterName) return null;

  const myQueuePos = queue.indexOf(characterName);
  const inQueue = myQueuePos >= 0;
  const queueLength = queue.length;
  const estimatedWaitMins = Math.round((myQueuePos + 1) * 3 + Math.max(0, 5 - waitTime / 60));

  const reactions = {
    Jack: {
      waiting: `I really need to go! ${occupant} has been in there forever! I'm ${myQueuePos === 0 ? 'next' : `number ${myQueuePos + 1}`}.`,
      notWaiting: queueLength > 0 ? `Someone's in the bathroom and there's a line.` : `${occupant} is in the bathroom.`,
    },
    Lily: {
      waiting: `I'm waiting for the bathroom. ${myQueuePos === 0 ? "I'm next!" : `There's ${myQueuePos} ${myQueuePos === 1 ? 'person' : 'people'} ahead of me.`}`,
      notWaiting: queueLength > 0 ? `The bathroom is busy — ${queueLength} waiting.` : `${occupant} is using the bathroom.`,
    },
    Emma: {
      waiting: `Ugh, I've been waiting ${estimatedWaitMins > 3 ? 'forever' : 'a bit'}. ${myQueuePos === 0 ? "I'm next at least." : `And I'm ${myQueuePos + 1}th in line. Great.`}`,
      notWaiting: queueLength > 1 ? `Bathroom's taken and there's a crowd.` : `${occupant} is in the bathroom.`,
    },
    Dad: {
      waiting: `Waiting for the bathroom. ${myQueuePos === 0 ? 'Should be quick.' : `${myQueuePos} ahead of me.`}`,
      notWaiting: null,
    },
    Mom: {
      waiting: `I'm in the bathroom queue. ${queueLength > 1 ? 'We really need a second bathroom.' : ''}`.trim(),
      notWaiting: waitTime > 300 ? `${occupant} has been in the bathroom a while. Everything okay?` : null,
    },
  };

  const reaction = reactions[characterName] || {};
  if (inQueue) {
    return reaction.waiting || `Waiting for bathroom (position #${myQueuePos + 1}).`;
  }
  return reaction.notWaiting || null;
}

// ═══════════════════════════════════════════════════════════════
//  POETIC TIME DESCRIPTIONS (goals.md #30)
// ═══════════════════════════════════════════════════════════════

/**
 * Character-specific evocative time descriptions instead of
 * plain labels like "early morning".
 *
 * @param {number} hour — game hour (0–24 float)
 * @param {string} characterName
 * @returns {string}
 */
function getPoeticTimeDescription(hour, characterName) {
  const h = Math.floor(hour);

  const descriptions = {
    Dad: {
      0: 'The dead of night — everyone should be asleep.',
      5: 'The alarm hasn\'t gone off yet. Just darkness and quiet.',
      6: 'Early. Coffee isn\'t even on yet.',
      7: 'Morning scramble. Where did his keys go?',
      8: 'The sun\'s properly up now. Day\'s underway.',
      10: 'Mid-morning. That second cup of coffee is calling.',
      12: 'Lunchtime. Stomach\'s making itself heard.',
      14: 'That post-lunch slump.',
      16: 'Afternoon. Almost through.',
      18: 'Evening. The family\'s together.',
      20: 'Winding down. The couch is winning.',
      22: 'Late. Eyes getting heavy.',
    },
    Mom: {
      0: 'The house is finally quiet. Everyone asleep. Hopefully.',
      5: 'Before dawn. A few stolen moments of peace.',
      6: 'The day starts whether she\'s ready or not.',
      7: 'Morning. Lunches, backpacks, did anyone brush their teeth?',
      8: 'The kids are sorted. She can breathe.',
      10: 'Mid-morning. The to-do list isn\'t getting shorter.',
      12: 'Noon already? The morning vanished.',
      14: 'Afternoon. The house is quiet for once.',
      16: 'Late afternoon. The after-school rush approaches.',
      18: 'Evening. Dinner, homework, baths — the evening marathon.',
      20: 'The kids should be settling. Emphasis on should.',
      22: 'Finally. Her time. Just a few minutes before sleep claims her.',
    },
    Emma: {
      0: 'Way too late — or way too early. Whatever.',
      5: 'Ugh. No. Not yet.',
      6: 'The worst hour of the day.',
      7: 'Morning. At least there\'s breakfast.',
      8: 'Okay, she\'s awake. Barely.',
      10: 'Mid-morning. Things are picking up.',
      12: 'Lunch o\'clock.',
      14: 'The boring part of the afternoon.',
      16: 'Afternoon. Finally freedom.',
      18: 'The golden hour. The sky\'s doing that pretty thing.',
      20: 'Evening. Prime social media time.',
      22: 'Late night. This is when the good stuff happens.',
    },
    Lily: {
      0: 'It\'s dark and quiet and a little scary.',
      5: 'Still sleeping time!',
      6: 'The sun is waking up too.',
      7: 'Morning! Is it a pancake day?',
      8: 'The day is bright and new!',
      10: 'The morning is going so fast!',
      12: 'Lunch! She\'s starving!',
      14: 'After lunch sleepy time. But she\'s NOT tired.',
      16: 'Afternoon playtime!',
      18: 'The fireflies might come out soon!',
      20: 'Almost bedtime. One more story?',
      22: 'Past bedtime. Shhh.',
    },
    Jack: {
      0: 'Night night time. Zzzzz.',
      5: 'Still super dark outside.',
      6: 'Is it morning yet? IS IT?',
      7: 'MORNING! Breakfast time!',
      8: 'The day is here! What should he do first?',
      10: 'Play time! PLAY TIME!',
      12: 'Lunch! He\'s SO hungry.',
      14: 'After lunch. The afternoon stretches forever (in a good way).',
      16: 'The sun is doing that sideways thing.',
      18: 'Dinnertime noises from the kitchen!',
      20: 'Bath time already? But he wasn\'t even dirty!',
      22: 'He\'s not sleepy. He\'s NOT. *yawn*',
    },
  };

  const charDescs = descriptions[characterName] || descriptions['Dad'];

  // Find the nearest lower hour bucket
  const buckets = Object.keys(charDescs).map(Number).sort((a, b) => a - b);
  let chosen = buckets[0];
  for (const bucket of buckets) {
    if (h >= bucket) chosen = bucket;
    else break;
  }

  return charDescs[chosen] || getTimeOfDayLabel(hour);
}
