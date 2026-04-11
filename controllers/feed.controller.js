// controllers/feed.controller.js - Feed controller for home and discovery feeds

const feedService = require('../services/feed.service');
const AppError = require('../utils/AppError');
const { catchAsync } = require('../utils/catchAsync');

// ════════════════════════════════════════════════
// HOME FEED (Following-based)
// ════════════════════════════════════════════════
exports.getHomeFeed = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const {
    page = 1,
    limit = 20,
    useCache = true
  } = req.query;

  const feed = await feedService.getHomeFeed(userId, {
    page: parseInt(page),
    limit: parseInt(limit),
    useCache: useCache !== 'false'
  });

  res.status(200).json({
    success: true,
    status: 'success',
    data: {
      ...feed,
      feed: feed.items || [],
      posts: feed.items || []
    }
  });
});

// ════════════════════════════════════════════════
// SPHERE FEED (For You / Discovery)
// ════════════════════════════════════════════════
exports.getSphereFeed = catchAsync(async (req, res, next) => {
  const userId = req.user?._id || null;
  const {
    page = 1,
    limit = 20,
    mode = 'top', // 'top' or 'latest'
    useCache = true
  } = req.query;

  const feed = await feedService.getSphereFeed(userId, {
    page: parseInt(page),
    limit: parseInt(limit),
    mode,
    useCache: useCache !== 'false'
  });

  res.status(200).json({
    success: true,
    status: 'success',
    data: {
      ...feed,
      feed: feed.items || [],
      posts: feed.items || []
    }
  });
});

// ════════════════════════════════════════════════
// CATEGORY FEED
// ════════════════════════════════════════════════
exports.getCategoryFeed = catchAsync(async (req, res, next) => {
  const { category } = req.params;
  const userId = req.user?._id || null;
  const {
    page = 1,
    limit = 20,
    mode = 'latest' // 'top' or 'latest'
  } = req.query;

  const Post = require('../models/Post.model');
  const feed = await Post.getCategoryFeed(category, userId, {
    page: parseInt(page),
    limit: parseInt(limit),
    mode
  });

  res.status(200).json({
    success: true,
    status: 'success',
    data: {
      ...feed,
      feed: feed.items || feed.posts || [],
      posts: feed.items || feed.posts || []
    }
  });
});

// ════════════════════════════════════════════════
// REFRESH FEED CACHE
// ════════════════════════════════════════════════
exports.refreshFeedCache = catchAsync(async (req, res, next) => {
  const userId = req.user._id;

  await feedService.invalidateFeedCache(userId);

  res.status(200).json({
    status: 'success',
    message: 'Feed cache refreshed successfully'
  });
});

// ════════════════════════════════════════════════
// GET FEED RANKING INFO (for debugging)
// ════════════════════════════════════════════════
exports.getFeedRankingInfo = catchAsync(async (req, res, next) => {
  const { postId } = req.params;
  const userId = req.user._id;

  const Post = require('../models/Post.model');
  const post = await Post.findById(postId);

  if (!post) {
    return next(new AppError('Post not found', 404));
  }

  const score = await feedService.calculatePostScore(post, userId);
  const reason = feedService.getRankReason(post, userId);

  res.status(200).json({
    status: 'success',
    data: {
      postId,
      score,
      reason,
      factors: {
        recency: feedService.calculateRecencyScore(post.createdAt),
        engagement: feedService.calculateEngagementScore(post),
        relationship: feedService.calculateRelationshipWeight(post, userId),
        communityAffinity: await feedService.calculateCommunityAffinity(post, userId),
        safetyPenalty: feedService.calculateSafetyPenalty(post)
      }
    }
  });
});
