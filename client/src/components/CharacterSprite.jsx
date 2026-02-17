import React, { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { renderAllFrames } from '../game/SpriteRenderer';
import { CATEGORIES, POSE_TRANSFORMS, getBodyAnimForInteraction } from '../game/InteractionData';
import { getActivityFrames } from '../game/ActivityAnimator';

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

/* ── Activity-animation colour coding (bubble background) ─── */
// Driven by CATEGORIES from interactions.json — thin alias for backward compat
const ACTIVITY_COLORS = Object.fromEntries(
  Object.entries(CATEGORIES).map(([k, v]) => [k, v.color])
);

/* ── Emoji / icon per animation hint ─────────────────────── */
const ACTIVITY_ICONS = {
  sit:   '🪑',
  sleep: '💤',
  use:   '🔧',
  walk:  '🚶',
};

/* ── Per-category emoji for richer activity bubble icons ── */
// Driven by CATEGORIES from interactions.json
const CATEGORY_ICONS = Object.fromEntries(
  Object.entries(CATEGORIES).map(([k, v]) => [k, v.icon])
);

/**
 * CharacterSprite - A billboard sprite that renders pixel art from JSON data.
 * Always faces the camera. Shows activity bubble when performing an interaction.
 */
export default function CharacterSprite({ member, camera, onClick, activeSpeech }) {
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

  // ── Activity animation textures (generated per-interaction) ──
  const activityInteractionId = member.currentInteraction?.id || null;
  const activityTextures = useMemo(() => {
    if (!member.currentInteraction) return null;
    const bodyAnim = getBodyAnimForInteraction(member.currentInteraction);
    const actCanvases = getActivityFrames(spriteData, bodyAnim, 4);
    return actCanvases.map(canvas => {
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    });
  }, [spriteData, activityInteractionId]);

  // Sprite dimensions in world space
  const spriteWidth = useMemo(() => {
    const isChild = member.role === 'son' || member.role === 'daughter';
    return isChild ? 0.7 : 0.9;
  }, [member.role]);

  const spriteHeight = useMemo(() => {
    const isChild = member.role === 'son' || member.role === 'daughter';
    return isChild ? 1.0 : 1.4;
  }, [member.role]);

  // Update texture based on animation frame —
  // Use activity textures during PERFORMING, walk textures otherwise
  const isPerformingNow = member.state === 'performing' && member.currentInteraction;
  useEffect(() => {
    if (isPerformingNow && activityTextures && activityTextures.length > 0) {
      const idx = (member.activityAnimFrame || 0) % activityTextures.length;
      if (activityTextures[idx]) setCurrentTexture(activityTextures[idx]);
    } else {
      const tex = textures[member.animFrame % textures.length];
      if (tex) setCurrentTexture(tex);
    }
  }, [member.animFrame, member.activityAnimFrame, textures, activityTextures, isPerformingNow]);

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

  const isPerforming = member.state === 'performing' && member.activityLabel;
  const isSleeping = member.activityAnim === 'sleep';
  const isSitting = member.activityAnim === 'sit';
  const isUsing = member.activityAnim === 'use' && isPerforming;

  // ── Pose transforms (driven by interactions.json) ────────
  // Sleeping: flatten horizontally (lying down)
  // Sitting: drop significantly + shrink (looks like they sat down)
  // Using: slight forward lean
  let yOffset = 0;
  let scaleX = 1;
  let scaleY = 1;

  const poseKey = isSleeping ? 'sleep' : isSitting ? 'sit' : isUsing ? 'use' : null;
  if (poseKey) {
    const pose = POSE_TRANSFORMS[poseKey] || {};
    yOffset = spriteHeight * (pose.yOffset || 0);
    scaleX  = pose.scaleX  || 1;
    scaleY  = pose.scaleY  || 1;
  }

  return (
    <group position={[member.position.x, (member.position.y || 0) + spriteHeight / 2 + yOffset, member.position.z]}>
      <mesh
        ref={meshRef}
        onClick={handleClick}
        scale={[spriteWidth * scaleX, spriteHeight * scaleY, 1]}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={currentTexture}
          transparent={true}
          alphaTest={0.1}
          side={THREE.DoubleSide}
          depthWrite={true}
        />
      </mesh>

      {/* Name label above sprite */}
      <NameLabel name={member.name} height={spriteHeight * scaleY / 2 + 0.15} />

      {/* Speech bubble from agentic AI */}
      {activeSpeech && (
        <SpeechBubble
          text={activeSpeech.text}
          emotion={activeSpeech.emotion}
          target={activeSpeech.target}
          height={spriteHeight * scaleY / 2 + 0.65}
        />
      )}

      {/* Thinking indicator when waiting for LLM */}
      {member.state === 'thinking' && !activeSpeech && (
        <ThinkingBubble height={spriteHeight * scaleY / 2 + 0.55} />
      )}

      {/* Activity bubble (shows what the character is doing) */}
      {isPerforming && (
        <ActivityBubble
          label={member.activityLabel}
          anim={member.activityAnim}
          category={member.currentInteraction?.category}
          height={spriteHeight * scaleY / 2 + 0.4}
          progress={member.interactionDuration > 0 ? member.interactionTimer / member.interactionDuration : 0}
        />
      )}

      {/* Floating Z's when sleeping */}
      {isSleeping && <SleepZZZ height={spriteHeight * scaleY / 2 + 0.3} />}

      {/* Category-specific visual effects */}
      {isPerforming && member.currentInteraction?.category === 'cooking' && (
        <SteamEffect height={spriteHeight * scaleY / 2 + 0.2} />
      )}
      {isPerforming && member.currentInteraction?.category === 'hygiene' && member.activityAnim === 'use' && (
        <WaterDroplets height={spriteHeight * scaleY / 2} />
      )}
      {isPerforming && member.currentInteraction?.category === 'exercise' && (
        <SweatDrops height={spriteHeight * scaleY / 2 + 0.15} />
      )}
      {isPerforming && member.currentInteraction?.category === 'entertainment' && (
        <EntertainmentSparkle height={spriteHeight * scaleY / 2 + 0.1} />
      )}
      {isPerforming && member.currentInteraction?.category === 'eating' && (
        <EatingEffect height={spriteHeight * scaleY / 2 + 0.1} />
      )}
      {isPerforming && member.currentInteraction?.category === 'chores' && (
        <ChoresEffect height={spriteHeight * scaleY / 2 + 0.1} />
      )}
      {isPerforming && member.currentInteraction?.category === 'education' && (
        <StudyEffect height={spriteHeight * scaleY / 2 + 0.2} />
      )}
      {isPerforming && member.currentInteraction?.category === 'social' && (
        <SocialEffect height={spriteHeight * scaleY / 2 + 0.2} />
      )}
      {isPerforming && member.currentInteraction?.category === 'hobby' && (
        <HobbyEffect height={spriteHeight * scaleY / 2 + 0.2} />
      )}
      {isPerforming && member.currentInteraction?.category === 'relaxing' && !isSleeping && (
        <RelaxEffect height={spriteHeight * scaleY / 2 + 0.2} />
      )}

      {/* Shadow-casting proxy */}
      <mesh castShadow position={[0, 0, 0]}>
        <boxGeometry args={[spriteWidth * 0.4, spriteHeight * 0.9, spriteWidth * 0.25]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * ActivityBubble – floating label showing what a character is currently doing.
 * Changes colour by activity category and shows a small progress bar.
 */
function ActivityBubble({ label, anim, category, height, progress }) {
  const bgColor = ACTIVITY_COLORS[category] || '#555';
  // Prefer category icon (more specific), fall back to animation icon
  const icon = CATEGORY_ICONS[category] || ACTIVITY_ICONS[anim] || '';
  const displayText = icon ? `${icon} ${label}` : label;

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 48);

    // Background pill
    ctx.fillStyle = bgColor + 'CC';  // semi-transparent
    ctx.beginPath();
    ctx.roundRect(2, 2, 252, 36, 6);
    ctx.fill();

    // Progress bar along bottom
    if (progress > 0 && progress < 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(6, 32, 244 * progress, 4);
    }

    // Text
    ctx.font = 'bold 14px "Courier New"';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(displayText.slice(0, 26), 128, 24);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }, [displayText, bgColor, Math.floor(progress * 20)]); // re-generate at 5% steps

  return (
    <sprite position={[0, height, 0]} scale={[1.4, 0.28, 1]}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

/**
 * SleepZZZ – animated floating Z characters above a sleeping sprite
 */
function SleepZZZ({ height }) {
  const groupRef = useRef();

  useFrame((_, delta) => {
    if (groupRef.current) {
      // Gentle bobbing
      groupRef.current.position.y = height + Math.sin(Date.now() * 0.002) * 0.1;
    }
  });

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 64, 32);
    ctx.font = 'bold 20px "Courier New"';
    ctx.fillStyle = '#7986CB';
    ctx.textAlign = 'center';
    ctx.fillText('Z Z Z', 32, 22);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }, []);

  return (
    <group ref={groupRef}>
      <sprite position={[0, height, 0]} scale={[0.6, 0.2, 1]}>
        <spriteMaterial map={texture} transparent depthTest={false} opacity={0.85} />
      </sprite>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Category-specific visual effects — procedural particle/icon sprites
   ═══════════════════════════════════════════════════════════════════ */

/** Steam puffs for cooking */
function SteamEffect({ height }) {
  const groupRef = useRef();
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        const t = (Date.now() * 0.001 + i * 1.2) % 2;
        child.position.y = height + t * 0.4;
        child.position.x = Math.sin(Date.now() * 0.002 + i) * 0.12;
        child.material.opacity = Math.max(0, 0.6 - t * 0.35);
        child.scale.setScalar(0.08 + t * 0.06);
      });
    }
  });
  const tex = useMemo(() => makeCircleTexture('#FFFFFF'), []);
  return (
    <group ref={groupRef}>
      {[0, 1, 2].map(i => (
        <sprite key={i}><spriteMaterial map={tex} transparent depthTest={false} /></sprite>
      ))}
    </group>
  );
}

