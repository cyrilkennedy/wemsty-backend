// controllers/notification-preferences.controller.js - Notification preferences controller

const pushNotificationService = require('../services/push-notification.service');
const AppError = require('../utils/AppError');
const { catchAsync } = require('../utils/catchAsync');

// ════════════════════════════════════════════════
// GET NOTIFICATION PREFERENCES
// ════════════════════════════════════════════════
exports.getPreferences = catchAsync(async (req, res, next) => {
  const userId = req.user._id;

  const preferences = await pushNotificationService.getNotificationPreferences(userId);

  res.status(200).json({
    status: 'success',
    data: {
      preferences
    }
  });
});

// ════════════════════════════════════════════════
// UPDATE NOTIFICATION PREFERENCES
// ════════════════════════════════════════════════
exports.updatePreferences = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const preferences = req.body;

  // Validate preferences structure
  const validTypes = ['email', 'push', 'sms'];
  const validActions = ['follow', 'like', 'reply', 'repost', 'mention', 'dm', 'channel_mention', 'invite', 'circle_activity'];

  for (const type of Object.keys(preferences)) {
    if (!validTypes.includes(type)) {
      return next(new AppError(`Invalid notification type: ${type}`, 400));
    }

    for (const action of Object.keys(preferences[type])) {
      if (!validActions.includes(action)) {
        return next(new AppError(`Invalid notification action: ${action}`, 400));
      }

      if (typeof preferences[type][action] !== 'boolean') {
        return next(new AppError(`Preference value must be boolean for ${type}.${action}`, 400));
      }
    }
  }

  const success = await pushNotificationService.updateNotificationPreferences(userId, preferences);

  if (!success) {
    return next(new AppError('Failed to update preferences', 500));
  }

  res.status(200).json({
    status: 'success',
    message: 'Notification preferences updated successfully',
    data: { preferences }
  });
});

// ════════════════════════════════════════════════
// GET DEFAULT PREFERENCES
// ════════════════════════════════════════════════
exports.getDefaultPreferences = catchAsync(async (req, res, next) => {
  const defaults = pushNotificationService.getDefaultPreferences();

  res.status(200).json({
    status: 'success',
    data: {
      defaults
    }
  });
});

// ════════════════════════════════════════════════
// RESET TO DEFAULT PREFERENCES
// ════════════════════════════════════════════════
exports.resetPreferences = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const defaults = pushNotificationService.getDefaultPreferences();

  const success = await pushNotificationService.updateNotificationPreferences(userId, defaults);

  if (!success) {
    return next(new AppError('Failed to reset preferences', 500));
  }

  res.status(200).json({
    status: 'success',
    message: 'Notification preferences reset to defaults',
    data: { preferences: defaults }
  });
});

// ════════════════════════════════════════════════
// ENABLE ALL NOTIFICATIONS
// ════════════════════════════════════════════════
exports.enableAllNotifications = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const defaults = pushNotificationService.getDefaultPreferences();

  // Enable all notifications
  const allEnabled = {
    email: Object.keys(defaults.email).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {}),
    push: Object.keys(defaults.push).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {}),
    sms: Object.keys(defaults.sms).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {})
  };

  const success = await pushNotificationService.updateNotificationPreferences(userId, allEnabled);

  if (!success) {
    return next(new AppError('Failed to enable all notifications', 500));
  }

  res.status(200).json({
    status: 'success',
    message: 'All notifications enabled',
    data: { preferences: allEnabled }
  });
});

// ════════════════════════════════════════════════
// DISABLE ALL NOTIFICATIONS
// ════════════════════════════════════════════════
exports.disableAllNotifications = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const defaults = pushNotificationService.getDefaultPreferences();

  // Disable all notifications
  const allDisabled = {
    email: Object.keys(defaults.email).reduce((acc, key) => {
      acc[key] = false;
      return acc;
    }, {}),
    push: Object.keys(defaults.push).reduce((acc, key) => {
      acc[key] = false;
      return acc;
    }, {}),
    sms: Object.keys(defaults.sms).reduce((acc, key) => {
      acc[key] = false;
      return acc;
    }, {})
  };

  const success = await pushNotificationService.updateNotificationPreferences(userId, allDisabled);

  if (!success) {
    return next(new AppError('Failed to disable all notifications', 500));
  }

  res.status(200).json({
    status: 'success',
    message: 'All notifications disabled',
    data: { preferences: allDisabled }
  });
});

// ════════════════════════════════════════════════
// GET NOTIFICATION SUMMARY
// ════════════════════════════════════════════════
exports.getNotificationSummary = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const preferences = await pushNotificationService.getNotificationPreferences(userId);

  const summary = {
    email: {
      enabled: Object.values(preferences.email).some(v => v),
      count: Object.values(preferences.email).filter(v => v).length,
      total: Object.keys(preferences.email).length
    },
    push: {
      enabled: Object.values(preferences.push).some(v => v),
      count: Object.values(preferences.push).filter(v => v).length,
      total: Object.keys(preferences.push).length
    },
    sms: {
      enabled: Object.values(preferences.sms).some(v => v),
      count: Object.values(preferences.sms).filter(v => v).length,
      total: Object.keys(preferences.sms).length
    }
  };

  res.status(200).json({
    status: 'success',
    data: {
      summary,
      preferences
    }
  });
});

// ════════════════════════════════════════════════
// TEST NOTIFICATION
// ════════════════════════════════════════════════
exports.testNotification = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { type = 'push' } = req.query;

  const testNotification = {
    title: 'Test Notification',
    body: 'This is a test notification to verify your settings',
    data: {
      type: 'test',
      timestamp: new Date().toISOString()
    }
  };

  const success = await pushNotificationService.sendToUser(userId, testNotification);

  if (!success) {
    return next(new AppError('Failed to send test notification', 500));
  }

  res.status(200).json({
    status: 'success',
    message: 'Test notification sent successfully'
  });
});