// controllers/social.controller.js

const User = require('../models/User.model');
const Follow = require('../models/Follow.model');
const Block = require('../models/Block.model');
const Mute = require('../models/Mute.model');
const UserProfile = require('../models/UserProfile.model');
const AppError = require('../utils/AppError');
const { catchAsync } = require('../utils/catchAsync');
const { createNotification } = require('../services/notification.service');

// ════════════════════════════════════════════════
// FOLLOW SYSTEM
// ════════════════════════════════════════════════

// Follow a user
exports.followUser = catchAsync(async (req, res, next) => {
  const followerId = req.user._id;
  const { userId } = req.params;

  // Validate not following self
  if (followerId.toString() === userId) {
    return next(new AppError('You cannot follow yourself', 400));
  }

  // Check if user exists
  const userToFollow = await User.findById(userId);
  if (!userToFollow || userToFollow.accountStatus !== 'active') {
    return next(new AppError('User not found', 404));
  }

  // Check if blocked
  const isBlocked = await Block.isBlocked(followerId, userId);
  if (isBlocked) {
    return next(new AppError('Cannot follow this user', 403));
  }

  // Check if already following
  const existingFollow = await Follow.findOne({
    follower: followerId,
    following: userId
  });

  if (existingFollow) {
    if (existingFollow.status === 'ACCEPTED') {
      return next(new AppError('Already following this user', 400));
    }
    if (existingFollow.status === 'PENDING') {
      return next(new AppError('Follow request already sent', 400));
    }
    if (existingFollow.status === 'REJECTED') {
      // Allow re-request after rejection
      existingFollow.status = 'PENDING';
      existingFollow.requestedAt = Date.now();
      await existingFollow.save();
      return res.status(200).json({
        success: true,
        message: 'Follow request sent',
        data: { status: 'PENDING' }
      });
    }
  }

  // Get target user's profile settings
  const targetProfile = await UserProfile.findOne({ user: userId });
  const isPrivate = targetProfile?.privacy.profileVisibility === 'PRIVATE';

  // Create follow relationship
  const follow = await Follow.create({
    follower: followerId,
    following: userId,
    status: isPrivate ? 'PENDING' : 'ACCEPTED'
  });

  // TODO: Emit event for notifications
  if (!isPrivate) {
    await createNotification({
      recipient: userId,
      actor: followerId,
      type: 'follow',
      objectType: 'user',
      objectId: userId
    });
  }

  res.status(201).json({
    success: true,
    message: isPrivate ? 'Follow request sent' : 'Now following user',
    data: {
      status: follow.status,
      followId: follow._id
    }
  });
});

// Unfollow a user
exports.unfollowUser = catchAsync(async (req, res, next) => {
  const followerId = req.user._id;
  const { userId } = req.params;

  const follow = await Follow.findOneAndDelete({
    follower: followerId,
    following: userId,
    status: 'ACCEPTED'
  });

  if (!follow) {
    return next(new AppError('You are not following this user', 400));
  }

  // TODO: Emit event
  // eventEmitter.emit('follow.removed', { followerId, userId });

  res.status(200).json({
    success: true,
    message: 'Unfollowed successfully'
  });
});

