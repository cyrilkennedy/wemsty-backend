const mongoose = require('mongoose');

const ModerationActionSchema = new mongoose.Schema({
  targetType: {
    type: String,
    enum: ['user', 'post', 'circle', 'circle_message', 'dm_message'],
    required: true,
    index: true
  },

  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  actionType: {
    type: String,
    enum: ['warn', 'hide', 'remove', 'suspend_user', 'ban_from_circle', 'dismiss_report'],
    required: true,
    index: true
  },

  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  report: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report',
    default: null
  },

  reasonText: {
    type: String,
    default: '',
    maxlength: 500
  },

  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

ModerationActionSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.model('ModerationAction', ModerationActionSchema);
