const mongoose = require('mongoose');

const UserTopicAffinitySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  topic: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  score: {
    type: Number,
    default: 0
  },
  positiveCount: {
    type: Number,
    default: 0,
    min: 0
  },
  negativeCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastActionAt: Date
}, { timestamps: true });

UserTopicAffinitySchema.index({ user: 1, topic: 1 }, { unique: true });
UserTopicAffinitySchema.index({ user: 1, score: -1 });
UserTopicAffinitySchema.index({ topic: 1, score: -1 });

module.exports = mongoose.model('UserTopicAffinity', UserTopicAffinitySchema);
