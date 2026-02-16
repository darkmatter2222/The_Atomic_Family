require('dotenv').config({ path: '../.env' });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

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

// MongoDB Connection
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

// Socket.IO - Real-time game state
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('requestGameState', () => {
    // Send current game state to the client
    const GameState = require('./models/GameState');
    GameState.findOne().sort({ updatedAt: -1 }).then(state => {
      socket.emit('gameState', state || { message: 'No state yet' });
    });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Make io accessible to routes
app.set('io', io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`The Atomic Family server running on port ${PORT}`);
});
