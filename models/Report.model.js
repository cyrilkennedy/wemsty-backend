const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  targetType: {
    type: String,
    enum: ['user', 'post', 'circle', 'circle_message', 'dm_message'],
    required: true,
    index: true
  },

  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  reasonCode: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80
  },

  detailsText: {
    type: String,
    default: '',
    maxlength: 1000
  },

  status: {
    type: String,
    enum: ['open', 'triaged', 'actioned', 'dismissed'],
    default: 'open',
    index: true
  },

  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  reviewedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

ReportSchema.index({ status: 1, createdAt: -1 });
ReportSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.model('Report', ReportSchema);
