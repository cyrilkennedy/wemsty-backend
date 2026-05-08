const assert = require('node:assert/strict');

const emailService = require('../utils/emailService');
const paymentService = require('../services/payment.service');
const algoliaService = require('../services/algolia.service');
const feedService = require('../services/feed.service');
const notificationService = require('../services/notification.service');
const maintenanceService = require('../services/maintenance.service');
const { defaultJobOptions } = require('../config/queue');

async function runWorkerProcessorTests() {
  const originalSendOtp = emailService.sendOTPEmailNow;
  const originalProcessWebhook = paymentService.processWebhookEvent;
  const originalSavePost = algoliaService.savePost;
  const originalUpdatePost = algoliaService.updatePost;
  const originalDeletePost = algoliaService.deletePost;
  const originalRefreshTrendingScores = feedService.refreshTrendingScores;
  const originalCreateNotification = notificationService.createNotification;
  const originalRunMaintenanceJob = maintenanceService.runMaintenanceJob;

  try {
    const calls = [];
    emailService.sendOTPEmailNow = async (email, otp, purpose) => {
      calls.push({ type: 'email', email, otp, purpose });
      return { success: true };
    };
    paymentService.processWebhookEvent = async (webhookEventId) => {
      calls.push({ type: 'payment', webhookEventId });
      return { status: 'processed' };
    };
    algoliaService.savePost = async (payload) => {
      calls.push({ type: 'search-save', payload });
    };
    algoliaService.updatePost = async (entityId, payload) => {
      calls.push({ type: 'search-update', entityId, payload });
    };
    algoliaService.deletePost = async (entityId) => {
      calls.push({ type: 'search-delete', entityId });
    };
    feedService.refreshTrendingScores = async (data) => {
      calls.push({ type: 'feed-refresh', data });
    };
    notificationService.createNotification = async (data) => {
      calls.push({ type: 'notification', data });
    };
    maintenanceService.runMaintenanceJob = async (name, data) => {
      calls.push({ type: 'maintenance', name, data });
    };

    delete require.cache[require.resolve('../services/worker-processors.service')];
    const processors = require('../services/worker-processors.service');

    await processors.processEmailJob({ name: 'otp', data: { email: 'a@example.com', otp: '123456', purpose: 'login' } });
    await processors.processPaymentJob({ name: 'process-paystack-webhook', data: { webhookEventId: 'event-1' } });
    await processors.processSearchIndexJob({ name: 'index-entity', data: { action: 'save', entityType: 'post', payload: { id: 'post-1' } } });
    await processors.processSearchIndexJob({ name: 'index-entity', data: { action: 'update', entityType: 'post', entityId: 'post-1', payload: { title: 'x' } } });
    await processors.processSearchIndexJob({ name: 'index-entity', data: { action: 'delete', entityType: 'post', entityId: 'post-1' } });
    await processors.processFeedJob({ name: 'refresh-trending-scores', data: { days: 1 } });
    await processors.processNotificationJob({ name: 'create-notification', data: { recipient: 'user-1', type: 'like' } });
    await processors.processMaintenanceJob({ name: 'hourly-cleanup', data: { now: '2026-05-08T00:00:00.000Z' } });

    assert.deepEqual(calls.map((call) => call.type), [
      'email',
      'payment',
      'search-save',
      'search-update',
      'search-delete',
      'feed-refresh',
      'notification',
      'maintenance'
    ]);

    await assert.rejects(
      () => processors.processPaymentJob({ name: 'unknown-payment-job', data: {} }),
      /Unknown payment job/
    );

    const error = new Error('final failure');
    const failedAt = new Date('2026-05-08T10:00:00.000Z');
    const deadLetter = processors.buildDeadLetterPayload(
      'payment',
      {
        id: 'job-1',
        name: 'process-paystack-webhook',
        attemptsMade: 3,
        data: { webhookEventId: 'event-1' }
      },
      error,
      failedAt
    );

    assert.equal(deadLetter.sourceQueue, 'payment');
    assert.equal(deadLetter.sourceJobName, 'process-paystack-webhook');
    assert.equal(deadLetter.failedReason, 'final failure');
    assert.equal(deadLetter.failedAt, failedAt.toISOString());
    assert.deepEqual(deadLetter.data, { webhookEventId: 'event-1' });

    assert.equal(defaultJobOptions.attempts >= 1, true);
    assert.equal(defaultJobOptions.backoff.type, 'exponential');
    assert.equal(typeof defaultJobOptions.backoff.delay, 'number');
  } finally {
    emailService.sendOTPEmailNow = originalSendOtp;
    paymentService.processWebhookEvent = originalProcessWebhook;
    algoliaService.savePost = originalSavePost;
    algoliaService.updatePost = originalUpdatePost;
    algoliaService.deletePost = originalDeletePost;
    feedService.refreshTrendingScores = originalRefreshTrendingScores;
    notificationService.createNotification = originalCreateNotification;
    maintenanceService.runMaintenanceJob = originalRunMaintenanceJob;
    delete require.cache[require.resolve('../services/worker-processors.service')];
  }
}

module.exports = runWorkerProcessorTests;
