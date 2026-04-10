// controllers/payment.controller.js - Payment controller

const paymentService = require('../services/payment.service');
const { catchAsync } = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const crypto = require('crypto');

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
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    return next(new AppError('Invalid webhook signature', 401));
  }

  // Handle the event
  await paymentService.handleWebhook(req.body);

  res.status(200).json({
    status: 'success',
    message: 'Webhook received'
  });
});

/**
 * Get transaction history (Placeholder)
 */
exports.getTransactionHistory = catchAsync(async (req, res, next) => {
  // In a real app, you'd fetch this from your DB
  // For now, we'll list from Paystack or return an empty list
  res.status(200).json({
    status: 'success',
    data: {
      transactions: []
    }
  });
});
