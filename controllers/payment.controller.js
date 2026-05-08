// controllers/payment.controller.js - Payment controller

const paymentService = require('../services/payment.service');
const { catchAsync } = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const crypto = require('crypto');
const PaymentWebhookEvent = require('../models/PaymentWebhookEvent.model');
const { paymentQueue } = require('../queues');
const { addJob } = require('../services/queue.service');

/**
 * Initialize a payment transaction
 */
exports.initializePayment = catchAsync(async (req, res, next) => {
  const { amount, metadata } = req.body;
  const email = req.user.email;
  const userId = req.user._id;

  if (!amount) {
    return next(new AppError('Amount is required', 400));
  }

  const transactionData = await paymentService.initializeTransaction(email, amount, {
    ...metadata,
    userId: userId.toString()
  });

  res.status(200).json({
    status: 'success',
    data: transactionData
  });
});

/**
 * Verify a payment transaction
 */
exports.verifyPayment = catchAsync(async (req, res, next) => {
  const { reference } = req.params;

  if (!reference) {
    return next(new AppError('Transaction reference is required', 400));
  }

  const verificationData = await paymentService.verifyTransaction(reference);

  res.status(200).json({
    status: 'success',
    data: verificationData
  });
});

/**
 * Paystack Webhook Handler
 */
exports.handleWebhook = catchAsync(async (req, res, next) => {
  // Verify Paystack signature
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const hash = crypto
    .createHmac('sha512', secret)
    .update(req.rawBody || JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    return next(new AppError('Invalid webhook signature', 401));
  }

  const eventType = req.body.event || 'unknown';
  const reference = req.body.data?.reference || null;
  const signature = req.headers['x-paystack-signature'];

  const existingEvent = reference
    ? await PaymentWebhookEvent.findOne({ provider: 'paystack', eventType, reference })
    : null;

  if (existingEvent) {
    return res.status(200).json({
      success: true,
      message: 'Webhook already received',
      data: {
        status: existingEvent.status
      }
    });
  }

  let webhookEvent;
  try {
    webhookEvent = await PaymentWebhookEvent.create({
      eventType,
      reference,
      signature,
      payload: req.body,
      status: 'queued'
    });
  } catch (error) {
    if (error.code === 11000 && reference) {
      const duplicateEvent = await PaymentWebhookEvent.findOne({ provider: 'paystack', eventType, reference });
      return res.status(200).json({
        success: true,
        message: 'Webhook already received',
        data: {
          status: duplicateEvent?.status || 'unknown'
        }
      });
    }
    throw error;
  }

  await addJob(paymentQueue, 'process-paystack-webhook', {
    webhookEventId: webhookEvent._id.toString()
  });

  res.status(200).json({
    success: true,
    message: 'Webhook received'
  });
});

/**
 * Get transaction history (Placeholder)
 */
exports.getTransactionHistory = catchAsync(async (req, res, next) => {
  const PaymentTransaction = require('../models/PaymentTransaction.model');
  const transactions = await PaymentTransaction.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  res.status(200).json({
    success: true,
    data: {
      transactions
    }
  });
});
