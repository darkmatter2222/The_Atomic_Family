import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Stats, Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import House3D from './components/House3D';
import CharacterSprite from './components/CharacterSprite';
import FirstPersonController from './components/FirstPersonController';
import SidePane from './components/SidePane';
import { createFamily, updateFamilyMember } from './game/FamilyMemberAI';
import { HOUSE_LAYOUT } from './game/HouseLayout';

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

function SunSystem({ timeSpeed, syncToReal, paused, onTimeUpdate, timeOverrideRef }) {
  const sunRef = useRef();
  const ambientRef = useRef();
  const sunSphereRef = useRef();
  const moonSphereRef = useRef();
  const { scene } = useThree();
  const gameTimeRef = useRef(getEasternTime());
  const lastDisplayRef = useRef(0);

  // When syncToReal flips on, snap immediately
  useEffect(() => {
    if (syncToReal) gameTimeRef.current = getEasternTime();
  }, [syncToReal]);

  useFrame((_, delta) => {
    /* ── Advance clock ───────────────────────────────── */
    if (!paused) {
      if (syncToReal) {
        gameTimeRef.current = getEasternTime();
      } else {
        const clampedDelta = Math.min(delta, 0.1);
        gameTimeRef.current = new Date(
          gameTimeRef.current.getTime() + clampedDelta * 1000 * timeSpeed
        );
      }
    }

    // Honour slider override
    if (timeOverrideRef?.current !== null && timeOverrideRef?.current !== undefined) {
      const h = Math.floor(timeOverrideRef.current);
      const m = Math.floor((timeOverrideRef.current - h) * 60);
      const d = new Date(gameTimeRef.current);
      d.setHours(h, m, 0, 0);
      gameTimeRef.current = d;
      timeOverrideRef.current = null;
    }

    // Throttled HUD update (~4 fps)
    const now = performance.now();
    if (now - lastDisplayRef.current > 250) {
      lastDisplayRef.current = now;
      if (onTimeUpdate) onTimeUpdate(new Date(gameTimeRef.current));
    }

    /* ── Sun maths ───────────────────────────────────── */
    const t = gameTimeRef.current;
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
 * Exposes live family state so the sidebar can track the selected player.
 */
function GameScene({ onRoomHover, onFurnitureHover, onPlayerClick, onRoomClick, onGroundClick, selectedPlayerName, onFamilyUpdate, visibility, timeSpeed, syncToReal, simPaused, onTimeUpdate, timeOverrideRef, roomLights, gameTime, firstPerson }) {
  const [family, setFamily] = useState(() => createFamily());
  const familyRef = useRef(family);
  const gameTimeRef = useRef(gameTime);

  // Keep refs in sync
  useEffect(() => { familyRef.current = family; }, [family]);
  useEffect(() => { gameTimeRef.current = gameTime; }, [gameTime]);

  // Notify parent of family updates so sidebar can live-track selected player
  useEffect(() => {
    if (onFamilyUpdate) onFamilyUpdate(family);
  }, [family, onFamilyUpdate]);

  // Game loop: update AI every frame (speed = timeSpeed, clamped for sanity)
  useFrame((state, delta) => {
    if (simPaused) return;
    const effectiveSpeed = syncToReal ? 1 : timeSpeed;
    const dt = Math.min(delta, 0.1) * effectiveSpeed;

    // Compute current game hour for interaction time-window checks
    const gt = gameTimeRef.current;
    const gameHour = gt ? (gt.getHours() + gt.getMinutes() / 60) : 12;

    setFamily(prev =>
      prev.map(member => updateFamilyMember(member, dt, gameHour))
    );
  });

  return (
    <>
      {/* Sun / Moon / Ambient – driven by game clock */}
      <SunSystem
        timeSpeed={timeSpeed}
        syncToReal={syncToReal}
        paused={simPaused}
        onTimeUpdate={onTimeUpdate}
        timeOverrideRef={timeOverrideRef}
      />

      {/* Compass indicators */}
      <CompassIndicators />

      {/* The House */}
      <House3D onRoomHover={onRoomHover} onFurnitureHover={onFurnitureHover} onRoomClick={onRoomClick} onGroundClick={onGroundClick} visibility={visibility} roomLights={roomLights} firstPerson={firstPerson} />

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

  // Simulation / time-of-day state
  const [simPaused, setSimPaused] = useState(false);
  const [timeSpeed, setTimeSpeed] = useState(1);          // 1x, 10x, 100x, 1000x
  const [syncToReal, setSyncToReal] = useState(false);     // lock to Eastern Time
  const [gameTime, setGameTime] = useState(() => getEasternTime());
  const timeOverrideRef = useRef(null);                    // slider → SunSystem
  const TIME_SPEEDS = [1, 10, 100, 1000];

  // Room lights state: { room_id: boolean }
  const [roomLights, setRoomLights] = useState(() => {
    const initial = {};
    HOUSE_LAYOUT.rooms.forEach(r => { initial[r.id] = true; });
    initial._exterior = true;
    return initial;
  });
  const [lightsAuto, setLightsAuto] = useState(true);  // auto-on at dusk

  // Auto-on/off based on time of day
  useEffect(() => {
    if (!lightsAuto || !gameTime) return;
    const hour = gameTime.getHours() + gameTime.getMinutes() / 60;
    const shouldBeOn = hour >= 18 || hour < 6.5;
    setRoomLights(prev => {
      const next = { ...prev };
      let changed = false;
      for (const key of Object.keys(next)) {
        if (next[key] !== shouldBeOn) { next[key] = shouldBeOn; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [lightsAuto, gameTime]);

  const toggleRoomLight = useCallback((roomId) => {
    setRoomLights(prev => ({ ...prev, [roomId]: !prev[roomId] }));
    setLightsAuto(false);  // manual override disables auto
  }, []);

  const setAllLights = useCallback((on) => {
    setRoomLights(prev => {
      const next = {};
      Object.keys(prev).forEach(k => { next[k] = on; });
      return next;
    });
    setLightsAuto(false);
  }, []);

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

  const [recenterCounter, setRecenterCounter] = useState(0);

  const handleGroundClick = useCallback(() => {
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
          timeSpeed={timeSpeed}
          syncToReal={syncToReal}
          simPaused={simPaused}
          onTimeUpdate={setGameTime}
          timeOverrideRef={timeOverrideRef}
          roomLights={roomLights}
          gameTime={gameTime}
          firstPerson={firstPerson}
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
          onSetTimeSpeed={(s) => { setTimeSpeed(s); setSyncToReal(false); }}
          onToggleSyncReal={() => setSyncToReal(p => !p)}
          onSetHour={(h) => { timeOverrideRef.current = h; setSyncToReal(false); }}
          onTogglePaused={() => setSimPaused(p => !p)}
        />
      )}

      {/* Light switches panel */}
      {panelVis.lightSwitches && (
        <LightSwitchPanel
          roomLights={roomLights}
          onToggle={toggleRoomLight}
          onAllOn={() => setAllLights(true)}
          onAllOff={() => setAllLights(false)}
          lightsAuto={lightsAuto}
          onToggleAuto={() => setLightsAuto(p => !p)}
        />
      )}

      {/* Controls panel */}
      {panelVis.controls && (
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
        />
      )}

      {/* Side Pane */}
      {panelVis.sidePane && <SidePane data={sidePaneData} onClose={handleCloseSidePane} />}
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

function LightSwitchPanel({ roomLights, onToggle, onAllOn, onAllOff, lightsAuto, onToggleAuto }) {
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
}

const lightMasterBtnStyle = (active) => ({
  flex: 1, padding: '4px 6px', borderRadius: 4, cursor: 'pointer',
  fontFamily: '"Courier New", monospace', fontSize: 10, fontWeight: 'bold',
  border: active ? '1px solid #FFD700' : '1px solid rgba(255,255,255,0.15)',
  background: active ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.05)',
  color: active ? '#FFD700' : '#888', transition: 'all 0.15s ease',
});

function ControlsPanel({
  visibility, onToggleVisibility,
  cameraAutoRotate, onToggleAutoRotate,
  cameraTopDown, onToggleTopDown,
  cameraLockOrientation, onToggleLockOrientation,
  firstPerson, onToggleFirstPerson
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

      {/* ── Visibility ── */}
      <SectionTitle>Visibility</SectionTitle>
      <ToggleBtn on={visibility.walls} onClick={() => onToggleVisibility('walls')} icon="[W]" label="Walls" />
      <ToggleBtn on={visibility.doors} onClick={() => onToggleVisibility('doors')} icon="[D]" label="Doors" />
      <ToggleBtn on={visibility.furniture} onClick={() => onToggleVisibility('furniture')} icon="[F]" label="Furniture" />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  TimeHUD – top-right overlay: clock, date, slider, speed btns
 * ════════════════════════════════════════════════════════════════ */

function TimeHUD({ gameTime, timeSpeed, syncToReal, paused, onSetTimeSpeed, onToggleSyncReal, onSetHour, onTogglePaused }) {
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
