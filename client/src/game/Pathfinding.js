/**
 * A* Pathfinding Algorithm
 * Finds shortest path on a 2D grid avoiding obstacles.
 */

class MinHeap {
  constructor() {
    this.data = [];
  }

  push(item) {
    this.data.push(item);
    this._bubbleUp(this.data.length - 1);
  }

  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  get size() {
    return this.data.length;
  }

  _bubbleUp(idx) {
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.data[idx].f < this.data[parent].f) {
        [this.data[idx], this.data[parent]] = [this.data[parent], this.data[idx]];
        idx = parent;
      } else break;
    }
  }

  _sinkDown(idx) {
    const len = this.data.length;
    while (true) {
      let smallest = idx;
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      if (left < len && this.data[left].f < this.data[smallest].f) smallest = left;
      if (right < len && this.data[right].f < this.data[smallest].f) smallest = right;
      if (smallest !== idx) {
        [this.data[idx], this.data[smallest]] = [this.data[smallest], this.data[idx]];
        idx = smallest;
      } else break;
    }
  }
}

/**
 * Find path from start to end on a walkable grid
 * @param {number[][]} grid - 2D array, 1=walkable, 0=blocked
 * @param {Object} start - { gx, gz }
 * @param {Object} end - { gx, gz }
 * @returns {Array<{gx: number, gz: number}>} path from start to end, or empty if no path
 */
export function findPath(grid, start, end) {
  const rows = grid.length;
  const cols = grid[0].length;

  // Bounds check
  if (start.gx < 0 || start.gx >= cols || start.gz < 0 || start.gz >= rows) return [];
  if (end.gx < 0 || end.gx >= cols || end.gz < 0 || end.gz >= rows) return [];

  // If start or end is not walkable, find nearest walkable cell
  if (grid[start.gz][start.gx] === 0) {
    const nearest = findNearestWalkable(grid, start);
    if (!nearest) return [];
    start = nearest;
  }
  if (grid[end.gz][end.gx] === 0) {
    const nearest = findNearestWalkable(grid, end);
    if (!nearest) return [];
    end = nearest;
  }

  const key = (gx, gz) => `${gx},${gz}`;
  const openSet = new MinHeap();
  const closedSet = new Set();
  const gScore = new Map();
  const cameFrom = new Map();

  const heuristic = (a, b) => Math.abs(a.gx - b.gx) + Math.abs(a.gz - b.gz);

  const startKey = key(start.gx, start.gz);
  gScore.set(startKey, 0);
  openSet.push({ gx: start.gx, gz: start.gz, f: heuristic(start, end) });

  // 8-directional movement
  const directions = [
    { dx: 0, dz: -1, cost: 1 },
    { dx: 0, dz: 1, cost: 1 },
    { dx: -1, dz: 0, cost: 1 },
    { dx: 1, dz: 0, cost: 1 },
    { dx: -1, dz: -1, cost: 1.414 },
    { dx: 1, dz: -1, cost: 1.414 },
    { dx: -1, dz: 1, cost: 1.414 },
    { dx: 1, dz: 1, cost: 1.414 }
  ];

  while (openSet.size > 0) {
    const current = openSet.pop();
    const currentKey = key(current.gx, current.gz);

    if (current.gx === end.gx && current.gz === end.gz) {
      // Reconstruct path
      const path = [];
      let k = currentKey;
      while (k) {
        const [gx, gz] = k.split(',').map(Number);
        path.unshift({ gx, gz });
        k = cameFrom.get(k);
      }
      return path;
    }

    closedSet.add(currentKey);

    for (const dir of directions) {
      const nx = current.gx + dir.dx;
      const nz = current.gz + dir.dz;
      const nKey = key(nx, nz);

      if (nx < 0 || nx >= cols || nz < 0 || nz >= rows) continue;
      if (grid[nz][nx] === 0) continue;
      if (closedSet.has(nKey)) continue;

      // For diagonal movement, ensure both adjacent cells are walkable
      if (dir.dx !== 0 && dir.dz !== 0) {
        if (grid[current.gz][nx] === 0 || grid[nz][current.gx] === 0) continue;
      }

      const tentativeG = (gScore.get(currentKey) || 0) + dir.cost;
      const existingG = gScore.get(nKey) ?? Infinity;

      if (tentativeG < existingG) {
        cameFrom.set(nKey, currentKey);
        gScore.set(nKey, tentativeG);
        openSet.push({ gx: nx, gz: nz, f: tentativeG + heuristic({ gx: nx, gz: nz }, end) });
      }
    }
  }

  return []; // No path found
}

/**
 * Find nearest walkable cell to a blocked position
 */
function findNearestWalkable(grid, pos) {
  const rows = grid.length;
  const cols = grid[0].length;

  for (let radius = 1; radius < Math.max(rows, cols); radius++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
        const nx = pos.gx + dx;
        const nz = pos.gz + dz;
        if (nx >= 0 && nx < cols && nz >= 0 && nz < rows && grid[nz][nx] === 1) {
          return { gx: nx, gz: nz };
        }
      }
    }
  }
  return null;
}

/**
 * Smooth a grid path into world coordinates with path simplification
 * Removes unnecessary intermediate points that are in a straight line
 */
export function smoothPath(gridPath, gridData) {
  if (gridPath.length <= 2) {
    return gridPath.map(p => ({
      x: gridData.offsetX + (p.gx + 0.5) / gridData.resolution,
      z: gridData.offsetZ + (p.gz + 0.5) / gridData.resolution
    }));
  }

  // Line-of-sight simplification
  const simplified = [gridPath[0]];
  let current = 0;

  while (current < gridPath.length - 1) {
    let farthest = current + 1;
    for (let i = current + 2; i < gridPath.length; i++) {
      if (hasLineOfSight(gridData.grid, gridPath[current], gridPath[i])) {
        farthest = i;
      }
    }
    simplified.push(gridPath[farthest]);
    current = farthest;
  }

  return simplified.map(p => ({
    x: gridData.offsetX + (p.gx + 0.5) / gridData.resolution,
    z: gridData.offsetZ + (p.gz + 0.5) / gridData.resolution
  }));
}

/**
 * Check if there's a clear line of sight between two grid cells
 */
function hasLineOfSight(grid, a, b) {
  // Bresenham's line algorithm
  let x0 = a.gx, z0 = a.gz;
  const x1 = b.gx, z1 = b.gz;
  const dx = Math.abs(x1 - x0);
  const dz = Math.abs(z1 - z0);
  const sx = x0 < x1 ? 1 : -1;
  const sz = z0 < z1 ? 1 : -1;
  let err = dx - dz;

  while (true) {
    if (grid[z0]?.[x0] !== 1) return false;
    if (x0 === x1 && z0 === z1) break;
    const e2 = 2 * err;
    if (e2 > -dz) { err -= dz; x0 += sx; }
    if (e2 < dx) { err += dx; z0 += sz; }
  }
  return true;
}