/** Water droplets for shower / bath / hygiene */
function WaterDroplets({ height }) {
  const groupRef = useRef();
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        const t = (Date.now() * 0.003 + i * 0.8) % 1.5;
        child.position.y = height + 0.3 - t * 0.5;
        child.position.x = (i - 1) * 0.15 + Math.sin(Date.now() * 0.004 + i) * 0.05;
        child.material.opacity = Math.max(0, 0.7 - t * 0.5);
        child.scale.setScalar(0.04 + t * 0.01);
      });
    }
  });
  const tex = useMemo(() => makeCircleTexture('#64B5F6'), []);
  return (
    <group ref={groupRef}>
      {[0, 1, 2].map(i => (
        <sprite key={i}><spriteMaterial map={tex} transparent depthTest={false} /></sprite>
      ))}
    </group>
  );
}

/** Sweat drops for exercise */
function SweatDrops({ height }) {
  const groupRef = useRef();
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        const t = (Date.now() * 0.002 + i * 1.5) % 2;
        child.position.y = height + 0.2 - t * 0.3;
        child.position.x = (i === 0 ? -0.2 : 0.2) + Math.sin(Date.now() * 0.003 + i) * 0.03;
        child.material.opacity = t < 1.5 ? 0.6 : 0;
        child.scale.setScalar(0.05);
      });
    }
  });
  const tex = useMemo(() => makeCircleTexture('#81D4FA'), []);
  return (
    <group ref={groupRef}>
      {[0, 1].map(i => (
        <sprite key={i}><spriteMaterial map={tex} transparent depthTest={false} /></sprite>
      ))}
    </group>
  );
}

