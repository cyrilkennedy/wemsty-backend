const mongoose = require('mongoose');

const CircleMessageSchema = new mongoose.Schema({
  circle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Circle',
    required: true,
    index: true
  },

  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CircleChannel',
    required: true,
    index: true
  },

  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  bodyText: {
    type: String,
    required: true,
    trim: true,
    maxlength: 4000
  },

  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  replyToMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CircleMessage',
    default: null
  },

  moderationState: {
    type: String,
    enum: ['visible', 'hidden', 'removed', 'pending_review'],
    default: 'visible',
    index: true
  }
}, {
  timestamps: true
});

CircleMessageSchema.index({ channel: 1, createdAt: -1 });
CircleMessageSchema.index({ sender: 1, createdAt: -1 });

module.exports = mongoose.model('CircleMessage', CircleMessageSchema);
