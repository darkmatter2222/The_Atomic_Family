import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Stats } from '@react-three/drei';
import * as THREE from 'three';
import House3D from './components/House3D';
import CharacterSprite from './components/CharacterSprite';
import FirstPersonController from './components/FirstPersonController';
import SidePane from './components/SidePane';
import { createFamily, updateFamilyMember } from './game/FamilyMemberAI';

/**
 * GameScene - Main 3D scene containing the house and characters.
 * Exposes live family state so the sidebar can track the selected player.
 */
function GameScene({ onRoomHover, onFurnitureHover, onPlayerClick, onRoomClick, onGroundClick, selectedPlayerName, onFamilyUpdate, visibility, simSpeed, simPaused }) {
  const [family, setFamily] = useState(() => createFamily());
  const familyRef = useRef(family);

  // Keep ref in sync for non-React updates
  useEffect(() => {
    familyRef.current = family;
  }, [family]);

  // Notify parent of family updates so sidebar can live-track selected player
  useEffect(() => {
    if (onFamilyUpdate) onFamilyUpdate(family);
  }, [family, onFamilyUpdate]);

  // Game loop: update AI every frame
  useFrame((state, delta) => {
    if (simPaused) return;
    // Clamp delta to prevent large jumps, then scale by sim speed
    const dt = Math.min(delta, 0.1) * simSpeed;

    setFamily(prev =>
      prev.map(member => updateFamilyMember(member, dt))
    );
  });

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[15, 20, 15]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={80}
        shadow-camera-left={-25}
        shadow-camera-right={25}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
      />
      <pointLight position={[-3, 2.5, -2]} intensity={0.4} color="#FFE4B5" />
      <pointLight position={[3, 2.5, 2]} intensity={0.3} color="#E6E6FA" />

      {/* The House */}
      <House3D onRoomHover={onRoomHover} onFurnitureHover={onFurnitureHover} onRoomClick={onRoomClick} onGroundClick={onGroundClick} visibility={visibility} />

      {/* Family Members */}
      {family.map(member => (
        <CharacterSprite key={member.name} member={member} onClick={onPlayerClick} />
      ))}
    </>
  );
}

/**
 * CameraController - Follows a target position when a player is selected,
 * otherwise slowly auto-rotates around the house center.
 * The user can always orbit / zoom freely.
 */
function CameraController({ followTarget, autoRotate, topDown, lockOrientation }) {
  const controlsRef = useRef();
  const { camera } = useThree();
  const targetVec = useRef(new THREE.Vector3(0, 1, 0));
  const HOME_TARGET = new THREE.Vector3(0, 1, 0);
  const LERP_SPEED = 3;

  // Smoothly animate camera position for top-down / 3D transitions
  const desiredPos = useRef(new THREE.Vector3(12, 10, 12));

  useFrame((_, delta) => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;

    // --- Orbit target tracking ---
    if (followTarget) {
      const desired = new THREE.Vector3(followTarget.x, 1, followTarget.z);
      targetVec.current.lerp(desired, 1 - Math.exp(-LERP_SPEED * delta));
      controls.target.copy(targetVec.current);
      // When following a character, auto-rotate orbits around them
      controls.autoRotate = autoRotate;
      controls.autoRotateSpeed = 0.5;
    } else {
      targetVec.current.lerp(HOME_TARGET, 1 - Math.exp(-2 * delta));
      controls.target.copy(targetVec.current);
      controls.autoRotate = autoRotate;
      controls.autoRotateSpeed = 0.5;
    }

    // --- Top-down view ---
    if (topDown) {
      const t = followTarget || { x: 0, z: 0 };
      desiredPos.current.set(t.x, 22, t.z + 0.01);
      camera.position.lerp(desiredPos.current, 1 - Math.exp(-4 * delta));
      controls.minPolarAngle = 0.01;
      controls.maxPolarAngle = 0.02;

      // Lock orientation: prevent azimuth (horizontal) rotation
      if (lockOrientation) {
        controls.minAzimuthAngle = controls.getAzimuthalAngle();
        controls.maxAzimuthAngle = controls.getAzimuthalAngle();
        controls.enableRotate = false;
      } else {
        controls.minAzimuthAngle = -Infinity;
        controls.maxAzimuthAngle = Infinity;
        controls.enableRotate = true;
      }
    } else {
      controls.minPolarAngle = Math.PI / 6;
      controls.maxPolarAngle = Math.PI / 2.2;
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
      controls.enableRotate = true;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enableDamping
      dampingFactor={0.05}
      minDistance={5}
      maxDistance={50}
      maxPolarAngle={Math.PI / 2.2}
      minPolarAngle={Math.PI / 6}
      target={[0, 1, 0]}
      autoRotate={autoRotate}
      autoRotateSpeed={0.5}
      enablePan={false}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: undefined,
        RIGHT: undefined
      }}
    />
  );
}

