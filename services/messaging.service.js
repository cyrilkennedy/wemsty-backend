const Block = require('../models/Block.model');
const Circle = require('../models/Circle.model');
const CircleMembership = require('../models/CircleMembership.model');
const CircleChannel = require('../models/CircleChannel.model');
const CircleMessage = require('../models/CircleMessage.model');
const DMConversation = require('../models/DMConversation.model');
const DMMessage = require('../models/DMMessage.model');
const MessageRead = require('../models/MessageRead.model');
const User = require('../models/User.model');
const AppError = require('../utils/AppError');
const {
  createNotification,
  createMentionNotifications,
  extractMentionUsernames
} = require('./notification.service');
const { writeAuditLog } = require('./audit.service');
const realtimeEvents = require('./realtime-events.service');

function createPairKey(userA, userB) {
  return [userA.toString(), userB.toString()].sort().join(':');
}

function normalizeMessageBody(bodyText = '') {
  return bodyText.trim();
}

async function ensureActiveCircleMembership(circleId, userId) {
  return CircleMembership.findOne({
    circle: circleId,
    user: userId,
    status: 'active'
  });
}

async function resolveMentionUserIds(text) {
  const usernames = extractMentionUsernames(text);
  if (usernames.length === 0) {
    return [];
  }

  const users = await User.find({
    username: { $in: usernames },
    accountStatus: 'active'
  }).select('_id');

  return users.map((user) => user._id);
}

async function incrementUnreadForChannel(circleId, channelId, senderId) {
  const memberships = await CircleMembership.find({
    circle: circleId,
    status: 'active',
    user: { $ne: senderId }
  }).select('user');

  for (const membership of memberships) {
    await MessageRead.findOneAndUpdate(
      {
        user: membership.user,
        scopeType: 'channel',
        scopeId: channelId
      },
      {
        $inc: { unreadCountCache: 1 },
        $setOnInsert: {
          lastReadMessageId: null
        }
      },
      { upsert: true, new: true }
    );
  }
}

async function incrementUnreadForConversation(conversationId, recipientId) {
  await MessageRead.findOneAndUpdate(
    {
      user: recipientId,
      scopeType: 'dm_conversation',
      scopeId: conversationId
    },
    {
      $inc: { unreadCountCache: 1 },
      $setOnInsert: {
        lastReadMessageId: null
      }
    },
    { upsert: true, new: true }
  );
}

async function resolveChannelContext(circleId, channelId) {
  const channel = await CircleChannel.findById(channelId);
  if (!channel) {
    throw new AppError('Channel not found', 404);
  }

  if (circleId && channel.circle.toString() !== circleId.toString()) {
    throw new AppError('Channel not found', 404);
  }

  const circle = await Circle.findById(channel.circle);
  if (!circle) {
    throw new AppError('Circle not found', 404);
  }

  return { circle, channel };
}

async function assertChannelAccess({ circleId = null, channelId, user, requireMembership = false }) {
  const { circle, channel } = await resolveChannelContext(circleId, channelId);
  const membership = await ensureActiveCircleMembership(circle._id, user._id);
  const canViewPublicChannel =
    circle.visibility === 'public' && channel.visibility === 'public';

  if (requireMembership && !membership && user.role !== 'admin') {
    throw new AppError('Join the circle to send messages', 403);
  }

  if (!requireMembership && !membership && !canViewPublicChannel && user.role !== 'admin') {
    throw new AppError('You do not have access to this channel', 403);
  }

  return { circle, channel, membership };
}

async function getOrCreateConversation({ userId, otherUserId }) {
  if (userId.toString() === otherUserId.toString()) {
    throw new AppError('You cannot start a DM with yourself', 400);
  }

  const isBlocked = await Block.isBlocked(userId, otherUserId);
  if (isBlocked) {
    throw new AppError('You cannot message this user', 403);
  }

  const otherUser = await User.findById(otherUserId);
  if (!otherUser || otherUser.accountStatus !== 'active') {
    throw new AppError('User not found', 404);
  }

  const pairKey = createPairKey(userId, otherUserId);
  let conversation = await DMConversation.findOne({ pairKey })
    .populate('members', 'username profile.displayName profile.avatar');

  if (!conversation) {
    conversation = await DMConversation.create({
      members: [userId, otherUserId],
      pairKey
    });

    await conversation.populate('members', 'username profile.displayName profile.avatar');
  }

  return conversation;
}

