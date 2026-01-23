// models/UserProfile.model.js
// Extended profile information (separate from User authentication model)

const mongoose = require('mongoose');

const UserProfileSchema = new mongoose.Schema({
  // ════════════════════════════════════════════════
  // LINK TO USER
  // ════════════════════════════════════════════════
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  // ════════════════════════════════════════════════
  // PRIVACY SETTINGS
  // ════════════════════════════════════════════════
  privacy: {
    profileVisibility: {
      type: String,
      enum: ['PUBLIC', 'FOLLOWERS_ONLY', 'PRIVATE'],
      default: 'PUBLIC'
    },
    allowFollowRequests: {
      type: Boolean,
      default: true
    },
    showInSearch: {
      type: Boolean,
      default: true
    },
    allowTagging: {
      type: Boolean,
      default: true
    }
  },

  // ════════════════════════════════════════════════
  // NOTIFICATION PREFERENCES
  // ════════════════════════════════════════════════
  notificationSettings: {
    notifyOnFollow: {
      type: Boolean,
      default: true
    },
    notifyOnFollowRequest: {
      type: Boolean,
      default: true
    },
    emailNotifications: {
      type: Boolean,
      default: false
    },
    pushNotifications: {
      type: Boolean,
      default: true
    },
    notifyOnMention: {
      type: Boolean,
      default: true
    },
    notifyOnReaction: {
      type: Boolean,
      default: true
    }
  },

  // ════════════════════════════════════════════════
  // PROFILE METADATA
  // ════════════════════════════════════════════════
  metadata: {
    profileCompleteness: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    lastProfileUpdate: Date,
    profileViewCount: {
      type: Number,
      default: 0
    }
  }

}, {
  timestamps: true
});

// ════════════════════════════════════════════════
// INDEXES
// ════════════════════════════════════════════════
UserProfileSchema.index({ user: 1 });

// ════════════════════════════════════════════════
// METHODS
// ════════════════════════════════════════════════

// Calculate profile completeness
UserProfileSchema.methods.calculateCompleteness = async function() {
  const User = mongoose.model('User');
  const user = await User.findById(this.user);
  
  let score = 0;
  const checks = [
    user.username ? 20 : 0,
    user.profile?.displayName ? 15 : 0,
    user.profile?.bio ? 15 : 0,
    user.profile?.avatar ? 20 : 0,
    user.profile?.location ? 10 : 0,
    user.isEmailVerified ? 20 : 0
  ];
  
  score = checks.reduce((a, b) => a + b, 0);
  this.metadata.profileCompleteness = score;
  return score;
};

// Check if user can be viewed by another user
UserProfileSchema.methods.canBeViewedBy = async function(viewerId) {
  const Follow = mongoose.model('Follow');
  
  // Public profiles visible to all
  if (this.privacy.profileVisibility === 'PUBLIC') {
    return { canView: true, level: 'full' };
  }
  
  // Check if viewer follows this user
  const isFollowing = await Follow.exists({
    follower: viewerId,
    following: this.user,
    status: 'ACCEPTED'
  });
  
  if (this.privacy.profileVisibility === 'FOLLOWERS_ONLY') {
    if (isFollowing) {
      return { canView: true, level: 'full' };
    }
    return { canView: true, level: 'limited' };
  }
  
  if (this.privacy.profileVisibility === 'PRIVATE') {
    if (isFollowing) {
      return { canView: true, level: 'full' };
    }
    return { canView: true, level: 'minimal' };
  }
  
  return { canView: true, level: 'full' };
};

module.exports = mongoose.model('UserProfile', UserProfileSchema);