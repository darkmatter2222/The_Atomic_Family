/**
 * House Layout Definition
 * Expanded one-story family home with:
 * - Kitchen, Living Room, 3 Bedrooms, Bathroom, Laundry Room, Hallway, Garage
 * - Exterior: Front lawn, sidewalk, street, driveway
 * 
 * Coordinate system: X = left/right, Y = up (always 0 for floor), Z = forward/back
 * All measurements in world units. 1 unit ≈ 1 meter.
 * 
 * House interior: x ∈ [-10, 10], z ∈ [-7, 7]
 * Garage attached to kitchen side: x ∈ [-10, -4], z ∈ [7, 12]
 * Front of house faces +Z (toward the street).
 */

export const HOUSE_LAYOUT = {
  // Overall house dimensions (interior bounding box, not counting garage/exterior)
  width: 20,
  depth: 14,
  wallHeight: 3,
  wallThickness: 0.15,
  floorY: 0,

  // --- Room definitions ---
  rooms: [
    {
      id: 'living_room',
      name: 'Living Room',
      bounds: { minX: -10, maxX: -1.5, minZ: -7, maxZ: 0 },
      floorColor: '#8B7355',
      wallColor: '#F5F5DC'
    },
    {
      id: 'kitchen',
      name: 'Kitchen',
      bounds: { minX: -10, maxX: -1.5, minZ: 0, maxZ: 7 },
      floorColor: '#D2B48C',
      wallColor: '#FFFACD'
    },
    {
      id: 'hallway',
      name: 'Hallway',
      bounds: { minX: -1.5, maxX: 1.5, minZ: -7, maxZ: 7 },
      floorColor: '#A0522D',
      wallColor: '#FFF8DC'
    },
    {
      id: 'bedroom_master',
      name: 'Master Bedroom',
      bounds: { minX: 1.5, maxX: 10, minZ: -7, maxZ: -2 },
      floorColor: '#6B8E23',
      wallColor: '#E6E6FA'
    },
    {
      id: 'bathroom',
      name: 'Bathroom',
      bounds: { minX: 1.5, maxX: 5, minZ: -2, maxZ: 2 },
      floorColor: '#B0C4DE',
      wallColor: '#F0FFFF'
    },
    {
      id: 'laundry',
      name: 'Laundry Room',
      bounds: { minX: 5, maxX: 10, minZ: -2, maxZ: 2 },
      floorColor: '#C4AEAD',
      wallColor: '#F5F5F5'
    },
    {
      id: 'bedroom_kids_shared',
      name: 'Shared Kids Room',
      bounds: { minX: 1.5, maxX: 5.5, minZ: 2, maxZ: 7 },
      floorColor: '#4682B4',
      wallColor: '#FFE4E1'
    },
    {
      id: 'bedroom_kids_single',
      name: 'Kids Room',
      bounds: { minX: 5.5, maxX: 10, minZ: 2, maxZ: 7 },
      floorColor: '#5B9BD5',
      wallColor: '#FFF0F5'
    },
    {
      id: 'garage',
      name: 'Garage',
      bounds: { minX: -10, maxX: -4, minZ: 7, maxZ: 12 },
      floorColor: '#808080',
      wallColor: '#D3D3D3'
    }
  ],

  // --- Door openings between rooms ---
  doors: [
    // Left side
    { from: 'living_room', to: 'hallway', position: { x: -1.5, z: -3.5 }, axis: 'z', width: 1.2 },
    { from: 'kitchen', to: 'hallway', position: { x: -1.5, z: 3.5 }, axis: 'z', width: 1.2 },
    // Right side – off hallway
    { from: 'hallway', to: 'bedroom_master', position: { x: 1.5, z: -4.5 }, axis: 'z', width: 1.2 },
    { from: 'hallway', to: 'bathroom', position: { x: 1.5, z: 0 }, axis: 'z', width: 1.0 },
    { from: 'hallway', to: 'bedroom_kids_shared', position: { x: 1.5, z: 4.5 }, axis: 'z', width: 1.2 },
    // Right side – between rooms
    { from: 'bathroom', to: 'laundry', position: { x: 5, z: 0 }, axis: 'z', width: 1.0 },
    { from: 'bedroom_kids_shared', to: 'bedroom_kids_single', position: { x: 5.5, z: 4.5 }, axis: 'z', width: 1.0 },
    // Garage access from kitchen
    { from: 'kitchen', to: 'garage', position: { x: -7, z: 7 }, axis: 'x', width: 1.2 },
    // Front door (hallway to outside, at front wall z = 7)
    { from: 'hallway', to: 'outside', position: { x: 0, z: 7 }, axis: 'x', width: 1.4 }
  ],

  // --- Exterior elements (rendered separately from rooms) ---
  exterior: {
    // Lawn surrounds entire property
    lawn: { minX: -13, maxX: 13, minZ: -10, maxZ: 14, color: '#5dba6a' },
    // Driveway from garage to curb (does not extend into street)
    driveway: { minX: -9, maxX: -5, minZ: 12, maxZ: 15, color: '#6B6B6B' },
    // Sidewalk runs the full width, in front of lawn
    sidewalk: { minX: -18, maxX: 22, minZ: 14, maxZ: 15, color: '#B8B8B8' },
    // Street (beyond sidewalk)
    street: { minX: -20, maxX: 24, minZ: 15, maxZ: 21, color: '#3a3a3a' },
    // Street lane markings (center line)
    streetCenterZ: 18,
    // Front walkway from front door to sidewalk
    walkway: { cx: 0, minZ: 7, maxZ: 15, width: 1.4, color: '#B0A090' },
    // Mailbox position (on lawn near sidewalk)
    mailbox: { x: 3, z: 13.5 },
    // Garden hedges along front of house
    hedges: [
      { position: { x: -2, z: 8.5 }, size: { w: 2, d: 0.8 } },
      { position: { x: 5, z: 8.5 }, size: { w: 3, d: 0.8 } }
    ],
    // Picket fence around the property
    fence: {
      bounds: { minX: -12.5, maxX: 12.5, minZ: -9.5, maxZ: 13.5 },
      color: '#FFFFFF',
      height: 0.8,
      gates: [
        { side: 'front', center: 0, width: 1.6 },
        { side: 'front', center: -7, width: 4.0 }
      ]
    }
  },

  // --- Furniture / objects in each room ---
  furniture: [
    // ═══════════════════ Kitchen ═══════════════════
    { id: 'fridge', label: 'Refrigerator', room: 'kitchen', position: { x: -9.3, y: 0, z: 6.3 }, size: { w: 1, h: 2, d: 0.8 }, color: '#C0C0C0' },
    { id: 'sink', label: 'Kitchen Sink', room: 'kitchen', position: { x: -7.5, y: 0, z: 6.3 }, size: { w: 1.2, h: 1, d: 0.6 }, color: '#A9A9A9' },
    { id: 'dishwasher', label: 'Dishwasher', room: 'kitchen', position: { x: -6.2, y: 0, z: 6.3 }, size: { w: 0.8, h: 1, d: 0.6 }, color: '#808080' },
    { id: 'stove', label: 'Stove', room: 'kitchen', position: { x: -4.8, y: 0, z: 6.3 }, size: { w: 0.8, h: 1, d: 0.6 }, color: '#2F4F4F' },
    { id: 'microwave', label: 'Microwave', room: 'kitchen', position: { x: -3.5, y: 0, z: 6.3 }, size: { w: 0.6, h: 0.4, d: 0.4 }, color: '#333' },
    { id: 'kitchen_table', label: 'Kitchen Table', room: 'kitchen', position: { x: -5.5, y: 0, z: 3 }, size: { w: 2.5, h: 0.8, d: 1.5 }, color: '#8B4513' },
    { id: 'kitchen_chair_1', label: 'Chair', room: 'kitchen', position: { x: -7.1, y: 0, z: 3 }, size: { w: 0.5, h: 0.9, d: 0.5 }, color: '#A0522D', rotationY: Math.PI / 2 },
    { id: 'kitchen_chair_2', label: 'Chair', room: 'kitchen', position: { x: -3.9, y: 0, z: 3 }, size: { w: 0.5, h: 0.9, d: 0.5 }, color: '#A0522D', rotationY: -Math.PI / 2 },
    { id: 'pantry', label: 'Pantry', room: 'kitchen', position: { x: -9.3, y: 0, z: 1 }, size: { w: 0.8, h: 2, d: 1.2 }, color: '#7B5B3A' },

    // ═══════════════════ Living Room ═══════════════════
    { id: 'couch', label: 'Couch', room: 'living_room', position: { x: -5.5, y: 0, z: -6 }, size: { w: 4, h: 0.9, d: 1.2 }, color: '#4169E1' },
    { id: 'loveseat', label: 'Loveseat', room: 'living_room', position: { x: -9, y: 0, z: -3.5 }, size: { w: 1.2, h: 0.85, d: 2.2 }, color: '#4169E1' },
    { id: 'tv_stand', label: 'TV Stand', room: 'living_room', position: { x: -5.5, y: 0, z: -1.2 }, size: { w: 2.5, h: 0.6, d: 0.5 }, color: '#2F2F2F' },
    { id: 'tv', label: 'Television', room: 'living_room', position: { x: -5.5, y: 0.6, z: -1.2 }, size: { w: 2, h: 0.05, d: 0.1 }, color: '#111' },
    { id: 'coffee_table', label: 'Coffee Table', room: 'living_room', position: { x: -5.5, y: 0, z: -4 }, size: { w: 1.8, h: 0.5, d: 0.8 }, color: '#A0522D' },
    { id: 'bookshelf', label: 'Bookshelf', room: 'living_room', position: { x: -2.5, y: 0, z: -6 }, size: { w: 1.2, h: 1.8, d: 0.4 }, color: '#6B3A2A' },
    { id: 'end_table', label: 'End Table', room: 'living_room', position: { x: -9, y: 0, z: -5.8 }, size: { w: 0.5, h: 0.6, d: 0.5 }, color: '#8B4513' },
    { id: 'rug', label: 'Area Rug', room: 'living_room', position: { x: -5.5, y: 0, z: -4 }, size: { w: 4, h: 0.02, d: 3 }, color: '#8B4526' },

    // ═══════════════════ Master Bedroom ═══════════════════
    { id: 'master_bed', label: 'King Bed', room: 'bedroom_master', position: { x: 5.5, y: 0, z: -5.5 }, size: { w: 2.8, h: 0.6, d: 2.2 }, color: '#8B0000' },
    { id: 'nightstand_l', label: 'Nightstand', room: 'bedroom_master', position: { x: 3.5, y: 0, z: -6 }, size: { w: 0.5, h: 0.6, d: 0.5 }, color: '#DEB887' },
    { id: 'nightstand_r', label: 'Nightstand', room: 'bedroom_master', position: { x: 7.5, y: 0, z: -6 }, size: { w: 0.5, h: 0.6, d: 0.5 }, color: '#DEB887' },
    { id: 'dresser', label: 'Dresser', room: 'bedroom_master', position: { x: 9.3, y: 0, z: -4.5 }, size: { w: 0.8, h: 1, d: 2 }, color: '#DEB887' },
    { id: 'wardrobe', label: 'Wardrobe', room: 'bedroom_master', position: { x: 9.3, y: 0, z: -2.8 }, size: { w: 0.8, h: 2.2, d: 1.2 }, color: '#5C3317' },
    { id: 'master_rug', label: 'Bedroom Rug', room: 'bedroom_master', position: { x: 5.5, y: 0, z: -4.5 }, size: { w: 3.5, h: 0.02, d: 3 }, color: '#6B5B4A' },

    // ═══════════════════ Bathroom ═══════════════════
    { id: 'toilet', label: 'Toilet', room: 'bathroom', position: { x: 2.2, y: 0, z: 1.3 }, size: { w: 0.5, h: 0.6, d: 0.6 }, color: '#FFFFF0' },
    { id: 'shower', label: 'Shower', room: 'bathroom', position: { x: 4.2, y: 0, z: 1 }, size: { w: 1.2, h: 2.2, d: 1.2 }, color: '#E8E8E8' },
    { id: 'bath_sink', label: 'Bathroom Sink', room: 'bathroom', position: { x: 2.2, y: 0, z: -1.3 }, size: { w: 0.6, h: 0.9, d: 0.4 }, color: '#FFFFF0' },
    { id: 'bath_mirror', label: 'Mirror', room: 'bathroom', position: { x: 2.2, y: 1.2, z: -1.7 }, size: { w: 0.6, h: 0.8, d: 0.05 }, color: '#C0E8FF' },
    { id: 'bath_mat', label: 'Bath Mat', room: 'bathroom', position: { x: 3.3, y: 0, z: -0.5 }, size: { w: 1, h: 0.02, d: 0.6 }, color: '#5DADE2' },

    // ═══════════════════ Laundry Room ═══════════════════
    { id: 'washer', label: 'Washing Machine', room: 'laundry', position: { x: 9.3, y: 0, z: 0 }, size: { w: 0.8, h: 1, d: 0.7 }, color: '#E0E0E0', rotationY: Math.PI },
    { id: 'dryer', label: 'Dryer', room: 'laundry', position: { x: 9.3, y: 0, z: 1 }, size: { w: 0.8, h: 1, d: 0.7 }, color: '#E0E0E0', rotationY: Math.PI },
    { id: 'utility_sink', label: 'Utility Sink', room: 'laundry', position: { x: 9.3, y: 0, z: -1.2 }, size: { w: 0.6, h: 0.9, d: 0.5 }, color: '#B0B0B0', rotationY: -Math.PI / 2 },
    { id: 'laundry_basket', label: 'Laundry Basket', room: 'laundry', position: { x: 6, y: 0, z: 0 }, size: { w: 0.6, h: 0.7, d: 0.6 }, color: '#C4A35A' },
    { id: 'ironing_board', label: 'Ironing Board', room: 'laundry', position: { x: 7, y: 0, z: 1.2 }, size: { w: 0.4, h: 0.9, d: 1.2 }, color: '#A9A9A9' },

    // ═══════════════════ Shared Kids Room (2 beds) ═══════════════════
    { id: 'kids_bed_1', label: 'Bed 1', room: 'bedroom_kids_shared', position: { x: 2.5, y: 0, z: 5.5 }, size: { w: 1.5, h: 0.5, d: 2 }, color: '#FF69B4', rotationY: Math.PI },
    { id: 'kids_bed_2', label: 'Bed 2', room: 'bedroom_kids_shared', position: { x: 4.5, y: 0, z: 5.5 }, size: { w: 1.5, h: 0.5, d: 2 }, color: '#4169E1', rotationY: Math.PI },
    { id: 'toy_box', label: 'Toy Box', room: 'bedroom_kids_shared', position: { x: 3.5, y: 0, z: 3 }, size: { w: 1, h: 0.5, d: 0.5 }, color: '#FFD700' },
    { id: 'kids_desk_shared', label: 'Desk', room: 'bedroom_kids_shared', position: { x: 2.2, y: 0, z: 3 }, size: { w: 1, h: 0.75, d: 0.5 }, color: '#B8860B' },

    // ═══════════════════ Single Kids Room (1 bed) ═══════════════════
    { id: 'kids_bed_3', label: 'Bed', room: 'bedroom_kids_single', position: { x: 7.5, y: 0, z: 5.5 }, size: { w: 1.5, h: 0.5, d: 2 }, color: '#32CD32', rotationY: Math.PI },
    { id: 'kids_desk_single', label: 'Desk', room: 'bedroom_kids_single', position: { x: 9.3, y: 0, z: 3.5 }, size: { w: 0.8, h: 0.75, d: 1.2 }, color: '#B8860B' },
    { id: 'kids_bookshelf', label: 'Bookshelf', room: 'bedroom_kids_single', position: { x: 9.3, y: 0, z: 5.5 }, size: { w: 0.7, h: 1.6, d: 1 }, color: '#6B3A2A' },
    { id: 'bean_bag', label: 'Bean Bag', room: 'bedroom_kids_single', position: { x: 6.5, y: 0, z: 3.5 }, size: { w: 0.8, h: 0.4, d: 0.8 }, color: '#FF6347' },

    // ═══════════════════ Garage ═══════════════════
    { id: 'car', label: 'Family Car', room: 'garage', position: { x: -7, y: 0, z: 9.5 }, size: { w: 2.2, h: 1.4, d: 4.2 }, color: '#1E3A5F' },
    { id: 'workbench', label: 'Workbench', room: 'garage', position: { x: -4.7, y: 0, z: 8 }, size: { w: 0.8, h: 1, d: 1.5 }, color: '#5C3317' },
    { id: 'tool_shelf', label: 'Tool Shelf', room: 'garage', position: { x: -4.7, y: 0, z: 11 }, size: { w: 0.7, h: 1.8, d: 1.2 }, color: '#696969' },
    { id: 'bike', label: 'Bicycle', room: 'garage', position: { x: -9.3, y: 0, z: 11 }, size: { w: 0.5, h: 1, d: 1.8 }, color: '#CD5C5C' }
  ]
};

