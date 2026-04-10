// controllers/trending.controller.js - Trending topics controller

const Hashtag = require('../models/Hashtag.model');
const TrendingTopic = require('../models/TrendingTopic.model');
const AppError = require('../utils/AppError');
const { catchAsync } = require('../utils/catchAsync');

// ════════════════════════════════════════════════
// GET TRENDING HASHTAGS
// ════════════════════════════════════════════════
exports.getTrendingHashtags = catchAsync(async (req, res, next) => {
  const {
    limit = 10,
    category = null,
    timeWindow = '1h'
  } = req.query;

  const hashtags = await Hashtag.getTrending({
    limit: parseInt(limit),
    category,
    excludeBanned: true,
    timeWindow
  });

  res.status(200).json({
    status: 'success',
    data: {
      hashtags,
      count: hashtags.length
    }
  });
});

// ════════════════════════════════════════════════
// GET TRENDING TOPICS
// ════════════════════════════════════════════════
exports.getTrendingTopics = catchAsync(async (req, res, next) => {
  const {
    limit = 20,
    category = null,
    status = null,
    timeWindow = '1h'
  } = req.query;

  const topics = await TrendingTopic.getTrending({
    limit: parseInt(limit),
    category,
    status,
    excludeBanned: true,
    timeWindow
  });

  res.status(200).json({
    status: 'success',
    data: {
      topics,
      count: topics.length
    }
  });
});

// ════════════════════════════════════════════════
// GET TOPICS BY CATEGORY
// ════════════════════════════════════════════════
exports.getTopicsByCategory = catchAsync(async (req, res, next) => {
  const { category } = req.params;
  const { limit = 10, status = null } = req.query;

  const topics = await TrendingTopic.getByCategory(category, {
    limit: parseInt(limit),
    status
  });

  res.status(200).json({
    status: 'success',
    data: {
      category,
      topics,
      count: topics.length
    }
  });
});

// ════════════════════════════════════════════════
// GET HASHTAG DETAILS
// ════════════════════════════════════════════════
exports.getHashtagDetails = catchAsync(async (req, res, next) => {
  const { tag } = req.params;

  const hashtag = await Hashtag.findOne({
    normalizedTag: tag.toLowerCase()
  }).lean();

  if (!hashtag) {
    return next(new AppError('Hashtag not found', 404));
  }

  // Get related hashtags
  const relatedHashtags = await Hashtag.find({
    _id: { $in: hashtag.relatedTags || [] }
  }).limit(5).lean();

  res.status(200).json({
    status: 'success',
    data: {
      hashtag: {
        ...hashtag,
        relatedTags: relatedHashtags
      }
    }
  });
});

// ════════════════════════════════════════════════
// SEARCH HASHTAGS
// ════════════════════════════════════════════════
exports.searchHashtags = catchAsync(async (req, res, next) => {
  const { q, limit = 20 } = req.query;

  if (!q) {
    return next(new AppError('Please provide a search query', 400));
  }

  const hashtags = await Hashtag.find({
    normalizedTag: { $regex: q.toLowerCase(), $options: 'i' },
    isBanned: false
  })
    .sort({ usageCount: -1 })
    .limit(parseInt(limit))
    .lean();

  res.status(200).json({
    status: 'success',
    data: {
      query: q,
      hashtags,
      count: hashtags.length
    }
  });
});

// ════════════════════════════════════════════════
// GET TOPIC DETAILS
// ════════════════════════════════════════════════
exports.getTopicDetails = catchAsync(async (req, res, next) => {
  const { topic, type } = req.params;

  const topicData = await TrendingTopic.findOne({
    topic,
    type: type || 'hashtag'
  }).lean();

  if (!topicData) {
    return next(new AppError('Topic not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: topicData
  });
});

// ════════════════════════════════════════════════
// GET REGIONAL TRENDING
// ════════════════════════════════════════════════
exports.getRegionalTrending = catchAsync(async (req, res, next) => {
  const { region } = req.params;
  const { limit = 10 } = req.query;

  const topics = await TrendingTopic.getByRegion(region, {
    limit: parseInt(limit)
  });

  res.status(200).json({
    status: 'success',
    data: {
      region,
      topics,
      count: topics.length
    }
  });
});

// ════════════════════════════════════════════════
// GET ALL CATEGORIES
// ════════════════════════════════════════════════
exports.getCategories = catchAsync(async (req, res, next) => {
  const categories = [
    { name: 'general', displayName: 'General' },
    { name: 'entertainment', displayName: 'Entertainment' },
    { name: 'sports', displayName: 'Sports' },
    { name: 'politics', displayName: 'Politics' },
    { name: 'technology', displayName: 'Technology' },
    { name: 'music', displayName: 'Music' },
    { name: 'gaming', displayName: 'Gaming' },
    { name: 'news', displayName: 'News' },
    { name: 'other', displayName: 'Other' }
  ];

  res.status(200).json({
    status: 'success',
    data: categories
  });
});

// ════════════════════════════════════════════════
// GET TRENDING STATS
// ════════════════════════════════════════════════
exports.getTrendingStats = catchAsync(async (req, res, next) => {
  const [
    totalHashtags,
    activeHashtags,
    totalTopics,
    trendingTopics
  ] = await Promise.all([
    Hashtag.countDocuments(),
    Hashtag.countDocuments({ isBanned: false, usageCount: { $gt: 0 } }),
    TrendingTopic.countDocuments(),
    TrendingTopic.countDocuments({ status: { $in: ['trending', 'rising'] }, isBanned: false })
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      hashtags: {
        total: totalHashtags,
        active: activeHashtags
      },
      topics: {
        total: totalTopics,
        trending: trendingTopics
      }
    }
  });
});