/**
 * App - Root component
 */
export default function App() {
  const [hoveredRoom, setHoveredRoom] = useState(null);
  const [hoveredFurniture, setHoveredFurniture] = useState(null);
  const [sidePaneData, setSidePaneData] = useState(null);
  const [visibility, setVisibility] = useState({ walls: true, doors: true, furniture: true });
  const [cameraAutoRotate, setCameraAutoRotate] = useState(true);
  const [cameraTopDown, setCameraTopDown] = useState(false);
  const [cameraLockOrientation, setCameraLockOrientation] = useState(false);
  const [firstPerson, setFirstPerson] = useState(false);

  // Simulation state
  const [simPaused, setSimPaused] = useState(false);
  const [simSpeed, setSimSpeed] = useState(1);
  const SIM_SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

  const toggleVisibility = useCallback((key) => {
    setVisibility(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const [selectedPlayerName, setSelectedPlayerName] = useState(null);
  const [cameraFollowTarget, setCameraFollowTarget] = useState(null);
  const familyRef = useRef([]);

  const handleRoomHover = useCallback((room) => {
    setHoveredRoom(room);
  }, []);

  const handleFurnitureHover = useCallback((furniture) => {
    setHoveredFurniture(furniture);
  }, []);

  const handlePlayerClick = useCallback((member) => {
    setSelectedPlayerName(member.name);
    setSidePaneData({ type: 'player', payload: { ...member } });
    setCameraFollowTarget({ x: member.position.x, z: member.position.z });
  }, []);

  const handleRoomClick = useCallback((room) => {
    setSelectedPlayerName(null);
    setCameraFollowTarget(null);
    setSidePaneData({ type: 'room', payload: { ...room } });
  }, []);

  const handleGroundClick = useCallback(() => {
    setSelectedPlayerName(null);
    setCameraFollowTarget(null);
    setSidePaneData(null);
  }, []);

  const handleCloseSidePane = useCallback(() => {
    setSelectedPlayerName(null);
    setCameraFollowTarget(null);
    setSidePaneData(null);
  }, []);

  // Receive live family state from GameScene and update sidebar + camera follow
  const handleFamilyUpdate = useCallback((family) => {
    familyRef.current = family;
    if (selectedPlayerName) {
      const member = family.find(m => m.name === selectedPlayerName);
      if (member) {
        setSidePaneData(prev => {
          if (prev?.type === 'player') {
            return { type: 'player', payload: { ...member } };
          }
          return prev;
        });
        setCameraFollowTarget({ x: member.position.x, z: member.position.z });
      }
    }
  }, [selectedPlayerName]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* Title overlay */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        zIndex: 10,
        color: '#FFD700',
        fontFamily: '"Courier New", monospace',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
      }}>
        <h1 style={{ fontSize: '28px', margin: 0, letterSpacing: '2px' }}>
          THE ATOMIC FAMILY
        </h1>
        <p style={{ fontSize: '12px', color: '#aaa', marginTop: 4 }}>
          Pixel Craft Simulation | Orbit: Drag | Zoom: Scroll | FP: WASD
        </p>
      </div>

      {/* Hovered room indicator */}
      <RoomHoverIndicator room={hoveredRoom} />

      {/* Furniture tooltip */}
      <FurnitureTooltip furniture={hoveredFurniture} />

      {/* Room legend */}
      <RoomLegend hoveredRoom={hoveredRoom} />

      <Canvas
        shadows
        camera={{
          position: [18, 16, 20],
          fov: 50,
          near: 0.1,
          far: 150
        }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        <color attach="background" args={['#1a1a2e']} />
        <fog attach="fog" args={['#1a1a2e', 35, 80]} />

        <GameScene
          onRoomHover={handleRoomHover}
          onFurnitureHover={handleFurnitureHover}
          onPlayerClick={handlePlayerClick}
          onRoomClick={handleRoomClick}
          onGroundClick={handleGroundClick}
          selectedPlayerName={selectedPlayerName}
          onFamilyUpdate={handleFamilyUpdate}
          visibility={visibility}
          simSpeed={simSpeed}
          simPaused={simPaused}
        />
        {firstPerson ? (
          <FirstPersonController
            active={firstPerson}
            spawnPosition={cameraFollowTarget || { x: 0, z: 2 }}
          />
        ) : (
          <CameraController followTarget={cameraFollowTarget} autoRotate={cameraAutoRotate} topDown={cameraTopDown} lockOrientation={cameraLockOrientation} />
        )}
      </Canvas>

      {/* FP mode crosshair */}
      {firstPerson && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 20, pointerEvents: 'none'
        }}>
          <div style={{ width: 20, height: 2, background: 'rgba(255,255,255,0.5)', position: 'absolute', top: -1, left: -10 }} />
          <div style={{ width: 2, height: 20, background: 'rgba(255,255,255,0.5)', position: 'absolute', top: -10, left: -1 }} />
        </div>
      )}

      {/* FP mode hint */}
      {firstPerson && (
        <div style={{
          position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, pointerEvents: 'none',
          color: '#aaa', fontFamily: '"Courier New", monospace', fontSize: 11,
          background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '4px 14px'
        }}>
          WASD to move | Shift to run | Click to lock mouse | ESC to unlock
        </div>
      )}

      {/* Controls panel */}
      <ControlsPanel
        visibility={visibility}
        onToggleVisibility={toggleVisibility}
        cameraAutoRotate={cameraAutoRotate}
        onToggleAutoRotate={() => setCameraAutoRotate(p => !p)}
        cameraTopDown={cameraTopDown}
        onToggleTopDown={() => { setCameraTopDown(p => !p); setFirstPerson(false); }}
        cameraLockOrientation={cameraLockOrientation}
        onToggleLockOrientation={() => setCameraLockOrientation(p => !p)}
        firstPerson={firstPerson}
        onToggleFirstPerson={() => { setFirstPerson(p => !p); setCameraTopDown(false); }}
        simPaused={simPaused}
        onTogglePaused={() => setSimPaused(p => !p)}
        simSpeed={simSpeed}
        simSpeeds={SIM_SPEEDS}
        onSetSimSpeed={setSimSpeed}
      />

      {/* Side Pane */}
      <SidePane data={sidePaneData} onClose={handleCloseSidePane} />
    </div>
  );
}

