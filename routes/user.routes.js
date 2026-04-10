// routes/user.routes.js

const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// ════════════════════════════════════════════════
// PUBLIC USER INFO (OPTIONAL AUTH)
// ════════════════════════════════════════════════

/**
 * @route   GET /api/users/:username
 * @desc    Get public user profile by username
 * @access  Public
 */
router.get(
  '/handle/:username',
  authMiddleware.optionalAuth,
  userController.getUserByUsername
);

// ════════════════════════════════════════════════
// ALL ROUTES BELOW REQUIRE AUTHENTICATION
// ════════════════════════════════════════════════
router.use(authMiddleware.protect);

// ════════════════════════════════════════════════
// USER PROFILE ROUTES
// ════════════════════════════════════════════════

/**
 * @route   GET /api/users/profile
 * @desc    Get current user's full profile
 * @access  Private
 */
router.get('/profile', userController.getProfile);

/**
 * @route   PATCH /api/users/profile
 * @desc    Update current user's profile
 * @access  Private
 */
router.patch('/profile', userController.updateProfile);

/**
 * @route   DELETE /api/users/account
 * @desc    Delete/deactivate user account
 * @access  Private
 */
router.delete('/account', userController.deleteAccount);

// ════════════════════════════════════════════════
// ADMIN ROUTES
// ════════════════════════════════════════════════

/**
 * @route   GET /api/users
 * @desc    Get all users (admin only)
 * @access  Private/Admin
 */
router.get(
  '/',
  authMiddleware.restrictTo('admin', 'moderator'),
  userController.getAllUsers
);

/**
 * @route   PATCH /api/users/:id/role
 * @desc    Update user role (admin only)
 * @access  Private/Admin
 */
router.patch(
  '/:id/role',
  authMiddleware.restrictTo('admin'),
  userController.updateUserRole
);

/**
 * @route   PATCH /api/users/:id/status
 * @desc    Update user account status (admin only)
 * @access  Private/Admin
 */
router.patch(
  '/:id/status',
  authMiddleware.restrictTo('admin', 'moderator'),
  userController.updateAccountStatus
);

module.exports = router;
