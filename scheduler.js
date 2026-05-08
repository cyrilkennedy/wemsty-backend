require('dotenv').config();

const cron = require('node-cron');
const connectDB = require('./config/mongodb');
const redisManager = require('./config/redis');
const logger = require('./config/logger');
const { maintenanceQueue, feedQueue } = require('./queues');
const { addJob } = require('./services/queue.service');

async function startScheduler() {
  await connectDB();

  try {
    await redisManager.connect();
  } catch (error) {
    logger.warn({ err: error }, 'Redis helper unavailable in scheduler');
  }

  cron.schedule('* * * * *', async () => {
    await addJob(maintenanceQueue, 'stale-presence-cleanup', { at: new Date().toISOString() });
  });

  cron.schedule('*/5 * * * *', async () => {
    await addJob(feedQueue, 'refresh-trending-scores', { at: new Date().toISOString() });
  });

  cron.schedule('*/15 * * * *', async () => {
    await addJob(feedQueue, 'refresh-hot-feed-cache', { at: new Date().toISOString() });
  });

  cron.schedule('0 * * * *', async () => {
    await addJob(maintenanceQueue, 'hourly-cleanup', { at: new Date().toISOString() });
  });

  cron.schedule('0 2 * * *', async () => {
    await addJob(maintenanceQueue, 'counter-reconciliation', { at: new Date().toISOString() });
    await addJob(maintenanceQueue, 'orphan-media-cleanup', { at: new Date().toISOString() });
    await addJob(maintenanceQueue, 'notification-archive', { at: new Date().toISOString() });
    await addJob(maintenanceQueue, 'payment-verification-sweep', { at: new Date().toISOString() });
    await addJob(maintenanceQueue, 'algolia-repair', { at: new Date().toISOString() });
  });

  logger.info('Wemsty scheduler started');
}

process.on('SIGTERM', async () => {
  logger.info('Scheduler SIGTERM received');
  await redisManager.close().catch(() => {});
  process.exit(0);
});

startScheduler().catch((error) => {
  logger.error({ err: error }, 'Scheduler failed to start');
  process.exit(1);
});
