require('dotenv').config({ path: '../.env' });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const GameSimulation = require('./game/GameSimulation');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection (optional — game runs without it)
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/atomic_family';
mongoose.connect(mongoUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.log('MongoDB connection error (non-fatal, running without DB):', err.message));

// Routes
const gameRoutes = require('./routes/game');
app.use('/api/game', gameRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ═══════════════════════════════════════════════════════════════════
//  Game Simulation — authoritative server-side game loop
// ═══════════════════════════════════════════════════════════════════
const simulation = new GameSimulation(io);
simulation.start();

// Make simulation accessible to routes
app.set('io', io);
app.set('simulation', simulation);

// ═══════════════════════════════════════════════════════════════════
//  Socket.IO — Client ↔ Server communication
// ═══════════════════════════════════════════════════════════════════
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send full state immediately on connect
  simulation.sendFullState(socket);

  // ── Time / Speed controls ──
  socket.on('setSpeed', (speed) => {
    simulation.setSpeed(speed);
  });

  socket.on('togglePause', () => {
    simulation.togglePause();
  });

  socket.on('setPaused', (paused) => {
    simulation.setPaused(paused);
  });

  socket.on('setSyncToReal', (sync) => {
    simulation.setSyncToReal(sync);
  });

  socket.on('setTimeOverride', (hour) => {
    simulation.setTimeOverride(hour);
  });

  // ── Character commands ──
  socket.on('command', ({ memberName, interactionId }) => {
    simulation.command(memberName, interactionId);
  });

  // ── Light controls ──
  socket.on('toggleRoomLight', (roomId) => {
    simulation.toggleRoomLight(roomId);
  });

  socket.on('setAllLights', (on) => {
    simulation.setAllLights(on);
  });

  socket.on('toggleLightsAuto', () => {
    simulation.toggleLightsAuto();
  });

  // ── Legacy: requestGameState (backwards compat) ──
  socket.on('requestGameState', () => {
    simulation.sendFullState(socket);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`The Atomic Family server running on port ${PORT}`);
  console.log(`Game simulation running at ${simulation.tickRate} tps`);
});
