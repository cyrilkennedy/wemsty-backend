// routes/auth.routes.js




// routes/auth.routes.js

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validation.middleware');
const rateLimit = require('express-rate-limit');

// ════════════════════════════════════════════════
// RATE LIMITERS
// ════════════════════════════════════════════════

// Strict rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many authentication attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Moderate rate limiting for other auth routes
const generalAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many requests. Please try again later.'
});

// ════════════════════════════════════════════════
// VALIDATION SCHEMAS
// ════════════════════════════════════════════════

const signupSchema = {
  email: {
    required: true,
    type: 'email',
    message: 'Valid email is required'
  },
  username: {
    required: true,
    type: 'string',
    minLength: 3,
    maxLength: 30,
    pattern: /^[a-zA-Z0-9_]+$/,
    message: 'Username must be 3-30 characters and contain only letters, numbers, and underscores'
  },
  password: {
    required: true,
    type: 'string',
    minLength: 8,
    message: 'Password must be at least 8 characters'
  }
};

const loginSchema = {
  email: {
    required: true,
    type: 'email',
    message: 'Valid email is required'
  },
  password: {
    required: true,
    type: 'string',
    message: 'Password is required'
  }
};

const googleAuthSchema = {
  idToken: {
    required: true,
    type: 'string',
    message: 'Google ID token is required'
  }
};

const changePasswordSchema = {
  currentPassword: {
    required: true,
    type: 'string',
    message: 'Current password is required'
  },
  newPassword: {
    required: true,
    type: 'string',
    minLength: 8,
    message: 'New password must be at least 8 characters'
  }
};

const resetPasswordSchema = {
  token: {
    required: true,
    type: 'string',
    message: 'Reset token is required'
  },
  newPassword: {
    required: true,
    type: 'string',
    minLength: 8,
    message: 'New password must be at least 8 characters'
  }
};

// ════════════════════════════════════════════════
// PUBLIC ROUTES
// ════════════════════════════════════════════════




// ADD THESE ROUTES TO routes/auth.routes.js

// ════════════════════════════════════════════════
// NEW PASSWORD RESET FLOW (WITH OTP)
// ════════════════════════════════════════════════

/**
 * @route   POST /api/auth/password-reset/request
 * @desc    Step 1: Request password reset (sends OTP to email)
 * @access  Public
 */
router.post(
  '/password-reset/request',
  generalAuthLimiter,
  authController.requestPasswordReset
);

/**
 * @route   POST /api/auth/password-reset/verify-otp
 * @desc    Step 2: Verify OTP code
 * @access  Public
 */
router.post(
  '/password-reset/verify-otp',
  generalAuthLimiter,
  authController.verifyPasswordResetOTP
);

/**
 * @route   POST /api/auth/password-reset/reset
 * @desc    Step 3: Reset password with verified token
 * @access  Public
 */
router.post(
  '/password-reset/reset',
  authLimiter,
  authController.resetPasswordWithOTP
);

/**
 * @route   POST /api/auth/password-reset/feedback
 * @desc    Step 4: Submit feedback about password reset
 * @access  Public
 */
router.post(
  '/password-reset/feedback',
  authController.submitPasswordResetFeedback
);

/**
 * @route   POST /api/auth/password-reset/resend-otp
 * @desc    Resend OTP if not received or expired
 * @access  Public
 */
router.post(
  '/password-reset/resend-otp',
  generalAuthLimiter,
  authController.resendPasswordResetOTP
);

// ════════════════════════════════════════════════
// KEEP OLD ROUTES FOR BACKWARD COMPATIBILITY (OPTIONAL)
// ════════════════════════════════════════════════

// You can keep the old forgot-password and reset-password routes
// or remove them if you want to use only the new OTP flow

/**
 * @route   POST /api/auth/signup
 * @desc    Register a new user with email & password
 * @access  Public
 * 
 * 
 */



router.get('/test', (req, res) => res.json({ message: 'Auth routes working' }));



router.post(
  '/signup',
  authLimiter,
  validate(signupSchema),
  authController.signup
);

/**
 * @route   POST /api/auth/login
 * @desc    Login with email & password
 * @access  Public
 */
router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  authController.login
);

/**
 * @route   POST /api/auth/google
 * @desc    Authenticate with Google OAuth
 * @access  Public
 */
router.post(
  '/google',
  authLimiter,
  validate(googleAuthSchema),
  authController.googleAuth
);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public (requires valid refresh token)
 */
router.post(
  '/refresh',
  generalAuthLimiter,
  authMiddleware.verifyRefreshToken,
  authController.refreshToken
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset
 * @access  Public
 */
router.post(
  '/forgot-password',
  generalAuthLimiter,
  authController.forgotPassword
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with token
 * @access  Public
 */
router.post(
  '/reset-password',
  authLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword
);

/**
 * @route   POST /api/auth/verify-email
 * @desc    Verify email address
 * @access  Public
 */
router.post(
  '/verify-email',
  generalAuthLimiter,
  authController.verifyEmail
);

// ════════════════════════════════════════════════
// PROTECTED ROUTES (Require Authentication)
// ════════════════════════════════════════════════

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged-in user
 * @access  Private
 */
router.get(
  '/me',
  authMiddleware.protect,
  authController.getMe
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout from current device
 * @access  Private
 */
router.post(
  '/logout',
  authMiddleware.protect,
  authController.logout
);

/**
 * @route   POST /api/auth/logout-all
 * @desc    Logout from all devices
 * @access  Private
 */
router.post(
  '/logout-all',
  authMiddleware.protect,
  authController.logoutAll
);

/**
 * @route   POST /api/auth/change-password
 * @desc    Change password (when logged in)
 * @access  Private
 */
router.post(
  '/change-password',
  authMiddleware.protect,
  validate(changePasswordSchema),
  authController.changePassword
);

/**
 * @route   POST /api/auth/resend-verification
 * @desc    Resend email verification
 * @access  Private
 */
router.post(
  '/resend-verification',
  authMiddleware.protect,
  authController.resendVerification
);

module.exports = router;



