# Agents — The Atomic Family

Instructions and context for AI coding agents (GitHub Copilot, Copilot Chat, Copilot Workspace, etc.) working on this repository.

---

## Project Overview

**The Atomic Family** is a real-time pixel-craft life simulation.  
2D pixel-art sprites live inside a 3D rendered one-story house.  
Five characters autonomously wander the house and backyard driven by state-machine AI and A* pathfinding while a full day/night cycle controls the sun, sky, fog, and indoor lighting.

**Stack:** React 18 + @react-three/fiber 8 + Three.js 0.158 / Vite 5 / Express 4.18 + Socket.IO 4.7 / MongoDB + Mongoose 7.6.

---

## Repository Layout

```
The_Atomic_Family/
├── .env                          # Environment variables (MongoDB, ports)
├── client/                       # React + Vite frontend (port 3000)
│   ├── vite.config.js            # Dev server config, /api proxy → :5000
│   └── src/
│       ├── App.jsx               # Root: Canvas, SunSystem, TimeHUD, LightSwitchPanel, controls
│       ├── components/
│       │   ├── House3D.jsx       # 3D rendering: walls, floors, doors, furniture, light fixtures
│       │   ├── CharacterSprite.jsx  # Billboard sprites with shadow-casting proxy
│       │   ├── FirstPersonController.jsx
│       │   └── SidePane.jsx
│       ├── game/
│       │   ├── HouseLayout.js    # Declarative data: rooms, doors, lights, furniture, walls, grid
│       │   ├── FamilyMemberAI.js # Per-character state machine (idle/choosing/walking)
│       │   ├── Pathfinding.js    # A* on 2D grid with MinHeap + path smoothing
│       │   └── SpriteRenderer.js
│       └── sprites/              # JSON sprite-sheet atlases (5 characters)
└── server/                       # Express + Socket.IO backend (port 5000)
    └── src/
        ├── index.js              # Server entry, MongoDB connect, Socket.IO hub
        ├── models/GameState.js   # Mongoose schema
        └── routes/game.js        # REST: GET /state, POST /move
```

---

## Coordinate System

- **X** = left / right. Positive X = east.
- **Y** = vertical (up). Floor at Y = 0, ceiling at Y = 3.
- **Z** = forward / back. Positive Z = south (front of house faces +Z / street side).
- House interior: X ∈ [−10, 13], Z ∈ [−7, 7].
- Garage: X ∈ [−10, −4], Z ∈ [7, 12].
- Closets: X ∈ [10, 13] (master Z ∈ [−7, −2], kids Z ∈ [2, 7]).
- Backyard: Z < −7 (behind the house).
- Street / front yard: Z > 7.

When placing furniture or lights, always respect the room bounds defined in `HouseLayout.js → rooms[]`.

---

## Key Conventions

### General
- All source is plain JavaScript / JSX — no TypeScript.
- Use ES module `import`/`export` in `client/`, CommonJS `require` in `server/`.
- Prefer functional React components with hooks.
- No CSS files — all styling is inline `style={{}}` objects with monospace (`"Courier New"`) font and dark semi-transparent backgrounds.

### Three.js / R3F
- Use `@react-three/fiber` (`<Canvas>`, `useFrame`, `useThree`) and `@react-three/drei` helpers (`Text`, `Billboard`, `OrbitControls`, `Environment`).
- Geometries and materials are declared inline in JSX, not in separate files.
- Shadow-casting uses an invisible proxy box (see `CharacterSprite.jsx`) — do **not** add `castShadow` directly to sprite meshes.
- Light fixtures are defined declaratively in `HouseLayout.js → lights[]` and rendered by `RoomLights` in `House3D.jsx`.
- Walls are auto-generated from `HouseLayout.js → wallSegments[]` with door-frame cutouts.

### AI & Pathfinding
- `FamilyMemberAI.js` exports `createFamily()` and `updateFamilyMember(member, delta)`.
- The walkable grid is built once from `HouseLayout.js` at import time (`createWalkableGrid(2)` = 2× resolution).
- `findPath` returns grid coords; `smoothPath` converts to world coordinates.
- Characters have a 20% chance to pick a backyard destination.