/** Sparkle notes for entertainment (TV, music, games) */
function EntertainmentSparkle({ height }) {
  const groupRef = useRef();
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        const t = (Date.now() * 0.0015 + i * 1.1) % 2.5;
        child.position.y = height + Math.sin(t * 2) * 0.15;
        child.position.x = Math.cos(Date.now() * 0.002 + i * 2.1) * 0.25;
        child.material.opacity = 0.5 + Math.sin(Date.now() * 0.005 + i) * 0.3;
        child.scale.setScalar(0.06 + Math.sin(Date.now() * 0.003 + i) * 0.02);
      });
    }
  });
  const tex = useMemo(() => makeStarTexture('#FFD600'), []);
  return (
    <group ref={groupRef}>
      {[0, 1, 2].map(i => (
        <sprite key={i}><spriteMaterial map={tex} transparent depthTest={false} /></sprite>
      ))}
    </group>
  );
}

/** Fork/food for eating */
function EatingEffect({ height }) {
  const groupRef = useRef();
  useFrame(() => {
    if (groupRef.current) {
      const child = groupRef.current.children[0];
      if (child) {
        // Gentle up-down motion like eating
        child.position.y = height + Math.sin(Date.now() * 0.004) * 0.08;
        child.position.x = 0.2;
        child.material.opacity = 0.7;
        child.scale.setScalar(0.12);
      }
    }
  });
  const tex = useMemo(() => makeTextTexture('\ud83c\udf7d\ufe0f', 32), []);
  return (
    <group ref={groupRef}>
      <sprite><spriteMaterial map={tex} transparent depthTest={false} /></sprite>
    </group>
  );
}

