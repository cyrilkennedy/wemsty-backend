// controllers/profile.controller.js

const UserProfile = require('../models/UserProfile.model');
const AppError = require('../utils/AppError');
const { catchAsync } = require('../utils/catchAsync');

// ════════════════════════════════════════════════
// PRIVACY SETTINGS
// ════════════════════════════════════════════════

// Get privacy settings
exports.getPrivacySettings = catchAsync(async (req, res, next) => {
  let profile = await UserProfile.findOne({ user: req.user._id });
  
  if (!profile) {
    profile = await UserProfile.create({ user: req.user._id });
  }

  res.status(200).json({
    success: true,
    data: {
      privacy: profile.privacy
    }
  });
});

// Update privacy settings
exports.updatePrivacySettings = catchAsync(async (req, res, next) => {
  const { profileVisibility, allowFollowRequests, showInSearch, allowTagging } = req.body;

  let profile = await UserProfile.findOne({ user: req.user._id });
  
  if (!profile) {
    profile = await UserProfile.create({ user: req.user._id });
  }

  // Update privacy settings
  if (profileVisibility && ['PUBLIC', 'FOLLOWERS_ONLY', 'PRIVATE'].includes(profileVisibility)) {
    profile.privacy.profileVisibility = profileVisibility;
  }
  
  if (typeof allowFollowRequests === 'boolean') {
    profile.privacy.allowFollowRequests = allowFollowRequests;
  }
  
  if (typeof showInSearch === 'boolean') {
    profile.privacy.showInSearch = showInSearch;
  }
  
  if (typeof allowTagging === 'boolean') {
    profile.privacy.allowTagging = allowTagging;
  }

  await profile.save();

  res.status(200).json({
    success: true,
    message: 'Privacy settings updated',
    data: {
      privacy: profile.privacy
    }
  });
});

// ════════════════════════════════════════════════
// NOTIFICATION SETTINGS
// ════════════════════════════════════════════════

// Get notification settings
exports.getNotificationSettings = catchAsync(async (req, res, next) => {
  let profile = await UserProfile.findOne({ user: req.user._id });
  
  if (!profile) {
    profile = await UserProfile.create({ user: req.user._id });
  }

  res.status(200).json({
    success: true,
    data: {
      notifications: profile.notificationSettings
    }
  });
});

// Update notification settings
exports.updateNotificationSettings = catchAsync(async (req, res, next) => {
  const {
    notifyOnFollow,
    notifyOnFollowRequest,
    emailNotifications,
    pushNotifications,
    notifyOnMention,
    notifyOnReaction
  } = req.body;

  let profile = await UserProfile.findOne({ user: req.user._id });
  
  if (!profile) {
    profile = await UserProfile.create({ user: req.user._id });
  }

  // Update notification settings
  if (typeof notifyOnFollow === 'boolean') {
    profile.notificationSettings.notifyOnFollow = notifyOnFollow;
  }
  
  if (typeof notifyOnFollowRequest === 'boolean') {
    profile.notificationSettings.notifyOnFollowRequest = notifyOnFollowRequest;
  }
  
  if (typeof emailNotifications === 'boolean') {
    profile.notificationSettings.emailNotifications = emailNotifications;
  }
  
  if (typeof pushNotifications === 'boolean') {
    profile.notificationSettings.pushNotifications = pushNotifications;
  }
  
  if (typeof notifyOnMention === 'boolean') {
    profile.notificationSettings.notifyOnMention = notifyOnMention;
  }
  
  if (typeof notifyOnReaction === 'boolean') {
    profile.notificationSettings.notifyOnReaction = notifyOnReaction;
  }

  await profile.save();

  res.status(200).json({
    success: true,
    message: 'Notification settings updated',
    data: {
      notifications: profile.notificationSettings
    }
  });
});

// ════════════════════════════════════════════════
// PROFILE STATS
// ════════════════════════════════════════════════

// Get profile completeness
exports.getProfileCompleteness = catchAsync(async (req, res, next) => {
  let profile = await UserProfile.findOne({ user: req.user._id });
  
  if (!profile) {
    profile = await UserProfile.create({ user: req.user._id });
  }

  const completeness = await profile.calculateCompleteness();
  await profile.save();

  res.status(200).json({
    success: true,
    data: {
      completeness,
      metadata: profile.metadata
    }
  });
});