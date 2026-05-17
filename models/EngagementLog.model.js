const mongoose = require('mongoose');

const EngagementLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: true,
    index: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'impression',
      'view',
      'dwell',
      'like',
      'reply',
      'repost',
      'quote',
      'save',
      'bookmark',
      'profile_click',
      'link_click',
      'mention',
      'dm_sent',
      'author_replied',
      'hide',
      'not_interested',
      'report'
    ],
    index: true
  },
  dwellSeconds: {
    type: Number,
    default: 0,
    min: 0
  },
  metadata: {
    source: String,
    sessionId: String,
    deviceId: String,
    ipAddress: String,
    userAgent: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

EngagementLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 31536000 });
EngagementLogSchema.index({ user: 1, createdAt: -1 });
EngagementLogSchema.index({ post: 1, action: 1, createdAt: -1 });
EngagementLogSchema.index({ author: 1, action: 1, createdAt: -1 });

module.exports = mongoose.model('EngagementLog', EngagementLogSchema);
