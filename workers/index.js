require('dotenv').config();

process.env.WORKER_PROCESS = 'true';

const connectDB = require('../config/mongodb');
const redisManager = require('../config/redis');
const { makeWorker } = require('../config/queue');
const logger = require('../config/logger');
const {
  processEmailJob,
  processPaymentJob,
  processSearchIndexJob,
  processFeedJob,
  processNotificationJob,
  processMaintenanceJob,
  buildDeadLetterPayload
} = require('../services/worker-processors.service');
const { deadLetterQueue } = require('../queues');

const workers = [];

async function startWorker() {
  await connectDB();

  try {
    await redisManager.connect();
  } catch (error) {
    logger.warn({ err: error }, 'Redis manager helper unavailable in worker; BullMQ will still use REDIS_URL directly');
  }

  workers.push(makeWorker('email', processEmailJob));
  workers.push(makeWorker('payment', processPaymentJob));
  workers.push(makeWorker('search-index', processSearchIndexJob));
  workers.push(makeWorker('feed', processFeedJob));
  workers.push(makeWorker('notification', processNotificationJob));
  workers.push(makeWorker('maintenance', processMaintenanceJob));

  for (const worker of workers) {
    worker.on('completed', (job) => logger.info({ queue: worker.name, jobId: job.id, jobName: job.name }, 'Job completed'));
    worker.on('failed', async (job, err) => {
      logger.error({ queue: worker.name, jobId: job?.id, jobName: job?.name, attemptsMade: job?.attemptsMade, err }, 'Job failed');

      if (!job || job.attemptsMade < (job.opts?.attempts || 1)) {
        return;
      }

      try {
        await deadLetterQueue.add('failed-job', buildDeadLetterPayload(worker.name, job, err), {
          attempts: 1,
          removeOnComplete: false,
          removeOnFail: false
        });
      } catch (deadLetterError) {
        logger.error({ err: deadLetterError, sourceQueue: worker.name, jobId: job.id }, 'Failed to write dead-letter job');
      }
    });
  }

  logger.info('Wemsty worker started');
}

process.on('SIGTERM', async () => {
  logger.info('Worker SIGTERM received');
  await Promise.all(workers.map((worker) => worker.close()));
  await redisManager.close().catch(() => {});
  process.exit(0);
});

startWorker().catch((error) => {
  logger.error({ err: error }, 'Worker failed to start');
  process.exit(1);
});
