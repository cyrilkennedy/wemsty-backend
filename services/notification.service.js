const User = require('../models/User.model');
const Notification = require('../models/Notification.model');
const Follow = require('../models/Follow.model');
const CircleMembership = require('../models/CircleMembership.model');
const UserProfile = require('../models/UserProfile.model');
const realtimeEvents = require('./realtime-events.service');
const { notificationQueue } = require('../queues');
const { addJob, queuesEnabled } = require('./queue.service');

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
  if (queuesEnabled() && process.env.WORKER_PROCESS !== 'true') {
    await addJob(notificationQueue, 'create-notification', {
      recipient,
      actor,
      type,
      objectType,
      objectId,
      circle,
      channel,
      previewText
    });
    return { queued: true };
  }

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

async function queueFanoutPostNotification(data = {}) {
  await addJob(notificationQueue, 'fanout-post-notification', data);
  return { queued: true };
}

async function queueFanoutMentionNotification(data = {}) {
  const text = data.text || data.previewText || '';
  if (extractMentionUsernames(text).length === 0) {
    return { queued: false, reason: 'no_mentions' };
  }

  await addJob(notificationQueue, 'fanout-mention-notification', data);
  return { queued: true };
}

async function queueFanoutCircleNotification(data = {}) {
  await addJob(notificationQueue, 'fanout-circle-notification', data);
  return { queued: true };
}

async function filterRecipientsByPreference(recipients, type) {
  if (!recipients.length) {
    return [];
  }

  const profiles = await UserProfile.find({ user: { $in: recipients } })
    .select('user notificationSettings')
    .lean();
  const profileMap = new Map(profiles.map((profile) => [profile.user.toString(), profile]));

  return recipients.filter((recipient) => {
    const settings = profileMap.get(recipient.toString())?.notificationSettings;
    if (!settings) {
      return true;
    }

    if (type === 'follow') return settings.notifyOnFollow !== false;
    if (type === 'mention') return settings.notifyOnMention !== false;
    if (['like', 'reply', 'repost'].includes(type)) return settings.notifyOnReaction !== false;
    if (type === 'invite') return settings.notifyOnFollowRequest !== false;
    return true;
  });
}

async function insertNotificationBatch(notifications) {
  if (!notifications.length) {
    return { inserted: 0, skipped: 0 };
  }

  const existing = await Notification.find({
    $or: notifications.map((notification) => ({
      recipient: notification.recipient,
      actor: notification.actor || null,
      type: notification.type,
      objectType: notification.objectType || null,
      objectId: notification.objectId || null
    }))
  })
    .select('recipient actor type objectType objectId')
    .lean();

  const existingKeys = new Set(existing.map((notification) => [
    notification.recipient?.toString(),
    notification.actor?.toString() || '',
    notification.type,
    notification.objectType || '',
    notification.objectId?.toString() || ''
  ].join(':')));

  const newNotifications = notifications.filter((notification) => {
    const key = [
      notification.recipient?.toString(),
      notification.actor?.toString() || '',
      notification.type,
      notification.objectType || '',
      notification.objectId?.toString() || ''
    ].join(':');
    return !existingKeys.has(key);
  });

  if (newNotifications.length === 0) {
    return { inserted: 0, skipped: notifications.length };
  }

  await Notification.insertMany(newNotifications, { ordered: false });

  for (const notification of newNotifications) {
    realtimeEvents.emit('notification.created', {
      recipient: notification.recipient.toString(),
      type: notification.type
    });
  }

  return {
    inserted: newNotifications.length,
    skipped: notifications.length - newNotifications.length
  };
}

async function fanoutToRecipients(recipients, payload, options = {}) {
  const batchSize = Number(options.batchSize || 250);
  const uniqueRecipients = [...new Set(
    recipients
      .filter(Boolean)
      .map((recipient) => recipient.toString())
      .filter((recipient) => !payload.actor || recipient !== payload.actor.toString())
  )];
  const allowedRecipients = await filterRecipientsByPreference(uniqueRecipients, payload.type);
  let inserted = 0;
  let skipped = uniqueRecipients.length - allowedRecipients.length;

  for (let index = 0; index < allowedRecipients.length; index += batchSize) {
    const batch = allowedRecipients.slice(index, index + batchSize);
    const notifications = batch.map((recipient) => ({
      recipient,
      actor: payload.actor || null,
      type: payload.type,
      objectType: payload.objectType || null,
      objectId: payload.objectId || null,
      circle: payload.circle || null,
      channel: payload.channel || null,
      previewText: trimPreview(payload.previewText || '')
    }));
    const result = await insertNotificationBatch(notifications);
    inserted += result.inserted;
    skipped += result.skipped;
  }

  return { recipients: uniqueRecipients.length, inserted, skipped };
}

async function fanoutPostNotification(data) {
  const followers = await Follow.find({
    following: data.actor,
    status: 'ACCEPTED'
  })
    .select('follower')
    .lean();

  return fanoutToRecipients(
    followers.map((follow) => follow.follower),
    {
      actor: data.actor,
      type: data.type || 'circle_activity',
      objectType: data.objectType || 'post',
      objectId: data.objectId,
      previewText: data.previewText
    },
    data
  );
}

async function fanoutMentionNotification(data) {
  const usernames = extractMentionUsernames(data.text || data.previewText || '');
  if (usernames.length === 0) {
    return { recipients: 0, inserted: 0, skipped: 0 };
  }

  const users = await User.find({
    username: { $in: usernames },
    accountStatus: 'active'
  })
    .select('_id username')
    .lean();

  return fanoutToRecipients(
    users.map((user) => user._id),
    {
      actor: data.actor,
      type: data.type || 'mention',
      objectType: data.objectType,
      objectId: data.objectId,
      circle: data.circle,
      channel: data.channel,
      previewText: data.previewText || data.text
    },
    data
  );
}

async function fanoutCircleNotification(data) {
  const members = await CircleMembership.find({
    circle: data.circle,
    status: 'active'
  })
    .select('user')
    .lean();

  return fanoutToRecipients(
    members.map((member) => member.user),
    {
      actor: data.actor,
      type: data.type || 'circle_activity',
      objectType: data.objectType || 'circle',
      objectId: data.objectId || data.circle,
      circle: data.circle,
      channel: data.channel,
      previewText: data.previewText
    },
    data
  );
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
  queueFanoutPostNotification,
  queueFanoutMentionNotification,
  queueFanoutCircleNotification,
  fanoutPostNotification,
  fanoutMentionNotification,
  fanoutCircleNotification,
  extractMentionUsernames,
  trimPreview,
  countUnreadNotifications
};
