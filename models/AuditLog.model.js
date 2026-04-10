const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },

  actionType: {
    type: String,
    required: true,
    trim: true,
    index: true
  },

  objectType: {
    type: String,
    required: true,
    trim: true,
    index: true
  },

  objectId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true
  },

  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

AuditLogSchema.index({ actionType: 1, createdAt: -1 });
AuditLogSchema.index({ objectType: 1, objectId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
