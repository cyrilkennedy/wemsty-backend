const mongoose = require('mongoose');

const PaymentTransactionSchema = new mongoose.Schema({
  provider: {
    type: String,
    default: 'paystack',
    index: true
  },
  reference: {
    type: String,
    required: true,
    unique: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  email: String,
  amount: Number,
  currency: {
    type: String,
    default: 'NGN'
  },
  status: {
    type: String,
    enum: ['pending', 'success', 'failed', 'abandoned', 'reversed'],
    default: 'pending',
    index: true
  },
  providerStatus: String,
  authorizationUrl: String,
  accessCode: String,
  metadata: mongoose.Schema.Types.Mixed,
  paidAt: Date,
  verifiedAt: Date,
  lastWebhookEvent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentWebhookEvent'
  },
  webhookProcessedAt: Date,
  raw: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

PaymentTransactionSchema.index({ user: 1, createdAt: -1 });
PaymentTransactionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('PaymentTransaction', PaymentTransactionSchema);