function RoomHoverIndicator({ room }) {
  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10,
      fontFamily: '"Courier New", monospace',
      transition: 'opacity 0.2s ease',
      opacity: room ? 1 : 0,
      pointerEvents: 'none'
    }}>
      <div style={{
        background: 'rgba(0,0,0,0.75)',
        borderRadius: 8,
        padding: '8px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        border: room ? `2px solid ${room?.color || '#555'}` : '2px solid transparent',
        boxShadow: room ? `0 0 12px ${room?.color}44` : 'none'
      }}>
        <span style={{
          display: 'inline-block',
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: '#4ADE80',
          boxShadow: '0 0 6px #4ADE80'
        }} />
        <span style={{ color: '#4ADE80', fontSize: 14, fontWeight: 'bold', letterSpacing: 1 }}>
          {room?.name || ''}
        </span>
      </div>
    </div>
  );
}

function RoomLegend({ hoveredRoom }) {
  const rooms = [
    { id: 'living_room', name: 'Living Room', color: '#8B7355' },
    { id: 'kitchen', name: 'Kitchen', color: '#D2B48C' },
    { id: 'bedroom_master', name: 'Master Bedroom', color: '#6B8E23' },
    { id: 'bedroom_kids_shared', name: 'Shared Kids Room', color: '#4682B4' },
    { id: 'bedroom_kids_single', name: 'Kids Room', color: '#5B9BD5' },
    { id: 'bathroom', name: 'Bathroom', color: '#B0C4DE' },
    { id: 'laundry', name: 'Laundry Room', color: '#C4AEAD' },
    { id: 'hallway', name: 'Hallway', color: '#A0522D' },
    { id: 'garage', name: 'Garage', color: '#808080' }
  ];

  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      right: 20,
      zIndex: 10,
      background: 'rgba(0,0,0,0.7)',
      borderRadius: 8,
      padding: '12px 16px',
      color: '#fff',
      fontFamily: '"Courier New", monospace',
      fontSize: 11
    }}>
      <div style={{ marginBottom: 6, fontWeight: 'bold', color: '#FFD700' }}>Rooms</div>
      {rooms.map(r => {
        const isActive = hoveredRoom?.id === r.id;
        return (
          <div key={r.name} style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 3,
            padding: '2px 4px',
            borderRadius: 3,
            background: isActive ? 'rgba(74, 222, 128, 0.15)' : 'transparent',
            transition: 'background 0.2s ease'
          }}>
            <span style={{
              display: 'inline-block',
              width: 12,
              height: 12,
              background: isActive ? '#4ADE80' : r.color,
              borderRadius: 2,
              marginRight: 8,
              border: isActive ? '1px solid #4ADE80' : '1px solid rgba(255,255,255,0.3)',
              transition: 'all 0.2s ease'
            }} />
            <span style={{ color: isActive ? '#4ADE80' : '#fff', transition: 'color 0.2s ease' }}>
              {r.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ControlsPanel({
  visibility, onToggleVisibility,
  cameraAutoRotate, onToggleAutoRotate,
  cameraTopDown, onToggleTopDown,
  cameraLockOrientation, onToggleLockOrientation,
  firstPerson, onToggleFirstPerson,
  simPaused, onTogglePaused,
  simSpeed, simSpeeds, onSetSimSpeed
}) {
  const btnStyle = (on) => ({
    display: 'flex', alignItems: 'center', gap: 8,
    background: on ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.05)',
    border: on ? '1px solid rgba(74, 222, 128, 0.4)' : '1px solid rgba(255,255,255,0.15)',
    borderRadius: 5, padding: '5px 10px', cursor: 'pointer',
    color: on ? '#4ADE80' : '#777',
    fontFamily: '"Courier New", monospace', fontSize: 12,
    transition: 'all 0.15s ease', minWidth: 120
  });

  const checkStyle = (on) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 18, height: 18, borderRadius: 3,
    background: on ? '#4ADE80' : 'transparent',
    border: on ? '1px solid #4ADE80' : '1px solid #555',
    color: on ? '#000' : '#555',
    fontSize: 11, fontWeight: 'bold',
    transition: 'all 0.15s ease'
  });

  const ToggleBtn = ({ on, onClick, icon, label, disabled, indent }) => (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        ...btnStyle(on && !disabled),
        ...(indent ? { marginLeft: 14 } : {}),
        ...(disabled ? { opacity: 0.35, cursor: 'default' } : {})
      }}
    >
      <span style={checkStyle(on && !disabled)}>{on && !disabled ? '*' : ''}</span>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );

  const SectionTitle = ({ children }) => (
    <div style={{ fontSize: 11, fontWeight: 'bold', color: '#FFD700', marginBottom: 2, marginTop: 4, letterSpacing: 1 }}>
      {children}
    </div>
  );

  return (
    <div style={{
      position: 'absolute', bottom: 20, left: 20, zIndex: 10,
      background: 'rgba(0,0,0,0.8)', borderRadius: 10,
      padding: '12px 14px',
      fontFamily: '"Courier New", monospace',
      display: 'flex', flexDirection: 'column', gap: 5,
      maxHeight: 'calc(100vh - 60px)', overflowY: 'auto',
      backdropFilter: 'blur(6px)',
      border: '1px solid rgba(255,215,0,0.15)'
    }}>
      {/* ── Simulation ── */}
      <SectionTitle>Simulation</SectionTitle>
      <ToggleBtn on={!simPaused} onClick={onTogglePaused} icon={simPaused ? '>' : '||'} label={simPaused ? 'Resume' : 'Pause'} />

      {/* Speed selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
        <span style={{ color: '#aaa', fontSize: 11, marginRight: 4 }}>Speed:</span>
        {simSpeeds.map(s => (
          <button
            key={s}
            onClick={() => onSetSimSpeed(s)}
            style={{
              padding: '3px 7px', borderRadius: 4, cursor: 'pointer',
              fontFamily: '"Courier New", monospace', fontSize: 11,
              border: s === simSpeed ? '1px solid #FFD700' : '1px solid rgba(255,255,255,0.15)',
              background: s === simSpeed ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.05)',
              color: s === simSpeed ? '#FFD700' : '#888',
              transition: 'all 0.15s ease'
            }}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* ── Camera ── */}
      <SectionTitle>Camera</SectionTitle>
      <ToggleBtn on={firstPerson} onClick={onToggleFirstPerson} icon="[FP]" label="First Person" />
      <ToggleBtn on={cameraAutoRotate} onClick={onToggleAutoRotate} icon="[AR]" label="Auto Rotate" disabled={firstPerson} />
      <ToggleBtn on={cameraTopDown} onClick={onToggleTopDown} icon="[TD]" label="Top Down" disabled={firstPerson} />
      <ToggleBtn on={cameraLockOrientation} onClick={onToggleLockOrientation} icon="[LO]" label="Lock Orient." indent disabled={!cameraTopDown || firstPerson} />

      {/* ── Visibility ── */}
      <SectionTitle>Visibility</SectionTitle>
      <ToggleBtn on={visibility.walls} onClick={() => onToggleVisibility('walls')} icon="[W]" label="Walls" />
      <ToggleBtn on={visibility.doors} onClick={() => onToggleVisibility('doors')} icon="[D]" label="Doors" />
      <ToggleBtn on={visibility.furniture} onClick={() => onToggleVisibility('furniture')} icon="[F]" label="Furniture" />
    </div>
  );
}

