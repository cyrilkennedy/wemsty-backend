const mongoose = require('mongoose');

const mediaAssetSchema = new mongoose.Schema({
  publicId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  url: {
    type: String,
    required: function() {
      return this.resourceType !== 'text';
    },
    trim: true
  },
  resourceType: {
    type: String,
    enum: ['image', 'video', 'raw', 'text'],
    default: 'image'
  },
  usage: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 80,
    match: [/^[a-z0-9][a-z0-9_-]*$/, 'usage must be a lowercase slug'],
    default: 'general'
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  attachedToType: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 80,
    match: [/^[a-z0-9][a-z0-9_-]*$/, 'attachedToType must be a lowercase slug'],
    default: null
  },
  attachedToId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true
  },
  status: {
    type: String,
    enum: ['uploaded', 'attached', 'deleted', 'cleanup_failed'],
    default: 'uploaded',
    index: true
  },
  cleanupError: {
    type: String,
    default: null
  },
  text: {
    type: String,
    maxlength: 20000,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 60
  }],
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

mediaAssetSchema.index({ owner: 1, createdAt: -1 });
mediaAssetSchema.index({ owner: 1, usage: 1, createdAt: -1 });
mediaAssetSchema.index({ status: 1, attachedToId: 1, createdAt: 1 });

module.exports = mongoose.model('MediaAsset', mediaAssetSchema);
