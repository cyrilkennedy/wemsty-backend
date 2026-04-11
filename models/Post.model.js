// models/Post.model.js

const mongoose = require('mongoose');
const {
  POST_CATEGORY_SLUGS,
  DEFAULT_POST_CATEGORY,
  normalizeCategorySlug
} = require('../config/post-categories');

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
  category: {
    type: String,
    enum: POST_CATEGORY_SLUGS,
    default: DEFAULT_POST_CATEGORY,
    index: true
  },

  content: {
    text: {
      type: String,
      maxlength: 500,
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
PostSchema.index(
  { author: 1, originalPost: 1 },
  {
    unique: true,
    partialFilterExpression: {
      postType: { $in: ['repost', 'quote'] },
      status: 'active',
      originalPost: { $exists: true }
    }
  }
);
PostSchema.index({ parentPost: 1, createdAt: -1 });
PostSchema.index({ category: 1, visibility: 1, status: 1, createdAt: -1 });
PostSchema.index({ 'content.hashtags': 1, createdAt: -1 });
PostSchema.index({ visibility: 1, status: 1, sphereEligible: 1 });
PostSchema.index({ visibility: 1, status: 1, sphereEligible: 1, createdAt: -1 });
PostSchema.index({ visibility: 1, status: 1, sphereEligible: 1, sphereScore: -1, 'engagement.score': -1, createdAt: -1 });
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
PostSchema.pre('save', function() {
  if (this.isModified('category') || !this.category) {
    this.category = normalizeCategorySlug(this.category || DEFAULT_POST_CATEGORY);
  }

  if (this.isModified('content.text') && this.content.text) {
    const hashtagRegex = /#(\w+)/g;
    const hashtags = [];
    let match;
    
    while ((match = hashtagRegex.exec(this.content.text)) !== null) {
      hashtags.push(match[1].toLowerCase());
    }
    
    this.content.hashtags = [...new Set(hashtags)]; // Remove duplicates
  }
});

// Calculate engagement score
PostSchema.pre('save', function() {
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
});

// ════════════════════════════════════════════════
// STATIC METHODS
// ════════════════════════════════════════════════

// Get posts for home feed (following)
PostSchema.statics.getHomeFeed = async function(userId, options = {}) {
  const { page = 1, limit = 20 } = options;
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
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
    .limit(safeLimit)
    .skip((safePage - 1) * safeLimit)
    .lean();
  
  const total = await this.countDocuments(query);
  
  return {
    posts,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit)
    }
  };
};

// Get posts for Sphere/For You feed
PostSchema.statics.getSphereFeed = async function(userId, options = {}) {
  const { page = 1, limit = 20, mode = 'top' } = options;
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const Block = mongoose.model('Block');

  let blockedIds = [];
  if (userId) {
    const blocked = await Block.find({
      $or: [{ blocker: userId }, { blocked: userId }]
    });
    blockedIds = blocked.map(b =>
      b.blocker.equals(userId) ? b.blocked : b.blocker
    );
  }

  const query = {
    author: { $nin: blockedIds },
    visibility: 'public',
    sphereEligible: true,
    status: 'active'
  };

  const sort = mode === 'latest'
    ? { createdAt: -1 }
    : { sphereScore: -1, 'engagement.score': -1, createdAt: -1 };

  const posts = await this.find(query)
    .populate('author', 'username profile.displayName profile.avatar isEmailVerified')
    .sort(sort)
    .limit(safeLimit)
    .skip((safePage - 1) * safeLimit)
    .lean();

  const total = await this.countDocuments(query);

  return {
    posts,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit)
    }
  };
};

PostSchema.statics.getCategoryFeed = async function(category, userId, options = {}) {
  const { page = 1, limit = 20, mode = 'latest' } = options;
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const Block = mongoose.model('Block');

  let blockedIds = [];
  if (userId) {
    const blocked = await Block.find({
      $or: [{ blocker: userId }, { blocked: userId }]
    });
    blockedIds = blocked.map(b =>
      b.blocker.equals(userId) ? b.blocked : b.blocker
    );
  }

  const query = {
    category: normalizeCategorySlug(category),
    author: { $nin: blockedIds },
    visibility: 'public',
    status: 'active'
  };

  const sort = mode === 'top'
    ? { sphereScore: -1, 'engagement.score': -1, createdAt: -1 }
    : { createdAt: -1 };

  const posts = await this.find(query)
    .populate('author', 'username profile.displayName profile.avatar isEmailVerified')
    .populate('originalPost')
    .sort(sort)
    .limit(safeLimit)
    .skip((safePage - 1) * safeLimit)
    .lean();

  const total = await this.countDocuments(query);

  return {
    posts,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit)
    }
  };
};

// Get user profile posts
PostSchema.statics.getUserPosts = async function(userId, viewerId, options = {}) {
  const { page = 1, limit = 20, includeReplies = false } = options;
  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
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
    .limit(safeLimit)
    .skip((safePage - 1) * safeLimit)
    .lean();
  
  const total = await this.countDocuments(query);
  
  return {
    posts,
    pagination: { page: safePage, limit: safeLimit, total, pages: Math.ceil(total / safeLimit) }
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
