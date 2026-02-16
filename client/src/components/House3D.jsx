import React, { useRef, useMemo, useState, useCallback } from 'react';
import * as THREE from 'three';
import { HOUSE_LAYOUT, getWallSegments } from '../game/HouseLayout';

/**
 * House3D - Renders the 3D house with rooms, walls, furniture, and doors.
 * Walls have selective transparency so we can see sprites inside.
 */
export default function House3D({ onRoomHover, onFurnitureHover, onRoomClick, onGroundClick, visibility = {} }) {
  const layout = HOUSE_LAYOUT;
  const showWalls = visibility.walls !== false;
  const showDoors = visibility.doors !== false;
  const showFurniture = visibility.furniture !== false;

  return (
    <group>
      {/* Ground plane (far background) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 5]}
        receiveShadow
        onPointerMove={() => {
          onRoomHover && onRoomHover(null);
          onFurnitureHover && onFurnitureHover(null);
        }}
        onClick={(e) => { e.stopPropagation(); if (onGroundClick) onGroundClick(); }}
      >
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#2d4a32" />
      </mesh>

      {/* === Exterior elements === */}
      <Exterior layout={layout} />

      {/* Room floors (interactive) */}
      {layout.rooms.map(room => (
        <RoomFloor key={room.id} room={room} onRoomHover={onRoomHover} onFurnitureHover={onFurnitureHover} onRoomClick={onRoomClick} />
      ))}

      {/* Walls */}
      {showWalls && <HouseWalls layout={layout} />}

      {/* Door frames */}
      {showDoors && <DoorFrames layout={layout} />}

      {/* Furniture */}
      {showFurniture && layout.furniture.map(item => (
        <FurnitureItem key={item.id} item={item} onFurnitureHover={onFurnitureHover} />
      ))}
    </group>
  );
}

/**
 * Exterior - Renders the front lawn, sidewalk, street, driveway, hedges, and mailbox
 */
