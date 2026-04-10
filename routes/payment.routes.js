// routes/payment.routes.js - Payment API routes

const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const authMiddleware = require('../middlewares/auth.middleware');

/**
 * @route   POST /api/payments/webhook
 * @desc    Paystack webhook (No auth, uses signature verification)
 * @access  Public
 */
router.post('/webhook', paymentController.handleWebhook);

// Protect all following routes
router.use(authMiddleware.protect);

/**
 * @route   POST /api/payments/initialize
 * @desc    Initialize a payment
 * @access  Private
 */
router.post('/initialize', paymentController.initializePayment);

/**
 * @route   GET /api/payments/verify/:reference
 * @desc    Verify a payment
 * @access  Private
 */
router.get('/verify/:reference', paymentController.verifyPayment);

/**
 * @route   GET /api/payments/history
 * @desc    Get transaction history
 * @access  Private
 */
router.get('/history', paymentController.getTransactionHistory);

module.exports = router;
