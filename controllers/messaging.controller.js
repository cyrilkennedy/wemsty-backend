const Circle = require('../models/Circle.model');
const CircleChannel = require('../models/CircleChannel.model');
const CircleMessage = require('../models/CircleMessage.model');
const DMConversation = require('../models/DMConversation.model');
const DMMessage = require('../models/DMMessage.model');
const MessageRead = require('../models/MessageRead.model');
const User = require('../models/User.model');
const AppError = require('../utils/AppError');
const { catchAsync } = require('../utils/catchAsync');
const {
  ensureActiveCircleMembership,
  getOrCreateConversation,
  sendChannelMessage,
  sendDMMessage,
  updateReadState
} = require('../services/messaging.service');

exports.getChannelMessages = catchAsync(async (req, res, next) => {
  const { circleId, channelId } = req.params;
  const { page = 1, limit = 50 } = req.query;

  const circle = await Circle.findById(circleId);
  const channel = await CircleChannel.findOne({ _id: channelId, circle: circleId });

  if (!circle || !channel) {
    return next(new AppError('Channel not found', 404));
  }

  const membership = await ensureActiveCircleMembership(circleId, req.user._id);
  const canView = membership || (circle.visibility === 'public' && channel.visibility === 'public');
  if (!canView && req.user.role !== 'admin') {
    return next(new AppError('You do not have access to this channel', 403));
  }

  const messages = await CircleMessage.find({
    channel: channelId,
    moderationState: { $ne: 'removed' }
  })
    .populate('sender', 'username profile.displayName profile.avatar')
    .populate('replyToMessage')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit, 10))
    .skip((parseInt(page, 10) - 1) * parseInt(limit, 10));

  const total = await CircleMessage.countDocuments({
    channel: channelId,
    moderationState: { $ne: 'removed' }
  });

  res.status(200).json({
    success: true,
    data: {
      messages,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    }
  });
});

exports.sendChannelMessage = catchAsync(async (req, res) => {
  const { circleId, channelId } = req.params;
  const { bodyText, replyToMessageId } = req.body;

  const { message } = await sendChannelMessage({
    circleId,
    channelId,
    user: req.user,
    bodyText,
    replyToMessageId
  });

  res.status(201).json({
    success: true,
    message: 'Message sent successfully',
    data: { message }
  });
});

exports.getOrCreateConversation = catchAsync(async (req, res) => {
  const conversation = await getOrCreateConversation({
    userId: req.user._id,
    otherUserId: req.params.userId
  });

  res.status(200).json({
    success: true,
    data: { conversation }
  });
});

exports.listDMConversations = catchAsync(async (req, res) => {
  const conversations = await DMConversation.find({
    members: req.user._id
  })
    .populate('members', 'username profile.displayName profile.avatar')
    .sort({ lastMessageAt: -1, updatedAt: -1 });

  res.status(200).json({
    success: true,
    data: { conversations }
  });
});

exports.searchDMConversations = catchAsync(async (req, res, next) => {
  const { q, page = 1, limit = 20 } = req.query;
  const searchTerm = typeof q === 'string' ? q.trim() : '';

  if (!searchTerm) {
    return next(new AppError('Search query is required', 400));
  }

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escaped, 'i');

  const matchedUsers = await User.find({
    _id: { $ne: req.user._id },
    accountStatus: 'active',
    $or: [
      { username: regex },
      { 'profile.displayName': regex },
      { 'profile.firstName': regex },
      { 'profile.lastName': regex }
    ]
  }).select('_id');

  const baseConversations = await DMConversation.find({
    members: req.user._id
  }).select('_id members');

  const conversationIds = baseConversations.map((conversation) => conversation._id);
  const matchedMessages = await DMMessage.find({
    conversation: { $in: conversationIds },
    moderationState: { $ne: 'removed' },
    bodyText: regex
  }).select('conversation');

  const matchedUserIds = new Set(matchedUsers.map((user) => user._id.toString()));
  const matchedConversationIds = new Set(matchedMessages.map((message) => message.conversation.toString()));

  for (const conversation of baseConversations) {
    if (conversation.members.some((member) => matchedUserIds.has(member.toString()))) {
      matchedConversationIds.add(conversation._id.toString());
    }
  }

  const ids = [...matchedConversationIds];
  const total = ids.length;
  const pageIds = ids.slice((safePage - 1) * safeLimit, safePage * safeLimit);

  const conversations = await DMConversation.find({ _id: { $in: pageIds } })
    .populate('members', 'username profile.displayName profile.avatar')
    .sort({ lastMessageAt: -1, updatedAt: -1 });

  res.status(200).json({
    success: true,
    data: { conversations },
    meta: {
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.ceil(total / safeLimit)
      }
    }
  });
});

exports.getDMMessages = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;
  const { page = 1, limit = 50 } = req.query;

  const conversation = await DMConversation.findById(conversationId);
  if (!conversation || !conversation.members.some((member) => member.toString() === req.user._id.toString())) {
    return next(new AppError('Conversation not found', 404));
  }

  const messages = await DMMessage.find({
    conversation: conversationId,
    moderationState: { $ne: 'removed' }
  })
    .populate('sender', 'username profile.displayName profile.avatar')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit, 10))
    .skip((parseInt(page, 10) - 1) * parseInt(limit, 10));

  const total = await DMMessage.countDocuments({
    conversation: conversationId,
    moderationState: { $ne: 'removed' }
  });

  res.status(200).json({
    success: true,
    data: {
      messages,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    }
  });
});

exports.sendDMMessage = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const { bodyText } = req.body;

  const { message } = await sendDMMessage({
    conversationId,
    user: req.user,
    bodyText
  });

  res.status(201).json({
    success: true,
    message: 'DM sent successfully',
    data: { message }
  });
});

exports.updateReadState = catchAsync(async (req, res) => {
  const { scopeType, scopeId, lastReadMessageId = null } = req.body;

  const readState = await updateReadState({
    user: req.user,
    scopeType,
    scopeId,
    lastReadMessageId
  });

  res.status(200).json({
    success: true,
    message: 'Read state updated',
    data: { readState }
  });
});

exports.getReadStates = catchAsync(async (req, res) => {
  const readStates = await MessageRead.find({ user: req.user._id })
    .sort({ updatedAt: -1 });

  res.status(200).json({
    success: true,
    data: { readStates }
  });
});
