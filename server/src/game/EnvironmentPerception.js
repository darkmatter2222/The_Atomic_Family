/**
 * EnvironmentPerception.js — What a character can see and hear.
 *
 * Provides spatial awareness: room adjacency, line-of-sight (same room),
 * sound propagation through doors, and environmental context (time of day,
 * lighting, weather).
 *
 * CommonJS module (server-side).
 */

const { HOUSE_LAYOUT, getRoomAtPosition } = require('./HouseLayout');

// ── Build adjacency map from doors ─────────────────────────────────
const ROOM_ADJACENCY = {};
for (const room of HOUSE_LAYOUT.rooms) {
  ROOM_ADJACENCY[room.id] = new Set();
}
// Also add _exterior
ROOM_ADJACENCY['_exterior'] = new Set();

for (const door of HOUSE_LAYOUT.doors) {
  const rooms = door.connects || [];
  if (rooms.length === 2) {
    if (!ROOM_ADJACENCY[rooms[0]]) ROOM_ADJACENCY[rooms[0]] = new Set();
    if (!ROOM_ADJACENCY[rooms[1]]) ROOM_ADJACENCY[rooms[1]] = new Set();
    ROOM_ADJACENCY[rooms[0]].add(rooms[1]);
    ROOM_ADJACENCY[rooms[1]].add(rooms[0]);
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
 * Includes: people talking, loud activities, crying, crashing.
 *
 * @param {object} member - The listening character
 * @param {Array} allMembers - All family members
 * @param {Array} recentEvents - Recent event log
 * @returns {Array} - List of audible events/people
 */
function getAudibleEnvironment(member, allMembers, recentEvents = []) {
  const myRoom = member.currentRoom;
  const adjacent = getAdjacentRooms(myRoom);
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

  // Recent events that are hearable (some go through the whole house)
  for (const event of recentEvents) {
    if (!event.hearingRange) continue;

    const eventAge = Date.now() - (event.timestamp || 0);
    if (eventAge > 30000) continue; // only events in the last 30 seconds

    if (event.hearingRange === 'whole_house') {
      sounds.push({
        type: 'event',
        eventId: event.id,
        description: event.description,
        room: event.room,
        muffled: event.room !== myRoom,
      });
    } else if (event.hearingRange === '2_rooms' || event.hearingRange === 'same_room') {
      if (event.room === myRoom || adjacent.includes(event.room)) {
        sounds.push({
          type: 'event',
          eventId: event.id,
          description: event.description,
          room: event.room,
          muffled: event.room !== myRoom,
        });
      }
    }
  }

  return sounds;
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
function buildPerception(member, allMembers, gameTime, roomLights, recentEvents = []) {
  const visible = getVisibleEnvironment(member, allMembers);
  const audible = getAudibleEnvironment(member, allMembers, recentEvents);

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
  getAudibleEnvironment,
  buildPerception,
  getTimeOfDayLabel,
  ROOM_ADJACENCY,
  ROOM_MAP,
};