### House Layout Data
- `HOUSE_LAYOUT` is a single exported object containing `rooms`, `doors`, `lights`, `exterior`, `furniture`, `wallSegments`, and helper functions (`createWalkableGrid`, `worldToGrid`, `getRandomWalkablePosition`, `getRoomAtPosition`).
- To **add a room**: add to `rooms[]`, add connecting `doors[]`, add furniture to `furniture[]`, add wall segments to `wallSegments[]`, and update the walkable-grid bounds if needed.
- To **add a light**: add to `lights[]` with `{ id, room, type, position, color, intensity, distance }`. Types: `ceiling`, `lamp`, `porch`.

### Day / Night
- `SunSystem` (in `App.jsx`) computes sun/moon position, sky color, and fog each frame.
- `SKY_KEYFRAMES` holds 14 `[hour, [r,g,b]]` entries; intermediate values are lerped.
- Time state: `gameHour` (0–24 float), `gameSpeed` (1/10/100/1000), `paused`, `syncEST`.
- Light auto-mode turns on all interior lights when `hour ≥ 18 || hour < 6.5`.

---

## Build & Run

```bash
# Install
cd server && npm install && cd ../client && npm install && cd ..

# Dev (two terminals)
cd server && npm run dev          # Express on :5000
cd client && npm run dev          # Vite on :3000

# Production build
cd client && npm run build        # → client/dist/
```

The client proxies `/api` and `/socket.io` to `localhost:5000` during dev (see `vite.config.js`).

MongoDB is optional — the server logs a non-fatal warning and continues if the DB is unreachable.

---

## Common Tasks

### Adding a new room
1. Add a room object to `HOUSE_LAYOUT.rooms[]` in `HouseLayout.js`.
2. Add at least one door to `HOUSE_LAYOUT.doors[]` connecting to an adjacent room.
3. Add wall segments in `wallSegments[]` (the renderer auto-cuts door frames).
4. Add furniture entries in `furniture[]`.
5. Optionally add a light in `lights[]`.
6. Update the grid bounds in `createWalkableGrid` if the room extends beyond current limits.

### Adding a new family member
1. Create a sprite-sheet JSON in `client/src/sprites/`.
2. Register the character in `createFamily()` inside `FamilyMemberAI.js`.
3. Add corresponding sprite-sheet import in `App.jsx` (the `SPRITE_SHEETS` map).
4. Add the member to the Mongoose schema default in `server/src/routes/game.js`.

### Changing light brightness
Edit `intensity` and `distance` values in `HOUSE_LAYOUT.lights[]` inside `HouseLayout.js`.  
Higher `intensity` = brighter glow; higher `distance` = larger reach before falloff.

### Adjusting day/night timing
Modify `SKY_KEYFRAMES` in `App.jsx` to shift sunrise / sunset hours or colors.  
Change the auto-light thresholds in the `useEffect` block that checks `lightsAuto`.

---

## Pitfalls & Gotchas

- **Math.random() in render** — never use `Math.random()` inside a component's render body or inside `useFrame`. It causes visual jitter every frame. Use deterministic index-based formulas instead. (See closet rod garment heights.)
- **Wall merging** — adjacent rooms sharing a wall use a single wall segment. If you extend a room or add a gap, you may need an invisible door (`visible: false` in `doors[]`) to cut through the merged wall.
- **Sprite shadows** — `<sprite>` meshes don't support `castShadow` in Three.js r158. Use the invisible proxy-box pattern from `CharacterSprite.jsx`.
- **Vite proxy** — Socket.IO WebSocket upgrade (`ws: true`) is configured in `vite.config.js`. Don't duplicate this in Express CORS.
- **MongoDB optional** — the `.env` credentials are for a specific LAN host. If MongoDB is unreachable, the server still runs; REST calls return 500 for DB-dependent routes but the frontend works standalone.
