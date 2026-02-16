import React, { useRef, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PointerLockControls } from '@react-three/drei';
import { createWalkableGrid, worldToGrid, getRoomAtPosition, getSurfaceHeight } from '../game/HouseLayout';

const gridData = createWalkableGrid(2);

/**
 * FirstPersonController
 * WASD movement + mouse look via PointerLockControls.
 * SPACE to jump. Jump lets you clear small obstacles and land on top of furniture.
 * SHIFT to sprint.
 * Click the canvas to lock the pointer; ESC to release.
 * Movement is collision-checked against the walkable grid + furniture heights.
 */
export default function FirstPersonController({ active, spawnPosition, onRoomChange, onExit }) {
  const controlsRef = useRef();
  const { camera, gl } = useThree();
  const keys = useRef({ w: false, a: false, s: false, d: false, shift: false, space: false });
  const isLocked = useRef(false);

  // Physics state
  const verticalVelocity = useRef(0);     // current Y velocity (units/sec)
  const isGrounded = useRef(true);         // whether player is on a surface
  const currentFloorY = useRef(0);         // the Y of the surface we're standing on
  const justJumped = useRef(false);        // prevents holding space from re-jumping

  const WALK_SPEED = 4.0;
  const RUN_SPEED = 7.0;
  const EYE_HEIGHT = 1.65;                 // eye offset above feet
  const JUMP_VELOCITY = 5.5;              // initial upward velocity when jumping
  const GRAVITY = -14.0;                   // gravity acceleration (units/sec²)
  const STEP_HEIGHT = 0.35;               // max height we can step up without jumping
  const BODY_RADIUS = 0.25;               // collision radius for furniture overlap

  // Place camera at spawn ONCE when entering FP mode
  const hasSpawned = useRef(false);
  useEffect(() => {
    if (!active) {
      hasSpawned.current = false;
      verticalVelocity.current = 0;
      isGrounded.current = true;
      currentFloorY.current = 0;
      return;
    }
    if (hasSpawned.current) return;
    hasSpawned.current = true;
    const sp = spawnPosition || { x: 0, z: 0 };
    const surfaceY = getSurfaceHeight(sp.x, sp.z, BODY_RADIUS);
    currentFloorY.current = surfaceY;
    camera.position.set(sp.x, surfaceY + EYE_HEIGHT, sp.z);
    camera.rotation.set(0, 0, 0);
  }, [active, spawnPosition, camera]);

  // Keyboard listeners
  useEffect(() => {
    if (!active) return;

    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (k in keys.current) keys.current[k] = true;
      if (k === 'shift') keys.current.shift = true;
      if (e.code === 'Space') {
        e.preventDefault();
        keys.current.space = true;
      }
    };
    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k in keys.current) keys.current[k] = false;
      if (k === 'shift') keys.current.shift = false;
      if (e.code === 'Space') {
        keys.current.space = false;
        justJumped.current = false; // allow jumping again once space is released
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      keys.current = { w: false, a: false, s: false, d: false, shift: false, space: false };
    };
  }, [active]);

  // Click to lock pointer
  useEffect(() => {
    if (!active) return;
    const handleClick = () => {
      if (controlsRef.current && !isLocked.current) {
        controlsRef.current.lock();
      }
    };
    gl.domElement.addEventListener('click', handleClick);
    return () => gl.domElement.removeEventListener('click', handleClick);
  }, [active, gl]);

  // Track lock state
  useEffect(() => {
    if (!active || !controlsRef.current) return;
    const ctrl = controlsRef.current;
    const onLock = () => { isLocked.current = true; };
    const onUnlock = () => { isLocked.current = false; };
    ctrl.addEventListener('lock', onLock);
    ctrl.addEventListener('unlock', onUnlock);
    return () => {
      ctrl.removeEventListener('lock', onLock);
      ctrl.removeEventListener('unlock', onUnlock);
    };
  }, [active]);

  useFrame((_, delta) => {
    if (!active) return;
    const dt = Math.min(delta, 0.1);
    const speed = keys.current.shift ? RUN_SPEED : WALK_SPEED;

    // --- Horizontal movement ---
    const direction = new THREE.Vector3();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    if (keys.current.w) direction.add(forward);
    if (keys.current.s) direction.sub(forward);
    if (keys.current.d) direction.add(right);
    if (keys.current.a) direction.sub(right);

    // Current feet Y (camera Y minus eye offset)
    const feetY = camera.position.y - EYE_HEIGHT;

    if (direction.lengthSq() > 0) {
      direction.normalize().multiplyScalar(speed * dt);

      const newX = camera.position.x + direction.x;
      const newZ = camera.position.z + direction.z;

      // Check if we can move to the new X position
      const canMoveX = canMoveTo(newX, camera.position.z, feetY);
      // Check if we can move to the new Z position
      const canMoveZ = canMoveTo(camera.position.x, newZ, feetY);

      if (canMoveX) camera.position.x = newX;
      if (canMoveZ) camera.position.z = newZ;
    }

    // --- Jumping ---
    if (keys.current.space && isGrounded.current && !justJumped.current) {
      verticalVelocity.current = JUMP_VELOCITY;
      isGrounded.current = false;
      justJumped.current = true;
    }

    // --- Gravity & vertical position ---
    if (!isGrounded.current) {
      verticalVelocity.current += GRAVITY * dt;
    }

    // Compute new feet Y
    let newFeetY = feetY + verticalVelocity.current * dt;

    // Determine floor level at current XZ
    const surfaceY = getSurfaceHeight(camera.position.x, camera.position.z, BODY_RADIUS);

    if (newFeetY <= surfaceY) {
      // Landed on surface (floor or furniture top)
      newFeetY = surfaceY;
      verticalVelocity.current = 0;
      isGrounded.current = true;
      currentFloorY.current = surfaceY;
    } else {
      isGrounded.current = false;
    }

    camera.position.y = newFeetY + EYE_HEIGHT;

    // --- Room tracking ---
    if (onRoomChange) {
      const room = getRoomAtPosition(camera.position.x, camera.position.z);
      if (room) onRoomChange(room);
    }
  });

  if (!active) return null;

  return <PointerLockControls ref={controlsRef} />;
}

/**
 * Check if the player can move to (worldX, worldZ) given their current feet Y.
 * Allows movement if:
 *  - The grid cell is walkable, OR
 *  - There's furniture there that is at or below (feetY + STEP_HEIGHT) — we can step onto it
 *  - If the player is above the furniture (jumping/airborne), they can pass over it
 */
function canMoveTo(worldX, worldZ, feetY) {
  // First check the walkable grid (rooms + open floor)
  const { gx, gz } = worldToGrid(worldX, worldZ, gridData);
  const inBounds = gz >= 0 && gz < gridData.gridHeight && gx >= 0 && gx < gridData.gridWidth;
  const gridWalkable = inBounds && gridData.grid[gz][gx] === 1;

  // If the grid says walkable, we're fine (furniture cells are marked 0 in the grid,
  // but we handle those with height logic below)
  if (gridWalkable) return true;

  // Not on walkable grid — check if there's furniture we can step/jump onto
  if (!inBounds) return false;

  // Check furniture height at destination
  const surfaceH = getSurfaceHeight(worldX, worldZ, 0.25);
  if (surfaceH <= 0) return false; // not walkable, no furniture — it's a wall

  // Can step up onto low furniture (step height tolerance)
  const STEP_HEIGHT = 0.35;
  if (feetY >= surfaceH - STEP_HEIGHT) return true;

  // Player is high enough in the air to be above this furniture
  if (feetY >= surfaceH) return true;

  return false;
}
