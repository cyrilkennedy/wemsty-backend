const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'test-paystack-secret';

const paymentController = require('../controllers/payment.controller');
const paymentService = require('../services/payment.service');
const PaymentWebhookEvent = require('../models/PaymentWebhookEvent.model');
const PaymentTransaction = require('../models/PaymentTransaction.model');
const { paymentQueue } = require('../queues');

function signedWebhookRequest(payload) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest('hex');

  return {
    rawBody,
    body: payload,
    headers: {
      'x-paystack-signature': signature
    }
  };
}

function invokeController(handler, req) {
  return new Promise((resolve) => {
    const response = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        resolve({ error: undefined, response: this });
        return this;
      }
    };

    handler(req, response, (error) => resolve({ error, response }));
  });
}

async function runPaymentWebhookTests() {
  const originalEnableQueuesInTest = process.env.ENABLE_QUEUES_IN_TEST;
  const originalFindOne = PaymentWebhookEvent.findOne;
  const originalCreate = PaymentWebhookEvent.create;
  const originalFindById = PaymentWebhookEvent.findById;
  const originalQueueAdd = paymentQueue.add;
  const originalTransactionFindOne = PaymentTransaction.findOne;
  const originalUpsert = paymentService.upsertTransactionFromPaystack;
  const originalHandleWebhook = paymentService.handleWebhook;

  try {
    process.env.ENABLE_QUEUES_IN_TEST = 'true';
    const payload = {
      event: 'charge.success',
      data: {
        reference: 'test-reference-1',
        status: 'success',
        amount: 500000,
        currency: 'NGN',
        customer: { email: 'payer@example.com' },
        metadata: { userId: '507f1f77bcf86cd799439011' }
      }
    };

    let queuedJob = null;
    let createdEvent = null;

    PaymentWebhookEvent.findOne = async () => null;
    PaymentWebhookEvent.create = async (data) => {
      createdEvent = data;
      return {
        _id: { toString: () => 'webhook-event-id-1' },
        ...data
      };
    };
    paymentQueue.add = async (name, data) => {
      queuedJob = { name, data };
      return queuedJob;
    };

    const accepted = await invokeController(paymentController.handleWebhook, signedWebhookRequest(payload));
    assert.equal(accepted.error, undefined);
    assert.equal(accepted.response.statusCode, 200);
    assert.equal(accepted.response.body.success, true);
    assert.equal(createdEvent.eventType, 'charge.success');
    assert.equal(createdEvent.reference, 'test-reference-1');
    assert.equal(createdEvent.status, 'queued');
    assert.equal(queuedJob.name, 'process-paystack-webhook');
    assert.equal(queuedJob.data.webhookEventId, 'webhook-event-id-1');

    queuedJob = null;
    PaymentWebhookEvent.findOne = async () => ({ status: 'processed' });

    const duplicate = await invokeController(paymentController.handleWebhook, signedWebhookRequest(payload));
    assert.equal(duplicate.error, undefined);
    assert.equal(duplicate.response.statusCode, 200);
    assert.equal(duplicate.response.body.message, 'Webhook already received');
    assert.equal(duplicate.response.body.data.status, 'processed');
    assert.equal(queuedJob, null);

    const invalid = await invokeController(paymentController.handleWebhook, {
      rawBody: Buffer.from(JSON.stringify(payload)),
      body: payload,
      headers: { 'x-paystack-signature': 'bad-signature' }
    });
    assert.equal(invalid.error.statusCode, 401);
    assert.equal(invalid.error.message, 'Invalid webhook signature');

    let upsertCalled = false;
    PaymentTransaction.findOne = async () => ({ status: 'success' });
    paymentService.upsertTransactionFromPaystack = async () => {
      upsertCalled = true;
    };

    const alreadyProcessed = await paymentService.handleSuccessfulCharge(payload.data, {
      webhookEventId: 'webhook-event-id-2'
    });
    assert.equal(alreadyProcessed.status, 'success');
    assert.equal(upsertCalled, false);

    PaymentWebhookEvent.findById = async () => null;
    const missingEvent = await paymentService.processWebhookEvent('missing-id');
    assert.equal(missingEvent, null);

    let handleWebhookCalls = 0;
    const processedEvent = {
      status: 'processed'
    };
    PaymentWebhookEvent.findById = async () => processedEvent;
    paymentService.handleWebhook = async () => {
      handleWebhookCalls += 1;
    };
    const alreadyWebhookProcessed = await paymentService.processWebhookEvent('processed-id');
    assert.equal(alreadyWebhookProcessed, processedEvent);
    assert.equal(handleWebhookCalls, 0);

    const savedStates = [];
    const successEvent = {
      _id: 'success-event-id',
      status: 'queued',
      payload,
      async save() {
        savedStates.push({
          status: this.status,
          processedAt: this.processedAt,
          errorMessage: this.errorMessage
        });
      }
    };
    PaymentWebhookEvent.findById = async () => successEvent;
    paymentService.handleWebhook = async () => {
      handleWebhookCalls += 1;
    };
    const processed = await paymentService.processWebhookEvent('success-event-id');
    assert.equal(processed.status, 'processed');
    assert.ok(processed.processedAt instanceof Date);
    assert.equal(processed.errorMessage, undefined);
    assert.deepEqual(savedStates.map((item) => item.status), ['processing', 'processed']);

    const failedEvent = {
      _id: 'failed-event-id',
      status: 'queued',
      payload,
      async save() {
        return this;
      }
    };
    PaymentWebhookEvent.findById = async () => failedEvent;
    paymentService.handleWebhook = async () => {
      throw new Error('processor exploded');
    };
    await assert.rejects(
      () => paymentService.processWebhookEvent('failed-event-id'),
      /processor exploded/
    );
    assert.equal(failedEvent.status, 'failed');
    assert.equal(failedEvent.errorMessage, 'processor exploded');
  } finally {
    if (originalEnableQueuesInTest === undefined) {
      delete process.env.ENABLE_QUEUES_IN_TEST;
    } else {
      process.env.ENABLE_QUEUES_IN_TEST = originalEnableQueuesInTest;
    }

    PaymentWebhookEvent.findOne = originalFindOne;
    PaymentWebhookEvent.create = originalCreate;
    PaymentWebhookEvent.findById = originalFindById;
    paymentQueue.add = originalQueueAdd;
    PaymentTransaction.findOne = originalTransactionFindOne;
    paymentService.upsertTransactionFromPaystack = originalUpsert;
    paymentService.handleWebhook = originalHandleWebhook;
  }
}

module.exports = runPaymentWebhookTests;
