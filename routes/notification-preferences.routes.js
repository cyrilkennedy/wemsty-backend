// routes/notification-preferences.routes.js - Notification preferences API routes

const express = require('express');
const router = express.Router();
const notificationPreferencesController = require('../controllers/notification-preferences.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Apply authentication to all routes
router.use(authMiddleware.protect);

/**
 * @route   GET /api/notifications/preferences
 * @desc    Get user notification preferences
 * @access  Private
 */
router.get('/', notificationPreferencesController.getPreferences);

/**
 * @route   PUT /api/notifications/preferences
 * @desc    Update user notification preferences
 * @access  Private
 */
router.put('/', notificationPreferencesController.updatePreferences);

/**
 * @route   GET /api/notifications/preferences/defaults
 * @desc    Get default notification preferences
 * @access  Private
 */
router.get('/defaults', notificationPreferencesController.getDefaultPreferences);

/**
 * @route   POST /api/notifications/preferences/reset
 * @desc    Reset notification preferences to defaults
 * @access  Private
 */
router.post('/reset', notificationPreferencesController.resetPreferences);

/**
 * @route   POST /api/notifications/preferences/enable-all
 * @desc    Enable all notifications
 * @access  Private
 */
router.post('/enable-all', notificationPreferencesController.enableAllNotifications);

/**
 * @route   POST /api/notifications/preferences/disable-all
 * @desc    Disable all notifications
 * @access  Private
 */
router.post('/disable-all', notificationPreferencesController.disableAllNotifications);

/**
 * @route   GET /api/notifications/preferences/summary
 * @desc    Get notification preferences summary
 * @access  Private
 */
router.get('/summary', notificationPreferencesController.getNotificationSummary);

/**
 * @route   POST /api/notifications/preferences/test
 * @desc    Send a test notification
 * @access  Private
 */
router.post('/test', notificationPreferencesController.testNotification);

module.exports = router;
