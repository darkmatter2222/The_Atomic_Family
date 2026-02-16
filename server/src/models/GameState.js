const mongoose = require('mongoose');

const familyMemberSchema = new mongoose.Schema({
  name: String,
  role: { type: String, enum: ['father', 'mother', 'son', 'daughter'] },
  position: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    z: { type: Number, default: 0 }
  },
  currentRoom: { type: String, default: 'living_room' },
  currentAction: { type: String, default: 'idle' },
  targetPosition: {
    x: Number,
    y: Number,
    z: Number
  },
  path: [{
    x: Number,
    y: Number,
    z: Number
  }]
});

const gameStateSchema = new mongoose.Schema({
  familyMembers: [familyMemberSchema],
  timeOfDay: { type: Number, default: 8 }, // 24hr format
  dayCount: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

gameStateSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('GameState', gameStateSchema);
