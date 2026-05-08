const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ENABLE_RATE_LIMITING = 'false';
process.env.ENABLE_QUEUES = 'false';

const app = require('../server');

async function runHealthTests() {
  const health = await request(app).get('/api/health').expect(200);
  assert.equal(health.body.success, true);
  assert.equal(health.body.message, 'Wemsty Backend is running');
  assert.equal(health.body.data.version, process.env.API_VERSION || '4.0');

  const jsonHealth = await request(app)
    .get('/api/health')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200);
  assert.equal(jsonHealth.body.success, true);
  assert.equal(jsonHealth.body.message, 'Wemsty Backend is running');

  const originalSmtpFrom = process.env.SMTP_FROM;
  const originalJwtSecret = process.env.JWT_ACCESS_SECRET;
  process.env.SMTP_FROM = 'status@wemsty.test';
  process.env.JWT_ACCESS_SECRET = 'super-secret-health-test-value';

  const htmlHealth = await request(app)
    .get('/api/health')
    .set('Accept', 'text/html')
    .expect('Content-Type', /html/)
    .expect(200);
  assert.match(htmlHealth.text, /Wemsty is running/);
  assert.match(htmlHealth.text, /status@wemsty\.test/);
  assert.doesNotMatch(htmlHealth.text, /super-secret-health-test-value/);

  if (originalSmtpFrom === undefined) {
    delete process.env.SMTP_FROM;
  } else {
    process.env.SMTP_FROM = originalSmtpFrom;
  }

  if (originalJwtSecret === undefined) {
    delete process.env.JWT_ACCESS_SECRET;
  } else {
    process.env.JWT_ACCESS_SECRET = originalJwtSecret;
  }

  const notFound = await request(app).get('/api/does-not-exist').expect(404);
  assert.equal(notFound.body.success, false);
  assert.equal(notFound.body.code, 'ROUTE_NOT_FOUND');
}

module.exports = runHealthTests;
