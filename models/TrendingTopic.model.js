// models/TrendingTopic.model.js - Trending topics and topics tracking

const mongoose = require('mongoose');

const TrendingTopicSchema = new mongoose.Schema({
  // Topic identifier
  topic: {
    type: String,
    required: true,
    trim: true,
    index: true
  },

  // Topic type
  type: {
    type: String,
    enum: ['hashtag', 'keyword', 'phrase'],
    required: true,
    index: true
  },

  // Topic category
  category: {
    type: String,
    enum: ['general', 'entertainment', 'sports', 'politics', 'technology', 'music', 'gaming', 'news', 'other'],
    default: 'general'
  },

  // Trending metrics
  currentScore: {
    type: Number,
    default: 0,
    index: true
  },

  peakScore: {
    type: Number,
    default: 0
  },

  // Usage statistics
  currentUsage: {
    type: Number,
    default: 0
  },

  totalUsage: {
    type: Number,
    default: 0
  },

  // Velocity (rate of change)
  velocity: {
    type: Number,
    default: 0
  },

  // Time windows
  hourlyUsage: {
    type: Number,
    default: 0
  },

  dailyUsage: {
    type: Number,
    default: 0
  },

  weeklyUsage: {
    type: Number,
    default: 0
  },

  // Geographic distribution
  regions: [{
    region: String,
    usage: Number,
    score: Number
  }],

  // Related topics
  relatedTopics: [{
    topic: String,
    type: String,
    score: Number
  }],

  // Sentiment analysis
  sentiment: {
    score: {
      type: Number,
      min: -1,
      max: 1,
      default: 0
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    }
  },

  // Trending status
  status: {
    type: String,
    enum: ['trending', 'rising', 'stable', 'declining', 'fading'],
    default: 'stable',
    index: true
  },

  // Time tracking
  firstSeen: {
    type: Date,
    default: Date.now
  },

  lastSeen: {
    type: Date,
    default: Date.now,
    index: true
  },

  peakTime: {
    type: Date,
    default: Date.now
  },

  // Historical data
  hourlyHistory: [{
    timestamp: Date,
    usage: Number,
    score: Number
  }],

  dailyHistory: [{
    date: Date,
    usage: Number,
    score: Number
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
  source: {
    type: String,
    enum: ['posts', 'comments', 'searches', 'external'],
    default: 'posts'
  },

  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.8
  }

}, {
  timestamps: true
});

// Indexes
TrendingTopicSchema.index({ topic: 1, type: 1 }, { unique: true });
TrendingTopicSchema.index({ currentScore: -1, lastSeen: -1 });
TrendingTopicSchema.index({ category: 1, currentScore: -1 });
TrendingTopicSchema.index({ status: 1, lastSeen: -1 });
TrendingTopicSchema.index({ isBanned: 1, currentScore: -1 });

// Static method: Get trending topics
TrendingTopicSchema.statics.getTrending = async function(options = {}) {
  const {
    limit = 20,
    category = null,
    status = null,
    excludeBanned = true,
    timeWindow = '1h'
  } = options;

  const query = { isBanned: false };
  
  if (category) {
    query.category = category;
  }
  
  if (status) {
    query.status = status;
  }
  
  if (excludeBanned) {
    query.isBanned = false;
  }

  // Filter by time window
  const now = new Date();
  let timeFilter = {};
  
  switch (timeWindow) {
    case '1h':
      timeFilter = { lastSeen: { $gte: new Date(now - 60 * 60 * 1000) } };
      break;
    case '24h':
      timeFilter = { lastSeen: { $gte: new Date(now - 24 * 60 * 60 * 1000) } };
      break;
    case '7d':
      timeFilter = { lastSeen: { $gte: new Date(now - 7 * 24 * 60 * 60 * 1000) } };
      break;
  }

  return this.find({ ...query, ...timeFilter })
    .sort({ currentScore: -1, velocity: -1 })
    .limit(limit)
    .lean();
};

// Static method: Update topic metrics
TrendingTopicSchema.statics.updateTopic = async function(topic, type, usage, metadata = {}) {
  const now = new Date();
  
  const update = {
    $inc: {
      currentUsage: usage,
      totalUsage: usage,
      hourlyUsage: usage,
      dailyUsage: usage,
      weeklyUsage: usage
    },
    $set: {
      lastSeen: now,
      'sentiment.score': metadata.sentimentScore || 0,
      'sentiment.confidence': metadata.sentimentConfidence || 0,
      'confidence': metadata.confidence || 0.8
    },
    $push: {
      hourlyHistory: {
        $each: [{ timestamp: now, usage, score: 0 }],
        $slice: -168 // Keep last 168 hours (7 days)
      },
      dailyHistory: {
        $each: [{ date: new Date(now.toDateString()), usage, score: 0 }],
        $slice: -30 // Keep last 30 days
      }
    }
  };

  const result = await this.findOneAndUpdate(
    { topic, type },
    update,
    { new: true, upsert: true }
  );

  if (result) {
    await result.calculateMetrics();
  }

  return result;
};

// Instance method: Calculate trending metrics
TrendingTopicSchema.methods.calculateMetrics = async function() {
  const now = Date.now();
  const hourAgo = now - (60 * 60 * 1000);
  const dayAgo = now - (24 * 60 * 60 * 1000);

  // Calculate velocity (rate of change)
  const recentUsage = this.hourlyUsage || 0;
  const previousUsage = this.dailyUsage - this.hourlyUsage || 0;
  
  this.velocity = recentUsage > 0 ? 
    (recentUsage / Math.max(previousUsage, 1)) : 0;

  // Calculate trending score
  const baseScore = this.currentUsage * 0.1;
  const velocityBonus = this.velocity * 10;
  const recencyBonus = Math.exp(-(Date.now() - this.lastSeen) / (60 * 60 * 1000)); // Decay over time
  
  this.currentScore = baseScore + velocityBonus + recencyBonus;

  // Update peak score
  if (this.currentScore > this.peakScore) {
    this.peakScore = this.currentScore;
    this.peakTime = new Date();
  }

  // Determine trending status
  this.status = this.calculateStatus();

  // Update historical scores
  if (this.hourlyHistory.length > 0) {
    this.hourlyHistory[this.hourlyHistory.length - 1].score = this.currentScore;
  }
  if (this.dailyHistory.length > 0) {
    this.dailyHistory[this.dailyHistory.length - 1].score = this.currentScore;
  }

  return this.save();
};

// Instance method: Calculate trending status
TrendingTopicSchema.methods.calculateStatus = function() {
  const velocity = this.velocity || 0;
  const score = this.currentScore || 0;
  const ageHours = (Date.now() - this.firstSeen) / (1000 * 60 * 60);

  if (score > 100 && velocity > 2) {
    return 'trending';
  } else if (score > 50 && velocity > 1.5) {
    return 'rising';
  } else if (velocity > 1) {
    return 'rising';
  } else if (velocity < 0.5 && score < 10) {
    return 'fading';
  } else if (velocity < 0) {
    return 'declining';
  } else {
    return 'stable';
  }
};

// Instance method: Add related topic
TrendingTopicSchema.methods.addRelatedTopic = function(relatedTopic, score) {
  const existingIndex = this.relatedTopics.findIndex(
    rt => rt.topic === relatedTopic
  );

  if (existingIndex >= 0) {
    this.relatedTopics[existingIndex].score = score;
  } else {
    this.relatedTopics.push({ topic: relatedTopic, score });
  }

  // Keep only top 10 related topics
  this.relatedTopics.sort((a, b) => b.score - a.score);
  this.relatedTopics = this.relatedTopics.slice(0, 10);

  return this.save();
};

// Instance method: Add region data
TrendingTopicSchema.methods.addRegionData = function(region, usage, score) {
  const existingIndex = this.regions.findIndex(
    r => r.region === region
  );

  if (existingIndex >= 0) {
    this.regions[existingIndex].usage += usage;
    this.regions[existingIndex].score = score;
  } else {
    this.regions.push({ region, usage, score });
  }

  // Keep only top 5 regions
  this.regions.sort((a, b) => b.usage - a.usage);
  this.regions = this.regions.slice(0, 5);

  return this.save();
};

// Instance method: Reset periodic counters
TrendingTopicSchema.methods.resetPeriodicCounters = function(period) {
  if (period === 'hourly') {
    this.hourlyUsage = 0;
  } else if (period === 'daily') {
    this.dailyUsage = 0;
  } else if (period === 'weekly') {
    this.weeklyUsage = 0;
  }

  return this.save();
};

// Static method: Get topics by category
TrendingTopicSchema.statics.getByCategory = async function(category, options = {}) {
  const { limit = 10, status = null } = options;

  const query = { category, isBanned: false };
  
  if (status) {
    query.status = status;
  }

  return this.find(query)
    .sort({ currentScore: -1, velocity: -1 })
    .limit(limit)
    .lean();
};

// Static method: Get topics by region
TrendingTopicSchema.statics.getByRegion = async function(region, options = {}) {
  const { limit = 10 } = options;

  return this.find({
    isBanned: false,
    'regions.region': region
  })
    .sort({ currentScore: -1 })
    .limit(limit)
    .lean();
};

module.exports = mongoose.model('TrendingTopic', TrendingTopicSchema);