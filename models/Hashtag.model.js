// models/Hashtag.model.js - Hashtag tracking for trending topics

const mongoose = require('mongoose');

const HashtagSchema = new mongoose.Schema({
  // Normalized tag (lowercase, no #)
  normalizedTag: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },

  // Original display tag (with #)
  displayTag: {
    type: String,
    required: true
  },

  // Usage statistics
  usageCount: {
    type: Number,
    default: 0,
    index: true
  },

  // Recent usage for trending calculation
  recentUsageCount: {
    type: Number,
    default: 0,
    index: true
  },

  // Usage in last 24 hours
  dailyUsageCount: {
    type: Number,
    default: 0
  },

  // Usage in last hour
  hourlyUsageCount: {
    type: Number,
    default: 0
  },

  // Trending score (calculated)
  trendingScore: {
    type: Number,
    default: 0,
    index: true
  },

  // Category/Topic classification
  category: {
    type: String,
    enum: ['general', 'entertainment', 'sports', 'politics', 'technology', 'music', 'gaming', 'other'],
    default: 'general'
  },

  // Related hashtags
  relatedTags: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Hashtag'
  }],

  // Moderation
  isBanned: {
    type: Boolean,
    default: false,
    index: true
  },

  isSensitive: {
    type: Boolean,
    default: false
  },

  // Metadata
  firstUsedAt: {
    type: Date,
    default: Date.now
  },

  lastUsedAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  // Hourly usage history (for trending calculation)
  hourlyHistory: [{
    hour: Date,
    count: Number
  }]

}, {
  timestamps: true
});

// Indexes
HashtagSchema.index({ trendingScore: -1, lastUsedAt: -1 });
HashtagSchema.index({ category: 1, trendingScore: -1 });
HashtagSchema.index({ isBanned: 1, usageCount: -1 });

// Static method: Extract hashtags from text
HashtagSchema.statics.extractHashtags = function(text) {
  if (!text) return [];
  const hashtagRegex = /#(\w+)/g;
  const hashtags = [];
  let match;
  
  while ((match = hashtagRegex.exec(text)) !== null) {
    const tag = match[1].toLowerCase();
    if (!hashtags.includes(tag)) {
      hashtags.push(tag);
    }
  }
  
  return hashtags;
};

// Static method: Get or create hashtag
HashtagSchema.statics.getOrCreate = async function(tag) {
  const normalizedTag = tag.toLowerCase().replace(/^#/, '');
  const displayTag = `#${normalizedTag}`;
  
  let hashtag = await this.findOne({ normalizedTag });
  
  if (!hashtag) {
    hashtag = await this.create({
      normalizedTag,
      displayTag,
      usageCount: 0,
      recentUsageCount: 0,
      dailyUsageCount: 0,
      hourlyUsageCount: 0,
      trendingScore: 0
    });
  }
  
  return hashtag;
};

// Static method: Increment usage
HashtagSchema.statics.incrementUsage = async function(tag) {
  const normalizedTag = tag.toLowerCase().replace(/^#/, '');
  
  const result = await this.findOneAndUpdate(
    { normalizedTag },
    {
      $inc: {
        usageCount: 1,
        recentUsageCount: 1,
        dailyUsageCount: 1,
        hourlyUsageCount: 1
      },
      $set: { lastUsedAt: new Date() }
    },
    { new: true, upsert: true }
  );
  
  return result;
};

// Static method: Get trending hashtags
HashtagSchema.statics.getTrending = async function(options = {}) {
  const {
    limit = 10,
    category = null,
    excludeBanned = true,
    timeWindow = '1h' // '1h', '24h', '7d'
  } = options;

  const query = { isBanned: false };
  
  if (category) {
    query.category = category;
  }
  
  if (excludeBanned) {
    query.isBanned = false;
  }

  // Sort by trending score
  return this.find(query)
    .sort({ trendingScore: -1, recentUsageCount: -1 })
    .limit(limit)
    .lean();
};

// Instance method: Calculate trending score
HashtagSchema.methods.calculateTrendingScore = function() {
  const now = Date.now();
  const hourAgo = now - (60 * 60 * 1000);
  const dayAgo = now - (24 * 60 * 60 * 1000);
  
  // Weight recent usage more heavily
  const hourlyWeight = 3;
  const dailyWeight = 2;
  const overallWeight = 1;
  
  // Calculate velocity (usage acceleration)
  const velocity = this.hourlyUsageCount > 0 ? 
    (this.dailyUsageCount / Math.max(this.hourlyUsageCount, 1)) : 1;
  
  // Trending score formula
  this.trendingScore = 
    (this.hourlyUsageCount * hourlyWeight) +
    (this.dailyUsageCount * dailyWeight) +
    (this.usageCount * overallWeight * 0.01) +
    (velocity * 10);
  
  return this.trendingScore;
};

// Instance method: Reset periodic counters
HashtagSchema.methods.resetPeriodicCounters = function(period) {
  if (period === 'hourly') {
    // Save current hourly to history
    this.hourlyHistory.push({
      hour: new Date(),
      count: this.hourlyUsageCount
    });
    
    // Keep only last 168 hours (7 days)
    if (this.hourlyHistory.length > 168) {
      this.hourlyHistory = this.hourlyHistory.slice(-168);
    }
    
    this.hourlyUsageCount = 0;
  } else if (period === 'daily') {
    this.dailyUsageCount = 0;
  }
  
  return this.save();
};

module.exports = mongoose.model('Hashtag', HashtagSchema);