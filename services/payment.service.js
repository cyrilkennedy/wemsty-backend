// services/payment.service.js - Paystack payment integration service

const paystack = require('paystack')(process.env.PAYSTACK_SECRET_KEY);

class PaymentService {
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

      const response = await new Promise((resolve, reject) => {
        paystack.transaction.initialize({
          email,
          amount: amountInKobo,
          metadata
        }, (error, body) => {
          if (error) return reject(error);
          resolve(body);
        });
      });

      if (!response.status) {
        throw new Error(response.message || 'Failed to initialize Paystack transaction');
      }

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
      const response = await new Promise((resolve, reject) => {
        paystack.transaction.verify(reference, (error, body) => {
          if (error) return reject(error);
          resolve(body);
        });
      });

      if (!response.status) {
        throw new Error(response.message || 'Failed to verify Paystack transaction');
      }

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
      const response = await new Promise((resolve, reject) => {
        paystack.transaction.list(params, (error, body) => {
          if (error) return reject(error);
          resolve(body);
        });
      });

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
      const response = await new Promise((resolve, reject) => {
        paystack.customer.get(email, (error, body) => {
          if (error) return reject(error);
          resolve(body);
        });
      });

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
  async handleWebhook(payload) {
    const event = payload.event;
    const data = payload.data;

    console.log(`🔔 Paystack Webhook received: ${event}`);

    switch (event) {
      case 'charge.success':
        await this.handleSuccessfulCharge(data);
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

  async handleSuccessfulCharge(data) {
    const { reference, amount, customer, metadata } = data;
    console.log(`✅ Payment successful: ${reference} for user ${metadata?.userId || customer.email}`);
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
