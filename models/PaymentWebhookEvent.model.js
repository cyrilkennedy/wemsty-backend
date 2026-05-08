const mongoose = require('mongoose');

const PaymentWebhookEventSchema = new mongoose.Schema({
  provider: {
    type: String,
    default: 'paystack',
    index: true
  },
  eventType: {
    type: String,
    required: true,
    index: true
  },
  reference: {
    type: String,
    index: true
  },
  signature: String,
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  status: {
    type: String,
    enum: ['received', 'queued', 'processing', 'processed', 'failed', 'ignored'],
    default: 'received',
    index: true
  },
  processedAt: Date,
  errorMessage: String
}, {
  timestamps: true
});

PaymentWebhookEventSchema.index({ provider: 1, eventType: 1, reference: 1, createdAt: -1 });
PaymentWebhookEventSchema.index(
  { provider: 1, eventType: 1, reference: 1 },
  {
    unique: true,
    partialFilterExpression: {
      reference: { $type: 'string' }
    }
  }
);

module.exports = mongoose.model('PaymentWebhookEvent', PaymentWebhookEventSchema);
