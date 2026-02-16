/**
 * FamilyMemberAI - Manages random movement behavior for each family member.
 * Each character picks a random destination, pathfinds to it, walks there,
 * idles for a bit, then picks a new destination.
 */

import { findPath, smoothPath } from './Pathfinding';
import { createWalkableGrid, worldToGrid, getRandomWalkablePosition, getRoomAtPosition } from './HouseLayout';

// Create the walkable grid once
const gridData = createWalkableGrid(2);

/**
 * State machine states for each family member
 */
const STATE = {
  IDLE: 'idle',
  WALKING: 'walking',
  CHOOSING: 'choosing'
};

/**
 * Create initial AI state for a family member
 */
export function createFamilyMemberState(name, role, startX, startZ) {
  return {
    name,
    role,
    position: { x: startX, y: 0, z: startZ },
    state: STATE.CHOOSING,
    path: [],
    pathIndex: 0,
    idleTimer: 0,
    idleDuration: 1 + Math.random() * 3, // 1-4 seconds idle
    walkSpeed: 1.5 + Math.random() * 0.5, // units per second
    currentRoom: getRoomAtPosition(startX, startZ) || 'living_room',
    animFrame: 0,
    animTimer: 0,
    facingRight: true
  };
}

/**
 * Update a single family member's AI state
 * @param {Object} member - The member state object
 * @param {number} deltaTime - Time elapsed in seconds
 * @returns {Object} Updated member state
 */
export function updateFamilyMember(member, deltaTime) {
  const updated = { ...member };

  switch (updated.state) {
    case STATE.CHOOSING: {
      // Pick a random destination
      const dest = getRandomWalkablePosition();
      const startGrid = worldToGrid(updated.position.x, updated.position.z, gridData);
      const endGrid = worldToGrid(dest.x, dest.z, gridData);

      const rawPath = findPath(gridData.grid, startGrid, endGrid);
      if (rawPath.length > 1) {
        updated.path = smoothPath(rawPath, gridData);
        updated.pathIndex = 0;
        updated.state = STATE.WALKING;
      } else {
        // Couldn't find path, try again next frame
        updated.idleTimer = 0;
        updated.idleDuration = 0.5;
        updated.state = STATE.IDLE;
      }
      break;
    }

    case STATE.WALKING: {
      if (updated.pathIndex >= updated.path.length) {
        // Reached destination
        updated.state = STATE.IDLE;
        updated.idleTimer = 0;
        updated.idleDuration = 2 + Math.random() * 5; // 2-7 seconds
        updated.animFrame = 0;
        break;
      }

      const target = updated.path[updated.pathIndex];
      const dx = target.x - updated.position.x;
      const dz = target.z - updated.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 0.1) {
        // Reached waypoint, move to next
        updated.pathIndex++;
        break;
      }

      // Move towards target
      const moveAmount = updated.walkSpeed * deltaTime;
      const ratio = Math.min(moveAmount / dist, 1);
      updated.position = {
        x: updated.position.x + dx * ratio,
        y: 0,
        z: updated.position.z + dz * ratio
      };

      // Determine facing direction
      if (Math.abs(dx) > 0.01) {
        updated.facingRight = dx > 0;
      }

      // Update current room
      const room = getRoomAtPosition(updated.position.x, updated.position.z);
      if (room) updated.currentRoom = room;

      // Animate walking
      updated.animTimer += deltaTime;
      if (updated.animTimer > 0.125) { // ~8 fps animation
        updated.animTimer = 0;
        updated.animFrame = (updated.animFrame + 1) % 6;
      }
      break;
    }

    case STATE.IDLE: {
      updated.idleTimer += deltaTime;
      updated.animFrame = 0; // Standing frame
      if (updated.idleTimer >= updated.idleDuration) {
        updated.state = STATE.CHOOSING;
      }
      break;
    }
  }

  return updated;
}

/**
 * Get the initial family members
 */
export function createFamily() {
  return [
    createFamilyMemberState('Dad', 'father', -5, -3),
    createFamilyMemberState('Mom', 'mother', -5, 3),
    createFamilyMemberState('Emma', 'daughter', 3.5, 5),
    createFamilyMemberState('Lily', 'daughter', 4.5, 5),
    createFamilyMemberState('Jack', 'son', 7.5, 5)
  ];
}
