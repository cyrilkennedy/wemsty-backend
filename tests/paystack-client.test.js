const assert = require('node:assert/strict');

const { PaystackClient } = require('../services/paystack-client.service');

function createJsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

async function runPaystackClientTests() {
  const calls = [];
  const client = new PaystackClient({
    secretKey: 'test-secret',
    baseUrl: 'https://paystack.test/',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return createJsonResponse(200, {
        status: true,
        data: {
          reference: 'ref-1',
          authorization_url: 'https://checkout.test/ref-1',
          access_code: 'access-1'
        }
      });
    }
  });

  const initialized = await client.initializeTransaction({
    email: 'payer@example.com',
    amount: 500000,
    metadata: { userId: 'user-1' }
  });

  assert.equal(initialized.data.reference, 'ref-1');
  assert.equal(calls[0].url, 'https://paystack.test/transaction/initialize');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-secret');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    email: 'payer@example.com',
    amount: 500000,
    metadata: { userId: 'user-1' }
  });

  await client.verifyTransaction('ref/with space');
  assert.equal(calls[1].url, 'https://paystack.test/transaction/verify/ref%2Fwith%20space');
  assert.equal(calls[1].options.method, 'GET');

  const failingClient = new PaystackClient({
    secretKey: 'test-secret',
    baseUrl: 'https://paystack.test',
    fetchImpl: async () => createJsonResponse(400, {
      status: false,
      message: 'Invalid transaction'
    })
  });

  await assert.rejects(
    () => failingClient.verifyTransaction('bad-ref'),
    /Invalid transaction/
  );

  const missingSecretClient = new PaystackClient({
    secretKey: '',
    fetchImpl: async () => createJsonResponse(200, { status: true })
  });

  await assert.rejects(
    () => missingSecretClient.verifyTransaction('ref-1'),
    /PAYSTACK_SECRET_KEY/
  );
}

module.exports = runPaystackClientTests;