async function sendChannelMessage({ circleId = null, channelId, user, bodyText, replyToMessageId = null }) {
  const normalizedBody = normalizeMessageBody(bodyText);
  if (!normalizedBody) {
    throw new AppError('Message text is required', 400);
  }

  const { circle, channel } = await assertChannelAccess({
    circleId,
    channelId,
    user,
    requireMembership: true
  });

  const mentions = await resolveMentionUserIds(normalizedBody);

  const message = await CircleMessage.create({
    circle: circle._id,
    channel: channel._id,
    sender: user._id,
    bodyText: normalizedBody,
    mentions,
    replyToMessage: replyToMessageId || null
  });

  await CircleChannel.findByIdAndUpdate(channel._id, { $set: { lastMessageAt: new Date() } });
  await Circle.findByIdAndUpdate(circle._id, { $set: { lastActivityAt: new Date() } });
  await incrementUnreadForChannel(circle._id, channel._id, user._id);

  await createMentionNotifications({
    text: normalizedBody,
    actor: user._id,
    type: 'channel_mention',
    objectType: 'circle_message',
    objectId: message._id,
    circle: circle._id,
    channel: channel._id
  });

  await message.populate('sender', 'username profile.displayName profile.avatar');
  await message.populate('replyToMessage');

  await writeAuditLog({
    actor: user._id,
    actionType: 'message.channel.sent',
    objectType: 'circle_message',
    objectId: message._id,
    payload: { circleId: circle._id, channelId: channel._id }
  });

  realtimeEvents.emit('channel.message.created', {
    circleId: circle._id.toString(),
    channelId: channel._id.toString(),
    message
  });

  return { circle, channel, message };
}

async function sendDMMessage({ conversationId, user, bodyText }) {
  const normalizedBody = normalizeMessageBody(bodyText);
  if (!normalizedBody) {
    throw new AppError('Message text is required', 400);
  }

  const conversation = await DMConversation.findById(conversationId);
  if (!conversation || !conversation.members.some((member) => member.toString() === user._id.toString())) {
    throw new AppError('Conversation not found', 404);
  }

  const recipientId = conversation.members.find(
    (member) => member.toString() !== user._id.toString()
  );

  const isBlocked = await Block.isBlocked(user._id, recipientId);
  if (isBlocked) {
    throw new AppError('You cannot message this user', 403);
  }

  const mentions = await resolveMentionUserIds(normalizedBody);
  const message = await DMMessage.create({
    conversation: conversationId,
    sender: user._id,
    bodyText: normalizedBody,
    mentions,
    readBy: [user._id]
  });

  await DMConversation.findByIdAndUpdate(conversationId, {
    $set: {
      lastMessageAt: new Date(),
      lastMessagePreview: normalizedBody.slice(0, 120)
    }
  });

  await incrementUnreadForConversation(conversationId, recipientId);

  await createNotification({
    recipient: recipientId,
    actor: user._id,
    type: 'dm',
    objectType: 'dm_message',
    objectId: message._id,
    previewText: normalizedBody
  });

  await message.populate('sender', 'username profile.displayName profile.avatar');

  await writeAuditLog({
    actor: user._id,
    actionType: 'message.dm.sent',
    objectType: 'dm_message',
    objectId: message._id,
    payload: { conversationId }
  });

  realtimeEvents.emit('dm.message.created', {
    conversationId: conversationId.toString(),
    recipientId: recipientId.toString(),
    senderId: user._id.toString(),
    message
  });

  return { conversation, recipientId, message };
}

async function updateReadState({ user, scopeType, scopeId, lastReadMessageId = null }) {
  if (!scopeType || !scopeId) {
    throw new AppError('scopeType and scopeId are required', 400);
  }

  if (!['dm_conversation', 'channel'].includes(scopeType)) {
    throw new AppError('Invalid scopeType', 400);
  }

  if (scopeType === 'dm_conversation') {
    const conversation = await DMConversation.findById(scopeId);
    if (!conversation || !conversation.members.some((member) => member.toString() === user._id.toString())) {
      throw new AppError('Conversation not found', 404);
    }

    if (lastReadMessageId) {
      await DMMessage.updateMany(
        {
          conversation: scopeId,
          _id: { $lte: lastReadMessageId }
        },
        { $addToSet: { readBy: user._id } }
      );
    }
  } else {
    const channel = await CircleChannel.findById(scopeId);
    if (!channel) {
      throw new AppError('Channel not found', 404);
    }

    const membership = await ensureActiveCircleMembership(channel.circle, user._id);
    if (!membership && user.role !== 'admin') {
      throw new AppError('You do not have access to this channel', 403);
    }

    if (membership) {
      membership.lastSeenAt = new Date();
      await membership.save();
    }
  }

  const readState = await MessageRead.findOneAndUpdate(
    {
      user: user._id,
      scopeType,
      scopeId
    },
    {
      $set: {
        lastReadMessageId,
        unreadCountCache: 0
      }
    },
    {
      upsert: true,
      new: true
    }
  );

  await writeAuditLog({
    actor: user._id,
    actionType: 'message.read.updated',
    objectType: scopeType,
    objectId: scopeId,
    payload: { lastReadMessageId }
  });

  realtimeEvents.emit('message.read.updated', {
    userId: user._id.toString(),
    scopeType,
    scopeId: scopeId.toString(),
    lastReadMessageId: lastReadMessageId ? lastReadMessageId.toString() : null
  });

  return readState;
}

module.exports = {
  ensureActiveCircleMembership,
  assertChannelAccess,
  getOrCreateConversation,
  sendChannelMessage,
  sendDMMessage,
  updateReadState
};
