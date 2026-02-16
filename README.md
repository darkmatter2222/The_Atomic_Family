# The Atomic Family

A real-time pixel-craft life simulation built with **React**, **Three.js**, and **Express**. A family of five — Dad, Mom, Emma, Lily, and Jack — autonomously navigate a fully furnished one-story house, backyard, and garage while a dynamic day/night cycle drives the world around them.

> 2D pixel-art sprites living in a 3D world.

---

## Features

### House & World
- **11-room floor plan** — Kitchen, Living Room, Hallway, Master Bedroom, Bathroom, Laundry Room, Shared Kids Room, Single Kids Room, Garage, Master Closet, Kids Closet
- **Backyard** with playground (swing set, slide, sandbox, garden beds, picnic table, trampoline)
- **Exterior** with front lawn, sidewalk, street, driveway, fence, mailbox, trees, and hedges
- **130+ furniture items** placed per room (beds, desks, appliances, closet rods with hanging clothes, etc.)
- Procedurally generated **wall segments** with automatic door-frame cutouts

### Characters & AI
- **5 family members** with unique pixel-art walk-cycle sprite sheets
- Autonomous **state-machine AI** (idle → choosing → walking) with per-character speed and idle timers
- **A\* pathfinding** on a walkable grid with 8-directional movement and path smoothing
- 20% chance characters wander into the backyard
- Camera-facing **billboard sprites** that always face the viewer

### Day / Night Cycle
- **Sun arc** east → west (6 AM – 6 PM), **moon** at night
- **14-keyframe sky gradient** from sunrise through sunset to midnight
- Adjustable fog that thickens at night
- **Compass indicators** (N / S / E / W) at the world edges
- **Time HUD** — clock, date display, time slider, pause button, speed controls (1× / 10× / 100× / 1000×), and EST-sync mode

### Lighting System
- **20 light fixtures** — ceiling lights, nightstand lamps, porch lanterns
- Visual fixtures (glass domes, lamp shades, lantern boxes) with **emissive glow** when powered on
- Per-room **point lights** with configurable intensity and falloff
- **Light Switch Panel** UI — toggle individual rooms, All On / All Off, Auto mode (lights on at dusk, off at dawn)

### Real-Time Backend
- **Express + Socket.IO** server for live game-state sync
- **MongoDB** persistence via Mongoose (family positions, rooms, time of day)
- REST endpoints: `GET /api/game/state`, `POST /api/game/move`, `GET /api/health`
- WebSocket broadcasts on every state change

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| UI / 3D | React, @react-three/fiber, @react-three/drei, Three.js | 18 / 8.15 / 9.88 / 0.158 |
| Build | Vite | 5.x |
| Server | Express, Socket.IO | 4.18 / 4.7 |
| Database | MongoDB + Mongoose | 7.6 |
| Dev | Nodemon, Vite HMR | — |

---

## Project Structure

```
The_Atomic_Family/
├── .env                          # MongoDB URI, ports, JWT secret
├── .gitignore
├── README.md
├── agents.md                     # Copilot / AI coding-agent instructions
│
├── client/                       # React + Vite frontend
│   ├── package.json
│   ├── vite.config.js            # Dev server on :3000, proxies /api → :5000
│   ├── index.html
│   └── src/
│       ├── main.jsx              # React root
│       ├── App.jsx               # Canvas, HUD, sun system, camera, controls
│       ├── components/
│       │   ├── House3D.jsx       # 3D house renderer (walls, floors, furniture, lights)
│       │   ├── CharacterSprite.jsx  # Billboard sprite with shadow proxy
│       │   ├── FirstPersonController.jsx
│       │   └── SidePane.jsx      # Family member info panel
│       ├── game/
│       │   ├── HouseLayout.js    # Room, door, light, furniture, wall definitions
│       │   ├── FamilyMemberAI.js # State-machine AI per character
│       │   ├── Pathfinding.js    # A* with MinHeap + path smoothing
│       │   └── SpriteRenderer.js # Sprite-sheet frame logic
│       └── sprites/              # Per-character walk-cycle JSON atlases
│           ├── father_walk.json
│           ├── mother_walk.json
│           ├── son_walk.json
│           ├── daughter1_walk.json
│           └── daughter2_walk.json
│
└── server/                       # Express + Socket.IO backend
    ├── package.json
    └── src/
        ├── index.js              # Server entry, MongoDB connect, Socket.IO
        ├── models/
        │   └── GameState.js      # Mongoose schema (family members, time, day)
        └── routes/
            └── game.js           # REST routes: /state, /move
```

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **MongoDB** instance (local or remote) — the app runs without it but won't persist state

### 1. Clone & install

```bash
git clone https://github.com/<your-org>/The_Atomic_Family.git
cd The_Atomic_Family

# Install server dependencies
cd server && npm install && cd ..

# Install client dependencies
cd client && npm install && cd ..
```

### 2. Configure environment

Copy or edit the root `.env`:

```env
MONGO_URI=mongodb://<user>:<pass>@<host>:27017/atomic_family?authSource=admin
PORT=5000
FRONTEND_URL=http://localhost:3000
```

### 3. Run

```bash
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm run dev
```

Open **http://localhost:3000** in your browser.

### 4. Build for production

```bash
cd client && npm run build
# Outputs to client/dist/
```

---

## Controls

| Control | Action |
|---------|--------|
| Left-click drag | Orbit camera |
| Right-click drag | Pan camera |
| Scroll wheel | Zoom in / out |
| Time slider (HUD) | Scrub to any hour |
| ⏸ button | Pause / resume time |
| 1× / 10× / 100× / 1000× | Time speed multiplier |
| EST Sync | Lock clock to real Eastern Time |
| Light Switch Panel | Toggle per-room lights, auto mode |

---

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/game/state` | Current game state (family positions, time) |
| `POST` | `/api/game/move` | Update a family member's position / room / action |

**WebSocket events:**

| Event | Direction | Payload |
|-------|-----------|---------|
| `requestGameState` | Client → Server | *(none)* |
| `gameState` | Server → Client | Full `GameState` document |

---

## License

MIT