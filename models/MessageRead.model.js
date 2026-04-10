const mongoose = require('mongoose');

const MessageReadSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  scopeType: {
    type: String,
    enum: ['dm_conversation', 'channel'],
    required: true,
    index: true
  },

  scopeId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  lastReadMessageId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },

  unreadCountCache: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

MessageReadSchema.index({ user: 1, scopeType: 1, scopeId: 1 }, { unique: true });
MessageReadSchema.index({ user: 1, updatedAt: -1 });

module.exports = mongoose.model('MessageRead', MessageReadSchema);
