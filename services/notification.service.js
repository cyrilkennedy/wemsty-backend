const User = require('../models/User.model');
const Notification = require('../models/Notification.model');
const realtimeEvents = require('./realtime-events.service');

function trimPreview(text = '', max = 140) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function extractMentionUsernames(text = '') {
  const matches = text.match(/@([a-zA-Z0-9_]+)/g) || [];
  return [...new Set(matches.map((match) => match.slice(1).toLowerCase()))];
}

async function createNotification({
  recipient,
  actor = null,
  type,
  objectType = null,
  objectId = null,
  circle = null,
  channel = null,
  previewText = ''
}) {
  if (!recipient) {
    return null;
  }

  if (actor && recipient.toString() === actor.toString()) {
    return null;
  }

  const notification = await Notification.create({
    recipient,
    actor,
    type,
    objectType,
    objectId,
    circle,
    channel,
    previewText: trimPreview(previewText)
  });

  realtimeEvents.emit('notification.created', {
    notificationId: notification._id.toString(),
    recipient: notification.recipient.toString(),
    type: notification.type
  });

  return notification;
}

async function createMentionNotifications({
  text,
  actor,
  type = 'mention',
  objectType,
  objectId,
  circle = null,
  channel = null
}) {
  const usernames = extractMentionUsernames(text);
  if (usernames.length === 0) {
    return [];
  }

  const users = await User.find({
    username: { $in: usernames },
    accountStatus: 'active'
  }).select('_id username');

  const notifications = [];
  for (const user of users) {
    const notification = await createNotification({
      recipient: user._id,
      actor,
      type,
      objectType,
      objectId,
      circle,
      channel,
      previewText: text
    });

    if (notification) {
      notifications.push(notification);
    }
  }

  return notifications;
}

async function countUnreadNotifications(recipient) {
  return Notification.countDocuments({
    recipient,
    readAt: null
  });
}

module.exports = {
  createNotification,
  createMentionNotifications,
  extractMentionUsernames,
  trimPreview,
  countUnreadNotifications
};
