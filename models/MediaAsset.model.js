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
    required: true,
    trim: true
  },
  resourceType: {
    type: String,
    enum: ['image', 'video', 'raw'],
    default: 'image'
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  attachedToType: {
    type: String,
    enum: ['post', 'reply', 'user', 'circle', 'message', null],
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
  deletedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

mediaAssetSchema.index({ owner: 1, createdAt: -1 });
mediaAssetSchema.index({ status: 1, attachedToId: 1, createdAt: 1 });

module.exports = mongoose.model('MediaAsset', mediaAssetSchema);
