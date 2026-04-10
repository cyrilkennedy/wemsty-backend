const mongoose = require('mongoose');

const DMMessageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DMConversation',
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

  moderationState: {
    type: String,
    enum: ['visible', 'hidden', 'removed', 'pending_review'],
    default: 'visible',
    index: true
  },

  readBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

DMMessageSchema.index({ conversation: 1, createdAt: -1 });
DMMessageSchema.index({ sender: 1, createdAt: -1 });

module.exports = mongoose.model('DMMessage', DMMessageSchema);
