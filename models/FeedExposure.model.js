const mongoose = require('mongoose');

const FeedExposureSchema = new mongoose.Schema({
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
  feedType: {
    type: String,
    enum: ['home', 'sphere', 'category', 'profile', 'search'],
    default: 'sphere',
    index: true
  },
  source: {
    type: String,
    default: 'ranked',
    index: true
  },
  variant: {
    type: String,
    default: 'balanced',
    index: true
  },
  algorithmVersion: {
    type: String,
    default: 'wemsty-v2',
    index: true
  },
  rankPosition: {
    type: Number,
    default: 0,
    min: 0
  },
  score: {
    type: Number,
    default: 0
  },
  requestId: String,
  outcome: {
    viewed: { type: Boolean, default: false },
    clicked: { type: Boolean, default: false },
    liked: { type: Boolean, default: false },
    replied: { type: Boolean, default: false },
    reposted: { type: Boolean, default: false },
    bookmarked: { type: Boolean, default: false },
    hidden: { type: Boolean, default: false },
    notInterested: { type: Boolean, default: false },
    dwellSeconds: { type: Number, default: 0, min: 0 }
  }
}, { timestamps: true });

FeedExposureSchema.index({ user: 1, createdAt: -1 });
FeedExposureSchema.index({ variant: 1, feedType: 1, createdAt: -1 });
FeedExposureSchema.index({ source: 1, feedType: 1, createdAt: -1 });
FeedExposureSchema.index({ post: 1, user: 1, createdAt: -1 });

module.exports = mongoose.model('FeedExposure', FeedExposureSchema);
