const { makeQueue } = require('../config/queue');

function makeDisabledQueue(name) {
  return {
    name,
    disabled: true,
    async add() {
      return null;
    },
    async close() {
      return null;
    }
  };
}

function queue(name) {
  const isEnabled = process.env.ENABLE_QUEUES !== 'false' && (process.env.REDIS_URL || process.env.NODE_ENV !== 'production');
  
  if (!isEnabled || process.env.NODE_ENV === 'test') {
    return makeDisabledQueue(name);
  }
  return makeQueue(name);
}

const emailQueue = queue('email');
const notificationQueue = queue('notification');
const searchIndexQueue = queue('search-index');
const feedQueue = queue('feed');
const paymentQueue = queue('payment');
const moderationQueue = queue('moderation');
const mediaQueue = queue('media');
const maintenanceQueue = queue('maintenance');
const deadLetterQueue = queue('dead-letter');

module.exports = {
  emailQueue,
  notificationQueue,
  searchIndexQueue,
  feedQueue,
  paymentQueue,
  moderationQueue,
  mediaQueue,
  maintenanceQueue,
  deadLetterQueue
};
