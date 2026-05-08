const assert = require('node:assert/strict');

const notificationService = require('../services/notification.service');
const Follow = require('../models/Follow.model');
const Notification = require('../models/Notification.model');
const UserProfile = require('../models/UserProfile.model');
const { notificationQueue } = require('../queues');

function chainLean(items) {
  return {
    select() {
      return this;
    },
    lean() {
      return Promise.resolve(items);
    }
  };
}

async function runNotificationFanoutTests() {
  const originalFollowFind = Follow.find;
  const originalProfileFind = UserProfile.find;
  const originalNotificationFind = Notification.find;
  const originalInsertMany = Notification.insertMany;
  const originalQueueAdd = notificationQueue.add;
  const originalEnableQueuesInTest = process.env.ENABLE_QUEUES_IN_TEST;

  try {
    process.env.ENABLE_QUEUES_IN_TEST = 'true';
    Follow.find = () => chainLean([
      { follower: 'user-1' },
      { follower: 'user-2' },
      { follower: 'actor-1' }
    ]);
    UserProfile.find = () => chainLean([
      {
        user: 'user-2',
        notificationSettings: { notifyOnReaction: false }
      }
    ]);
    Notification.find = () => chainLean([]);

    let inserted = [];
    Notification.insertMany = async (docs) => {
      inserted = docs;
      return docs;
    };

    const result = await notificationService.fanoutPostNotification({
      actor: 'actor-1',
      type: 'like',
      objectType: 'post',
      objectId: 'post-1',
      previewText: 'A new post',
      batchSize: 2
    });

    assert.equal(result.recipients, 2);
    assert.equal(result.inserted, 1);
    assert.equal(result.skipped, 1);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].recipient, 'user-1');
    assert.equal(inserted[0].type, 'like');

    Notification.find = () => chainLean([
      {
        recipient: 'user-1',
        actor: 'actor-1',
        type: 'like',
        objectType: 'post',
        objectId: 'post-1'
      }
    ]);
    inserted = [];

    const duplicate = await notificationService.fanoutPostNotification({
      actor: 'actor-1',
      type: 'like',
      objectType: 'post',
      objectId: 'post-1',
      batchSize: 2
    });

    assert.equal(duplicate.inserted, 0);
    assert.equal(inserted.length, 0);

    const queuedJobs = [];
    notificationQueue.add = async (name, data) => {
      queuedJobs.push({ name, data });
      return { name, data };
    };

    await notificationService.queueFanoutPostNotification({
      actor: 'actor-1',
      objectId: 'post-2',
      previewText: 'New public post'
    });
    await notificationService.queueFanoutMentionNotification({
      actor: 'actor-1',
      text: 'Hello @user_1',
      objectType: 'post',
      objectId: 'post-2'
    });
    const noMentions = await notificationService.queueFanoutMentionNotification({
      actor: 'actor-1',
      text: 'No mentions here'
    });
    await notificationService.queueFanoutCircleNotification({
      actor: 'actor-1',
      circle: 'circle-1',
      previewText: 'Circle update'
    });

    assert.deepEqual(queuedJobs.map((job) => job.name), [
      'fanout-post-notification',
      'fanout-mention-notification',
      'fanout-circle-notification'
    ]);
    assert.equal(noMentions.queued, false);
  } finally {
    if (originalEnableQueuesInTest === undefined) {
      delete process.env.ENABLE_QUEUES_IN_TEST;
    } else {
      process.env.ENABLE_QUEUES_IN_TEST = originalEnableQueuesInTest;
    }

    Follow.find = originalFollowFind;
    UserProfile.find = originalProfileFind;
    Notification.find = originalNotificationFind;
    Notification.insertMany = originalInsertMany;
    notificationQueue.add = originalQueueAdd;
  }
}

module.exports = runNotificationFanoutTests;
