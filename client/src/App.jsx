import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Stats, Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { io } from 'socket.io-client';
import House3D from './components/House3D';
import CharacterSprite from './components/CharacterSprite';
import FirstPersonController from './components/FirstPersonController';
import SidePane from './components/SidePane';
import ConversationViewer from './components/ConversationViewer';
import ThoughtDetailModal from './components/ThoughtDetailModal';
import ConversationDetailModal from './components/ConversationDetailModal';
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
  const [lightsAuto, setLightsAuto] = useState(false);

  // Agentic AI state — conversations, persona data, speech
  const [agenticState, setAgenticState] = useState(null);
  const [showConversations, setShowConversations] = useState(false);
  const [dashboardPopped, setDashboardPopped] = useState(false);
  const [poppedPos, setPoppedPos] = useState({ x: 20, y: 20 });
  const [selectedThought, setSelectedThought] = useState(null);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const dragRef = useRef(null);

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
  const handlePopOutDashboard = useCallback(() => {
    setDashboardPopped(p => !p);
    setPoppedPos({ x: 20, y: 20 });
  }, []);
  const handleDashboardDragStart = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX - poppedPos.x;
    const startY = e.clientY - poppedPos.y;
    const onMove = (me) => {
      setPoppedPos({
        x: Math.max(0, Math.min(window.innerWidth - 400, me.clientX - startX)),
        y: Math.max(0, Math.min(window.innerHeight - 100, me.clientY - startY)),
      });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [poppedPos]);
  const handleThoughtClick = useCallback((thoughtId) => {
    if (!thoughtId) return;
    setModalLoading(true);
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        setModalLoading(false);
        console.warn('[App] getThoughtDetail timed out for id:', thoughtId);
      }
    }, 5000);
    try {
      socket.emit('getThoughtDetail', thoughtId, (thought) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        setModalLoading(false);
        if (thought) {
          setSelectedThought(thought);
        } else {
          console.warn('[App] No thought returned for id:', thoughtId);
        }
      });
    } catch (err) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        setModalLoading(false);
      }
      console.error('[App] Error requesting thought detail:', err);
    }
  }, []);
  const handleCloseThoughtModal = useCallback(() => setSelectedThought(null), []);
  const handleConversationClick = useCallback((threadId) => {
    if (!threadId) return;
    setModalLoading(true);
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        setModalLoading(false);
        console.warn('[App] getConversationThread timed out for id:', threadId);
      }
    }, 5000);
    try {
      socket.emit('getConversationThread', threadId, (thread) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        setModalLoading(false);
        if (thread) {
          setSelectedConversation(thread);
        } else {
          console.warn('[App] No thread returned for id:', threadId);
        }
      });
    } catch (err) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        setModalLoading(false);
      }
      console.error('[App] Error requesting conversation thread:', err);
    }
  }, []);
  const handleCloseConversationModal = useCallback(() => setSelectedConversation(null), []);

  // Extract active speech for rendering bubbles — memoized
  const activeSpeech = useMemo(() => {
    return agenticState?.social?.activeSpeech || [];
  }, [agenticState?.social?.activeSpeech]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* ─── Title Bar ─── */}
      <div style={{
        position: 'absolute', top: 14, left: 16, zIndex: 20,
        display: 'flex', alignItems: 'center', gap: 10,
        pointerEvents: 'none',
      }}>
        <h1 style={{
          fontSize: 20, margin: 0, letterSpacing: 3,
          color: '#FFD700', fontFamily: '"Courier New", monospace',
          textShadow: '1px 1px 6px rgba(0,0,0,0.9)',
        }}>
          THE ATOMIC FAMILY
        </h1>
        {agenticState?.llmAvailable === false && agenticState?.enabled && (
          <span style={{
            padding: '3px 8px', borderRadius: 4, fontSize: 9,
            background: 'rgba(244,67,54,0.2)', border: '1px solid rgba(244,67,54,0.4)',
            color: '#F44336', fontFamily: '"Courier New", monospace',
            pointerEvents: 'auto',
          }}>⚠ LLM Offline</span>
        )}
      </div>

      {/* Hovered room indicator */}
      <RoomHoverIndicator room={hoveredRoom} />

      {/* Furniture tooltip */}
      <FurnitureTooltip furniture={hoveredFurniture} />

      <Canvas
        shadows
        camera={{ position: [18, 16, 20], fov: 50, near: 0.1, far: 150 }}
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
          <FirstPersonController active={firstPerson} spawnPosition={cameraFollowTarget || { x: 0, z: 2 }} />
        ) : (
          <CameraController followTarget={cameraFollowTarget} autoRotate={cameraAutoRotate} topDown={cameraTopDown} lockOrientation={cameraLockOrientation} recenter={recenterCounter} />
        )}
      </Canvas>

      {/* FP mode crosshair */}
      {firstPerson && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 20, pointerEvents: 'none' }}>
          <div style={{ width: 20, height: 2, background: 'rgba(255,255,255,0.5)', position: 'absolute', top: -1, left: -10 }} />
          <div style={{ width: 2, height: 20, background: 'rgba(255,255,255,0.5)', position: 'absolute', top: -10, left: -1 }} />
        </div>
      )}
      {firstPerson && (
        <div style={{
          position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, pointerEvents: 'none',
          color: '#aaa', fontFamily: '"Courier New", monospace', fontSize: 11,
          background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '4px 14px',
        }}>
          WASD to move · Shift to run · Click to lock · ESC to unlock
        </div>
      )}

      {/* ─── Unified Control Dock ─── */}
      <ControlDock
        gameTime={gameTime}
        timeSpeed={timeSpeed}
        syncToReal={syncToReal}
        paused={simPaused}
        onSetTimeSpeed={handleSetTimeSpeed}
        onToggleSyncReal={handleToggleSyncReal}
        onSetHour={handleSetHour}
        onTogglePaused={handleTogglePaused}
        roomLights={roomLights}
        onToggleLight={toggleRoomLight}
        onAllLightsOn={handleAllLightsOn}
        onAllLightsOff={handleAllLightsOff}
        lightsAuto={lightsAuto}
        onToggleLightsAuto={handleToggleLightsAuto}
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
        agenticState={agenticState}
        onToggleAgentic={handleToggleAgentic}
        showConversations={showConversations}
        onToggleConversations={handleToggleConversations}
        hoveredRoom={hoveredRoom}
      />

      {/* AI Dashboard — flyout (docked left) or draggable floating window */}
      {showConversations && !dashboardPopped && (
        <ConversationViewer
          agenticState={agenticState}
          selectedCharacter={selectedPlayerName}
          onClose={handleToggleConversations}
          onThoughtClick={handleThoughtClick}
          onConversationClick={handleConversationClick}
          onPopOut={handlePopOutDashboard}
          isPopped={false}
        />
      )}
      {showConversations && dashboardPopped && (
        <ConversationViewer
          agenticState={agenticState}
          selectedCharacter={selectedPlayerName}
          onClose={handleToggleConversations}
          onThoughtClick={handleThoughtClick}
          onConversationClick={handleConversationClick}
          onPopOut={handlePopOutDashboard}
          isPopped={true}
          dragHandleProps={{ onMouseDown: handleDashboardDragStart }}
          style={{
            position: 'fixed',
            top: poppedPos.y,
            left: poppedPos.x,
            bottom: 'auto',
            width: 400,
            height: 580,
            zIndex: 9000,
            boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
            resize: 'both',
            overflow: 'hidden',
          }}
        />
      )}

      {/* Modals */}
      {modalLoading && ReactDOM.createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 99998, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: '"Courier New", monospace', color: '#FFD700', fontSize: 14,
          pointerEvents: 'all',
        }}>
          <div style={{ background: 'rgba(10,10,30,0.95)', padding: '20px 40px', borderRadius: 10, border: '1px solid rgba(255,215,0,0.3)' }}>
            ⏳ Loading...
          </div>
        </div>,
        document.body
      )}
      {selectedThought && ReactDOM.createPortal(
        <ThoughtDetailModal thought={selectedThought} onClose={handleCloseThoughtModal} />,
        document.body
      )}
      {selectedConversation && ReactDOM.createPortal(
        <ConversationDetailModal thread={selectedConversation} onClose={handleCloseConversationModal} />,
        document.body
      )}

      {/* Side Pane */}
      <SidePane
        data={sidePaneData}
        onClose={handleCloseSidePane}
        onCommandAction={handleCommandAction}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  ControlDock — Unified bottom toolbar with expandable flyouts
 *  Replaces: TimeHUD, LightSwitchPanel, ControlsPanel, RoomLegend,
 *            SuperMenuDropdown, AI toggle buttons
 * ════════════════════════════════════════════════════════════════ */

