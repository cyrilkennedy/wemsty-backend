const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.ENABLE_QUEUES = 'false';

const app = require('../server');
const queues = require('../queues');

async function runQueueTests() {
  assert.ok(queues.deadLetterQueue);
  assert.equal(queues.deadLetterQueue.name, 'dead-letter');

  const notConfigured = await request(app).get('/api/queues').expect(503);
  assert.equal(notConfigured.body.success, false);
  assert.equal(notConfigured.body.message, 'Queue dashboard is not configured');

  process.env.QUEUE_DASHBOARD_TOKEN = 'test-queue-dashboard-token';

  const forbidden = await request(app).get('/api/queues').expect(403);
  assert.equal(forbidden.body.success, false);
  assert.equal(forbidden.body.message, 'Queue dashboard access denied');

  delete process.env.QUEUE_DASHBOARD_TOKEN;
}

module.exports = runQueueTests;