// Get follow requests (for current user)
exports.getFollowRequests = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;

  const requests = await Follow.find({
    following: userId,
    status: 'PENDING'
  })
    .populate('follower', 'username profile.displayName profile.avatar isEmailVerified')
    .sort({ requestedAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Follow.countDocuments({
    following: userId,
    status: 'PENDING'
  });

  res.status(200).json({
    success: true,
    data: {
      requests: requests.map(r => r.follower),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// Accept follow request
exports.acceptFollowRequest = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { requestId } = req.params;

  const follow = await Follow.findOne({
    _id: requestId,
    following: userId,
    status: 'PENDING'
  });

  if (!follow) {
    return next(new AppError('Follow request not found', 404));
  }

  follow.status = 'ACCEPTED';
  await follow.save();

  // TODO: Emit event
  // eventEmitter.emit('follow.accepted', { followerId: follow.follower, userId });

  res.status(200).json({
    success: true,
    message: 'Follow request accepted'
  });
});

// Reject follow request
exports.rejectFollowRequest = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { requestId } = req.params;

  const follow = await Follow.findOneAndDelete({
    _id: requestId,
    following: userId,
    status: 'PENDING'
  });

  if (!follow) {
    return next(new AppError('Follow request not found', 404));
  }

  // TODO: Emit event (silent - no notification to requester)
  // eventEmitter.emit('follow.rejected', { followerId: follow.follower, userId });

  res.status(200).json({
    success: true,
    message: 'Follow request rejected'
  });
});

// Get followers
exports.getFollowers = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const followers = await Follow.find({
    following: userId,
    status: 'ACCEPTED'
  })
    .populate('follower', 'username profile.displayName profile.avatar isEmailVerified followers_count following_count')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Follow.countDocuments({
    following: userId,
    status: 'ACCEPTED'
  });

  res.status(200).json({
    success: true,
    data: {
      followers: followers.map(f => f.follower),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// Get following
exports.getFollowing = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  const following = await Follow.find({
    follower: userId,
    status: 'ACCEPTED'
  })
    .populate('following', 'username profile.displayName profile.avatar isEmailVerified followers_count following_count')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Follow.countDocuments({
    follower: userId,
    status: 'ACCEPTED'
  });

  res.status(200).json({
    success: true,
    data: {
      following: following.map(f => f.following),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// Get mutual followers
exports.getMutualFollowers = catchAsync(async (req, res, next) => {
  const { userId } = req.params;
  const currentUserId = req.user._id;

  const mutuals = await Follow.getMutualFollows(userId);

  res.status(200).json({
    success: true,
    data: {
      mutuals
    }
  });
});

// Get follow suggestions
exports.getFollowSuggestions = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { limit = 10 } = req.query;

  const suggestions = await Follow.getSuggestions(userId, parseInt(limit));

  // Populate user details
  const userIds = suggestions.map(s => s._id);
  const users = await User.find({ _id: { $in: userIds } })
    .select('username profile.displayName profile.avatar isEmailVerified followers_count');

  res.status(200).json({
    success: true,
    data: {
      suggestions: users
    }
  });
});

// Check follow status
exports.checkFollowStatus = catchAsync(async (req, res, next) => {
  const followerId = req.user._id;
  const { userId } = req.params;

  const status = await Follow.checkFollowStatus(followerId, userId);

  res.status(200).json({
    success: true,
    data: {
      status,
      isFollowing: status === 'ACCEPTED'
    }
  });
});

// ════════════════════════════════════════════════
// BLOCK SYSTEM
// ════════════════════════════════════════════════

// Block a user
exports.blockUser = catchAsync(async (req, res, next) => {
  const blockerId = req.user._id;
  const { userId } = req.params;

  if (blockerId.toString() === userId) {
    return next(new AppError('You cannot block yourself', 400));
  }

  // Check if already blocked
  const existingBlock = await Block.findOne({
    blocker: blockerId,
    blocked: userId
  });

  if (existingBlock) {
    return next(new AppError('User already blocked', 400));
  }

  // Create block
  await Block.create({
    blocker: blockerId,
    blocked: userId
  });

  // TODO: Emit event
  // eventEmitter.emit('block.created', { blockerId, userId });

  res.status(201).json({
    success: true,
    message: 'User blocked successfully'
  });
});

// Unblock a user
exports.unblockUser = catchAsync(async (req, res, next) => {
  const blockerId = req.user._id;
  const { userId } = req.params;

  const block = await Block.findOneAndDelete({
    blocker: blockerId,
    blocked: userId
  });

  if (!block) {
    return next(new AppError('User is not blocked', 400));
  }

  // TODO: Emit event
  // eventEmitter.emit('block.removed', { blockerId, userId });

  res.status(200).json({
    success: true,
    message: 'User unblocked successfully'
  });
});

// Get blocked users
exports.getBlockedUsers = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;

  const blocks = await Block.find({ blocker: userId })
    .populate('blocked', 'username profile.displayName profile.avatar')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Block.countDocuments({ blocker: userId });

  res.status(200).json({
    success: true,
    data: {
      blocked: blocks.map(b => b.blocked),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// ════════════════════════════════════════════════
// MUTE SYSTEM
// ════════════════════════════════════════════════

// Mute a user
exports.muteUser = catchAsync(async (req, res, next) => {
  const muterId = req.user._id;
  const { userId } = req.params;

  if (muterId.toString() === userId) {
    return next(new AppError('You cannot mute yourself', 400));
  }

  // Check if already muted
  const existingMute = await Mute.findOne({
    muter: muterId,
    muted: userId
  });

  if (existingMute) {
    return next(new AppError('User already muted', 400));
  }

  // Create mute
  await Mute.create({
    muter: muterId,
    muted: userId
  });

  // TODO: Emit event
  // eventEmitter.emit('mute.created', { muterId, userId });

  res.status(201).json({
    success: true,
    message: 'User muted successfully'
  });
});

// Unmute a user
exports.unmuteUser = catchAsync(async (req, res, next) => {
  const muterId = req.user._id;
  const { userId } = req.params;

  const mute = await Mute.findOneAndDelete({
    muter: muterId,
    muted: userId
  });

  if (!mute) {
    return next(new AppError('User is not muted', 400));
  }

  // TODO: Emit event
  // eventEmitter.emit('mute.removed', { muterId, userId });

  res.status(200).json({
    success: true,
    message: 'User unmuted successfully'
  });
});

// Get muted users
exports.getMutedUsers = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;

  const mutes = await Mute.find({ muter: userId })
    .populate('muted', 'username profile.displayName profile.avatar')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

  const total = await Mute.countDocuments({ muter: userId });

  res.status(200).json({
    success: true,
    data: {
      muted: mutes.map(m => m.muted),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});
