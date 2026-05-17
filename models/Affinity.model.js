const mongoose = require('mongoose');

const AffinitySchema = new mongoose.Schema({
  viewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  likeCount: { type: Number, default: 0, min: 0 },
  replyCount: { type: Number, default: 0, min: 0 },
  repostCount: { type: Number, default: 0, min: 0 },
  saveCount: { type: Number, default: 0, min: 0 },
  profileVisitCount: { type: Number, default: 0, min: 0 },
  linkClickCount: { type: Number, default: 0, min: 0 },
  mentionCount: { type: Number, default: 0, min: 0 },
  dmCount: { type: Number, default: 0, min: 0 },
  authorRepliedCount: { type: Number, default: 0, min: 0 },
  negativeCount: { type: Number, default: 0, min: 0 },
  rawScore: { type: Number, default: 0 },
  normalizedScore: { type: Number, default: 0 },
  lastInteractionAt: Date
}, { timestamps: true });

AffinitySchema.index({ viewer: 1, author: 1 }, { unique: true });
AffinitySchema.index({ viewer: 1, normalizedScore: -1 });
AffinitySchema.index({ author: 1, normalizedScore: -1 });

module.exports = mongoose.model('Affinity', AffinitySchema);
