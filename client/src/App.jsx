import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Stats, Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { io } from 'socket.io-client';
import House3D from './components/House3D';
import CharacterSprite from './components/CharacterSprite';
import FirstPersonController from './components/FirstPersonController';
import SidePane from './components/SidePane';
import ConversationViewer from './components/ConversationViewer';
import { HOUSE_LAYOUT } from './game/HouseLayout';

/* ════════════════════════════════════════════════════════════════
 *  SOCKET.IO CONNECTION — single shared instance
 * ════════════════════════════════════════════════════════════════ */
const socket = io({ transports: ['websocket', 'polling'] });

/* ════════════════════════════════════════════════════════════════
 *  TIME / SKY HELPERS
 * ════════════════════════════════════════════════════════════════ */

function getEasternTime() {
  // Build a Date whose local-looking fields match US-Eastern wall-clock
  const str = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  return new Date(str);
}

function lerpRGB(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

const SKY_KEYFRAMES = [
  { hour: 0,    color: [8, 8, 25] },
  { hour: 5,    color: [12, 12, 35] },
  { hour: 5.5,  color: [40, 30, 60] },
  { hour: 6,    color: [80, 50, 80] },
  { hour: 6.5,  color: [200, 120, 80] },
  { hour: 7.5,  color: [170, 200, 230] },
  { hour: 9,    color: [135, 205, 245] },
  { hour: 12,   color: [130, 210, 255] },
  { hour: 16,   color: [130, 195, 240] },
  { hour: 17.5, color: [220, 160, 100] },
  { hour: 18,   color: [200, 100, 60] },
  { hour: 18.5, color: [80, 40, 70] },
  { hour: 19.5, color: [20, 15, 40] },
  { hour: 20.5, color: [10, 10, 30] },
  { hour: 24,   color: [8, 8, 25] },
];

function sampleKeyframes(kf, hour) {
  for (let i = 0; i < kf.length - 1; i++) {
    if (hour >= kf[i].hour && hour < kf[i + 1].hour) {
      const t = (hour - kf[i].hour) / (kf[i + 1].hour - kf[i].hour);
      return lerpRGB(kf[i].color, kf[i + 1].color, t);
    }
  }
  return kf[0].color;
}

/* ════════════════════════════════════════════════════════════════
 *  SunSystem – drives the directional light, ambient, sky colour,
 *  visual sun / moon spheres, and keeps the game clock ticking.
 * ════════════════════════════════════════════════════════════════ */

function SunSystem({ gameTime }) {
  const sunRef = useRef();
  const ambientRef = useRef();
  const sunSphereRef = useRef();
  const moonSphereRef = useRef();
  const { scene } = useThree();

  useFrame(() => {
    /* ── Sun maths — driven by server-authoritative gameTime ── */
    const t = gameTime;
    const hour = t.getHours() + t.getMinutes() / 60 + t.getSeconds() / 3600;

    const SUNRISE = 6, SUNSET = 18;
    const RADIUS = 40;
    const isDaytime = hour >= SUNRISE && hour <= SUNSET;

    let sunX, sunY, sunZ, sunIntensity, ambientIntensity;
    let sunR, sunG, sunB;

    if (isDaytime) {
      const frac = (hour - SUNRISE) / (SUNSET - SUNRISE);          // 0 → 1
      const angle = Math.PI * frac;
      sunX = RADIUS * Math.cos(angle);          // +E → -W
      sunY = RADIUS * Math.sin(angle);          // peaks at noon
      sunZ = RADIUS * 0.25;

      const hf = Math.sin(angle);               // height-factor 0→1→0
      sunIntensity = 0.35 + hf * 1.0;
      ambientIntensity = 0.2 + hf * 0.4;

      // Sun colour: warm orange at horizon, white-ish at peak
      const warmth = 1 - hf;
      const sc = lerpRGB([255, 200, 110], [255, 250, 240], 1 - warmth);
      sunR = sc[0] / 255; sunG = sc[1] / 255; sunB = sc[2] / 255;
    } else {
      // Night arc for the moon
      const nightHour = hour < SUNRISE ? hour + 24 : hour;
      const nightFrac = (nightHour - SUNSET) / (24 - (SUNSET - SUNRISE));
      const angle = Math.PI * nightFrac;
      sunX = -RADIUS * 0.8 * Math.cos(angle);
      sunY = RADIUS * 0.3 * Math.sin(angle) + 5;
      sunZ = RADIUS * 0.2;
      sunIntensity = 0.08;
      ambientIntensity = 0.1;
      sunR = 0.4; sunG = 0.45; sunB = 0.7;   // cool moonlight
    }

    /* ── Apply to lights ─────────────────────────────── */
    if (sunRef.current) {
      sunRef.current.position.set(sunX, Math.max(sunY, 1), sunZ);
      sunRef.current.intensity = sunIntensity;
      sunRef.current.color.setRGB(sunR, sunG, sunB);
    }
    if (ambientRef.current) {
      ambientRef.current.intensity = ambientIntensity;
      if (isDaytime) ambientRef.current.color.setRGB(1, 0.98, 0.95);
      else          ambientRef.current.color.setRGB(0.3, 0.35, 0.5);
    }

    /* ── Visual spheres ──────────────────────────────── */
    if (sunSphereRef.current) {
      sunSphereRef.current.visible = isDaytime;
      if (isDaytime) {
        sunSphereRef.current.position.set(sunX, sunY, sunZ);
      }
    }
    if (moonSphereRef.current) {
      moonSphereRef.current.visible = !isDaytime;
      if (!isDaytime) {
        moonSphereRef.current.position.set(sunX, Math.max(sunY, 1), sunZ);
      }
    }

    /* ── Sky / fog ───────────────────────────────────── */
    const sky = sampleKeyframes(SKY_KEYFRAMES, hour);
    scene.background.setRGB(sky[0] / 255, sky[1] / 255, sky[2] / 255);
    if (scene.fog) {
      scene.fog.color.setRGB(sky[0] / 255, sky[1] / 255, sky[2] / 255);
      scene.fog.near = isDaytime ? 40 : 20;
      scene.fog.far  = isDaytime ? 100 : 50;
    }
  });

  return (
    <>
      <ambientLight ref={ambientRef} intensity={0.5} />
      <directionalLight
        ref={sunRef}
        position={[15, 20, 10]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={80}
        shadow-camera-left={-30}
        shadow-camera-right={30}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
      />
      {/* Visual sun */}
      <mesh ref={sunSphereRef}>
        <sphereGeometry args={[2.5, 16, 16]} />
        <meshBasicMaterial color="#FFE484" />
      </mesh>
      {/* Visual moon */}
      <mesh ref={moonSphereRef}>
        <sphereGeometry args={[1.5, 16, 16]} />
        <meshBasicMaterial color="#E8E8F0" />
      </mesh>
    </>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  CompassIndicators – giant E / W / N / S labels in the world
 * ════════════════════════════════════════════════════════════════ */

function CompassIndicators() {
  return (
    <group>
      <Billboard position={[38, 4, 0]}><Text fontSize={4} color="#FFD700" outlineWidth={0.2} outlineColor="#000">E</Text></Billboard>
      <Billboard position={[-38, 4, 0]}><Text fontSize={4} color="#FFD700" outlineWidth={0.2} outlineColor="#000">W</Text></Billboard>
      <Billboard position={[0, 4, -38]}><Text fontSize={3} color="#C0C0C0" outlineWidth={0.15} outlineColor="#000">N</Text></Billboard>
      <Billboard position={[0, 4, 38]}><Text fontSize={3} color="#C0C0C0" outlineWidth={0.15} outlineColor="#000">S</Text></Billboard>
    </group>
  );
}

/**
 * GameScene - Main 3D scene containing the house and characters.
 * PASSIVE RENDERER: receives family state from the server via props.
 * No local AI logic — the server is the source of truth.
 */
function GameScene({ onRoomHover, onFurnitureHover, onPlayerClick, onRoomClick, onGroundClick, selectedPlayerName, onFamilyUpdate, visibility, roomLights, gameTime, firstPerson, family, activeSpeech }) {

  // Notify parent of family updates so sidebar can live-track selected player
  useEffect(() => {
    if (onFamilyUpdate) onFamilyUpdate(family);
  }, [family, onFamilyUpdate]);

  return (
    <>
      {/* Sun / Moon / Ambient – driven by server game clock */}
      <SunSystem gameTime={gameTime} />

      {/* Compass indicators */}
      <CompassIndicators />

      {/* The House */}
      <House3D onRoomHover={onRoomHover} onFurnitureHover={onFurnitureHover} onRoomClick={onRoomClick} onGroundClick={onGroundClick} visibility={visibility} roomLights={roomLights} firstPerson={firstPerson} />

      {/* Family Members */}
      {family.map(member => {
        const speech = activeSpeech?.find(s => s.speaker === member.name);
        return (
          <CharacterSprite key={member.name} member={member} onClick={onPlayerClick} activeSpeech={speech || null} />
        );
      })}
    </>
  );
}

/**
 * CameraController - Follows a target position when a player is selected,
 * otherwise slowly auto-rotates around the house center.
 * The user can always orbit / zoom freely.
 */
function CameraController({ followTarget, autoRotate, topDown, lockOrientation, recenter }) {
  const controlsRef = useRef();
  const { camera } = useThree();
  const targetVec = useRef(new THREE.Vector3(0, 1, 0));
  const HOME_TARGET = new THREE.Vector3(0, 1, 0);
  const LERP_SPEED = 3;
  const isRecentering = useRef(false);

  // Smoothly animate camera position for top-down / 3D transitions
  const desiredPos = useRef(new THREE.Vector3(12, 10, 12));

  // When recenter flag changes to true, start recentering
  const prevRecenter = useRef(0);
  if (recenter !== prevRecenter.current) {
    prevRecenter.current = recenter;
    isRecentering.current = true;
  }

  useFrame((_, delta) => {
    if (!controlsRef.current) return;
    const controls = controlsRef.current;

    // --- Orbit target tracking ---
    if (followTarget) {
      // Following a player: smoothly track them
      const desired = new THREE.Vector3(followTarget.x, 1, followTarget.z);
      targetVec.current.lerp(desired, 1 - Math.exp(-LERP_SPEED * delta));
      controls.target.copy(targetVec.current);
      controls.autoRotate = autoRotate;
      controls.autoRotateSpeed = 0.5;
      isRecentering.current = false;
    } else if (isRecentering.current) {
      // Recentering after ground click: smoothly return to home
      targetVec.current.lerp(HOME_TARGET, 1 - Math.exp(-4 * delta));
      controls.target.copy(targetVec.current);
      // Stop recentering once close enough
      if (targetVec.current.distanceTo(HOME_TARGET) < 0.05) {
        isRecentering.current = false;
      }
      controls.autoRotate = autoRotate;
      controls.autoRotateSpeed = 0.5;
    } else {
      // Free camera: let user pan wherever they want, don't override target
      targetVec.current.copy(controls.target);
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
      enablePan={true}
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: undefined,
        RIGHT: THREE.MOUSE.PAN
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

  // Panel visibility (super menu)
  const [panelVis, setPanelVis] = useState({
    lightSwitches: true,
    controls: true,
    timeHud: true,
    roomLegend: true,
    sidePane: true,
  });
  const [superMenuOpen, setSuperMenuOpen] = useState(false);
  const togglePanel = useCallback((key) => {
    setPanelVis(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Simulation / time-of-day state — driven by server via Socket.IO
  const [simPaused, setSimPaused] = useState(false);
  const [timeSpeed, setTimeSpeed] = useState(1);
  const [syncToReal, setSyncToReal] = useState(false);
  const syncToRealRef = useRef(false);
  const [gameTime, setGameTime] = useState(() => getEasternTime());
  const TIME_SPEEDS = [1, 10, 100, 1000];

  // Family state — received from server
  const [family, setFamily] = useState([]);

  // Room lights state — driven by server
  const [roomLights, setRoomLights] = useState(() => {
    const initial = {};
    HOUSE_LAYOUT.rooms.forEach(r => { initial[r.id] = true; });
    initial._exterior = true;
    return initial;
  });
  const [lightsAuto, setLightsAuto] = useState(true);

  // Agentic AI state — conversations, persona data, speech
  const [agenticState, setAgenticState] = useState(null);
  const [showConversations, setShowConversations] = useState(false);

  // ── Socket.IO: receive authoritative state from server ──
  useEffect(() => {
    function onGameState(state) {
      if (state.family) setFamily(state.family);
      if (state.gameTime) setGameTime(new Date(state.gameTime));
      if (state.gameSpeed !== undefined) setTimeSpeed(state.gameSpeed);
      if (state.paused !== undefined) setSimPaused(state.paused);
      if (state.syncToReal !== undefined) { setSyncToReal(state.syncToReal); syncToRealRef.current = state.syncToReal; }
      if (state.roomLights) setRoomLights(state.roomLights);
      if (state.lightsAuto !== undefined) setLightsAuto(state.lightsAuto);
      if (state.agenticState) setAgenticState(state.agenticState);
    }
    socket.on('gameState', onGameState);
    return () => { socket.off('gameState', onGameState); };
  }, []);

  // ── Controls: emit commands to server instead of local state ──
  const toggleRoomLight = useCallback((roomId) => {
    socket.emit('toggleRoomLight', roomId);
  }, []);

  const setAllLights = useCallback((on) => {
    socket.emit('setAllLights', on);
  }, []);

  const toggleVisibility = useCallback((key) => {
    setVisibility(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const [selectedPlayerName, setSelectedPlayerName] = useState(null);
  const [cameraFollowTarget, setCameraFollowTarget] = useState(null);
  const familyRef = useRef([]);

  // ── Auto-cycle camera (rotate between family members) ──
  const AUTO_CYCLE_INTERVALS = useMemo(() => [5, 10, 30, 60], []);
  const [autoCycleEnabled, setAutoCycleEnabled] = useState(false);
  const [autoCycleInterval, setAutoCycleInterval] = useState(10);
  const autoCycleIndexRef = useRef(0);

  useEffect(() => {
    if (!autoCycleEnabled || family.length === 0) return;
    // Immediately focus the first person when enabled
    const pickNext = () => {
      const idx = autoCycleIndexRef.current % family.length;
      const member = family[idx];
      if (member) {
        setSelectedPlayerName(member.name);
        setSidePaneData({ type: 'player', payload: { ...member } });
        setCameraFollowTarget({ x: member.position.x, z: member.position.z });
      }
      autoCycleIndexRef.current = (idx + 1) % family.length;
    };
    pickNext();
    const id = setInterval(pickNext, autoCycleInterval * 1000);
    return () => clearInterval(id);
  }, [autoCycleEnabled, autoCycleInterval, family.length]);

  const handleRoomHover = useCallback((room) => {
    setHoveredRoom(room);
  }, []);

  const handleFurnitureHover = useCallback((furniture) => {
    setHoveredFurniture(furniture);
  }, []);

  const handlePlayerClick = useCallback((member) => {
    setAutoCycleEnabled(false);          // manual click disables auto-cycle
    setSelectedPlayerName(member.name);
    setSidePaneData({ type: 'player', payload: { ...member } });
    setCameraFollowTarget({ x: member.position.x, z: member.position.z });
  }, []);

  const handleRoomClick = useCallback((room) => {
    setSelectedPlayerName(null);
    setCameraFollowTarget(null);
    setSidePaneData({ type: 'room', payload: { ...room } });
  }, []);

  const [recenterCounter, setRecenterCounter] = useState(0);

  const handleGroundClick = useCallback(() => {
    setAutoCycleEnabled(false);            // ground click disables auto-cycle
    setSelectedPlayerName(null);
    setCameraFollowTarget(null);
    setSidePaneData(null);
    setRecenterCounter(c => c + 1);
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
        // Don't update camera follow target in first-person mode
        if (!firstPerson) {
          setCameraFollowTarget({ x: member.position.x, z: member.position.z });
        }
      }
    }
  }, [selectedPlayerName, firstPerson]);

  // ── Stable callbacks for memoized panels ──
  const handleSetTimeSpeed = useCallback((s) => { socket.emit('setSpeed', s); }, []);
  const handleToggleSyncReal = useCallback(() => { socket.emit('setSyncToReal', !syncToRealRef.current); }, []);
  const handleSetHour = useCallback((h) => { socket.emit('setTimeOverride', h); }, []);
  const handleTogglePaused = useCallback(() => { socket.emit('togglePause'); }, []);
  const handleAllLightsOn = useCallback(() => setAllLights(true), [setAllLights]);
  const handleAllLightsOff = useCallback(() => setAllLights(false), [setAllLights]);
  const handleToggleLightsAuto = useCallback(() => { socket.emit('toggleLightsAuto'); }, []);
  const handleToggleAutoRotate = useCallback(() => setCameraAutoRotate(p => !p), []);
  const handleToggleTopDown = useCallback(() => { setCameraTopDown(p => !p); setFirstPerson(false); }, []);
  const handleToggleLockOrientation = useCallback(() => setCameraLockOrientation(p => !p), []);
  const handleToggleFirstPerson = useCallback(() => { setFirstPerson(p => !p); setCameraTopDown(false); setAutoCycleEnabled(false); }, []);
  const handleToggleAutoCycle = useCallback(() => setAutoCycleEnabled(p => !p), []);
  const handleCommandAction = useCallback((memberName, interactionId) => {
    socket.emit('command', { memberName, interactionId });
  }, []);

  // Agentic AI controls
  const handleToggleAgentic = useCallback(() => {
    const newState = !agenticState?.enabled;
    socket.emit('setAgenticEnabled', newState);
  }, [agenticState?.enabled]);
  const handleToggleConversations = useCallback(() => setShowConversations(p => !p), []);

  // Extract active speech for rendering bubbles — memoized
  const activeSpeech = useMemo(() => {
    return agenticState?.social?.activeSpeech || [];
  }, [agenticState?.social?.activeSpeech]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* Title overlay with hamburger super menu */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        zIndex: 20,
        color: '#FFD700',
        fontFamily: '"Courier New", monospace',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Hamburger button */}
          <button
            onClick={() => setSuperMenuOpen(p => !p)}
            style={{
              background: superMenuOpen ? 'rgba(255,215,0,0.2)' : 'rgba(0,0,0,0.6)',
              border: superMenuOpen ? '1px solid #FFD700' : '1px solid rgba(255,255,255,0.2)',
              borderRadius: 6,
              padding: '6px 8px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              transition: 'all 0.15s ease',
            }}
            title="Toggle panels"
          >
            <span style={{ display: 'block', width: 18, height: 2, background: superMenuOpen ? '#FFD700' : '#ccc', borderRadius: 1, transition: 'background 0.15s' }} />
            <span style={{ display: 'block', width: 18, height: 2, background: superMenuOpen ? '#FFD700' : '#ccc', borderRadius: 1, transition: 'background 0.15s' }} />
            <span style={{ display: 'block', width: 18, height: 2, background: superMenuOpen ? '#FFD700' : '#ccc', borderRadius: 1, transition: 'background 0.15s' }} />
          </button>
          <div>
            <h1 style={{ fontSize: '28px', margin: 0, letterSpacing: '2px' }}>
              THE ATOMIC FAMILY
            </h1>
            <p style={{ fontSize: '12px', color: '#aaa', marginTop: 4, margin: 0 }}>
              Pixel Craft Simulation | Orbit: Drag | Zoom: Scroll | FP: WASD
            </p>
          </div>
        </div>

        {/* Super menu dropdown */}
        {superMenuOpen && (
          <SuperMenuDropdown panelVis={panelVis} onToggle={togglePanel} />
        )}
      </div>

      {/* Hovered room indicator */}
      <RoomHoverIndicator room={hoveredRoom} />

      {/* Furniture tooltip */}
      <FurnitureTooltip furniture={hoveredFurniture} />

      {/* Room legend */}
      {panelVis.roomLegend && <RoomLegend hoveredRoom={hoveredRoom} />}

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
          roomLights={roomLights}
          gameTime={gameTime}
          firstPerson={firstPerson}
          family={family}
          activeSpeech={activeSpeech}
        />
        {firstPerson ? (
          <FirstPersonController
            active={firstPerson}
            spawnPosition={cameraFollowTarget || { x: 0, z: 2 }}
          />
        ) : (
          <CameraController followTarget={cameraFollowTarget} autoRotate={cameraAutoRotate} topDown={cameraTopDown} lockOrientation={cameraLockOrientation} recenter={recenterCounter} />
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

      {/* Time-of-day HUD (top right) */}
      {panelVis.timeHud && (
        <TimeHUD
          gameTime={gameTime}
          timeSpeed={timeSpeed}
          syncToReal={syncToReal}
          paused={simPaused}
          onSetTimeSpeed={handleSetTimeSpeed}
          onToggleSyncReal={handleToggleSyncReal}
          onSetHour={handleSetHour}
          onTogglePaused={handleTogglePaused}
        />
      )}

      {/* Light switches panel */}
      {panelVis.lightSwitches && (
        <LightSwitchPanel
          roomLights={roomLights}
          onToggle={toggleRoomLight}
          onAllOn={handleAllLightsOn}
          onAllOff={handleAllLightsOff}
          lightsAuto={lightsAuto}
          onToggleAuto={handleToggleLightsAuto}
        />
      )}

      {/* Controls panel */}
      {panelVis.controls && (
        <ControlsPanel
          visibility={visibility}
          onToggleVisibility={toggleVisibility}
          cameraAutoRotate={cameraAutoRotate}
          onToggleAutoRotate={handleToggleAutoRotate}
          cameraTopDown={cameraTopDown}
          onToggleTopDown={handleToggleTopDown}
          cameraLockOrientation={cameraLockOrientation}
          onToggleLockOrientation={handleToggleLockOrientation}
          firstPerson={firstPerson}
          onToggleFirstPerson={handleToggleFirstPerson}
          autoCycleEnabled={autoCycleEnabled}
          onToggleAutoCycle={handleToggleAutoCycle}
          autoCycleInterval={autoCycleInterval}
          autoCycleIntervals={AUTO_CYCLE_INTERVALS}
          onSetAutoCycleInterval={setAutoCycleInterval}
        />
      )}

      {/* Agentic AI toggle button (bottom-left) */}
      <div style={{
        position: 'absolute',
        bottom: showConversations ? 450 : 20,
        left: 20,
        zIndex: 20,
        display: 'flex',
        gap: 6,
        transition: 'bottom 0.25s ease',
      }}>
        <button
          onClick={handleToggleAgentic}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            fontFamily: '"Courier New", monospace',
            fontSize: 11,
            fontWeight: 'bold',
            cursor: 'pointer',
            background: agenticState?.enabled ? 'rgba(76,175,80,0.2)' : 'rgba(0,0,0,0.6)',
            border: agenticState?.enabled ? '1px solid rgba(76,175,80,0.5)' : '1px solid rgba(255,255,255,0.15)',
            color: agenticState?.enabled ? '#4CAF50' : '#888',
            transition: 'all 0.15s ease',
          }}
        >
          🤖 AI {agenticState?.enabled ? 'ON' : 'OFF'}
        </button>
        <button
          onClick={handleToggleConversations}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            fontFamily: '"Courier New", monospace',
            fontSize: 11,
            fontWeight: 'bold',
            cursor: 'pointer',
            background: showConversations ? 'rgba(255,215,0,0.15)' : 'rgba(0,0,0,0.6)',
            border: showConversations ? '1px solid rgba(255,215,0,0.4)' : '1px solid rgba(255,255,255,0.15)',
            color: showConversations ? '#FFD700' : '#888',
            transition: 'all 0.15s ease',
          }}
        >
          🗣️ Chat
        </button>
        {agenticState?.llmAvailable === false && agenticState?.enabled && (
          <span style={{
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 10,
            background: 'rgba(244,67,54,0.15)',
            border: '1px solid rgba(244,67,54,0.3)',
            color: '#F44336',
            fontFamily: '"Courier New", monospace',
          }}>
            ⚠ LLM Offline
          </span>
        )}
      </div>

      {/* Conversation Viewer */}
      {showConversations && (
        <ConversationViewer
          agenticState={agenticState}
          selectedCharacter={selectedPlayerName}
          onClose={handleToggleConversations}
        />
      )}

      {/* Side Pane */}
      {panelVis.sidePane && (
        <SidePane
          data={sidePaneData}
          onClose={handleCloseSidePane}
          onCommandAction={handleCommandAction}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  SuperMenuDropdown – hamburger panel-visibility toggles
 * ════════════════════════════════════════════════════════════════ */

const PANEL_ITEMS = [
  { key: 'timeHud',       label: 'Time HUD',       icon: '[T]' },
  { key: 'lightSwitches', label: 'Light Switches',  icon: '[L]' },
  { key: 'controls',      label: 'Controls',        icon: '[C]' },
  { key: 'roomLegend',    label: 'Room Legend',      icon: '[R]' },
  { key: 'sidePane',      label: 'Side Pane',       icon: '[S]' },
];

function SuperMenuDropdown({ panelVis, onToggle }) {
  const allVisible = Object.values(panelVis).every(Boolean);
  const noneVisible = Object.values(panelVis).every(v => !v);

  const toggleAll = (on) => {
    PANEL_ITEMS.forEach(p => {
      if (panelVis[p.key] !== on) onToggle(p.key);
    });
  };

  return (
    <div style={{
      marginTop: 8,
      background: 'rgba(0,0,0,0.88)',
      borderRadius: 8,
      padding: '10px 14px',
      minWidth: 190,
      border: '1px solid rgba(255,215,0,0.25)',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 'bold', color: '#FFD700', marginBottom: 6, letterSpacing: 1 }}>
        PANELS
      </div>

      {/* Show All / Hide All */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        <button
          onClick={() => toggleAll(true)}
          style={{
            flex: 1, padding: '4px 6px', borderRadius: 4, cursor: 'pointer',
            fontFamily: '"Courier New", monospace', fontSize: 10, fontWeight: 'bold',
            border: allVisible ? '1px solid #FFD700' : '1px solid rgba(255,255,255,0.15)',
            background: allVisible ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.05)',
            color: allVisible ? '#FFD700' : '#888', transition: 'all 0.15s ease',
          }}
        >Show All</button>
        <button
          onClick={() => toggleAll(false)}
          style={{
            flex: 1, padding: '4px 6px', borderRadius: 4, cursor: 'pointer',
            fontFamily: '"Courier New", monospace', fontSize: 10, fontWeight: 'bold',
            border: noneVisible ? '1px solid #FF6347' : '1px solid rgba(255,255,255,0.15)',
            background: noneVisible ? 'rgba(255,99,71,0.15)' : 'rgba(255,255,255,0.05)',
            color: noneVisible ? '#FF6347' : '#888', transition: 'all 0.15s ease',
          }}
        >Hide All</button>
      </div>

      {/* Per-panel toggles */}
      {PANEL_ITEMS.map(p => {
        const on = panelVis[p.key];
        return (
          <button
            key={p.key}
            onClick={() => onToggle(p.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              background: on ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.03)',
              border: on ? '1px solid rgba(74,222,128,0.35)' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 4, padding: '5px 10px', marginBottom: 3, cursor: 'pointer',
              fontFamily: '"Courier New", monospace', fontSize: 12,
              color: on ? '#4ADE80' : '#555', transition: 'all 0.15s ease',
            }}
          >
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 16, height: 16, borderRadius: 3,
              background: on ? '#4ADE80' : 'transparent',
              border: on ? '1px solid #4ADE80' : '1px solid #555',
              color: on ? '#000' : '#555',
              fontSize: 10, fontWeight: 'bold', transition: 'all 0.15s ease',
            }}>{on ? '*' : ''}</span>
            <span style={{ fontSize: 12, color: on ? '#aaa' : '#444' }}>{p.icon}</span>
            <span>{p.label}</span>
          </button>
        );
      })}
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
    { id: 'garage', name: 'Garage', color: '#808080' },
    { id: 'closet_master', name: 'Master Closet', color: '#B8A88A' },
    { id: 'closet_kids', name: 'Kids Closet', color: '#C9A6D8' },
    { id: 'backyard', name: 'Backyard', color: '#5dba6a' }
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

/* ════════════════════════════════════════════════════════════════
 *  LightSwitchPanel – per-room light toggle, top-left below title
 * ════════════════════════════════════════════════════════════════ */

const ROOM_LIGHT_LABELS = [
  { id: 'living_room', label: 'Living Room', icon: '\uD83D\uDECB' },
  { id: 'kitchen', label: 'Kitchen', icon: '\uD83C\uDF73' },
  { id: 'hallway', label: 'Hallway', icon: '\uD83D\uDEAA' },
  { id: 'bedroom_master', label: 'Master Bed', icon: '\uD83D\uDECF' },
  { id: 'bathroom', label: 'Bathroom', icon: '\uD83D\uDEC1' },
  { id: 'laundry', label: 'Laundry', icon: '\uD83E\uDDFA' },
  { id: 'bedroom_kids_shared', label: 'Kids Shared', icon: '\uD83E\uDDF8' },
  { id: 'bedroom_kids_single', label: 'Kids Room', icon: '\uD83C\uDFA8' },
  { id: 'garage', label: 'Garage', icon: '\uD83D\uDE97' },
  { id: 'closet_master', label: 'Master Closet', icon: '\uD83D\uDC54' },
  { id: 'closet_kids', label: 'Kids Closet', icon: '\uD83D\uDC57' },
  { id: '_exterior', label: 'Exterior', icon: '\uD83C\uDFE0' },
];

const LightSwitchPanel = React.memo(function LightSwitchPanel({ roomLights, onToggle, onAllOn, onAllOff, lightsAuto, onToggleAuto }) {
  const allOn = Object.values(roomLights).every(Boolean);
  const allOff = Object.values(roomLights).every(v => !v);

  return (
    <div style={{
      position: 'absolute', top: 90, left: 20, zIndex: 10,
      background: 'rgba(0,0,0,0.82)', borderRadius: 10,
      padding: '10px 14px', minWidth: 180,
      fontFamily: '"Courier New", monospace', color: '#fff',
      border: '1px solid rgba(255,215,0,0.15)', backdropFilter: 'blur(6px)',
      maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
    }}>
      <div style={{ fontSize: 11, fontWeight: 'bold', color: '#FFD700', marginBottom: 6, letterSpacing: 1 }}>
        LIGHT SWITCHES
      </div>

      {/* Master controls */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        <button onClick={onAllOn} style={lightMasterBtnStyle(!allOff && allOn)}>All On</button>
        <button onClick={onAllOff} style={lightMasterBtnStyle(allOff)}>All Off</button>
        <button onClick={onToggleAuto} style={{
          ...lightMasterBtnStyle(lightsAuto),
          border: lightsAuto ? '1px solid #4ADE80' : '1px solid rgba(255,255,255,0.15)',
          color: lightsAuto ? '#4ADE80' : '#888',
          background: lightsAuto ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.05)',
        }}>Auto</button>
      </div>

      {/* Per-room toggles */}
      {ROOM_LIGHT_LABELS.map(r => {
        const on = roomLights[r.id] !== false;
        return (
          <button
            key={r.id}
            onClick={() => onToggle(r.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              background: on ? 'rgba(255,230,100,0.1)' : 'rgba(255,255,255,0.03)',
              border: on ? '1px solid rgba(255,230,100,0.35)' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: 4, padding: '3px 8px', marginBottom: 2, cursor: 'pointer',
              fontFamily: '"Courier New", monospace', fontSize: 11,
              color: on ? '#FFE664' : '#555', transition: 'all 0.15s ease',
            }}
          >
            <span style={{ fontSize: 13 }}>{r.icon}</span>
            <span style={{ flex: 1, textAlign: 'left' }}>{r.label}</span>
            <span style={{
              width: 14, height: 14, borderRadius: 7,
              background: on ? '#FFE664' : '#333',
              border: on ? '1px solid #FFD700' : '1px solid #444',
              boxShadow: on ? '0 0 6px rgba(255,230,100,0.5)' : 'none',
              transition: 'all 0.15s ease',
            }} />
          </button>
        );
      })}
    </div>
  );
});

const lightMasterBtnStyle = (active) => ({
  flex: 1, padding: '4px 6px', borderRadius: 4, cursor: 'pointer',
  fontFamily: '"Courier New", monospace', fontSize: 10, fontWeight: 'bold',
  border: active ? '1px solid #FFD700' : '1px solid rgba(255,255,255,0.15)',
  background: active ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.05)',
  color: active ? '#FFD700' : '#888', transition: 'all 0.15s ease',
});

const ControlsPanel = React.memo(function ControlsPanel({
  visibility, onToggleVisibility,
  cameraAutoRotate, onToggleAutoRotate,
  cameraTopDown, onToggleTopDown,
  cameraLockOrientation, onToggleLockOrientation,
  firstPerson, onToggleFirstPerson,
  autoCycleEnabled, onToggleAutoCycle,
  autoCycleInterval, autoCycleIntervals, onSetAutoCycleInterval
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
      {/* ── Camera ── */}
      <SectionTitle>Camera</SectionTitle>
      <ToggleBtn on={firstPerson} onClick={onToggleFirstPerson} icon="[FP]" label="First Person" />
      <ToggleBtn on={cameraAutoRotate} onClick={onToggleAutoRotate} icon="[AR]" label="Auto Rotate" disabled={firstPerson} />
      <ToggleBtn on={cameraTopDown} onClick={onToggleTopDown} icon="[TD]" label="Top Down" disabled={firstPerson} />
      <ToggleBtn on={cameraLockOrientation} onClick={onToggleLockOrientation} icon="[LO]" label="Lock Orient." indent disabled={!cameraTopDown || firstPerson} />
      <ToggleBtn on={autoCycleEnabled} onClick={onToggleAutoCycle} icon="[AC]" label="Auto Cycle" disabled={firstPerson} />
      {autoCycleEnabled && !firstPerson && (
        <div style={{ display: 'flex', gap: 4, marginLeft: 14, flexWrap: 'wrap' }}>
          {autoCycleIntervals.map(sec => (
            <button
              key={sec}
              onClick={() => onSetAutoCycleInterval(sec)}
              style={{
                padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                fontFamily: '"Courier New", monospace', fontSize: 11,
                border: sec === autoCycleInterval ? '1px solid #4ADE80' : '1px solid rgba(255,255,255,0.15)',
                background: sec === autoCycleInterval ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255,255,255,0.05)',
                color: sec === autoCycleInterval ? '#4ADE80' : '#777',
                transition: 'all 0.15s ease',
              }}
            >
              {sec}s
            </button>
          ))}
        </div>
      )}

      {/* ── Visibility ── */}
      <SectionTitle>Visibility</SectionTitle>
      <ToggleBtn on={visibility.walls} onClick={() => onToggleVisibility('walls')} icon="[W]" label="Walls" />
      <ToggleBtn on={visibility.doors} onClick={() => onToggleVisibility('doors')} icon="[D]" label="Doors" />
      <ToggleBtn on={visibility.furniture} onClick={() => onToggleVisibility('furniture')} icon="[F]" label="Furniture" />
    </div>
  );
});

/* ════════════════════════════════════════════════════════════════
 *  TimeHUD – top-right overlay: clock, date, slider, speed btns
 * ════════════════════════════════════════════════════════════════ */

const TimeHUD = React.memo(function TimeHUD({ gameTime, timeSpeed, syncToReal, paused, onSetTimeSpeed, onToggleSyncReal, onSetHour, onTogglePaused }) {
  if (!gameTime) return null;

  const hours   = gameTime.getHours();
  const minutes = gameTime.getMinutes();
  const seconds = gameTime.getSeconds();
  const ampm    = hours >= 12 ? 'PM' : 'AM';
  const dh      = hours % 12 || 12;
  const timeStr = `${dh}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} ${ampm}`;
  const dateStr = gameTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const hourFloat = hours + minutes / 60;
  const isDaytime = hourFloat >= 6 && hourFloat < 18;

  const speedBtn = (label, value) => {
    const active = !syncToReal && timeSpeed === value;
    return (
      <button
        key={value}
        onClick={() => onSetTimeSpeed(value)}
        style={{
          padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
          fontFamily: '"Courier New", monospace', fontSize: 11,
          border: active ? '1px solid #FFD700' : '1px solid rgba(255,255,255,0.15)',
          background: active ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.05)',
          color: active ? '#FFD700' : '#888', transition: 'all 0.15s ease'
        }}
      >{label}</button>
    );
  };

  return (
    <div style={{
      position: 'absolute', top: 20, right: 20, zIndex: 10,
      background: 'rgba(0,0,0,0.82)', borderRadius: 10,
      padding: '14px 18px', minWidth: 210,
      fontFamily: '"Courier New", monospace', color: '#fff',
      border: '1px solid rgba(255,215,0,0.15)', backdropFilter: 'blur(6px)',
    }}>
      {/* Date */}
      <div style={{ fontSize: 11, color: '#aaa', marginBottom: 2 }}>{dateStr}</div>

      {/* Clock + sun/moon icon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 'bold', color: '#FFD700', letterSpacing: 1 }}>{timeStr}</span>
        <span style={{ fontSize: 22 }}>{isDaytime ? '\u2600' : '\u263E'}</span>
      </div>

      {/* Time-of-day slider */}
      <div style={{ marginBottom: 10 }}>
        <input
          type="range" min={0} max={24} step={0.25} value={hourFloat}
          onChange={(e) => onSetHour(parseFloat(e.target.value))}
          style={{ width: '100%', cursor: 'pointer', accentColor: '#FFD700' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#555' }}>
          <span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span>
        </div>
      </div>

      {/* Pause / Play */}
      <div style={{ marginBottom: 8 }}>
        <button
          onClick={onTogglePaused}
          style={{
            width: '100%', padding: '5px 0', borderRadius: 5, cursor: 'pointer',
            fontFamily: '"Courier New", monospace', fontSize: 12, fontWeight: 'bold',
            border: paused ? '1px solid #FF6347' : '1px solid rgba(74,222,128,0.4)',
            background: paused ? 'rgba(255,99,71,0.15)' : 'rgba(74,222,128,0.1)',
            color: paused ? '#FF6347' : '#4ADE80', transition: 'all 0.15s ease',
          }}
        >
          {paused ? '> RESUME' : '|| PAUSE'}
        </button>
      </div>

      {/* Speed buttons */}
      <div style={{ fontSize: 10, fontWeight: 'bold', color: '#FFD700', marginBottom: 4, letterSpacing: 1 }}>SPEED</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {speedBtn('1x', 1)}
        {speedBtn('10x', 10)}
        {speedBtn('100x', 100)}
        {speedBtn('1000x', 1000)}
        <button
          onClick={onToggleSyncReal}
          style={{
            padding: '4px 8px', borderRadius: 4, cursor: 'pointer',
            fontFamily: '"Courier New", monospace', fontSize: 11,
            border: syncToReal ? '1px solid #4ADE80' : '1px solid rgba(255,255,255,0.15)',
            background: syncToReal ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.05)',
            color: syncToReal ? '#4ADE80' : '#888', transition: 'all 0.15s ease',
          }}
        >EST</button>
      </div>
    </div>
  );
});

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