/** Sparkle dust for chores (cleaning) */
function ChoresEffect({ height }) {
  const groupRef = useRef();
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        const t = (Date.now() * 0.002 + i * 1.3) % 2;
        child.position.y = height - 0.3 + Math.sin(t * 3) * 0.1;
        child.position.x = Math.sin(Date.now() * 0.003 + i * 2) * 0.3;
        child.material.opacity = 0.4 + Math.sin(Date.now() * 0.004 + i) * 0.2;
        child.scale.setScalar(0.04);
      });
    }
  });
  const tex = useMemo(() => makeCircleTexture('#CE93D8'), []);
  return (
    <group ref={groupRef}>
      {[0, 1, 2, 3].map(i => (
        <sprite key={i}><spriteMaterial map={tex} transparent depthTest={false} /></sprite>
      ))}
    </group>
  );
}

/** Book / lightbulb for study / education */
function StudyEffect({ height }) {
  const groupRef = useRef();
  useFrame(() => {
    if (groupRef.current) {
      const child = groupRef.current.children[0];
      if (child) {
        child.position.y = height + 0.1 + Math.sin(Date.now() * 0.001) * 0.03;
        child.position.x = 0.22;
        child.material.opacity = 0.5 + Math.sin(Date.now() * 0.003) * 0.2;
        child.scale.setScalar(0.1);
      }
    }
  });
  const tex = useMemo(() => makeTextTexture('\ud83d\udca1', 32), []);
  return (
    <group ref={groupRef}>
      <sprite><spriteMaterial map={tex} transparent depthTest={false} /></sprite>
    </group>
  );
}

/** Speech bubbles for social */
function SocialEffect({ height }) {
  const groupRef = useRef();
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        const t = (Date.now() * 0.001 + i * 1.8) % 3;
        child.position.y = height + t * 0.12;
        child.position.x = (i === 0 ? -0.15 : 0.15);
        child.material.opacity = t < 2.5 ? 0.6 : 0;
        child.scale.setScalar(0.08 + i * 0.02);
      });
    }
  });
  const tex = useMemo(() => makeTextTexture('\ud83d\udcac', 32), []);
  return (
    <group ref={groupRef}>
      {[0, 1].map(i => (
        <sprite key={i}><spriteMaterial map={tex} transparent depthTest={false} /></sprite>
      ))}
    </group>
  );
}

/** Music note / palette for hobbies */
function HobbyEffect({ height }) {
  const groupRef = useRef();
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        const t = (Date.now() * 0.0012 + i * 1.5) % 3;
        child.position.y = height + 0.1 + t * 0.08;
        child.position.x = Math.sin(Date.now() * 0.002 + i * 2) * 0.2;
        child.material.opacity = Math.max(0, 0.7 - t * 0.25);
        child.scale.setScalar(0.08);
      });
    }
  });
  const tex = useMemo(() => makeTextTexture('\u266b', 32), []);
  return (
    <group ref={groupRef}>
      {[0, 1].map(i => (
        <sprite key={i}><spriteMaterial map={tex} transparent depthTest={false} /></sprite>
      ))}
    </group>
  );
}

/** Gentle floating hearts/clouds for relaxing */
function RelaxEffect({ height }) {
  const groupRef = useRef();
  useFrame(() => {
    if (groupRef.current) {
      const child = groupRef.current.children[0];
      if (child) {
        child.position.y = height + 0.15 + Math.sin(Date.now() * 0.0008) * 0.06;
        child.position.x = Math.sin(Date.now() * 0.001) * 0.05;
        child.material.opacity = 0.4 + Math.sin(Date.now() * 0.002) * 0.15;
        child.scale.setScalar(0.1);
      }
    }
  });
  const tex = useMemo(() => makeTextTexture('\u2601\ufe0f', 32), []);
  return (
    <group ref={groupRef}>
      <sprite><spriteMaterial map={tex} transparent depthTest={false} /></sprite>
    </group>
  );
}

