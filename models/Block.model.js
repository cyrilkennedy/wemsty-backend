// models/Block.model.js

const mongoose = require('mongoose');

const BlockSchema = new mongoose.Schema({
  blocker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  blocked: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  }

}, {
  timestamps: true
});

// Unique constraint
BlockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });
BlockSchema.index({ blocked: 1, blocker: 1 }); // Reverse lookup

// Prevent self-blocking
BlockSchema.pre('save', function(next) {
  if (this.blocker.equals(this.blocked)) {
    return next(new Error('Users cannot block themselves'));
  }
  next();
});

// Static method to check if blocked
BlockSchema.statics.isBlocked = async function(userA, userB) {
  const block = await this.findOne({
    $or: [
      { blocker: userA, blocked: userB },
      { blocker: userB, blocked: userA }
    ]
  });
  return !!block;
};

// Remove follow relationships on block
BlockSchema.post('save', async function(doc) {
  const Follow = mongoose.model('Follow');
  
  // Remove both directions of follow
  await Follow.deleteMany({
    $or: [
      { follower: doc.blocker, following: doc.blocked },
      { follower: doc.blocked, following: doc.blocker }
    ]
  });
});

module.exports = mongoose.model('Block', BlockSchema);

