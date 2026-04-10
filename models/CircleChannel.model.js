const mongoose = require('mongoose');

const CircleChannelSchema = new mongoose.Schema({
  circle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Circle',
    required: true,
    index: true
  },

  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 60
  },

  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },

  kind: {
    type: String,
    enum: ['text', 'announcement'],
    default: 'text'
  },

  topic: {
    type: String,
    default: '',
    maxlength: 240
  },

  position: {
    type: Number,
    default: 0
  },

  visibility: {
    type: String,
    enum: ['public', 'members_only'],
    default: 'members_only'
  },

  isDefault: {
    type: Boolean,
    default: false
  },

  isPinned: {
    type: Boolean,
    default: false,
    index: true
  },

  lastMessageAt: {
    type: Date,
    default: null,
    index: true
  }
}, {
  timestamps: true
});

CircleChannelSchema.index({ circle: 1, slug: 1 }, { unique: true });
CircleChannelSchema.index({ circle: 1, position: 1, createdAt: 1 });

module.exports = mongoose.model('CircleChannel', CircleChannelSchema);
