const Notification = require('../models/Notification.model');
const AppError = require('../utils/AppError');
const { catchAsync } = require('../utils/catchAsync');

exports.getNotifications = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const notifications = await Notification.find({ recipient: req.user._id })
    .populate('actor', 'username profile.displayName profile.avatar')
    .populate('circle', 'name slug')
    .populate('channel', 'name slug')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit, 10))
    .skip((parseInt(page, 10) - 1) * parseInt(limit, 10));

  const unreadCount = await Notification.countDocuments({
    recipient: req.user._id,
    readAt: null
  });

  const total = await Notification.countDocuments({ recipient: req.user._id });

  res.status(200).json({
    success: true,
    data: {
      items: notifications,
      unreadCount,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    }
  });
});

exports.getUnreadCount = catchAsync(async (req, res) => {
  const unreadCount = await Notification.countDocuments({
    recipient: req.user._id,
    readAt: null
  });

  res.status(200).json({
    success: true,
    data: { unreadCount }
  });
});

exports.markAsRead = catchAsync(async (req, res, next) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.notificationId, recipient: req.user._id },
    { $set: { readAt: new Date() } },
    { new: true }
  );

  if (!notification) {
    return next(new AppError('Notification not found', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Notification marked as read',
    data: { notification }
  });
});

exports.markAllAsRead = catchAsync(async (req, res) => {
  await Notification.updateMany(
    { recipient: req.user._id, readAt: null },
    { $set: { readAt: new Date() } }
  );

  res.status(200).json({
    success: true,
    message: 'All notifications marked as read'
  });
});
