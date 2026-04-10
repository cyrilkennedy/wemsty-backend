const mongoose = require('mongoose');

const DMConversationSchema = new mongoose.Schema({
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],

  pairKey: {
    type: String,
    required: true,
    unique: true
  },

  lastMessageAt: {
    type: Date,
    default: null,
    index: true
  },

  lastMessagePreview: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

DMConversationSchema.index({ members: 1, lastMessageAt: -1 });

module.exports = mongoose.model('DMConversation', DMConversationSchema);
