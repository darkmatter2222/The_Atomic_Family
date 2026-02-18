# Agents — The Atomic Family

Instructions and context for AI coding agents (GitHub Copilot, Copilot Chat, Copilot Workspace, etc.) working on this repository.

---

## Project Overview

**The Atomic Family** is a real-time pixel-craft life simulation.  
2D pixel-art sprites live inside a 3D rendered one-story house.  
Five characters autonomously wander the house and backyard driven by state-machine AI and A* pathfinding while a full day/night cycle controls the sun, sky, fog, and indoor lighting.

**Stack:** React 18 + @react-three/fiber 8 + Three.js 0.158 / Vite 5 / Express 4.18 + Socket.IO 4.7 / MongoDB + Mongoose 7.6 / Qwen 2.5 3B via vLLM on RTX 3090.

---

## Repository Layout

```
The_Atomic_Family/
├── .env                          # Environment variables (SSH, MongoDB, LLM, ports)
├── client/                       # React + Vite frontend (port 3000)
│   ├── vite.config.js            # Dev server config, /api proxy → :5000
│   └── src/
│       ├── App.jsx               # Root: Canvas, SunSystem, TimeHUD, LightSwitchPanel, controls
│       ├── main.jsx              # React entry point
│       ├── components/
│       │   ├── House3D.jsx       # 3D rendering: walls, floors, doors, furniture, light fixtures
│       │   ├── CharacterSprite.jsx  # Billboard sprites with shadow-casting proxy + speech/thinking bubbles
│       │   ├── ConversationViewer.jsx # Agentic conversation timeline panel
│       │   ├── FirstPersonController.jsx
│       │   └── SidePane.jsx
│       ├── data/
│       │   └── interactions.json # Client-side interaction definitions
│       ├── game/
│       │   ├── HouseLayout.js    # Declarative data: rooms, doors, lights, furniture, walls, grid
│       │   ├── FamilyMemberAI.js # Per-character state machine (idle/choosing/thinking/walking)
│       │   ├── Pathfinding.js    # A* on 2D grid with MinHeap + path smoothing
│       │   ├── ActivityAnimator.js
│       │   ├── InteractionData.js
│       │   └── SpriteRenderer.js
│       └── sprites/              # JSON sprite-sheet atlases (5 characters)
├── server/                       # Express + Socket.IO backend (port 5000)
│   └── src/
│       ├── index.js              # Server entry, MongoDB connect, Socket.IO hub, game loop
│       ├── models/GameState.js   # Mongoose schema
│       ├── routes/game.js        # REST: GET /state, POST /move
│       ├── data/
│       │   ├── personas.json     # LLM persona definitions for all 5 family members
│       │   └── interactions.json # Server-side interaction definitions
│       └── game/                 # Server-side authoritative game engine
│           ├── GameSimulation.js # 10Hz tick loop, state authority, Socket.IO broadcast
│           ├── FamilyMemberAI.js # Server AI state machine (IDLE/CHOOSING/THINKING/WALKING)
│           ├── HouseLayout.js    # Server copy of house layout data
│           ├── Pathfinding.js    # Server copy of A* pathfinding
│           ├── InteractionData.js
│           ├── ActivityAnimator.js
│           ├── AgenticEngine.js  # LLM reasoning coordinator (decides actions via Qwen)
│           ├── LLMClient.js      # HTTP client for vLLM inference server
│           ├── EnvironmentPerception.js # Builds world-state context for LLM prompts
│           ├── PersonaManager.js # Loads/manages character personas from personas.json
│           ├── ReasoningPrompt.js # Constructs LLM prompts for character decisions
│           └── SocialEngine.js   # Tracks social relationships and conversation state
└── llm/                          # LLM inference server (deployed to GPU server)
    ├── deploy.sh                 # SSH deployment script (setup/start/stop/status)
    ├── server.py                 # FastAPI + vLLM inference wrapper
    ├── start.sh                  # Quick-start script for running on GPU server directly
    └── requirements.txt          # Python deps: vllm, transformers, torch, fastapi, uvicorn
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
- States: `IDLE`, `CHOOSING`, `THINKING` (agentic LLM reasoning), `WALKING`.
- The walkable grid is built once from `HouseLayout.js` at import time (`createWalkableGrid(2)` = 2× resolution).
- `findPath` returns grid coords; `smoothPath` converts to world coordinates.
- Characters have a 20% chance to pick a backyard destination.
- **Server-side agentic engine** (6 modules in `server/src/game/`): AgenticEngine, LLMClient, EnvironmentPerception, PersonaManager, ReasoningPrompt, SocialEngine.
- Character personas defined in `server/src/data/personas.json`.
- `CharacterSprite.jsx` renders speech bubbles (dialogue) and thinking bubbles (💭) via `activeSpeech` prop from Socket.IO events.

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

## Environment Variables (.env)

The `.env` file at the repo root contains all infrastructure credentials:

```dotenv
# SSH Connection (GPU server for LLM deployment)
SSH_USER=darkmatter2222
SSH_HOST=192.168.86.48          # LAN IP of the GPU server (RTX 3090)
SSH_KEY_PATH=~/.ssh/id_rsa      # SSH key for passwordless auth