const ROOM_LIGHT_LABELS = [
  { id: 'living_room', label: 'Living Room', icon: '🛋' },
  { id: 'kitchen', label: 'Kitchen', icon: '🍳' },
  { id: 'hallway', label: 'Hallway', icon: '🚪' },
  { id: 'bedroom_master', label: 'Master Bed', icon: '🛏' },
  { id: 'bathroom', label: 'Bathroom', icon: '🛁' },
  { id: 'laundry', label: 'Laundry', icon: '🧺' },
  { id: 'bedroom_kids_shared', label: 'Kids Shared', icon: '🧸' },
  { id: 'bedroom_kids_single', label: 'Kids Room', icon: '🎨' },
  { id: 'garage', label: 'Garage', icon: '🚗' },
  { id: 'closet_master', label: 'Master Closet', icon: '👔' },
  { id: 'closet_kids', label: 'Kids Closet', icon: '👗' },
  { id: '_exterior', label: 'Exterior', icon: '🏠' },
];

const ROOM_LEGEND_DATA = [
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
  { id: 'backyard', name: 'Backyard', color: '#5dba6a' },
];

function ControlDock({
  // Time
  gameTime, timeSpeed, syncToReal, paused,
  onSetTimeSpeed, onToggleSyncReal, onSetHour, onTogglePaused,
  // Lights
  roomLights, onToggleLight, onAllLightsOn, onAllLightsOff, lightsAuto, onToggleLightsAuto,
  // Camera
  visibility, onToggleVisibility,
  cameraAutoRotate, onToggleAutoRotate,
  cameraTopDown, onToggleTopDown,
  cameraLockOrientation, onToggleLockOrientation,
  firstPerson, onToggleFirstPerson,
  autoCycleEnabled, onToggleAutoCycle,
  autoCycleInterval, autoCycleIntervals, onSetAutoCycleInterval,
  // AI
  agenticState, onToggleAgentic, showConversations, onToggleConversations,
  // Rooms
  hoveredRoom,
}) {
  const [openFlyout, setOpenFlyout] = useState(null);
  const dockRef = useRef(null);

  const toggle = useCallback((id) => setOpenFlyout(prev => prev === id ? null : id), []);

  // Close flyout on Escape or click outside
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') setOpenFlyout(null); };
    const handleClick = (e) => {
      if (dockRef.current && !dockRef.current.contains(e.target)) setOpenFlyout(null);
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousedown', handleClick);
    return () => { window.removeEventListener('keydown', handleKey); window.removeEventListener('mousedown', handleClick); };
  }, []);

  // Time formatting
  const hours = gameTime?.getHours() || 0;
  const minutes = gameTime?.getMinutes() || 0;
  const seconds = gameTime?.getSeconds() || 0;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const dh = hours % 12 || 12;
  const timeStr = `${dh}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} ${ampm}`;
  const hourFloat = hours + minutes / 60;
  const isDaytime = hourFloat >= 6 && hourFloat < 18;
  const dateStr = gameTime?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) || '';
  const speedLabel = syncToReal ? 'EST' : `${timeSpeed}x`;

  // Light counts
  const lightValues = Object.values(roomLights);
  const lightsOn = lightValues.filter(Boolean).length;
  const lightsTotal = lightValues.length;

  const aiEnabled = agenticState?.enabled || false;

  return (
    <div ref={dockRef} style={{
      position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
      zIndex: 30, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    }}>
      {/* ─── Flyout panels (render above the bar) ─── */}

      {openFlyout === 'time' && (
        <FlyoutPanel width={280}>
          <FlyoutTitle>Time Controls</FlyoutTitle>
          <div style={{ padding: '8px 12px' }}>
            <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>{dateStr}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 'bold', color: '#FFD700', letterSpacing: 1 }}>{timeStr}</span>
              <span style={{ fontSize: 20 }}>{isDaytime ? '☀' : '☾'}</span>
            </div>
            {/* Slider */}
            <div style={{ marginBottom: 10 }}>
              <input type="range" min={0} max={24} step={0.25} value={hourFloat}
                onChange={(e) => onSetHour(parseFloat(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: '#FFD700' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#555' }}>
                <span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>12a</span>
              </div>
            </div>
            {/* Speed */}
            <div style={{ fontSize: 9, color: '#888', marginBottom: 4, letterSpacing: 1, fontWeight: 'bold' }}>SPEED</div>
            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {[1, 10, 100, 1000].map(v => (
                <DockPillBtn key={v} active={!syncToReal && timeSpeed === v} onClick={() => onSetTimeSpeed(v)}>{v}x</DockPillBtn>
              ))}
              <DockPillBtn active={syncToReal} onClick={onToggleSyncReal} color="#4ADE80">EST</DockPillBtn>
            </div>
          </div>
        </FlyoutPanel>
      )}

      {openFlyout === 'lights' && (
        <FlyoutPanel width={260}>
          <FlyoutTitle>Light Switches <span style={{ color: '#888', fontSize: 10, fontWeight: 'normal' }}>({lightsOn}/{lightsTotal})</span></FlyoutTitle>
          <div style={{ padding: '6px 10px' }}>
            {/* Master controls */}
            <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
              <DockPillBtn active={lightsOn === lightsTotal} onClick={onAllLightsOn}>All On</DockPillBtn>
              <DockPillBtn active={lightsOn === 0} onClick={onAllLightsOff}>All Off</DockPillBtn>
              <DockPillBtn active={lightsAuto} onClick={onToggleLightsAuto} color="#4ADE80">Auto</DockPillBtn>
            </div>
            {/* Per-room grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
              {ROOM_LIGHT_LABELS.map(r => {
                const on = roomLights[r.id] !== false;
                return (
                  <button key={r.id} onClick={() => onToggleLight(r.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '4px 7px',
                    borderRadius: 5, cursor: 'pointer', fontFamily: '"Courier New", monospace', fontSize: 10,
                    background: on ? 'rgba(255,230,100,0.1)' : 'rgba(255,255,255,0.03)',
                    border: on ? '1px solid rgba(255,230,100,0.3)' : '1px solid rgba(255,255,255,0.06)',
                    color: on ? '#FFE664' : '#555', transition: 'all 0.12s ease',
                  }}>
                    <span style={{ fontSize: 12 }}>{r.icon}</span>
                    <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                    <span style={{
                      width: 8, height: 8, borderRadius: 4, flexShrink: 0,
                      background: on ? '#FFE664' : '#333',
                      boxShadow: on ? '0 0 4px rgba(255,230,100,0.6)' : 'none',
                      transition: 'all 0.12s ease',
                    }} />
                  </button>
                );
              })}
            </div>
          </div>
        </FlyoutPanel>
      )}

      {openFlyout === 'camera' && (
        <FlyoutPanel width={220}>
          <FlyoutTitle>Camera & View</FlyoutTitle>
          <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <FlyoutToggle on={firstPerson} onClick={onToggleFirstPerson} icon="👤" label="First Person" />
            <FlyoutToggle on={cameraAutoRotate} onClick={onToggleAutoRotate} icon="🔄" label="Auto Rotate" disabled={firstPerson} />
            <FlyoutToggle on={cameraTopDown} onClick={onToggleTopDown} icon="⬇" label="Top Down" disabled={firstPerson} />
            <FlyoutToggle on={cameraLockOrientation} onClick={onToggleLockOrientation} icon="🔒" label="Lock Orient." disabled={!cameraTopDown || firstPerson} indent />
            <FlyoutToggle on={autoCycleEnabled} onClick={onToggleAutoCycle} icon="🔁" label="Auto Cycle" disabled={firstPerson} />
            {autoCycleEnabled && !firstPerson && (
              <div style={{ display: 'flex', gap: 3, marginLeft: 24, flexWrap: 'wrap' }}>
                {autoCycleIntervals.map(sec => (
                  <DockPillBtn key={sec} active={sec === autoCycleInterval} onClick={() => onSetAutoCycleInterval(sec)} small>{sec}s</DockPillBtn>
                ))}
              </div>
            )}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
            <div style={{ fontSize: 9, color: '#888', marginBottom: 2, letterSpacing: 1, fontWeight: 'bold' }}>VISIBILITY</div>
            <FlyoutToggle on={visibility.walls} onClick={() => onToggleVisibility('walls')} icon="🧱" label="Walls" />
            <FlyoutToggle on={visibility.doors} onClick={() => onToggleVisibility('doors')} icon="🚪" label="Doors" />
            <FlyoutToggle on={visibility.furniture} onClick={() => onToggleVisibility('furniture')} icon="🪑" label="Furniture" />
          </div>
        </FlyoutPanel>
      )}

      {openFlyout === 'rooms' && (
        <FlyoutPanel width={200}>
          <FlyoutTitle>Room Legend</FlyoutTitle>
          <div style={{ padding: '6px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            {ROOM_LEGEND_DATA.map(r => {
              const active = hoveredRoom?.id === r.id;
              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', gap: 5, padding: '3px 6px',
                  borderRadius: 4,
                  background: active ? 'rgba(74,222,128,0.12)' : 'transparent',
                  transition: 'background 0.15s ease',
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                    background: active ? '#4ADE80' : r.color,
                    border: active ? '1px solid #4ADE80' : '1px solid rgba(255,255,255,0.2)',
                    transition: 'all 0.15s ease',
                  }} />
                  <span style={{
                    fontSize: 9, color: active ? '#4ADE80' : '#ccc',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    transition: 'color 0.15s ease',
                  }}>{r.name}</span>
                </div>
              );
            })}
          </div>
        </FlyoutPanel>
      )}

      {/* ─── The Dock Bar ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        background: 'rgba(8, 8, 20, 0.92)', backdropFilter: 'blur(16px)',
        borderRadius: 12, padding: '5px 6px',
        border: '1px solid rgba(255, 215, 0, 0.12)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
        fontFamily: '"Courier New", monospace',
      }}>
        {/* Pause / Resume */}
        <DockIconBtn
          active={paused}
          activeColor="#FF6347"
          onClick={onTogglePaused}
          title={paused ? 'Resume' : 'Pause'}
        >
          {paused ? '▶' : '⏸'}
        </DockIconBtn>

        <DockDivider />

        {/* Time display (click to expand) */}
        <DockIconBtn
          active={openFlyout === 'time'}
          onClick={() => toggle('time')}
          title="Time controls"
          wide
        >
          <span style={{ fontSize: 11, letterSpacing: 0.5 }}>{timeStr}</span>
          <span style={{ fontSize: 12 }}>{isDaytime ? '☀' : '☾'}</span>
        </DockIconBtn>

        {/* Speed indicator pill */}
        <span style={{
          padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 'bold',
          background: syncToReal ? 'rgba(74,222,128,0.15)' : 'rgba(255,215,0,0.12)',
          color: syncToReal ? '#4ADE80' : '#FFD700',
          border: syncToReal ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(255,215,0,0.25)',
          letterSpacing: 0.5,
        }}>{speedLabel}</span>

        <DockDivider />

        {/* Lights */}
        <DockIconBtn
          active={openFlyout === 'lights'}
          onClick={() => toggle('lights')}
          title="Light switches"
        >
          💡
          <span style={{ fontSize: 8, color: lightsOn === lightsTotal ? '#FFE664' : '#888' }}>{lightsOn}</span>
        </DockIconBtn>

        {/* Camera */}
        <DockIconBtn
          active={openFlyout === 'camera'}
          onClick={() => toggle('camera')}
          title="Camera & visibility"
        >
          📷
        </DockIconBtn>

        {/* Rooms */}
        <DockIconBtn
          active={openFlyout === 'rooms'}
          onClick={() => toggle('rooms')}
          title="Room legend"
        >
          🗺
        </DockIconBtn>

        <DockDivider />

        {/* AI Toggle */}
        <DockIconBtn
          active={aiEnabled}
          activeColor="#4CAF50"
          onClick={onToggleAgentic}
          title={`AI ${aiEnabled ? 'ON' : 'OFF'}`}
        >
          🤖
          <span style={{ fontSize: 8, fontWeight: 'bold', color: aiEnabled ? '#4CAF50' : '#666' }}>
            {aiEnabled ? 'ON' : 'OFF'}
          </span>
        </DockIconBtn>

        {/* Dashboard */}
        <DockIconBtn
          active={showConversations}
          activeColor="#FFD700"
          onClick={onToggleConversations}
          title="AI Dashboard"
        >
          🧠
        </DockIconBtn>
      </div>
    </div>
  );
}

/* ── Dock sub-components ─────────────────────────────────────── */

function DockIconBtn({ children, active, activeColor = '#FFD700', onClick, title, wide }) {
  const baseColor = active ? activeColor : '#888';
  return (
    <button onClick={onClick} title={title} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
      padding: wide ? '5px 10px' : '5px 8px',
      borderRadius: 8, cursor: 'pointer',
      background: active ? `${activeColor}18` : 'transparent',
      border: active ? `1px solid ${activeColor}40` : '1px solid transparent',
      color: baseColor, fontSize: 14,
      fontFamily: '"Courier New", monospace',
      transition: 'all 0.12s ease',
      minWidth: wide ? undefined : 36, height: 32,
    }}>{children}</button>
  );
}

