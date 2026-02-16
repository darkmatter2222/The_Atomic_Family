const express = require('express');
const router = express.Router();
const GameState = require('../models/GameState');

// GET current game state
router.get('/state', async (req, res) => {
  try {
    let state = await GameState.findOne().sort({ updatedAt: -1 });
    if (!state) {
      // Create initial game state with family members
      state = new GameState({
        familyMembers: [
          { name: 'Dad', role: 'father', position: { x: 0, y: 0, z: 0 }, currentRoom: 'living_room' },
          { name: 'Mom', role: 'mother', position: { x: 1, y: 0, z: 1 }, currentRoom: 'living_room' },
          { name: 'Emma', role: 'daughter', position: { x: -1, y: 0, z: 2 }, currentRoom: 'bedroom_1' },
          { name: 'Lily', role: 'daughter', position: { x: 2, y: 0, z: -1 }, currentRoom: 'bedroom_2' },
          { name: 'Jack', role: 'son', position: { x: -2, y: 0, z: 0 }, currentRoom: 'bedroom_2' }
        ],
        timeOfDay: 8,
        dayCount: 1
      });
      await state.save();
    }
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST update family member position
router.post('/move', async (req, res) => {
  try {
    const { memberName, position, currentRoom, currentAction } = req.body;
    const state = await GameState.findOne().sort({ updatedAt: -1 });
    if (!state) return res.status(404).json({ error: 'No game state found' });

    const member = state.familyMembers.find(m => m.name === memberName);
    if (!member) return res.status(404).json({ error: 'Family member not found' });

    if (position) member.position = position;
    if (currentRoom) member.currentRoom = currentRoom;
    if (currentAction) member.currentAction = currentAction;

    await state.save();

    // Broadcast update via Socket.IO
    const io = req.app.get('io');
    if (io) io.emit('gameState', state);

    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
