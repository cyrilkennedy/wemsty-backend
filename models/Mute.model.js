const mongoose = require('mongoose');
// ════════════════════════════════════════════════════════════
// models/Mute.model.js
// ════════════════════════════════════════════════════════════

const MuteSchema = new mongoose.Schema({
  muter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  muted: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  }

}, {
  timestamps: true
});

// Unique constraint
MuteSchema.index({ muter: 1, muted: 1 }, { unique: true });

// Prevent self-muting
MuteSchema.pre('save', function(next) {
  if (this.muter.equals(this.muted)) {
    return next(new Error('Users cannot mute themselves'));
  }
  next();
});

// Static method to check if muted
MuteSchema.statics.isMuted = async function(muterId, mutedId) {
  const mute = await this.findOne({
    muter: muterId,
    muted: mutedId
  });
  return !!mute;
};

// Get all muted users for a user (for feed filtering)
MuteSchema.statics.getMutedUsers = async function(userId) {
  const mutes = await this.find({ muter: userId }).select('muted');
  return mutes.map(m => m.muted);
};

module.exports = mongoose.model('Mute', MuteSchema);