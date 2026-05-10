const assert = require('node:assert/strict');

const { validatePlunkConfig } = require('../scripts/plunk-smoke-test');

async function runEmailConfigTests() {
  assert.throws(
    () => validatePlunkConfig({}, null),
    /Provide a recipient/
  );

  assert.throws(
    () => validatePlunkConfig({ SMTP_TEST_TO: 'test@example.com' }, 'test@example.com'),
    /Missing PLUNK_API_KEY config/
  );

  const valid = validatePlunkConfig({
    PLUNK_API_KEY: 'plunk_key',
  }, 'test@example.com');

  assert.equal(valid.to, 'test@example.com');
}

module.exports = runEmailConfigTests;
