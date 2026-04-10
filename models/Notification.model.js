const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  type: {
    type: String,
    enum: [
      'follow',
      'like',
      'reply',
      'repost',
      'mention',
      'dm',
      'channel_mention',
      'invite',
      'circle_activity'
    ],
    required: true,
    index: true
  },

  objectType: {
    type: String,
    enum: ['post', 'circle', 'channel', 'circle_message', 'dm_conversation', 'dm_message', 'user'],
    default: null
  },

  objectId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },

  circle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Circle',
    default: null
  },

  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CircleChannel',
    default: null
  },

  previewText: {
    type: String,
    default: '',
    maxlength: 280
  },

  readAt: {
    type: Date,
    default: null,
    index: true
  }
}, {
  timestamps: true
});

NotificationSchema.index({ recipient: 1, createdAt: -1 });
NotificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
