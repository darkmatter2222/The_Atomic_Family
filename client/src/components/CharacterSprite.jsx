import React, { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { renderAllFrames } from '../game/SpriteRenderer';

// Import sprite data
import fatherWalk from '../sprites/father_walk.json';
import motherWalk from '../sprites/mother_walk.json';
import daughter1Walk from '../sprites/daughter1_walk.json';
import daughter2Walk from '../sprites/daughter2_walk.json';
import sonWalk from '../sprites/son_walk.json';

const SPRITE_DATA = {
  father: fatherWalk,
  mother: motherWalk,
  daughter1: daughter1Walk,
  daughter2: daughter2Walk,
  son: sonWalk
};

// Map character names to sprite data keys
const NAME_TO_SPRITE = {
  'Dad': 'father',
  'Mom': 'mother',
  'Emma': 'daughter1',
  'Lily': 'daughter2',
  'Jack': 'son'
};

/**
 * CharacterSprite - A billboard sprite that renders pixel art from JSON data.
 * Always faces the camera. Animates walking frames when moving.
 */
export default function CharacterSprite({ member, camera, onClick }) {
  const meshRef = useRef();
  const [currentTexture, setCurrentTexture] = useState(null);

  const spriteKey = NAME_TO_SPRITE[member.name] || 'father';
  const spriteData = SPRITE_DATA[spriteKey];

  // Pre-render all frames as canvases
  const frameCanvases = useMemo(() => {
    return renderAllFrames(spriteData, 4);
  }, [spriteData]);

  // Create textures from canvases
  const textures = useMemo(() => {
    return frameCanvases.map(canvas => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    });
  }, [frameCanvases]);

  // Sprite dimensions in world space
  const spriteWidth = useMemo(() => {
    const isChild = member.role === 'son' || member.role === 'daughter';
    return isChild ? 0.7 : 0.9;
  }, [member.role]);

  const spriteHeight = useMemo(() => {
    const isChild = member.role === 'son' || member.role === 'daughter';
    return isChild ? 1.0 : 1.4;
  }, [member.role]);

  // Update texture based on animation frame
  useEffect(() => {
    const tex = textures[member.animFrame % textures.length];
    if (tex) setCurrentTexture(tex);
  }, [member.animFrame, textures]);

  // Billboard effect: always face camera
  useFrame(({ camera }) => {
    if (meshRef.current) {
      meshRef.current.quaternion.copy(camera.quaternion);
    }
  });

  if (!currentTexture) return null;

  const handleClick = (e) => {
    e.stopPropagation();
    if (onClick) onClick(member);
  };

  return (
    <group position={[member.position.x, spriteHeight / 2, member.position.z]}>
      <mesh ref={meshRef} onClick={handleClick} style={{ cursor: 'pointer' }}>
        <planeGeometry args={[spriteWidth, spriteHeight]} />
        <meshBasicMaterial
          map={currentTexture}
          transparent={true}
          alphaTest={0.1}
          side={THREE.DoubleSide}
          depthWrite={true}
        />
      </mesh>
      {/* Name label above sprite */}
      <NameLabel name={member.name} height={spriteHeight / 2 + 0.15} />
      {/* Small shadow on ground */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[0, -spriteHeight / 2 + 0.02, 0]}
        scale={[1, 0.4, 1]}
      >
        <circleGeometry args={[spriteWidth * 0.4, 16]} />
        <meshBasicMaterial color="black" transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

function NameLabel({ name, height }) {
  const canvasRef = useRef(null);
  const textureRef = useRef(null);

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 32);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.roundRect(0, 4, 128, 24, 4);
    ctx.fill();
    ctx.font = 'bold 16px "Courier New"';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(name, 64, 22);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }, [name]);

  return (
    <sprite position={[0, height, 0]} scale={[0.8, 0.2, 1]}>
      <spriteMaterial map={texture} transparent />
    </sprite>
  );
}