# MongoDB Configuration
MONGO_ROOT_USER=ryan
MONGO_ROOT_PASSWORD=<set in .env>
MONGO_URI=mongodb://<user>:<pass>@192.168.86.48:27017/atomic_family?authSource=admin

# Server
PORT=5000

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000

# LLM Service (GPU server — Qwen 2.5 3B via vLLM on RTX 3090)
LLM_HOST=192.168.86.48          # Same machine as MongoDB
LLM_PORT=8001                   # 8000 is taken by Portainer
LLM_MODEL=Qwen/Qwen2.5-3B-Instruct
LLM_ENABLED=true
```

All SSH operations use key-based auth via `SSH_KEY_PATH` — no password prompts needed.

---

## Infrastructure

### GPU Server (192.168.86.48 / "databrick")
- **Hardware**: RTX 3090 24GB VRAM, Ubuntu 24.04 LTS
- **User**: `darkmatter2222` (SSH key auth)
- **Docker**: 29.1.0 with NVIDIA Container Toolkit (GPU passthrough)
- **Services**: MongoDB (port 27017), Portainer (port 8000), Ollama (port 11434), LLM inference container (port 8001)
- **Container ecosystem**: Portainer manages all containers. Other apps: docucraft, gruntwork, research-toy, vega, susman-ingress.

### LLM Deployment (Docker)

The LLM runs inside a Docker container on the GPU server with full NVIDIA GPU access.  
Build context: `llm/Dockerfile`, `llm/docker-compose.yml`, `llm/server.py`, `llm/requirements.txt`.

**Container details:**
- **Image**: `atomic-family-llm:latest` (based on `nvidia/cuda:12.4.0-devel-ubuntu22.04`)
- **Container name**: `atomic-family-llm`
- **Port mapping**: 8001 (host) → 8000 (container)
- **GPU**: `--gpus all` (NVIDIA runtime)
- **Restart policy**: `unless-stopped`
- **HuggingFace cache**: Mounted from host `/home/darkmatter2222/.cache/huggingface:/root/.cache/huggingface` — model is NOT baked into the image, downloaded on first run and cached persistently.
- **vLLM config**: `torch.float16`, `max_model_len=4096`, `gpu_memory_utilization=0.85`, `FLASH_ATTN` backend

**Deployment is automated via `llm/deploy.sh`** (reads SSH creds from `.env`):

```bash
bash llm/deploy.sh deploy   # Full deploy: SCP files → build image → start container
bash llm/deploy.sh build    # Build/rebuild Docker image on GPU server
bash llm/deploy.sh start    # Start (or restart) the container
bash llm/deploy.sh stop     # Stop the container
bash llm/deploy.sh status   # Check container status + GPU utilization
bash llm/deploy.sh logs     # Tail container logs
```

When LLM is unavailable, the agentic engine gracefully falls back to regular weighted-random AI. Characters still move and do activities — they just won't use LLM reasoning.

### Agentic AI Architecture
- **AgenticEngine** coordinates LLM reasoning for character decisions.
- **Tick ordering is critical**: `_tickAgentic()` must run BEFORE `updateFamilyMember()` in `GameSimulation.tick()`, otherwise the regular AI's CHOOSING handler intercepts before agentic reasoning can start.
- **State flow**: IDLE → CHOOSING → (agentic intercepts) → THINKING → (LLM resolves) → WALKING/activity.
- **Graceful degradation**: If `LLMClient.available === false`, agentic tick is skipped entirely.
- **Resolved decisions**: AgenticEngine stores LLM results in a `resolvedDecisions` Map; GameSimulation consumes them synchronously each tick.

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
2. Register the character in `createFamily()` inside `FamilyMemberAI.js` (both client and server copies).
3. Add corresponding sprite-sheet import in `App.jsx` (the `SPRITE_SHEETS` map).
4. Add the member to the Mongoose schema default in `server/src/routes/game.js`.
5. Add a persona entry in `server/src/data/personas.json`.

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
