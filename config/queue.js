const { Queue, Worker, QueueEvents } = require('bullmq');
const IORedis = require('ioredis');

function makeConnection() {
  return new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });
}

const defaultJobOptions = {
  attempts: Number(process.env.QUEUE_JOB_ATTEMPTS || 3),
  backoff: {
    type: 'exponential',
    delay: Number(process.env.QUEUE_BACKOFF_MS || 5000)
  },
  removeOnComplete: {
    age: Number(process.env.QUEUE_REMOVE_COMPLETE_SECONDS || 86400),
    count: Number(process.env.QUEUE_REMOVE_COMPLETE_COUNT || 1000)
  },
  removeOnFail: false
};

function makeQueue(name) {
  return new Queue(name, {
    connection: makeConnection(),
    defaultJobOptions
  });
}

function makeWorker(name, processor, options = {}) {
  return new Worker(name, processor, {
    connection: makeConnection(),
    concurrency: Number(options.concurrency || process.env.QUEUE_CONCURRENCY || 5),
    limiter: options.limiter
  });
}

function makeQueueEvents(name) {
  return new QueueEvents(name, {
    connection: makeConnection()
  });
}

module.exports = {
  makeQueue,
  makeWorker,
  makeQueueEvents,
  defaultJobOptions
};