/**
 * Get the walkable grid for pathfinding
 * Creates a 2D grid representation of the house at floor level
 * @param {number} resolution - cells per world unit
 * @returns {Object} { grid, offsetX, offsetZ, resolution }
 */
export function createWalkableGrid(resolution = 2) {
  const layout = HOUSE_LAYOUT;
  // Grid covers entire house + garage + front lawn area
  const minX = -12;
  const maxX = 12;
  const minZ = -9;
  const maxZ = 14; // up to the sidewalk

  const gridWidth = Math.ceil((maxX - minX) * resolution);
  const gridHeight = Math.ceil((maxZ - minZ) * resolution);

  // Initialize grid: 0 = not walkable, 1 = walkable
  const grid = Array.from({ length: gridHeight }, () => new Array(gridWidth).fill(0));

  // Mark room floors as walkable
  for (const room of layout.rooms) {
    const { minX: rMinX, maxX: rMaxX, minZ: rMinZ, maxZ: rMaxZ } = room.bounds;
    for (let gz = 0; gz < gridHeight; gz++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        const worldX = minX + gx / resolution;
        const worldZ = minZ + gz / resolution;
        if (worldX >= rMinX && worldX < rMaxX && worldZ >= rMinZ && worldZ < rMaxZ) {
          grid[gz][gx] = 1;
        }
      }
    }
  }

  // Mark front lawn as walkable so characters can go outside
  const lawn = layout.exterior.lawn;
  for (let gz = 0; gz < gridHeight; gz++) {
    for (let gx = 0; gx < gridWidth; gx++) {
      const worldX = minX + gx / resolution;
      const worldZ = minZ + gz / resolution;
      if (worldX >= lawn.minX && worldX < lawn.maxX && worldZ >= lawn.minZ && worldZ < lawn.maxZ) {
        grid[gz][gx] = 1;
      }
    }
  }

  // Mark wall boundaries as non-walkable (prevents walking between rooms except through doors)
  const wallMap = new Map();
  for (const room of layout.rooms) {
    const { minX: rMinX, maxX: rMaxX, minZ: rMinZ, maxZ: rMaxZ } = room.bounds;
    _addWall(wallMap, 'z', rMinX, rMinZ, rMaxZ);
    _addWall(wallMap, 'z', rMaxX, rMinZ, rMaxZ);
    _addWall(wallMap, 'x', rMinZ, rMinX, rMaxX);
    _addWall(wallMap, 'x', rMaxZ, rMinX, rMaxX);
  }

  for (const [, wall] of wallMap) {
    if (wall.axis === 'z') {
      const gx = Math.round((wall.fixed - minX) * resolution);
      if (gx >= 0 && gx < gridWidth) {
        const gzStart = Math.max(0, Math.floor((wall.from - minZ) * resolution));
        const gzEnd = Math.min(gridHeight - 1, Math.ceil((wall.to - minZ) * resolution));
        for (let gz = gzStart; gz <= gzEnd; gz++) {
          grid[gz][gx] = 0;
        }
      }
    } else {
      const gz = Math.round((wall.fixed - minZ) * resolution);
      if (gz >= 0 && gz < gridHeight) {
        const gxStart = Math.max(0, Math.floor((wall.from - minX) * resolution));
        const gxEnd = Math.min(gridWidth - 1, Math.ceil((wall.to - minX) * resolution));
        for (let gx = gxStart; gx <= gxEnd; gx++) {
          grid[gz][gx] = 0;
        }
      }
    }
  }

  // Re-open door cells so characters can walk through doorways
  for (const door of layout.doors) {
    const halfW = door.width / 2;
    if (door.axis === 'z') {
      const gx = Math.round((door.position.x - minX) * resolution);
      if (gx >= 0 && gx < gridWidth) {
        const gzStart = Math.max(0, Math.ceil((door.position.z - halfW - minZ) * resolution));
        const gzEnd = Math.min(gridHeight - 1, Math.floor((door.position.z + halfW - minZ) * resolution));
        for (let gz = gzStart; gz <= gzEnd; gz++) {
          grid[gz][gx] = 1;
        }
      }
    } else {
      const gz = Math.round((door.position.z - minZ) * resolution);
      if (gz >= 0 && gz < gridHeight) {
        const gxStart = Math.max(0, Math.ceil((door.position.x - halfW - minX) * resolution));
        const gxEnd = Math.min(gridWidth - 1, Math.floor((door.position.x + halfW - minX) * resolution));
        for (let gx = gxStart; gx <= gxEnd; gx++) {
          grid[gz][gx] = 1;
        }
      }
    }
  }

  // Mark furniture as obstacles (non-walkable) with a small buffer
  const buffer = 0.2;
  for (const furn of layout.furniture) {
    const fMinX = furn.position.x - furn.size.w / 2 - buffer;
    const fMaxX = furn.position.x + furn.size.w / 2 + buffer;
    const fMinZ = furn.position.z - furn.size.d / 2 - buffer;
    const fMaxZ = furn.position.z + furn.size.d / 2 + buffer;

    for (let gz = 0; gz < gridHeight; gz++) {
      for (let gx = 0; gx < gridWidth; gx++) {
        const worldX = minX + gx / resolution;
        const worldZ = minZ + gz / resolution;
        if (worldX >= fMinX && worldX < fMaxX && worldZ >= fMinZ && worldZ < fMaxZ) {
          grid[gz][gx] = 0;
        }
      }
    }
  }

  return { grid, offsetX: minX, offsetZ: minZ, resolution, gridWidth, gridHeight };
}

