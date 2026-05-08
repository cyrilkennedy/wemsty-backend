const logger = require('../config/logger');

function queuesEnabled() {
  if (process.env.NODE_ENV === 'test') {
    return process.env.ENABLE_QUEUES_IN_TEST === 'true';
  }

  return process.env.ENABLE_QUEUES !== 'false' && process.env.NODE_ENV !== 'test';
}

async function addJob(queue, name, data, options = {}) {
  if (!queuesEnabled()) {
    return null;
  }

  try {
    return await queue.add(name, data, options);
  } catch (error) {
    logger.error({ err: error, queue: queue.name, job: name }, 'Failed to enqueue job');
    if (process.env.QUEUE_FAIL_CLOSED === 'true') {
      throw error;
    }
    return null;
  }
}

module.exports = {
  addJob,
  queuesEnabled
};
