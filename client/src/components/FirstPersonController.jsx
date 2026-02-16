import React, { useRef, useEffect, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PointerLockControls } from '@react-three/drei';
import { createWalkableGrid, worldToGrid, getRoomAtPosition } from '../game/HouseLayout';

const gridData = createWalkableGrid(2);

/**
 * FirstPersonController
 * WASD movement + mouse look via PointerLockControls.
 * Click the canvas to lock the pointer; ESC to release.
 * Movement is collision-checked against the walkable grid.
 */
export default function FirstPersonController({ active, spawnPosition, onRoomChange, onExit }) {
  const controlsRef = useRef();
  const { camera, gl } = useThree();
  const velocity = useRef(new THREE.Vector3());
  const keys = useRef({ w: false, a: false, s: false, d: false, shift: false });
  const isLocked = useRef(false);

  const WALK_SPEED = 4.0;
  const RUN_SPEED = 7.0;
  const EYE_HEIGHT = 1.65;

  // Place camera at spawn when entering FP mode
  useEffect(() => {
    if (!active) return;
    const sp = spawnPosition || { x: 0, z: 0 };
    camera.position.set(sp.x, EYE_HEIGHT, sp.z);
    camera.rotation.set(0, 0, 0);
  }, [active, spawnPosition, camera]);

  // Keyboard listeners
  useEffect(() => {
    if (!active) return;

    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (k in keys.current) keys.current[k] = true;
      if (k === 'shift') keys.current.shift = true;
      // ESC is handled by PointerLockControls
    };
    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k in keys.current) keys.current[k] = false;
      if (k === 'shift') keys.current.shift = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      // Reset keys when leaving
      keys.current = { w: false, a: false, s: false, d: false, shift: false };
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

    // Compute desired movement vector relative to camera facing
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

    if (direction.lengthSq() > 0) {
      direction.normalize().multiplyScalar(speed * dt);

      // Collision check: try X and Z independently for wall sliding
      const newX = camera.position.x + direction.x;
      const newZ = camera.position.z + direction.z;

      const canMoveX = isWalkable(newX, camera.position.z);
      const canMoveZ = isWalkable(camera.position.x, newZ);

      if (canMoveX) camera.position.x = newX;
      if (canMoveZ) camera.position.z = newZ;

      // Keep eye height fixed
      camera.position.y = EYE_HEIGHT;

      // Notify parent about room changes
      if (onRoomChange) {
        const room = getRoomAtPosition(camera.position.x, camera.position.z);
        if (room) onRoomChange(room);
      }
    }
  });

  if (!active) return null;

  return <PointerLockControls ref={controlsRef} />;
}

/**
 * Check if a world position is on walkable grid
 */
function isWalkable(worldX, worldZ) {
  const { gx, gz } = worldToGrid(worldX, worldZ, gridData);
  if (gz < 0 || gz >= gridData.gridHeight || gx < 0 || gx >= gridData.gridWidth) return false;
  return gridData.grid[gz][gx] === 1;
}
