// models/Follow.model.js

const mongoose = require('mongoose');

const FollowSchema = new mongoose.Schema({
  // ════════════════════════════════════════════════
  // RELATIONSHIP PARTICIPANTS
  // ════════════════════════════════════════════════
  follower: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  following: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // ════════════════════════════════════════════════
  // RELATIONSHIP STATUS
  // ════════════════════════════════════════════════
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
    default: 'ACCEPTED',
    index: true
  },

  // ════════════════════════════════════════════════
  // METADATA
  // ════════════════════════════════════════════════
  requestedAt: {
    type: Date,
    default: Date.now
  },

  acceptedAt: Date,
  rejectedAt: Date

}, {
  timestamps: true
});

// ════════════════════════════════════════════════
// COMPOUND INDEXES
// ════════════════════════════════════════════════

// Unique constraint: user can only follow another user once
FollowSchema.index({ follower: 1, following: 1 }, { unique: true });

// Reverse lookup for followers list
FollowSchema.index({ following: 1, follower: 1 });

// Query by status
FollowSchema.index({ status: 1, createdAt: -1 });

// ════════════════════════════════════════════════
// VALIDATION
// ════════════════════════════════════════════════

FollowSchema.pre('save', function(next) {
  // Prevent self-follows
  if (this.follower.equals(this.following)) {
    return next(new Error('Users cannot follow themselves'));
  }
  next();
});

// Update timestamps based on status
FollowSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    if (this.status === 'ACCEPTED') {
      this.acceptedAt = Date.now();
    } else if (this.status === 'REJECTED') {
      this.rejectedAt = Date.now();
    }
  }
  next();
});

// ════════════════════════════════════════════════
// STATIC METHODS
// ════════════════════════════════════════════════

// Check if user A follows user B
FollowSchema.statics.checkFollowStatus = async function(followerId, followingId) {
  const follow = await this.findOne({
    follower: followerId,
    following: followingId
  });
  
  if (!follow) return 'NOT_FOLLOWING';
  return follow.status;
};

// Get mutual followers (users who follow each other)
FollowSchema.statics.getMutualFollows = async function(userId) {
  const following = await this.find({ 
    follower: userId, 
    status: 'ACCEPTED' 
  }).select('following');
  
  const followingIds = following.map(f => f.following);
  
  const mutuals = await this.find({
    follower: { $in: followingIds },
    following: userId,
    status: 'ACCEPTED'
  }).populate('follower', 'username profile.displayName profile.avatar');
  
  return mutuals.map(m => m.follower);
};

// Get follow suggestions based on mutual connections
FollowSchema.statics.getSuggestions = async function(userId, limit = 10) {
  // Get users that people I follow also follow
  const myFollowing = await this.find({ 
    follower: userId, 
    status: 'ACCEPTED' 
  }).select('following');
  
  const followingIds = myFollowing.map(f => f.following);
  
  // Find who they follow
  const suggestions = await this.aggregate([
    {
      $match: {
        follower: { $in: followingIds },
        following: { $ne: userId },
        status: 'ACCEPTED'
      }
    },
    {
      $group: {
        _id: '$following',
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    },
    {
      $limit: limit * 2 // Get extra to filter out already following
    }
  ]);
  
  // Filter out users already following
  const alreadyFollowing = await this.find({
    follower: userId,
    following: { $in: suggestions.map(s => s._id) }
  }).select('following');
  
  const alreadyFollowingIds = alreadyFollowing.map(f => f.following.toString());
  
  const filtered = suggestions
    .filter(s => !alreadyFollowingIds.includes(s._id.toString()))
    .slice(0, limit);
  
  return filtered;
};

// ════════════════════════════════════════════════
// POST SAVE HOOKS - UPDATE COUNTERS
// ════════════════════════════════════════════════

FollowSchema.post('save', async function(doc) {
  if (doc.status === 'ACCEPTED') {
    const User = mongoose.model('User');
    
    // Increment follower's following count
    await User.findByIdAndUpdate(doc.follower, {
      $inc: { following_count: 1 }
    });
    
    // Increment following's followers count
    await User.findByIdAndUpdate(doc.following, {
      $inc: { followers_count: 1 }
    });
  }
});

FollowSchema.post('remove', async function(doc) {
  if (doc.status === 'ACCEPTED') {
    const User = mongoose.model('User');
    
    // Decrement counts
    await User.findByIdAndUpdate(doc.follower, {
      $inc: { following_count: -1 }
    });
    
    await User.findByIdAndUpdate(doc.following, {
      $inc: { followers_count: -1 }
    });
  }
});

module.exports = mongoose.model('Follow', FollowSchema);