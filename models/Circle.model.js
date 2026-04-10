const mongoose = require('mongoose');

const CircleSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },

  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },

  description: {
    type: String,
    default: '',
    maxlength: 500
  },

  visibility: {
    type: String,
    enum: ['public', 'private', 'invite_only'],
    default: 'public',
    index: true
  },

  icon: {
    type: String,
    default: null
  },

  banner: {
    type: String,
    default: null
  },

  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],

  pinnedPostIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post'
  }],

  pinnedChannelIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CircleChannel'
  }],

  memberCount: {
    type: Number,
    default: 1,
    min: 0
  },

  channelCount: {
    type: Number,
    default: 1,
    min: 0
  },

  lastActivityAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  settings: {
    allowMemberPosts: {
      type: Boolean,
      default: true
    },
    allowInvites: {
      type: Boolean,
      default: true
    },
    isSensitive: {
      type: Boolean,
      default: false
    }
  },

  moderation: {
    status: {
      type: String,
      enum: ['active', 'restricted', 'hidden', 'removed'],
      default: 'active',
      index: true
    },
    reportCount: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

CircleSchema.index({ visibility: 1, 'moderation.status': 1, memberCount: -1, lastActivityAt: -1 });
CircleSchema.index({ name: 'text', description: 'text', tags: 'text' });

module.exports = mongoose.model('Circle', CircleSchema);
