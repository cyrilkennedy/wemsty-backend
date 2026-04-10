const mongoose = require('mongoose');

const CircleMembershipSchema = new mongoose.Schema({
  circle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Circle',
    required: true
  },

  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  status: {
    type: String,
    enum: ['active', 'invited', 'banned', 'left'],
    default: 'active',
    index: true
  },

  roles: [{
    type: String,
    enum: ['owner', 'moderator', 'member'],
    default: 'member'
  }],

  roleIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CircleRole'
  }],

  joinedAt: {
    type: Date,
    default: Date.now
  },

  lastSeenAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

CircleMembershipSchema.index({ circle: 1, user: 1 }, { unique: true });
CircleMembershipSchema.index({ user: 1, status: 1, joinedAt: -1 });

module.exports = mongoose.model('CircleMembership', CircleMembershipSchema);
