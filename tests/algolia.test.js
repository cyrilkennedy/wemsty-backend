const assert = require('node:assert/strict');

const algoliaService = require('../services/algolia.service');
const { searchIndexQueue } = require('../queues');

async function runAlgoliaTests() {
  const originalAdd = searchIndexQueue.add;
  const originalEnableQueuesInTest = process.env.ENABLE_QUEUES_IN_TEST;
  const originalWorkerProcess = process.env.WORKER_PROCESS;

  try {
    process.env.ENABLE_QUEUES_IN_TEST = 'true';
    process.env.WORKER_PROCESS = 'false';

    const jobs = [];
    searchIndexQueue.add = async (name, data) => {
      jobs.push({ name, data });
    };

    await algoliaService.savePost({
      _id: { toString: () => 'public-post-1' },
      author: { toString: () => 'user-1' },
      postType: 'original',
      visibility: 'public',
      status: 'active',
      content: { text: 'Public searchable post' },
      engagement: {},
      createdAt: new Date()
    });

    await algoliaService.savePost({
      _id: { toString: () => 'private-post-1' },
      author: { toString: () => 'user-1' },
      postType: 'original',
      visibility: 'private',
      status: 'active'
    });

    await algoliaService.updatePost('hidden-post-1', { status: 'hidden' });
    await algoliaService.updatePost('followers-post-1', { visibility: 'followers' });

    assert.deepEqual(jobs.map((job) => job.data.action), ['save', 'delete', 'delete', 'delete']);
    assert.equal(jobs[0].data.entityType, 'post');
    assert.equal(jobs[1].data.entityId, 'private-post-1');
    assert.equal(jobs[2].data.entityId, 'hidden-post-1');
    assert.equal(jobs[3].data.entityId, 'followers-post-1');
  } finally {
    if (originalEnableQueuesInTest === undefined) {
      delete process.env.ENABLE_QUEUES_IN_TEST;
    } else {
      process.env.ENABLE_QUEUES_IN_TEST = originalEnableQueuesInTest;
    }

    if (originalWorkerProcess === undefined) {
      delete process.env.WORKER_PROCESS;
    } else {
      process.env.WORKER_PROCESS = originalWorkerProcess;
    }

    searchIndexQueue.add = originalAdd;
  }
}

module.exports = runAlgoliaTests;