/* ═══ Texture helpers ═══════════════════════════════════════════════ */

/** Create a small circle texture with the given colour */
function makeCircleTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(8, 8, 7, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

/** Create a small star texture */
function makeStarTexture(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    const r = i === 0 ? 7 : 7;
    ctx[i === 0 ? 'moveTo' : 'lineTo'](8 + Math.cos(a) * 7, 8 + Math.sin(a) * 7);
    const a2 = a + (2 * Math.PI) / 10;
    ctx.lineTo(8 + Math.cos(a2) * 3, 8 + Math.sin(a2) * 3);
  }
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

/** Create a texture from an emoji/text character */
function makeTextTexture(text, size = 32) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.font = `${size * 0.8}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

/**
 * SpeechBubble – floating speech text above a character when the agentic AI
 * generates dialogue. Shows who they're talking to and their emotion.
 */
function SpeechBubble({ text, emotion, target, height }) {
  const groupRef = useRef();

  // Gentle float animation
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.y = height + Math.sin(Date.now() * 0.003) * 0.03;
    }
  });

  const EMOTION_ICONS = {
    happy: '😊', content: '😌', calm: '😐', neutral: '😐',
    annoyed: '😤', angry: '😡', sad: '😢', tired: '😴',
    excited: '🤩', worried: '😟', amused: '😄', firm: '😠',
    loving: '🥰', playful: '😜', scared: '😨', proud: '🥲',
  };

  const emotionIcon = EMOTION_ICONS[emotion] || '💬';
  const displayText = text.length > 40 ? text.slice(0, 37) + '...' : text;

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 320, 64);

    // Speech bubble background — white with slight transparency
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 312, 48, 8);
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(4, 4, 312, 48, 8);
    ctx.stroke();

    // Tail triangle
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.beginPath();
    ctx.moveTo(150, 52);
    ctx.lineTo(160, 62);
    ctx.lineTo(170, 52);
    ctx.fill();

    // Emotion icon
    ctx.font = '18px sans-serif';
    ctx.fillText(emotionIcon, 10, 36);

    // Speech text
    ctx.font = 'bold 13px "Courier New"';
    ctx.fillStyle = '#1a1a1a';
    ctx.textAlign = 'left';
    ctx.fillText(displayText, 34, 32);

    // Target indicator (small, right-aligned)
    if (target && target !== 'everyone') {
      ctx.font = '10px "Courier New"';
      ctx.fillStyle = '#888';
      ctx.textAlign = 'right';
      ctx.fillText(`→ ${target}`, 310, 16);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }, [displayText, emotionIcon, target]);

  return (
    <group ref={groupRef}>
      <sprite position={[0, height, 0]} scale={[1.8, 0.36, 1]}>
        <spriteMaterial map={texture} transparent depthTest={false} />
      </sprite>
    </group>
  );
}

/**
 * ThinkingBubble – animated thought indicator (💭 ...) when character is
 * waiting for LLM reasoning.
 */
function ThinkingBubble({ height }) {
  const groupRef = useRef();
  const [dots, setDots] = useState(1);

  // Animate thinking dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => (d % 3) + 1);
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.y = height + Math.sin(Date.now() * 0.004) * 0.05;
    }
  });

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 96, 48);

    // Thought bubble background
    ctx.fillStyle = 'rgba(180, 180, 220, 0.85)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 88, 32, 12);
    ctx.fill();

    // Small circles for thought bubble tail
    ctx.fillStyle = 'rgba(180, 180, 220, 0.7)';
    ctx.beginPath();
    ctx.arc(42, 40, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(36, 46, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Thinking text: 💭 + dots
    ctx.font = '16px sans-serif';
    ctx.fillText('💭', 10, 28);
    ctx.font = 'bold 18px "Courier New"';
    ctx.fillStyle = '#444';
    ctx.fillText('.'.repeat(dots), 38, 28);

    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }, [dots]);

  return (
    <group ref={groupRef}>
      <sprite position={[0, height, 0]} scale={[0.6, 0.3, 1]}>
        <spriteMaterial map={texture} transparent depthTest={false} />
      </sprite>
    </group>
  );
}

function NameLabel({ name, height }) {
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


