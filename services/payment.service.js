// services/payment.service.js - Paystack payment integration service

const PaymentTransaction = require('../models/PaymentTransaction.model');
const PaymentWebhookEvent = require('../models/PaymentWebhookEvent.model');
const { createPaystackClient } = require('./paystack-client.service');

class PaymentService {
  constructor(paystackClient = createPaystackClient()) {
    this.paystackClient = paystackClient;
  }

  /**
   * Initialize a transaction
   * @param {string} email - Customer email
   * @param {number} amount - Amount in Naira (will be converted to Kobo)
   * @param {Object} metadata - Optional metadata (e.g. { userId, planId })
   */
  async initializeTransaction(email, amount, metadata = {}) {
    try {
      // Paystack expects amount in kobo
      const amountInKobo = amount * 100;

      const response = await this.paystackClient.initializeTransaction({
        email,
        amount: amountInKobo,
        metadata
      });

      if (!response.status) {
        throw new Error(response.message || 'Failed to initialize Paystack transaction');
      }

      await PaymentTransaction.findOneAndUpdate(
        { reference: response.data.reference },
        {
          $setOnInsert: {
            provider: 'paystack',
            reference: response.data.reference,
            user: metadata.userId || undefined,
            email,
            amount: amountInKobo,
            currency: response.data.currency || 'NGN',
            status: 'pending',
            authorizationUrl: response.data.authorization_url,
            accessCode: response.data.access_code,
            metadata,
            raw: response.data
          }
        },
        { upsert: true, new: true }
      );

      return response.data;
    } catch (error) {
      console.error('❌ Paystack initialize error:', error.message);
      throw error;
    }
  }

  /**
   * Verify a transaction
   * @param {string} reference - Transaction reference
   */
  async verifyTransaction(reference) {
    try {
      const response = await this.paystackClient.verifyTransaction(reference);

      if (!response.status) {
        throw new Error(response.message || 'Failed to verify Paystack transaction');
      }

      await this.upsertTransactionFromPaystack(response.data);

      return response.data;
    } catch (error) {
      console.error('❌ Paystack verify error:', error.message);
      throw error;
    }
  }

  /**
   * List transactions
   */
  async listTransactions(params = {}) {
    try {
      const response = await this.paystackClient.listTransactions(params);

      return response.data;
    } catch (error) {
      console.error('❌ Paystack listTransactions error:', error.message);
      throw error;
    }
  }

  /**
   * Get customer details
   */
  async getCustomer(email) {
    try {
      const response = await this.paystackClient.getCustomer(email);

      return response.data;
    } catch (error) {
      console.error('❌ Paystack getCustomer error:', error.message);
      throw error;
    }
  }

  /**
   * Create a dedicated virtual account
   */
  async createDedicatedAccount(customerId) {
    // Note: Dedicated accounts might require different setup in the package
    // or manual axios call to /dedicated_account
    console.log('Dedicated account creation requested for:', customerId);
    // Placeholder for now
    return null;
  }

  /**
   * Handle Paystack Webhook
   * @param {Object} payload - Webhook event body
   */
  async handleWebhook(payload, context = {}) {
    const event = payload.event;
    const data = payload.data;

    console.log(`🔔 Paystack Webhook received: ${event}`);

    switch (event) {
      case 'charge.success':
        await this.handleSuccessfulCharge(data, context);
        break;
      case 'transfer.success':
        await this.handleSuccessfulTransfer(data);
        break;
      case 'transfer.failed':
        await this.handleFailedTransfer(data);
        break;
      default:
        console.log(`Unhandled Paystack event: ${event}`);
    }

    return true;
  }

  async processWebhookEvent(webhookEventId) {
    const webhookEvent = await PaymentWebhookEvent.findById(webhookEventId);
    if (!webhookEvent) {
      return null;
    }

    if (webhookEvent.status === 'processed') {
      return webhookEvent;
    }

    webhookEvent.status = 'processing';
    await webhookEvent.save();

    try {
      await this.handleWebhook(webhookEvent.payload, {
        webhookEventId: webhookEvent._id
      });
      webhookEvent.status = 'processed';
      webhookEvent.processedAt = new Date();
      webhookEvent.errorMessage = undefined;
      await webhookEvent.save();
      return webhookEvent;
    } catch (error) {
      webhookEvent.status = 'failed';
      webhookEvent.errorMessage = error.message;
      await webhookEvent.save();
      throw error;
    }
  }

  async upsertTransactionFromPaystack(data, context = {}) {
    if (!data?.reference) {
      return null;
    }

    const metadata = data.metadata || {};
    const status = data.status === 'success' ? 'success' : data.status || 'pending';

    return PaymentTransaction.findOneAndUpdate(
      { reference: data.reference },
      {
        $set: {
          provider: 'paystack',
          user: metadata.userId || undefined,
          email: data.customer?.email,
          amount: data.amount,
          currency: data.currency || 'NGN',
          status,
          providerStatus: data.status,
          metadata,
          paidAt: data.paid_at ? new Date(data.paid_at) : undefined,
          verifiedAt: new Date(),
          lastWebhookEvent: context.webhookEventId || undefined,
          webhookProcessedAt: context.webhookEventId ? new Date() : undefined,
          raw: data
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  async handleSuccessfulCharge(data, context = {}) {
    const { reference, amount, customer, metadata } = data;
    console.log(`✅ Payment successful: ${reference} for user ${metadata?.userId || customer.email}`);
    const existingTransaction = await PaymentTransaction.findOne({ reference });
    if (existingTransaction?.status === 'success') {
      return existingTransaction;
    }

    return this.upsertTransactionFromPaystack(data, context);
    // Update user subscription, credit balance, or mark order as paid in DB
  }

  async handleSuccessfulTransfer(data) {
    console.log(`💸 Transfer successful: ${data.reference}`);
  }

  async handleFailedTransfer(data) {
    console.log(`❌ Transfer failed: ${data.reference}`);
  }
}

module.exports = new PaymentService();