/**
 * Convert world coordinates to grid coordinates
 */
export function worldToGrid(worldX, worldZ, gridData) {
  const gx = Math.floor((worldX - gridData.offsetX) * gridData.resolution);
  const gz = Math.floor((worldZ - gridData.offsetZ) * gridData.resolution);
  return { gx, gz };
}

/**
 * Convert grid coordinates to world coordinates (center of cell)
 */
export function gridToWorld(gx, gz, gridData) {
  const worldX = gridData.offsetX + (gx + 0.5) / gridData.resolution;
  const worldZ = gridData.offsetZ + (gz + 0.5) / gridData.resolution;
  return { x: worldX, z: worldZ };
}

/**
 * Get a random walkable position within a specific room
 */
export function getRandomPositionInRoom(roomId) {
  const room = HOUSE_LAYOUT.rooms.find(r => r.id === roomId);
  if (!room) return { x: 0, z: 0 };

  const margin = 0.5; // stay away from walls
  const x = room.bounds.minX + margin + Math.random() * (room.bounds.maxX - room.bounds.minX - margin * 2);
  const z = room.bounds.minZ + margin + Math.random() * (room.bounds.maxZ - room.bounds.minZ - margin * 2);
  return { x, z };
}

/**
 * Get a random walkable position anywhere in the house
 */
