// models/Post.model.js

const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  // ════════════════════════════════════════════════
  // OWNERSHIP
  // ════════════════════════════════════════════════
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // ════════════════════════════════════════════════
  // POST TYPE & STRUCTURE
  // ════════════════════════════════════════════════
  postType: {
    type: String,
    enum: ['original', 'repost', 'quote', 'reply'],
    default: 'original',
    index: true
  },

  // For reposts
  originalPost: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    index: true
  },

  // For replies/comments
  parentPost: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    index: true
  },

  // For nested replies
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // ════════════════════════════════════════════════
  // CONTENT
  // ════════════════════════════════════════════════
  content: {
    text: {
      type: String,
      maxlength: 280, // Twitter-style limit (adjustable)
      trim: true
    },
    
    // Media attachments
    media: [{
      type: {
        type: String,
        enum: ['image', 'video', 'gif']
      },
      url: String,
      thumbnail: String,
      width: Number,
      height: Number,
      size: Number,
      mimeType: String
    }],

    // Mentions (@username)
    mentions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],

    // Hashtags (#topic)
    hashtags: [{
      type: String,
      lowercase: true,
      index: true
    }],

    // External links
    links: [{
      url: String,
      title: String,
      description: String,
      image: String
    }]
  },

  // ════════════════════════════════════════════════
  // VISIBILITY & PRIVACY
  // ════════════════════════════════════════════════
  visibility: {
    type: String,
    enum: ['public', 'followers', 'private'],
    default: 'public',
    index: true
  },

  // Can appear in For You/Sphere
  sphereEligible: {
    type: Boolean,
    default: true,
    index: true
  },

  // ════════════════════════════════════════════════
  // STATE & STATUS
  // ════════════════════════════════════════════════
  status: {
    type: String,
    enum: ['active', 'edited', 'deleted', 'flagged', 'hidden', 'shadow_hidden'],
    default: 'active',
    index: true
  },

  isEdited: {
    type: Boolean,
    default: false
  },

  editedAt: Date,

  // ════════════════════════════════════════════════
  // ENGAGEMENT COUNTERS (DENORMALIZED)
  // ════════════════════════════════════════════════
  engagement: {
    likes: {
      type: Number,
      default: 0,
      min: 0
    },
    comments: {
      type: Number,
      default: 0,
      min: 0
    },
    reposts: {
      type: Number,
      default: 0,
      min: 0
    },
    views: {
      type: Number,
      default: 0,
      min: 0
    },
    
    // Engagement score for ranking
    score: {
      type: Number,
      default: 0,
      index: true
    },
    
    // Engagement velocity (likes per hour)
    velocity: {
      type: Number,
      default: 0
    }
  },

  // ════════════════════════════════════════════════
  // SPHERE/FOR YOU RANKING
  // ════════════════════════════════════════════════
  sphereScore: {
    type: Number,
    default: 0,
    index: true
  },

  // Quality threshold for Sphere
  qualityScore: {
    type: Number,
    default: 0
  },

  // ════════════════════════════════════════════════
  // MODERATION
  // ════════════════════════════════════════════════
  moderation: {
    flagged: {
      type: Boolean,
      default: false
    },
    flagCount: {
      type: Number,
      default: 0
    },
    reviewStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved'
    }
  },

  // ════════════════════════════════════════════════
  // METADATA
  // ════════════════════════════════════════════════
  metadata: {
    ipAddress: String,
    userAgent: String,
    location: {
      type: { type: String, default: 'Point' },
      coordinates: [Number] // [longitude, latitude]
    }
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ════════════════════════════════════════════════
// INDEXES
// ════════════════════════════════════════════════
PostSchema.index({ author: 1, createdAt: -1 });
PostSchema.index({ originalPost: 1, createdAt: -1 });
PostSchema.index({ parentPost: 1, createdAt: -1 });
PostSchema.index({ 'content.hashtags': 1, createdAt: -1 });
PostSchema.index({ visibility: 1, status: 1, sphereEligible: 1 });
PostSchema.index({ sphereScore: -1, createdAt: -1 }); // For You feed
PostSchema.index({ 'engagement.score': -1, createdAt: -1 }); // Trending

// Text search index
PostSchema.index({ 
  'content.text': 'text', 
  'content.hashtags': 'text' 
});

// ════════════════════════════════════════════════
// VIRTUALS
// ════════════════════════════════════════════════

// Check if post is a repost
PostSchema.virtual('isRepost').get(function() {
  return this.postType === 'repost' || this.postType === 'quote';
});

// Check if post is a reply
PostSchema.virtual('isReply').get(function() {
  return this.postType === 'reply';
});

// Get engagement rate
PostSchema.virtual('engagementRate').get(function() {
  if (this.engagement.views === 0) return 0;
  const totalEngagement = this.engagement.likes + this.engagement.comments + this.engagement.reposts;
  return (totalEngagement / this.engagement.views) * 100;
});

// ════════════════════════════════════════════════
// PRE-SAVE MIDDLEWARE
// ════════════════════════════════════════════════

// Extract hashtags from text
PostSchema.pre('save', function(next) {
  if (this.isModified('content.text') && this.content.text) {
    const hashtagRegex = /#(\w+)/g;
    const hashtags = [];
    let match;
    
    while ((match = hashtagRegex.exec(this.content.text)) !== null) {
      hashtags.push(match[1].toLowerCase());
    }
    
    this.content.hashtags = [...new Set(hashtags)]; // Remove duplicates
  }
  next();
});

// Calculate engagement score
PostSchema.pre('save', function(next) {
  if (this.isModified('engagement')) {
    const { likes, comments, reposts, views } = this.engagement;
    
    // Weighted engagement score
    this.engagement.score = (likes * 1) + (comments * 2) + (reposts * 3);
    
    // Calculate velocity (likes per hour since creation)
    if (this.createdAt) {
      const hoursOld = (Date.now() - this.createdAt) / (1000 * 60 * 60);
      this.engagement.velocity = hoursOld > 0 ? likes / hoursOld : likes;
    }
  }
  next();
});

// ════════════════════════════════════════════════
// STATIC METHODS
// ════════════════════════════════════════════════

// Get posts for home feed (following)
PostSchema.statics.getHomeFeed = async function(userId, options = {}) {
  const { page = 1, limit = 20 } = options;
  const Follow = mongoose.model('Follow');
  const Block = mongoose.model('Block');
  const Mute = mongoose.model('Mute');
  
  // Get users being followed
  const following = await Follow.find({ 
    follower: userId, 
    status: 'ACCEPTED' 
  }).select('following');
  
  const followingIds = following.map(f => f.following);
  
  // Get blocked users
  const blocked = await Block.find({
    $or: [
      { blocker: userId },
      { blocked: userId }
    ]
  });
  const blockedIds = blocked.map(b => 
    b.blocker.equals(userId) ? b.blocked : b.blocker
  );
  
  // Get muted users
  const muted = await Mute.find({ muter: userId }).select('muted');
  const mutedIds = muted.map(m => m.muted);
  
  // Build query
  const query = {
    author: { $in: followingIds, $nin: [...blockedIds, ...mutedIds] },
    status: 'active',
    $or: [
      { visibility: 'public' },
      { visibility: 'followers' }
    ]
  };
  
  const posts = await this.find(query)
    .populate('author', 'username profile.displayName profile.avatar isEmailVerified')
    .populate('originalPost')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip((page - 1) * limit);
  
  const total = await this.countDocuments(query);
  
  return {
    posts,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Get posts for Sphere/For You feed
PostSchema.statics.getSphereFeed = async function(userId, options = {}) {
  const { page = 1, limit = 20 } = options;
  const Follow = mongoose.model('Follow');
  const Block = mongoose.model('Block');
  
  // Get users already following
  const following = await Follow.find({ 
    follower: userId, 
    status: 'ACCEPTED' 
  }).select('following');
  const followingIds = following.map(f => f.following);
  
  // Get blocked users
  const blocked = await Block.find({
    $or: [{ blocker: userId }, { blocked: userId }]
  });
  const blockedIds = blocked.map(b => 
    b.blocker.equals(userId) ? b.blocked : b.blocker
  );
  
  // Sphere query: public, high quality, not from following, not blocked
  const query = {
    author: { $nin: [...followingIds, ...blockedIds, userId] },
    visibility: 'public',
    sphereEligible: true,
    status: 'active',
    qualityScore: { $gte: 0.5 } // Minimum quality threshold
  };
  
  const posts = await this.find(query)
    .populate('author', 'username profile.displayName profile.avatar isEmailVerified')
    .sort({ sphereScore: -1, createdAt: -1 }) // Sort by relevance
    .limit(limit)
    .skip((page - 1) * limit);
  
  return {
    posts,
    pagination: {
      page,
      limit,
      total: await this.countDocuments(query),
      pages: Math.ceil(await this.countDocuments(query) / limit)
    }
  };
};

// Get user profile posts
PostSchema.statics.getUserPosts = async function(userId, viewerId, options = {}) {
  const { page = 1, limit = 20, includeReplies = false } = options;
  const Block = mongoose.model('Block');
  
  // Check if blocked
  const isBlocked = await Block.exists({
    $or: [
      { blocker: userId, blocked: viewerId },
      { blocker: viewerId, blocked: userId }
    ]
  });
  
  if (isBlocked) {
    throw new Error('Cannot view posts from blocked user');
  }
  
  const query = {
    author: userId,
    status: 'active'
  };
  
  if (!includeReplies) {
    query.postType = { $ne: 'reply' };
  }
  
  const posts = await this.find(query)
    .populate('author', 'username profile.displayName profile.avatar')
    .populate('originalPost')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip((page - 1) * limit);
  
  const total = await this.countDocuments(query);
  
  return {
    posts,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
};

// Get post thread (with replies)
PostSchema.statics.getThread = async function(postId, userId) {
  const post = await this.findById(postId)
    .populate('author', 'username profile.displayName profile.avatar');
  
  if (!post) {
    throw new Error('Post not found');
  }
  
  // Get all replies
  const replies = await this.find({
    parentPost: postId,
    status: 'active'
  })
    .populate('author', 'username profile.displayName profile.avatar')
    .sort({ createdAt: 1 });
  
  return { post, replies };
};

// ════════════════════════════════════════════════
// INSTANCE METHODS
// ════════════════════════════════════════════════

// Increment view counter
PostSchema.methods.incrementViews = async function() {
  this.engagement.views += 1;
  await this.save({ validateBeforeSave: false });
};

// Calculate sphere score (for ranking)
PostSchema.methods.calculateSphereScore = function() {
  const ageHours = (Date.now() - this.createdAt) / (1000 * 60 * 60);
  const decayFactor = Math.exp(-ageHours / 24); // Exponential decay over 24 hours
  
  const { likes, comments, reposts } = this.engagement;
  const baseScore = (likes * 1) + (comments * 2) + (reposts * 3);
  
  this.sphereScore = baseScore * decayFactor;
  return this.sphereScore;
};

// Check if user can view this post
PostSchema.methods.canBeViewedBy = async function(viewerId) {
  const Follow = mongoose.model('Follow');
  const Block = mongoose.model('Block');
  
  // Check if blocked
  const isBlocked = await Block.exists({
    $or: [
      { blocker: this.author, blocked: viewerId },
      { blocker: viewerId, blocked: this.author }
    ]
  });
  
  if (isBlocked) return false;
  
  // Public posts visible to all
  if (this.visibility === 'public') return true;
  
  // Own posts always visible
  if (this.author.equals(viewerId)) return true;
  
  // Followers-only posts
  if (this.visibility === 'followers') {
    const isFollowing = await Follow.exists({
      follower: viewerId,
      following: this.author,
      status: 'ACCEPTED'
    });
    return isFollowing;
  }
  
  // Private posts (shouldn't exist, but handle)
  return false;
};

module.exports = mongoose.model('Post', PostSchema);