function Exterior({ layout }) {
  const ext = layout.exterior;
  const { lawn, driveway, sidewalk, street, hedges, mailbox, fence, walkway } = ext;

  const makeGround = (area, y = 0.01) => {
    const w = area.maxX - area.minX;
    const d = area.maxZ - area.minZ;
    const cx = (area.minX + area.maxX) / 2;
    const cz = (area.minZ + area.maxZ) / 2;
    return { w, d, cx, cz, y };
  };

  const lw = makeGround(lawn);
  const dw = makeGround(driveway, 0.018);
  const sw = makeGround(sidewalk, 0.022);
  const st = makeGround(street, 0.005);

  // Front walkway dimensions
  const wkLen = walkway.maxZ - walkway.minZ;
  const wkCenterZ = (walkway.minZ + walkway.maxZ) / 2;

  return (
    <group>
      {/* Lawn (wraps around entire property) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[lw.cx, lw.y, lw.cz]} receiveShadow>
        <planeGeometry args={[lw.w, lw.d]} />
        <meshStandardMaterial color={lawn.color} />
      </mesh>

      {/* Driveway (from garage to curb) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[dw.cx, dw.y, dw.cz]} receiveShadow>
        <planeGeometry args={[dw.w, dw.d]} />
        <meshStandardMaterial color={driveway.color} />
      </mesh>

      {/* Front walkway (from front door to sidewalk) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[walkway.cx, 0.019, wkCenterZ]} receiveShadow>
        <planeGeometry args={[walkway.width, wkLen]} />
        <meshStandardMaterial color={walkway.color} />
      </mesh>

      {/* Sidewalk */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[sw.cx, sw.y, sw.cz]} receiveShadow>
        <planeGeometry args={[sw.w, sw.d]} />
        <meshStandardMaterial color={sidewalk.color} />
      </mesh>

      {/* Street */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[st.cx, st.y, st.cz]} receiveShadow>
        <planeGeometry args={[st.w, st.d]} />
        <meshStandardMaterial color={street.color} />
      </mesh>

      {/* Street center line (dashed yellow) */}
      {Array.from({ length: 15 }).map((_, i) => (
        <mesh
          key={`lane_${i}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[-18 + i * 3, 0.025, ext.streetCenterZ]}
        >
          <planeGeometry args={[1.8, 0.15]} />
          <meshStandardMaterial color="#FFD700" />
        </mesh>
      ))}

      {/* Curb (raised edge between sidewalk and street) */}
      <mesh position={[(sidewalk.minX + sidewalk.maxX) / 2, 0.06, sidewalk.maxZ]}>
        <boxGeometry args={[sidewalk.maxX - sidewalk.minX, 0.12, 0.15]} />
        <meshStandardMaterial color="#999" />
      </mesh>

      {/* Hedges */}
      {hedges.map((hedge, i) => (
        <mesh key={`hedge_${i}`} position={[hedge.position.x, 0.35, hedge.position.z]} castShadow>
          <boxGeometry args={[hedge.size.w, 0.7, hedge.size.d]} />
          <meshStandardMaterial color="#2D5A27" />
        </mesh>
      ))}

      {/* Mailbox */}
      <group position={[mailbox.x, 0, mailbox.z]}>
        {/* Post */}
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[0.1, 1, 0.1]} />
          <meshStandardMaterial color="#5C3317" />
        </mesh>
        {/* Box */}
        <mesh position={[0, 1.05, 0]}>
          <boxGeometry args={[0.3, 0.25, 0.4]} />
          <meshStandardMaterial color="#1a1a8a" />
        </mesh>
      </group>

      {/* Garage door (visual, on the z=12 face of the garage) */}
      <mesh position={[-7, 1.3, 12]}>
        <boxGeometry args={[3.5, 2.6, 0.1]} />
        <meshStandardMaterial color="#8B7355" />
      </mesh>
      {/* Garage door panels */}
      {[0, 0.65, 1.3, 1.95].map((yOff, i) => (
        <mesh key={`gp_${i}`} position={[-7, 0.15 + yOff, 12.06]}>
          <boxGeometry args={[3.3, 0.55, 0.02]} />
          <meshStandardMaterial color="#7B6B4F" />
        </mesh>
      ))}

      {/* Picket Fence */}
      {fence && <PicketFence fence={fence} />}
    </group>
  );
}

/**
 * PicketFence - White picket fence around the property perimeter with gate openings
 */
function PicketFence({ fence }) {
  const { bounds, color, height, gates } = fence;
  const postW = 0.1;
  const railThick = 0.06;
  const railH = 0.06;
  const postHeight = height + 0.15;
  const topRailY = height - railH / 2;
  const bottomRailY = height * 0.3;

  const segments = useMemo(() => {
    const segs = [];
    // Back
    segs.push({ axis: 'x', fixed: bounds.minZ, from: bounds.minX, to: bounds.maxX });
    // Left
    segs.push({ axis: 'z', fixed: bounds.minX, from: bounds.minZ, to: bounds.maxZ });
    // Right
    segs.push({ axis: 'z', fixed: bounds.maxX, from: bounds.minZ, to: bounds.maxZ });
    // Front (with gate gaps)
    const frontGates = (gates || [])
      .filter(g => g.side === 'front')
      .map(g => ({ min: g.center - g.width / 2, max: g.center + g.width / 2 }))
      .sort((a, b) => a.min - b.min);
    let cursor = bounds.minX;
    for (const gap of frontGates) {
      if (cursor < gap.min - 0.01) {
        segs.push({ axis: 'x', fixed: bounds.maxZ, from: cursor, to: gap.min });
      }
      cursor = gap.max;
    }
    if (cursor < bounds.maxX - 0.01) {
      segs.push({ axis: 'x', fixed: bounds.maxZ, from: cursor, to: bounds.maxX });
    }
    return segs;
  }, [bounds, gates]);

  return (
    <group>
      {segments.map((seg, si) => {
        const len = seg.to - seg.from;
        const isX = seg.axis === 'x';
        const mid = (seg.from + seg.to) / 2;

        // Posts every ~2m
        const numPosts = Math.max(2, Math.round(len / 2) + 1);
        const postStep = len / (numPosts - 1);
        const posts = [];
        for (let p = 0; p < numPosts; p++) {
          const t = seg.from + p * postStep;
          posts.push(
            <mesh key={`p${p}`} position={[
              isX ? t : seg.fixed,
              postHeight / 2,
              isX ? seg.fixed : t,
            ]} castShadow>
              <boxGeometry args={[postW, postHeight, postW]} />
              <meshStandardMaterial color={color} />
            </mesh>
          );
        }

        return (
          <group key={si}>
            {/* Top rail */}
            <mesh position={[
              isX ? mid : seg.fixed,
              topRailY,
              isX ? seg.fixed : mid,
            ]} rotation={[0, isX ? 0 : Math.PI / 2, 0]}>
              <boxGeometry args={[len, railH, railThick]} />
              <meshStandardMaterial color={color} />
            </mesh>
            {/* Bottom rail */}
            <mesh position={[
              isX ? mid : seg.fixed,
              bottomRailY,
              isX ? seg.fixed : mid,
            ]} rotation={[0, isX ? 0 : Math.PI / 2, 0]}>
              <boxGeometry args={[len, railH, railThick]} />
              <meshStandardMaterial color={color} />
            </mesh>
            {posts}
          </group>
        );
      })}

      {/* Gate posts (taller, thicker posts at gate openings) */}
      {(gates || []).filter(g => g.side === 'front').map((gate, gi) => {
        const gatePostW = 0.15;
        const gatePostH = height + 0.3;
        const leftX = gate.center - gate.width / 2;
        const rightX = gate.center + gate.width / 2;
        return (
          <group key={`gate_${gi}`}>
            <mesh position={[leftX, gatePostH / 2, bounds.maxZ]} castShadow>
              <boxGeometry args={[gatePostW, gatePostH, gatePostW]} />
              <meshStandardMaterial color={color} />
            </mesh>
            <mesh position={[rightX, gatePostH / 2, bounds.maxZ]} castShadow>
              <boxGeometry args={[gatePostW, gatePostH, gatePostW]} />
              <meshStandardMaterial color={color} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function RoomFloor({ room, onRoomHover, onFurnitureHover, onRoomClick }) {
  const [hovered, setHovered] = useState(false);
  const width = room.bounds.maxX - room.bounds.minX;
  const depth = room.bounds.maxZ - room.bounds.minZ;
  const centerX = (room.bounds.minX + room.bounds.maxX) / 2;
  const centerZ = (room.bounds.minZ + room.bounds.maxZ) / 2;

  const handlePointerOver = useCallback((e) => {
    e.stopPropagation();
    setHovered(true);
    if (onRoomHover) onRoomHover({ id: room.id, name: room.name, color: room.floorColor });
    if (onFurnitureHover) onFurnitureHover(null);
  }, [room, onRoomHover, onFurnitureHover]);

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    if (onRoomHover) onRoomHover(null);
  }, [onRoomHover]);

  // Brighten color when hovered
  const baseColor = new THREE.Color(room.floorColor);
  const hoverColor = baseColor.clone().lerp(new THREE.Color('#ffffff'), 0.15);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[centerX, 0.02, centerZ]}
      receiveShadow
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={(e) => { e.stopPropagation(); if (onRoomClick) onRoomClick(room); }}
    >
      <planeGeometry args={[width, depth]} />
      <meshStandardMaterial
        color={hovered ? `#${hoverColor.getHexString()}` : room.floorColor}
      />
    </mesh>
  );
}

function HouseWalls({ layout }) {
  const wallHeight = layout.wallHeight;
  const thickness = layout.wallThickness;
  const wallMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#F5F5DC',
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false
  }), []);

  // Use pre-computed wall segments that already have door gaps cut out
  const segments = useMemo(() => getWallSegments(), []);

  return (
    <group>
      {segments.map((seg, i) => {
        const length = seg.to - seg.from;
        if (length <= 0.01) return null;

        const isXAxis = seg.axis === 'x';
        const posX = isXAxis ? (seg.from + seg.to) / 2 : seg.fixed;
        const posZ = isXAxis ? seg.fixed : (seg.from + seg.to) / 2;

        return (
          <mesh
            key={i}
            position={[posX, wallHeight / 2, posZ]}
            rotation={[0, isXAxis ? 0 : Math.PI / 2, 0]}
          >
            <boxGeometry args={[length, wallHeight, thickness]} />
            <primitive object={wallMaterial} attach="material" />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * DoorFrames - Renders visible door frames in each doorway opening
 */
function DoorFrames({ layout }) {
  const frameColor = '#5C3317';
  const frameThickness = 0.08;
  const frameDepth = 0.2;
  const wallHeight = layout.wallHeight;

  return (
    <group>
      {layout.doors.map((door, i) => {
        const { position, width } = door;
        // All doors are on Z-aligned walls (x = const boundary)
        const isZWall = door.axis === 'z';
        const halfW = width / 2;

        return (
          <group key={i}>
            {/* Left post */}
            <mesh position={[
              isZWall ? position.x : position.x - halfW,
              wallHeight / 2,
              isZWall ? position.z - halfW : position.z
            ]}>
              <boxGeometry args={[
                isZWall ? frameDepth : frameThickness,
                wallHeight,
                isZWall ? frameThickness : frameDepth
              ]} />
              <meshStandardMaterial color={frameColor} />
            </mesh>

            {/* Right post */}
            <mesh position={[
              isZWall ? position.x : position.x + halfW,
              wallHeight / 2,
              isZWall ? position.z + halfW : position.z
            ]}>
              <boxGeometry args={[
                isZWall ? frameDepth : frameThickness,
                wallHeight,
                isZWall ? frameThickness : frameDepth
              ]} />
              <meshStandardMaterial color={frameColor} />
            </mesh>

            {/* Top lintel */}
            <mesh position={[
              position.x,
              wallHeight - frameThickness / 2,
              position.z
            ]}>
              <boxGeometry args={[
                isZWall ? frameDepth : width + frameThickness * 2,
                frameThickness,
                isZWall ? width + frameThickness * 2 : frameDepth
              ]} />
              <meshStandardMaterial color={frameColor} />
            </mesh>

            {/* Threshold strip on floor */}
            <mesh position={[position.x, 0.025, position.z]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[
                isZWall ? frameDepth + 0.1 : width,
                isZWall ? width : frameDepth + 0.1
              ]} />
              <meshStandardMaterial color="#8B6914" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * FurnitureItem - Routes each furniture piece to a detailed multi-mesh renderer.
 * Each item type gets its own recognizable pixel-craft shape.
 */
function FurnitureItem({ item, onFurnitureHover }) {
  const [hovered, setHovered] = useState(false);

  const handlePointerOver = useCallback((e) => {
    e.stopPropagation();
    setHovered(true);
    if (onFurnitureHover) {
      onFurnitureHover({ id: item.id, label: item.label || item.id, room: item.room, screenX: e.clientX, screenY: e.clientY });
    }
  }, [item, onFurnitureHover]);

  const handlePointerMove = useCallback((e) => {
    e.stopPropagation();
    if (onFurnitureHover) {
      onFurnitureHover({ id: item.id, label: item.label || item.id, room: item.room, screenX: e.clientX, screenY: e.clientY });
    }
  }, [item, onFurnitureHover]);

  const handlePointerOut = useCallback(() => {
    setHovered(false);
    if (onFurnitureHover) onFurnitureHover(null);
  }, [onFurnitureHover]);

  const handlers = { onPointerOver: handlePointerOver, onPointerMove: handlePointerMove, onPointerOut: handlePointerOut };
  const { position: pos, size, color } = item;

  // Hover brightness helper
  const c = (col) => {
    if (!hovered) return col;
    const base = new THREE.Color(col);
    return `#${base.clone().lerp(new THREE.Color('#ffffff'), 0.25).getHexString()}`;
  };

  // Route to the appropriate detailed renderer
  const renderer = FURNITURE_RENDERERS[item.id] || FURNITURE_RENDERERS[`_type_${guessType(item.id)}`] || null;
  if (renderer) {
    return (
      <group position={[pos.x, pos.y || 0, pos.z]} rotation={[0, item.rotationY || 0, 0]} {...handlers}>
        {renderer(item, c, hovered)}
      </group>
    );
  }

  // Fallback: generic box
  return (
    <mesh position={[pos.x, (pos.y || 0) + size.h / 2, pos.z]} rotation={[0, item.rotationY || 0, 0]} castShadow receiveShadow {...handlers}>
      <boxGeometry args={[size.w, size.h, size.d]} />
      <meshStandardMaterial color={c(color)} />
    </mesh>
  );
}

function guessType(id) {
  if (id.includes('rug') || id.includes('mat')) return 'rug';
  if (id.includes('bed')) return 'bed';
  if (id.includes('chair')) return 'chair';
  if (id.includes('desk')) return 'desk';
  if (id.includes('bookshelf') || id.includes('shelf')) return 'bookshelf';
  return '';
}

/* ─── Box helper ───────────────────────────────────────── */
function B({ p, s, col, cast = true }) {
  return (
    <mesh position={p} castShadow={cast} receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial color={col} />
    </mesh>
  );
}

/* ─── Flat rug/mat (plane above floor, uses polygonOffset to avoid Z-fight) ─── */
function FlatRug({ w, d, color, c }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({
    color: color,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }), [color]);

  // Update color on hover
  if (c) {
    mat.color.set(c(color));
    mat.needsUpdate = true;
  }

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

/* ═══════════════════════════════════════════════════════════
   Furniture Renderers - Each returns JSX for a detailed shape
   Position is already set to (pos.x, 0, pos.z) by parent group
   ═══════════════════════════════════════════════════════════ */

const FURNITURE_RENDERERS = {
  /* ─── Rugs / Mats (flat planes) ──────────────────────── */
  rug: (item, c) => <FlatRug w={item.size.w} d={item.size.d} color={item.color} c={c} />,
  master_rug: (item, c) => <FlatRug w={item.size.w} d={item.size.d} color={item.color} c={c} />,
  bath_mat: (item, c) => <FlatRug w={item.size.w} d={item.size.d} color={item.color} c={c} />,
  _type_rug: (item, c) => <FlatRug w={item.size.w} d={item.size.d} color={item.color} c={c} />,

  /* ─── Fridge ──────────────────────────────────────────── */
  fridge: (item, c) => (
    <>
      {/* Main body */}
      <B p={[0, 1, 0]} s={[item.size.w, 2, item.size.d]} col={c('#C0C0C0')} />
      {/* Door line */}
      <B p={[0, 1, item.size.d / 2 + 0.01]} s={[item.size.w - 0.05, 0.02, 0.01]} col={c('#999')} cast={false} />
      {/* Top freezer section (darker) */}
      <B p={[0, 1.75, item.size.d / 2 + 0.01]} s={[item.size.w - 0.1, 0.4, 0.02]} col={c('#A8A8A8')} cast={false} />
      {/* Handle */}
      <B p={[item.size.w / 2 - 0.06, 1.2, item.size.d / 2 + 0.03]} s={[0.04, 0.5, 0.04]} col={c('#888')} cast={false} />
      <B p={[item.size.w / 2 - 0.06, 0.5, item.size.d / 2 + 0.03]} s={[0.04, 0.4, 0.04]} col={c('#888')} cast={false} />
    </>
  ),

  /* ─── Kitchen Sink ───────────────────────────────────── */
  sink: (item, c) => (
    <>
      {/* Counter/cabinet base */}
      <B p={[0, 0.45, 0]} s={[item.size.w, 0.9, item.size.d]} col={c('#A9A9A9')} />
      {/* Basin (recessed darker area on top) */}
      <B p={[0, 0.92, 0]} s={[item.size.w - 0.15, 0.06, item.size.d - 0.15]} col={c('#707070')} cast={false} />
      {/* Faucet post */}
      <B p={[0, 1.1, -item.size.d / 2 + 0.1]} s={[0.06, 0.3, 0.06]} col={c('#B8B8B8')} />
      {/* Faucet spout */}
      <B p={[0, 1.22, -item.size.d / 2 + 0.2]} s={[0.04, 0.04, 0.2]} col={c('#B8B8B8')} cast={false} />
    </>
  ),

  /* ─── Dishwasher ─────────────────────────────────────── */
  dishwasher: (item, c) => (
    <>
      <B p={[0, 0.5, 0]} s={[item.size.w, 1, item.size.d]} col={c('#808080')} />
      {/* Door panel */}
      <B p={[0, 0.5, item.size.d / 2 + 0.01]} s={[item.size.w - 0.06, 0.85, 0.02]} col={c('#707070')} cast={false} />
      {/* Handle bar */}
      <B p={[0, 0.88, item.size.d / 2 + 0.03]} s={[item.size.w - 0.15, 0.04, 0.04]} col={c('#999')} cast={false} />
    </>
  ),

  /* ─── Stove/Oven ─────────────────────────────────────── */
  stove: (item, c) => (
    <>
      {/* Oven body */}
      <B p={[0, 0.5, 0]} s={[item.size.w, 1, item.size.d]} col={c('#2F4F4F')} />
      {/* Stovetop surface */}
      <B p={[0, 1.01, 0]} s={[item.size.w, 0.03, item.size.d]} col={c('#1a1a1a')} cast={false} />
      {/* 4 burners */}
      {[[-0.15, -0.1], [0.15, -0.1], [-0.15, 0.12], [0.15, 0.12]].map(([bx, bz], i) => (
        <mesh key={i} position={[bx, 1.03, bz]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.06, 0.09, 8]} />
          <meshStandardMaterial color={c('#444')} />
        </mesh>
      ))}
      {/* Oven door */}
      <B p={[0, 0.35, item.size.d / 2 + 0.01]} s={[item.size.w - 0.06, 0.55, 0.02]} col={c('#222')} cast={false} />
      {/* Oven handle */}
      <B p={[0, 0.68, item.size.d / 2 + 0.03]} s={[item.size.w - 0.2, 0.04, 0.03]} col={c('#555')} cast={false} />
    </>
  ),

  /* ─── Microwave ──────────────────────────────────────── */
  microwave: (item, c) => (
    <>
      <B p={[0, 0.95, 0]} s={[item.size.w, item.size.h, item.size.d]} col={c('#333')} />
      {/* Glass door */}
      <B p={[-0.05, 0.95, item.size.d / 2 + 0.01]} s={[item.size.w - 0.2, item.size.h - 0.06, 0.01]} col={c('#1a3a4a')} cast={false} />
      {/* Control panel */}
      <B p={[item.size.w / 2 - 0.06, 0.95, item.size.d / 2 + 0.01]} s={[0.08, item.size.h - 0.06, 0.01]} col={c('#444')} cast={false} />
    </>
  ),

  /* ─── Kitchen Table ──────────────────────────────────── */
  kitchen_table: (item, c) => {
    const legH = 0.7;
    const topH = 0.08;
    const hw = item.size.w / 2 - 0.1;
    const hd = item.size.d / 2 - 0.1;
    return (
      <>
        {/* Tabletop */}
        <B p={[0, legH + topH / 2, 0]} s={[item.size.w, topH, item.size.d]} col={c('#8B4513')} />
        {/* 4 Legs */}
        {[[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].map(([lx, lz], i) => (
          <B key={i} p={[lx, legH / 2, lz]} s={[0.08, legH, 0.08]} col={c('#6B3513')} />
        ))}
      </>
    );
  },

  /* ─── Chairs ─────────────────────────────────────────── */
  kitchen_chair_1: (item, c) => <ChairShape c={c} color={item.color} />,
  kitchen_chair_2: (item, c) => <ChairShape c={c} color={item.color} />,
  _type_chair: (item, c) => <ChairShape c={c} color={item.color} />,

  /* ─── Pantry ─────────────────────────────────────────── */
  pantry: (item, c) => (
    <>
      <B p={[0, 1, 0]} s={[item.size.w, 2, item.size.d]} col={c('#7B5B3A')} />
      {/* Shelves inside (visible lines) */}
      {[0.5, 1.0, 1.5].map((sy, i) => (
        <B key={i} p={[0, sy, item.size.d / 2 + 0.01]} s={[item.size.w - 0.06, 0.03, 0.01]} col={c('#5A3A1A')} cast={false} />
      ))}
      {/* Door knob */}
      <B p={[item.size.w / 2 - 0.1, 1, item.size.d / 2 + 0.02]} s={[0.05, 0.05, 0.04]} col={c('#C0A060')} cast={false} />
    </>
  ),

  /* ─── Couch ──────────────────────────────────────────── */
  couch: (item, c) => (
    <>
      {/* Seat cushion */}
      <B p={[0, 0.25, 0.08]} s={[item.size.w, 0.3, item.size.d - 0.2]} col={c('#4169E1')} />
      {/* Back cushion */}
      <B p={[0, 0.55, -item.size.d / 2 + 0.12]} s={[item.size.w - 0.1, 0.35, 0.2]} col={c('#3558C8')} />
      {/* Left arm */}
      <B p={[-item.size.w / 2 + 0.12, 0.35, 0]} s={[0.2, 0.5, item.size.d]} col={c('#3A5FCF')} />
      {/* Right arm */}
      <B p={[item.size.w / 2 - 0.12, 0.35, 0]} s={[0.2, 0.5, item.size.d]} col={c('#3A5FCF')} />
    </>
  ),

  /* ─── Loveseat ───────────────────────────────────────── */
  loveseat: (item, c) => (
    <>
      <B p={[0, 0.22, 0]} s={[item.size.w, 0.28, item.size.d - 0.2]} col={c('#4169E1')} />
      <B p={[-item.size.w / 2 + 0.1, 0.5, 0]} s={[0.15, 0.35, item.size.d - 0.1]} col={c('#3558C8')} />
      <B p={[0, 0.22, -item.size.d / 2 + 0.1]} s={[item.size.w - 0.1, 0.5, 0.15]} col={c('#3558C8')} />
      <B p={[0, 0.22, item.size.d / 2 - 0.1]} s={[item.size.w - 0.1, 0.5, 0.15]} col={c('#3558C8')} />
    </>
  ),

  /* ─── TV Stand ───────────────────────────────────────── */
  tv_stand: (item, c) => (
    <>
      {/* Main cabinet */}
      <B p={[0, 0.3, 0]} s={[item.size.w, 0.6, item.size.d]} col={c('#2F2F2F')} />
      {/* Shelf line */}
      <B p={[0, 0.28, item.size.d / 2 + 0.01]} s={[item.size.w - 0.1, 0.02, 0.01]} col={c('#1a1a1a')} cast={false} />
      {/* Cabinet doors */}
      <B p={[-0.4, 0.15, item.size.d / 2 + 0.01]} s={[0.8, 0.25, 0.02]} col={c('#252525')} cast={false} />
      <B p={[0.4, 0.15, item.size.d / 2 + 0.01]} s={[0.8, 0.25, 0.02]} col={c('#252525')} cast={false} />
    </>
  ),

  /* ─── Television ─────────────────────────────────────── */
  tv: (item, c) => (
    <>
      {/* Stand base (sits on surface) */}
      <B p={[0, 0.02, 0]} s={[0.7, 0.04, 0.2]} col={c('#222')} cast={false} />
      {/* Stand neck */}
      <B p={[0, 0.14, 0]} s={[0.15, 0.22, 0.1]} col={c('#222')} />
      {/* Screen (thin panel) */}
      <B p={[0, 0.75, 0]} s={[2, 1.1, 0.06]} col={c('#111')} />
      {/* Screen face (slightly brighter) */}
      <B p={[0, 0.75, 0.035]} s={[1.85, 0.95, 0.01]} col={c('#0a0a2a')} cast={false} />
    </>
  ),

  /* ─── Coffee Table ───────────────────────────────────── */
  coffee_table: (item, c) => {
    const legH = 0.35;
    const hw = item.size.w / 2 - 0.08;
    const hd = item.size.d / 2 - 0.08;
    return (
      <>
        <B p={[0, legH + 0.04, 0]} s={[item.size.w, 0.06, item.size.d]} col={c('#A0522D')} />
        {/* Lower shelf */}
        <B p={[0, legH * 0.4, 0]} s={[item.size.w - 0.15, 0.04, item.size.d - 0.1]} col={c('#8B4513')} />
        {[[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].map(([lx, lz], i) => (
          <B key={i} p={[lx, legH / 2, lz]} s={[0.06, legH, 0.06]} col={c('#7B3B1A')} />
        ))}
      </>
    );
  },

  /* ─── Bookshelf ──────────────────────────────────────── */
  bookshelf: (item, c) => (
    <>
      {/* Frame */}
      <B p={[0, item.size.h / 2, 0]} s={[item.size.w, item.size.h, item.size.d]} col={c('#6B3A2A')} />
      {/* Shelves */}
      {[0.35, 0.8, 1.25].map((sy, i) => (
        <B key={i} p={[0, sy, 0.01]} s={[item.size.w - 0.06, 0.04, item.size.d]} col={c('#5A2A1A')} cast={false} />
      ))}
      {/* Books (colored blocks on shelves) */}
      {[
        { p: [-0.15, 0.55, 0.03], s: [0.3, 0.25, 0.18], col: '#8B0000' },
        { p: [0.15, 0.55, 0.03], s: [0.25, 0.25, 0.18], col: '#1a3a6a' },
        { p: [-0.1, 1.0, 0.03], s: [0.35, 0.22, 0.18], col: '#2E8B57' },
        { p: [0.2, 1.0, 0.03], s: [0.2, 0.22, 0.18], col: '#8B6914' },
        { p: [0, 1.45, 0.03], s: [0.4, 0.2, 0.18], col: '#4B0082' },
      ].map((book, i) => (
        <B key={i} p={book.p} s={book.s} col={c(book.col)} cast={false} />
      ))}
    </>
  ),
  kids_bookshelf: (item, c) => (
    <>
      <B p={[0, item.size.h / 2, 0]} s={[item.size.w, item.size.h, item.size.d]} col={c('#6B3A2A')} />
      {[0.3, 0.7, 1.1].map((sy, i) => (
        <B key={i} p={[0, sy, 0.01]} s={[item.size.w - 0.06, 0.04, item.size.d]} col={c('#5A2A1A')} cast={false} />
      ))}
      {[
        { p: [0, 0.5, 0.03], s: [0.25, 0.18, 0.15], col: '#FF4500' },
        { p: [0, 0.9, 0.03], s: [0.3, 0.18, 0.15], col: '#4169E1' },
        { p: [0, 1.3, 0.03], s: [0.22, 0.18, 0.15], col: '#32CD32' },
      ].map((book, i) => (
        <B key={i} p={book.p} s={book.s} col={c(book.col)} cast={false} />
      ))}
    </>
  ),

  /* ─── End Table ──────────────────────────────────────── */
  end_table: (item, c) => {
    const legH = 0.5;
    return (
      <>
        <B p={[0, legH + 0.03, 0]} s={[item.size.w, 0.05, item.size.d]} col={c('#8B4513')} />
        {[[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]].map(([lx, lz], i) => (
          <B key={i} p={[lx, legH / 2, lz]} s={[0.05, legH, 0.05]} col={c('#6B3513')} />
        ))}
        {/* Lamp on top */}
        <B p={[0, legH + 0.15, 0]} s={[0.1, 0.15, 0.1]} col={c('#DEB887')} />
        <B p={[0, legH + 0.3, 0]} s={[0.2, 0.12, 0.2]} col={c('#FFFACD')} />
      </>
    );
  },

  /* ─── Master Bed (King) ──────────────────────────────── */
  master_bed: (item, c) => (
    <>
      {/* Bed frame */}
      <B p={[0, 0.15, 0]} s={[item.size.w, 0.3, item.size.d]} col={c('#5C2020')} />
      {/* Mattress */}
      <B p={[0, 0.35, 0.05]} s={[item.size.w - 0.1, 0.12, item.size.d - 0.15]} col={c('#F5F5DC')} />
      {/* Blanket/duvet */}
      <B p={[0, 0.42, 0.25]} s={[item.size.w - 0.15, 0.06, item.size.d - 0.8]} col={c('#8B0000')} />
      {/* Pillows */}
      <B p={[-0.5, 0.44, -item.size.d / 2 + 0.3]} s={[0.6, 0.08, 0.35]} col={c('#FFFAF0')} />
      <B p={[0.5, 0.44, -item.size.d / 2 + 0.3]} s={[0.6, 0.08, 0.35]} col={c('#FFFAF0')} />
      {/* Headboard */}
      <B p={[0, 0.6, -item.size.d / 2 + 0.06]} s={[item.size.w, 0.7, 0.1]} col={c('#4A1515')} />
    </>
  ),

  /* ─── Nightstands ────────────────────────────────────── */
  nightstand_l: (item, c) => <NightstandShape c={c} color={item.color} size={item.size} />,
  nightstand_r: (item, c) => <NightstandShape c={c} color={item.color} size={item.size} />,

  /* ─── Dresser ────────────────────────────────────────── */
  dresser: (item, c) => (
    <>
      <B p={[0, 0.5, 0]} s={[item.size.w, 1, item.size.d]} col={c('#DEB887')} />
      {/* Drawer lines */}
      {[0.2, 0.45, 0.7].map((dy, i) => (
        <B key={i} p={[item.size.w / 2 + 0.01, dy, 0]} s={[0.02, 0.02, item.size.d - 0.1]} col={c('#B8956A')} cast={false} />
      ))}
      {/* Knobs */}
      {[0.2, 0.45, 0.7].map((dy, i) => (
        <B key={`k${i}`} p={[item.size.w / 2 + 0.02, dy, 0]} s={[0.04, 0.04, 0.04]} col={c('#C0A060')} cast={false} />
      ))}
    </>
  ),

  /* ─── Wardrobe ───────────────────────────────────────── */
  wardrobe: (item, c) => (
    <>
      <B p={[0, item.size.h / 2, 0]} s={[item.size.w, item.size.h, item.size.d]} col={c('#5C3317')} />
      {/* Door split line */}
      <B p={[item.size.w / 2 + 0.01, item.size.h / 2, 0]} s={[0.02, item.size.h - 0.1, 0.02]} col={c('#3A1A0A')} cast={false} />
      {/* Knobs */}
      <B p={[item.size.w / 2 + 0.02, item.size.h / 2, -0.15]} s={[0.04, 0.04, 0.04]} col={c('#C0A060')} cast={false} />
      <B p={[item.size.w / 2 + 0.02, item.size.h / 2, 0.15]} s={[0.04, 0.04, 0.04]} col={c('#C0A060')} cast={false} />
    </>
  ),

  /* ─── Toilet ─────────────────────────────────────────── */
  toilet: (item, c) => (
    <>
      {/* Base/bowl */}
      <B p={[0, 0.2, 0.05]} s={[0.4, 0.4, 0.45]} col={c('#FFFFF0')} />
      {/* Tank */}
      <B p={[0, 0.4, -0.2]} s={[0.35, 0.5, 0.18]} col={c('#F5F5E0')} />
      {/* Seat ring (darker oval on top) */}
      <B p={[0, 0.41, 0.06]} s={[0.32, 0.02, 0.36]} col={c('#E8E8D8')} cast={false} />
      {/* Flush handle */}
      <B p={[0.2, 0.6, -0.2]} s={[0.08, 0.04, 0.04]} col={c('#C0C0C0')} cast={false} />
    </>
  ),

  /* ─── Shower ─────────────────────────────────────────── */
  shower: (item, c) => (
    <>
      {/* Base tray */}
      <B p={[0, 0.04, 0]} s={[item.size.w, 0.08, item.size.d]} col={c('#D8D8D8')} />
      {/* Glass walls (transparent) */}
      <mesh position={[0, 1.1, item.size.d / 2 - 0.02]}>
        <boxGeometry args={[item.size.w, 2.0, 0.04]} />
        <meshStandardMaterial color="#E8F4FF" transparent opacity={0.25} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[item.size.w / 2 - 0.02, 1.1, 0]}>
        <boxGeometry args={[0.04, 2.0, item.size.d]} />
        <meshStandardMaterial color="#E8F4FF" transparent opacity={0.25} side={THREE.DoubleSide} />
      </mesh>
      {/* Shower head (at top of back wall) */}
      <B p={[0, 2.0, -item.size.d / 2 + 0.1]} s={[0.15, 0.06, 0.1]} col={c('#C0C0C0')} cast={false} />
      {/* Pipe */}
      <B p={[0, 1.5, -item.size.d / 2 + 0.05]} s={[0.04, 1.0, 0.04]} col={c('#B0B0B0')} cast={false} />
    </>
  ),

  /* ─── Bathroom Sink ──────────────────────────────────── */
  bath_sink: (item, c) => (
    <>
      {/* Pedestal */}
      <B p={[0, 0.35, 0]} s={[0.2, 0.7, 0.15]} col={c('#FFFFF0')} />
      {/* Basin */}
      <B p={[0, 0.72, 0]} s={[item.size.w, 0.08, item.size.d]} col={c('#FFFFF0')} />
      {/* Basin hollow */}
      <B p={[0, 0.77, 0]} s={[item.size.w - 0.1, 0.04, item.size.d - 0.08]} col={c('#D8D8E0')} cast={false} />
      {/* Faucet */}
      <B p={[0, 0.85, -item.size.d / 2 + 0.08]} s={[0.05, 0.12, 0.05]} col={c('#C0C0C0')} cast={false} />
      <B p={[0, 0.9, -item.size.d / 2 + 0.14]} s={[0.03, 0.03, 0.1]} col={c('#C0C0C0')} cast={false} />
    </>
  ),

  /* ─── Bathroom Mirror (wall-mounted) ─────────────────── */
  bath_mirror: (item, c) => (
    <>
      {/* Frame (mounted on wall, y position from layout puts it at wall height) */}
      <B p={[0, 0, 0]} s={[item.size.w + 0.06, item.size.h + 0.06, 0.04]} col={c('#8B7355')} />
      {/* Reflective surface */}
      <B p={[0, 0, 0.03]} s={[item.size.w, item.size.h, 0.01]} col={c('#C0E8FF')} cast={false} />
    </>
  ),

  /* ─── Washer ─────────────────────────────────────────── */
  washer: (item, c) => (
    <>
      <B p={[0, 0.5, 0]} s={[item.size.w, 1, item.size.d]} col={c('#E0E0E0')} />
      {/* Front door (circle approximation) */}
      <mesh position={[item.size.w / 2 + 0.01, 0.5, 0]} rotation={[0, Math.PI / 2, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.02, 12]} />
        <meshStandardMaterial color={c('#C8C8C8')} />
      </mesh>
      {/* Door ring */}
      <mesh position={[item.size.w / 2 + 0.02, 0.5, 0]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.22, 0.02, 6, 12]} />
        <meshStandardMaterial color={c('#A0A0A0')} />
      </mesh>
      {/* Control panel */}
      <B p={[item.size.w / 2 + 0.01, 0.9, 0]} s={[0.02, 0.15, item.size.d - 0.1]} col={c('#CCC')} cast={false} />
    </>
  ),

  /* ─── Dryer ──────────────────────────────────────────── */
  dryer: (item, c) => (
    <>
      <B p={[0, 0.5, 0]} s={[item.size.w, 1, item.size.d]} col={c('#E0E0E0')} />
      <mesh position={[item.size.w / 2 + 0.01, 0.5, 0]} rotation={[0, Math.PI / 2, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.02, 12]} />
        <meshStandardMaterial color={c('#D0D0D0')} />
      </mesh>
      <B p={[item.size.w / 2 + 0.01, 0.9, 0]} s={[0.02, 0.15, item.size.d - 0.1]} col={c('#CCC')} cast={false} />
    </>
  ),

  /* ─── Utility Sink ───────────────────────────────────── */
  utility_sink: (item, c) => (
    <>
      {/* Cabinet */}
      <B p={[0, 0.35, 0]} s={[item.size.w, 0.7, item.size.d]} col={c('#B0B0B0')} />
      {/* Basin top */}
      <B p={[0, 0.72, 0]} s={[item.size.w, 0.08, item.size.d]} col={c('#C8C8C8')} />
      <B p={[0, 0.77, 0]} s={[item.size.w - 0.12, 0.04, item.size.d - 0.1]} col={c('#A0A0A0')} cast={false} />
      {/* Faucet */}
      <B p={[0, 0.85, -item.size.d / 2 + 0.08]} s={[0.04, 0.1, 0.04]} col={c('#888')} cast={false} />
    </>
  ),

  /* ─── Laundry Basket ─────────────────────────────────── */
  laundry_basket: (item, c) => (
    <>
      {/* Basket body (slightly tapered - wider at top) */}
      <B p={[0, 0.15, 0]} s={[item.size.w - 0.08, 0.3, item.size.d - 0.08]} col={c('#C4A35A')} />
      <B p={[0, 0.4, 0]} s={[item.size.w, 0.3, item.size.d]} col={c('#C4A35A')} />
      {/* Rim */}
      <B p={[0, 0.56, 0]} s={[item.size.w + 0.04, 0.04, item.size.d + 0.04]} col={c('#A88940')} />
      {/* Cloth sticking out */}
      <B p={[0.1, 0.62, 0.05]} s={[0.2, 0.1, 0.15]} col={c('#E8E8E8')} cast={false} />
    </>
  ),

  /* ─── Ironing Board ──────────────────────────────────── */
  ironing_board: (item, c) => (
    <>
      {/* Board surface */}
      <B p={[0, 0.8, 0]} s={[item.size.w, 0.03, item.size.d]} col={c('#C8C8C8')} />
      {/* Cover */}
      <B p={[0, 0.82, 0]} s={[item.size.w - 0.02, 0.02, item.size.d - 0.02]} col={c('#A0B0C0')} cast={false} />
      {/* Legs (X frame) */}
      <B p={[-0.05, 0.4, -0.3]} s={[0.03, 0.8, 0.03]} col={c('#808080')} />
      <B p={[0.05, 0.4, 0.3]} s={[0.03, 0.8, 0.03]} col={c('#808080')} />
    </>
  ),

  /* ─── Kids Beds ──────────────────────────────────────── */
  kids_bed_1: (item, c) => <BedShape c={c} frameColor="#D45A8A" blanketColor="#FF69B4" size={item.size} />,
  kids_bed_2: (item, c) => <BedShape c={c} frameColor="#3050A0" blanketColor="#4169E1" size={item.size} />,
  kids_bed_3: (item, c) => <BedShape c={c} frameColor="#228B22" blanketColor="#32CD32" size={item.size} />,
  _type_bed: (item, c) => <BedShape c={c} frameColor="#5C3317" blanketColor={item.color} size={item.size} />,

  /* ─── Toy Box ────────────────────────────────────────── */
  toy_box: (item, c) => (
    <>
      <B p={[0, 0.2, 0]} s={[item.size.w, 0.4, item.size.d]} col={c('#FFD700')} />
      {/* Open lid (angled) */}
      <B p={[0, 0.42, -item.size.d / 2 + 0.02]} s={[item.size.w, 0.04, 0.04]} col={c('#E6C200')} />
      {/* Toys peeking out */}
      <B p={[-0.15, 0.38, 0.05]} s={[0.15, 0.12, 0.12]} col={c('#FF4500')} cast={false} />
      <B p={[0.15, 0.35, -0.05]} s={[0.12, 0.08, 0.1]} col={c('#4169E1')} cast={false} />
    </>
  ),

  /* ─── Desks ──────────────────────────────────────────── */
  kids_desk_shared: (item, c) => <DeskShape c={c} color={item.color} size={item.size} />,
  kids_desk_single: (item, c) => <DeskShape c={c} color={item.color} size={item.size} />,
  _type_desk: (item, c) => <DeskShape c={c} color={item.color} size={item.size} />,

  /* ─── Bean Bag ───────────────────────────────────────── */
  bean_bag: (item, c) => (
    <mesh position={[0, 0.2, 0]} castShadow>
      <sphereGeometry args={[0.35, 8, 6]} />
      <meshStandardMaterial color={c('#FF6347')} />
    </mesh>
  ),

  /* ─── Car ────────────────────────────────────────────── */
  car: (item, c) => (
    <>
      {/* Body lower */}
      <B p={[0, 0.35, 0]} s={[item.size.w, 0.55, item.size.d]} col={c('#1E3A5F')} />
      {/* Body upper (cabin) */}
      <B p={[0, 0.75, -0.2]} s={[item.size.w - 0.3, 0.5, item.size.d - 1.5]} col={c('#1E3A5F')} />
      {/* Windshield */}
      <B p={[0, 0.8, -0.2 + (item.size.d - 1.5) / 2 + 0.03]} s={[item.size.w - 0.4, 0.4, 0.04]} col={c('#6BA3D6')} cast={false} />
      {/* Rear window */}
      <B p={[0, 0.8, -0.2 - (item.size.d - 1.5) / 2 - 0.03]} s={[item.size.w - 0.4, 0.35, 0.04]} col={c('#6BA3D6')} cast={false} />
      {/* Headlights */}
      <B p={[-0.7, 0.3, item.size.d / 2 + 0.01]} s={[0.3, 0.15, 0.02]} col={c('#FFFACD')} cast={false} />
      <B p={[0.7, 0.3, item.size.d / 2 + 0.01]} s={[0.3, 0.15, 0.02]} col={c('#FFFACD')} cast={false} />
      {/* Taillights */}
      <B p={[-0.7, 0.3, -item.size.d / 2 - 0.01]} s={[0.3, 0.12, 0.02]} col={c('#FF3030')} cast={false} />
      <B p={[0.7, 0.3, -item.size.d / 2 - 0.01]} s={[0.3, 0.12, 0.02]} col={c('#FF3030')} cast={false} />
      {/* Wheels */}
      {[[-0.85, -1.2], [-0.85, 1.2], [0.85, -1.2], [0.85, 1.2]].map(([wx, wz], i) => (
        <mesh key={i} position={[wx, 0.18, wz]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.18, 0.18, 0.12, 8]} />
          <meshStandardMaterial color={c('#1a1a1a')} />
        </mesh>
      ))}
    </>
  ),

  /* ─── Workbench ──────────────────────────────────────── */
  workbench: (item, c) => {
    const legH = 0.85;
    const hw = item.size.w / 2 - 0.05;
    const hd = item.size.d / 2 - 0.05;
    return (
      <>
        <B p={[0, legH + 0.04, 0]} s={[item.size.w, 0.08, item.size.d]} col={c('#5C3317')} />
        {[[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].map(([lx, lz], i) => (
          <B key={i} p={[lx, legH / 2, lz]} s={[0.08, legH, 0.08]} col={c('#4A2510')} />
        ))}
        {/* Vice */}
        <B p={[hw, legH + 0.12, 0]} s={[0.12, 0.12, 0.2]} col={c('#666')} cast={false} />
      </>
    );
  },

  /* ─── Tool Shelf ─────────────────────────────────────── */
  tool_shelf: (item, c) => (
    <>
      <B p={[0, item.size.h / 2, 0]} s={[item.size.w, item.size.h, item.size.d]} col={c('#696969')} />
      {[0.4, 0.9, 1.4].map((sy, i) => (
        <B key={i} p={[0, sy, 0.01]} s={[item.size.w - 0.04, 0.04, item.size.d]} col={c('#555')} cast={false} />
      ))}
    </>
  ),

  /* ─── Bicycle ────────────────────────────────────────── */
  bike: (item, c) => (
    <>
      {/* Frame triangle */}
      <B p={[0, 0.45, 0]} s={[0.06, 0.35, 0.8]} col={c('#CD5C5C')} />
      <B p={[0, 0.55, -0.2]} s={[0.04, 0.2, 0.4]} col={c('#CD5C5C')} />
      {/* Wheels */}
      <mesh position={[0, 0.3, -0.65]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.28, 0.03, 6, 12]} />
        <meshStandardMaterial color={c('#333')} />
      </mesh>
      <mesh position={[0, 0.3, 0.65]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.28, 0.03, 6, 12]} />
        <meshStandardMaterial color={c('#333')} />
      </mesh>
      {/* Seat */}
      <B p={[0, 0.7, -0.15]} s={[0.12, 0.04, 0.2]} col={c('#2a2a2a')} cast={false} />
      {/* Handlebars */}
      <B p={[0, 0.7, 0.45]} s={[0.3, 0.04, 0.04]} col={c('#888')} cast={false} />
    </>
  ),
};

/* ─── Reusable sub-shapes ──────────────────────────────── */

function ChairShape({ c, color }) {
  const seatH = 0.45;
  return (
    <>
      {/* Seat */}
      <B p={[0, seatH, 0]} s={[0.42, 0.05, 0.42]} col={c(color)} />
      {/* Legs */}
      {[[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]].map(([lx, lz], i) => (
        <B key={i} p={[lx, seatH / 2, lz]} s={[0.05, seatH, 0.05]} col={c('#6B3513')} />
      ))}
      {/* Back */}
      <B p={[0, seatH + 0.2, -0.18]} s={[0.38, 0.35, 0.04]} col={c(color)} />
    </>
  );
}

function NightstandShape({ c, color, size }) {
  return (
    <>
      <B p={[0, size.h / 2, 0]} s={[size.w, size.h, size.d]} col={c(color)} />
      {/* Drawer line */}
      <B p={[0, size.h / 2, size.d / 2 + 0.01]} s={[size.w - 0.06, 0.02, 0.01]} col={c('#B8956A')} cast={false} />
      {/* Knob */}
      <B p={[0, size.h / 2, size.d / 2 + 0.02]} s={[0.04, 0.04, 0.04]} col={c('#C0A060')} cast={false} />
      {/* Lamp */}
      <B p={[0, size.h + 0.1, 0]} s={[0.08, 0.12, 0.08]} col={c('#8B7355')} />
      <B p={[0, size.h + 0.22, 0]} s={[0.18, 0.1, 0.18]} col={c('#FFFACD')} />
    </>
  );
}

function BedShape({ c, frameColor, blanketColor, size }) {
  return (
    <>
      {/* Frame */}
      <B p={[0, 0.12, 0]} s={[size.w, 0.24, size.d]} col={c(frameColor)} />
      {/* Mattress */}
      <B p={[0, 0.28, 0.05]} s={[size.w - 0.08, 0.1, size.d - 0.1]} col={c('#F5F5DC')} />
      {/* Blanket */}
      <B p={[0, 0.34, 0.2]} s={[size.w - 0.1, 0.05, size.d - 0.6]} col={c(blanketColor)} />
      {/* Pillow */}
      <B p={[0, 0.35, -size.d / 2 + 0.25]} s={[size.w - 0.3, 0.06, 0.3]} col={c('#FFFAF0')} />
      {/* Headboard */}
      <B p={[0, 0.4, -size.d / 2 + 0.05]} s={[size.w, 0.45, 0.08]} col={c(frameColor)} />
    </>
  );
}

function DeskShape({ c, color, size }) {
  const legH = 0.65;
  const hw = size.w / 2 - 0.06;
  const hd = size.d / 2 - 0.06;
  return (
    <>
      {/* Desktop */}
      <B p={[0, legH + 0.03, 0]} s={[size.w, 0.05, size.d]} col={c(color)} />
      {/* Legs */}
      {[[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].map(([lx, lz], i) => (
        <B key={i} p={[lx, legH / 2, lz]} s={[0.06, legH, 0.06]} col={c('#7A6520')} />
      ))}
      {/* Drawer */}
      <B p={[hw - 0.05, legH - 0.15, 0]} s={[size.w * 0.4, 0.12, size.d - 0.12]} col={c('#A08030')} />
    </>
  );
}
