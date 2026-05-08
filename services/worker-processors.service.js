const { sendOTPEmailNow, sendPasswordResetSuccessEmailNow } = require('../utils/emailService');
const paymentService = require('./payment.service');
const maintenanceService = require('./maintenance.service');
const algoliaService = require('./algolia.service');
const feedService = require('./feed.service');
const {
  createNotification,
  fanoutPostNotification,
  fanoutMentionNotification,
  fanoutCircleNotification
} = require('./notification.service');

async function processEmailJob(job) {
  if (job.name === 'otp') {
    return sendOTPEmailNow(job.data.email, job.data.otp, job.data.purpose);
  }

  if (job.name === 'password-reset-success') {
    return sendPasswordResetSuccessEmailNow(job.data.email);
  }

  throw new Error(`Unknown email job: ${job.name}`);
}

async function processPaymentJob(job) {
  if (job.name === 'process-paystack-webhook') {
    return paymentService.processWebhookEvent(job.data.webhookEventId);
  }

  throw new Error(`Unknown payment job: ${job.name}`);
}

async function processSearchIndexJob(job) {
  const { action, entityType, payload, entityId } = job.data;
  if (entityType === 'post') {
    if (action === 'delete') {
      return algoliaService.deletePost(entityId);
    }
    if (action === 'update') {
      return algoliaService.updatePost(entityId, payload);
    }
    return algoliaService.savePost(payload);
  }
  if (entityType === 'user') {
    return algoliaService.saveUser(payload);
  }
  if (entityType === 'circle') {
    return algoliaService.saveCircle(payload);
  }
  return null;
}

async function processFeedJob(job) {
  if (job.name === 'update-post-engagement') {
    return feedService.updatePostEngagement(job.data.postId);
  }
  if (job.name === 'process-new-post') {
    return feedService.processNewPost(job.data.post);
  }
  if (job.name === 'refresh-trending-scores') {
    return feedService.refreshTrendingScores(job.data);
  }
  if (job.name === 'refresh-hot-feed-cache') {
    return feedService.refreshHotFeedCache(job.data);
  }
  throw new Error(`Unknown feed job: ${job.name}`);
}

async function processNotificationJob(job) {
  if (job.name === 'create-notification') {
    return createNotification(job.data);
  }
  if (job.name === 'fanout-post-notification') {
    return fanoutPostNotification(job.data);
  }
  if (job.name === 'fanout-mention-notification') {
    return fanoutMentionNotification(job.data);
  }
  if (job.name === 'fanout-circle-notification') {
    return fanoutCircleNotification(job.data);
  }
  throw new Error(`Unknown notification job: ${job.name}`);
}

async function processMaintenanceJob(job) {
  return maintenanceService.runMaintenanceJob(job.name, job.data);
}

function buildDeadLetterPayload(workerName, job, err, failedAt = new Date()) {
  return {
    sourceQueue: workerName,
    sourceJobId: job.id,
    sourceJobName: job.name,
    attemptsMade: job.attemptsMade,
    failedReason: err.message,
    stack: err.stack,
    data: job.data,
    failedAt: failedAt.toISOString()
  };
}

module.exports = {
  processEmailJob,
  processPaymentJob,
  processSearchIndexJob,
  processFeedJob,
  processNotificationJob,
  processMaintenanceJob,
  buildDeadLetterPayload
};