function DockDivider() {
  return <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.08)', margin: '0 2px', flexShrink: 0 }} />;
}

function FlyoutPanel({ children, width = 260 }) {
  return (
    <div style={{
      width, background: 'rgba(10, 10, 25, 0.95)', backdropFilter: 'blur(16px)',
      borderRadius: 10, border: '1px solid rgba(255, 215, 0, 0.15)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 1px rgba(255,215,0,0.1)',
      overflow: 'hidden', fontFamily: '"Courier New", monospace', color: '#e0e0e0',
      animation: 'dockFlyoutIn 0.12s ease',
    }}>{children}</div>
  );
}

function FlyoutTitle({ children }) {
  return (
    <div style={{
      padding: '8px 12px 6px', fontSize: 10, fontWeight: 'bold',
      color: '#FFD700', letterSpacing: 1, textTransform: 'uppercase',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>{children}</div>
  );
}

function FlyoutToggle({ on, onClick, icon, label, disabled, indent }) {
  return (
    <button onClick={disabled ? undefined : onClick} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 8px', borderRadius: 5, cursor: disabled ? 'default' : 'pointer',
      fontFamily: '"Courier New", monospace', fontSize: 11,
      marginLeft: indent ? 16 : 0,
      opacity: disabled ? 0.35 : 1,
      background: on && !disabled ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)',
      border: on && !disabled ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(255,255,255,0.06)',
      color: on && !disabled ? '#4ADE80' : '#777',
      transition: 'all 0.12s ease',
    }}>
      <span style={{
        width: 14, height: 14, borderRadius: 3, flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: on && !disabled ? '#4ADE80' : 'transparent',
        border: on && !disabled ? '1px solid #4ADE80' : '1px solid #555',
        color: on && !disabled ? '#000' : '#555', fontSize: 9, fontWeight: 'bold',
        transition: 'all 0.12s ease',
      }}>{on && !disabled ? '✓' : ''}</span>
      <span style={{ fontSize: 12 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function DockPillBtn({ children, active, onClick, color = '#FFD700', small }) {
  return (
    <button onClick={onClick} style={{
      padding: small ? '2px 6px' : '3px 8px', borderRadius: 4, cursor: 'pointer',
      fontFamily: '"Courier New", monospace', fontSize: small ? 9 : 10, fontWeight: 'bold',
      border: active ? `1px solid ${color}` : '1px solid rgba(255,255,255,0.12)',
      background: active ? `${color}22` : 'rgba(255,255,255,0.04)',
      color: active ? color : '#777', transition: 'all 0.12s ease',
    }}>{children}</button>
  );
}

/* ── Room hover indicator (bottom center, above dock) ────────── */

function RoomHoverIndicator({ room }) {
  return (
    <div style={{
      position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)',
      zIndex: 25, fontFamily: '"Courier New", monospace',
      transition: 'opacity 0.2s ease', opacity: room ? 1 : 0, pointerEvents: 'none',
    }}>
      <div style={{
        background: 'rgba(0,0,0,0.8)', borderRadius: 8, padding: '6px 16px',
        display: 'flex', alignItems: 'center', gap: 8,
        border: room ? `1px solid ${room?.color || '#555'}` : '1px solid transparent',
        boxShadow: room ? `0 0 10px ${room?.color}33` : 'none',
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%',
          background: '#4ADE80', boxShadow: '0 0 4px #4ADE80',
        }} />
        <span style={{ color: '#4ADE80', fontSize: 13, fontWeight: 'bold', letterSpacing: 1 }}>
          {room?.name || ''}
        </span>
      </div>
    </div>
  );
}

/* ── Furniture tooltip ───────────────────────────────────────── */

function FurnitureTooltip({ furniture }) {
  if (!furniture) return null;
  return (
    <div style={{
      position: 'fixed', left: furniture.screenX, top: furniture.screenY - 44,
      transform: 'translateX(-50%)', zIndex: 100, pointerEvents: 'none',
    }}>
      <div style={{
        background: 'rgba(0,0,0,0.88)', borderRadius: 6, padding: '4px 10px',
        display: 'flex', alignItems: 'center', gap: 5,
        border: '1px solid rgba(255,215,0,0.4)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.6)',
        whiteSpace: 'nowrap',
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#FFD700', boxShadow: '0 0 3px #FFD700' }} />
        <span style={{ color: '#FFD700', fontSize: 11, fontWeight: 'bold', fontFamily: '"Courier New", monospace', letterSpacing: 0.5 }}>
          {furniture.label}
        </span>
      </div>
      <div style={{ width: 0, height: 0, margin: '0 auto', borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid rgba(0,0,0,0.88)' }} />
    </div>
  );
}
