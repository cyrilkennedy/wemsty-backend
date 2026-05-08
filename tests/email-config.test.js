const assert = require('node:assert/strict');

const { validateBrevoConfig } = require('../scripts/brevo-smoke-test');

async function runEmailConfigTests() {
  assert.throws(
    () => validateBrevoConfig({}, null),
    /Provide a recipient/
  );

  assert.throws(
    () => validateBrevoConfig({ SMTP_TEST_TO: 'test@example.com' }, 'test@example.com'),
    /Missing SMTP config/
  );

  const valid = validateBrevoConfig({
    SMTP_HOST: 'smtp-relay.brevo.com',
    SMTP_PORT: '587',
    SMTP_USER: 'smtp-user',
    SMTP_PASS: 'smtp-key',
    SMTP_FROM: 'noreply@example.com'
  }, 'test@example.com');

  assert.equal(valid.to, 'test@example.com');
}

module.exports = runEmailConfigTests;
