const mongoose = require('mongoose');

const CircleInviteSchema = new mongoose.Schema({
  circle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Circle',
    required: true,
    index: true
  },

  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  expiresAt: {
    type: Date,
    default: null,
    index: true
  },

  maxUses: {
    type: Number,
    default: null,
    min: 1
  },

  usedCount: {
    type: Number,
    default: 0,
    min: 0
  },

  isRevoked: {
    type: Boolean,
    default: false,
    index: true
  }
}, {
  timestamps: true
});

CircleInviteSchema.index({ circle: 1, createdAt: -1 });

module.exports = mongoose.model('CircleInvite', CircleInviteSchema);
