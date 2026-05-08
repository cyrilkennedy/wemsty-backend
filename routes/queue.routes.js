const express = require('express');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const AppError = require('../utils/AppError');
const queues = require('../queues');

const router = express.Router();

function requireQueueDashboardToken(req, res, next) {
  const expectedToken = process.env.QUEUE_DASHBOARD_TOKEN;

  if (!expectedToken) {
    return next(new AppError('Queue dashboard is not configured', 503));
  }

  const token = req.headers['x-queue-dashboard-token'] ||
    req.headers.authorization?.replace(/^Bearer\s+/i, '');

  if (token !== expectedToken) {
    return next(new AppError('Queue dashboard access denied', 403));
  }

  return next();
}

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/api/queues');

createBullBoard({
  queues: [
    queues.emailQueue,
    queues.notificationQueue,
    queues.searchIndexQueue,
    queues.feedQueue,
    queues.paymentQueue,
    queues.moderationQueue,
    queues.mediaQueue,
    queues.maintenanceQueue,
    queues.deadLetterQueue
  ]
    .filter((queue) => !queue.disabled)
    .map((queue) => new BullMQAdapter(queue)),
  serverAdapter
});

router.use(requireQueueDashboardToken, serverAdapter.getRouter());

module.exports = router;
