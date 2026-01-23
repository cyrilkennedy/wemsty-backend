// models/PasswordResetFeedback.model.js

const mongoose = require('mongoose');

const PasswordResetFeedbackSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  reason: {
    type: String,
    enum: [
      'forgot_password',
      'security_concern',
      'account_compromised',
      'regular_update',
      'other'
    ],
    required: true
  },

  additionalDetails: {
    type: String,
    maxlength: 500
  },

  // Security tracking
  ipAddress: String,
  userAgent: String,
  resetSuccessful: {
    type: Boolean,
    default: true
  }

}, {
  timestamps: true
});

// Index for analytics
PasswordResetFeedbackSchema.index({ user: 1, createdAt: -1 });
PasswordResetFeedbackSchema.index({ reason: 1 });

module.exports = mongoose.model('PasswordResetFeedback', PasswordResetFeedbackSchema);