export function getRandomWalkablePosition() {
  const rooms = HOUSE_LAYOUT.rooms;
  const room = rooms[Math.floor(Math.random() * rooms.length)];
  return { ...getRandomPositionInRoom(room.id), room: room.id };
}

/**
 * Find which room a world position is in
 */
export function getRoomAtPosition(x, z) {
  for (const room of HOUSE_LAYOUT.rooms) {
    const b = room.bounds;
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
      return room.id;
    }
  }
  return null;
}

/**
 * Helper to collect and merge walls at the same position
 */
function _addWall(map, axis, fixed, from, to) {
  const key = `${axis}_${fixed.toFixed(2)}`;
  if (map.has(key)) {
    const existing = map.get(key);
    existing.from = Math.min(existing.from, from);
    existing.to = Math.max(existing.to, to);
  } else {
    map.set(key, { axis, fixed, from, to });
  }
}

/**
 * Compute unique wall segments, split at door openings.
 * Used by both the walkable grid and the 3D wall renderer.
 * Returns array of { axis, fixed, from, to }
 *   axis='x' -> wall runs along x-axis at z=fixed, from/to are x coords
 *   axis='z' -> wall runs along z-axis at x=fixed, from/to are z coords
 */
export function getWallSegments() {
  const layout = HOUSE_LAYOUT;
  const wallMap = new Map();

  for (const room of layout.rooms) {
    const { minX, maxX, minZ, maxZ } = room.bounds;
    _addWall(wallMap, 'z', minX, minZ, maxZ);
    _addWall(wallMap, 'z', maxX, minZ, maxZ);
    _addWall(wallMap, 'x', minZ, minX, maxX);
    _addWall(wallMap, 'x', maxZ, minX, maxX);
  }

  const segments = [];
  for (const [, wall] of wallMap) {
    const cuts = [];
    for (const door of layout.doors) {
      const halfW = door.width / 2;
      if (wall.axis === 'z' && door.axis === 'z' && Math.abs(wall.fixed - door.position.x) < 0.01) {
        cuts.push({ from: door.position.z - halfW, to: door.position.z + halfW });
      }
      if (wall.axis === 'x' && door.axis === 'x' && Math.abs(wall.fixed - door.position.z) < 0.01) {
        cuts.push({ from: door.position.x - halfW, to: door.position.x + halfW });
      }
    }

    cuts.sort((a, b) => a.from - b.from);
    let current = wall.from;
    for (const cut of cuts) {
      if (current < cut.from - 0.01) {
        segments.push({ axis: wall.axis, fixed: wall.fixed, from: current, to: cut.from });
      }
      current = Math.max(current, cut.to);
    }
    if (current < wall.to - 0.01) {
      segments.push({ axis: wall.axis, fixed: wall.fixed, from: current, to: wall.to });
    }
  }

  return segments;
}
