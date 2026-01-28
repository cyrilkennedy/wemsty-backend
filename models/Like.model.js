// models/Like.model.js

const mongoose = require('mongoose');

const LikeSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true,
    index: true
  },

  // For engagement graph
  metadata: {
    source: {
      type: String,
      enum: ['home_feed', 'sphere_feed', 'profile', 'thread', 'search'],
      default: 'home_feed'
    }
  }

}, {
  timestamps: true
});

// Unique constraint: user can only like a post once
LikeSchema.index({ user: 1, post: 1 }, { unique: true });

// Compound indexes for queries
LikeSchema.index({ post: 1, createdAt: -1 });
LikeSchema.index({ user: 1, createdAt: -1 });

// Update post engagement counter on like
LikeSchema.post('save', async function(doc) {
  const Post = mongoose.model('Post');
  await Post.findByIdAndUpdate(doc.post, {
    $inc: { 'engagement.likes': 1 }
  });
});

// Update post engagement counter on unlike
LikeSchema.post('remove', async function(doc) {
  const Post = mongoose.model('Post');
  await Post.findByIdAndUpdate(doc.post, {
    $inc: { 'engagement.likes': -1 }
  });
});

// Prevent duplicate likes
LikeSchema.statics.toggleLike = async function(userId, postId, source = 'home_feed') {
  const existingLike = await this.findOne({ user: userId, post: postId });
  
  if (existingLike) {
    // Unlike
    await existingLike.remove();
    return { liked: false, message: 'Post unliked' };
  } else {
    // Like
    await this.create({ user: userId, post: postId, metadata: { source } });
    return { liked: true, message: 'Post liked' };
  }
};

// Check if user liked a post
LikeSchema.statics.isLikedByUser = async function(userId, postId) {
  return await this.exists({ user: userId, post: postId });
};

// Get users who liked a post
LikeSchema.statics.getLikes = async function(postId, options = {}) {
  const { page = 1, limit = 20 } = options;
  
  const likes = await this.find({ post: postId })
    .populate('user', 'username profile.displayName profile.avatar')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip((page - 1) * limit);
  
  const total = await this.countDocuments({ post: postId });
  
  return {
    likes: likes.map(l => l.user),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

module.exports = mongoose.model('Like', LikeSchema);

