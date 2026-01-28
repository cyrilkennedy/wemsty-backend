// models/Bookmark.model.js

const mongoose = require('mongoose');

const BookmarkSchema = new mongoose.Schema({
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

  // Optional collections/folders for organizing bookmarks
  collection: {
    type: String,
    default: 'default'
  }

}, {
  timestamps: true
});

// ════════════════════════════════════════════════
// INDEXES
// ════════════════════════════════════════════════

// Unique constraint: user can only bookmark a post once
BookmarkSchema.index({ user: 1, post: 1 }, { unique: true });

// Query bookmarks by collection
BookmarkSchema.index({ user: 1, collection: 1, createdAt: -1 });

// ════════════════════════════════════════════════
// STATIC METHODS
// ════════════════════════════════════════════════

// Toggle bookmark (bookmark if not bookmarked, unbookmark if already bookmarked)
BookmarkSchema.statics.toggleBookmark = async function(userId, postId, collection = 'default') {
  const existing = await this.findOne({ user: userId, post: postId });
  
  if (existing) {
    // Remove bookmark
    await existing.remove();
    return { bookmarked: false, message: 'Bookmark removed' };
  } else {
    // Add bookmark
    await this.create({ user: userId, post: postId, collection });
    return { bookmarked: true, message: 'Post bookmarked' };
  }
};

// Check if user bookmarked a post
BookmarkSchema.statics.isBookmarkedByUser = async function(userId, postId) {
  return await this.exists({ user: userId, post: postId });
};

// Get user's bookmarks
BookmarkSchema.statics.getUserBookmarks = async function(userId, options = {}) {
  const { page = 1, limit = 20, collection = null } = options;
  
  const query = { user: userId };
  if (collection) {
    query.collection = collection;
  }
  
  const bookmarks = await this.find(query)
    .populate({
      path: 'post',
      populate: { 
        path: 'author', 
        select: 'username profile.displayName profile.avatar isEmailVerified' 
      }
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip((page - 1) * limit);
  
  const total = await this.countDocuments(query);
  
  return {
    bookmarks: bookmarks.map(b => b.post),
    pagination: { 
      page, 
      limit, 
      total, 
      pages: Math.ceil(total / limit) 
    }
  };
};

// Get user's bookmark collections
BookmarkSchema.statics.getCollections = async function(userId) {
  const collections = await this.distinct('collection', { user: userId });
  
  // Get count for each collection
  const collectionsWithCounts = await Promise.all(
    collections.map(async (collection) => {
      const count = await this.countDocuments({ user: userId, collection });
      return { name: collection, count };
    })
  );
  
  return collectionsWithCounts;
};

module.exports = mongoose.model('Bookmark', BookmarkSchema);