/**
 * FurnitureTooltip - A small bubble that appears just above the cursor
 * when hovering over a piece of furniture in the 3D scene.
 */
function FurnitureTooltip({ furniture }) {
  if (!furniture) return null;

  return (
    <div
      style={{
        position: 'fixed',
        left: furniture.screenX,
        top: furniture.screenY - 48,
        transform: 'translateX(-50%)',
        zIndex: 100,
        pointerEvents: 'none',
        animation: 'tooltipFadeIn 0.15s ease'
      }}
    >
      <div style={{
        background: 'rgba(0, 0, 0, 0.85)',
        borderRadius: 6,
        padding: '5px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        border: '1px solid rgba(255, 215, 0, 0.5)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.6), 0 0 8px rgba(255,215,0,0.15)',
        whiteSpace: 'nowrap'
      }}>
        <span style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#FFD700',
          boxShadow: '0 0 4px #FFD700'
        }} />
        <span style={{
          color: '#FFD700',
          fontSize: 12,
          fontWeight: 'bold',
          fontFamily: '"Courier New", monospace',
          letterSpacing: 0.5
        }}>
          {furniture.label}
        </span>
      </div>
      {/* Arrow pointing down */}
      <div style={{
        width: 0,
        height: 0,
        margin: '0 auto',
        borderLeft: '6px solid transparent',
        borderRight: '6px solid transparent',
        borderTop: '6px solid rgba(0, 0, 0, 0.85)'
      }} />
    </div>
  );
}
