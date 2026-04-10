// routes/trending.routes.js - Trending topics API routes

const express = require('express');
const router = express.Router();
const trendingController = require('../controllers/trending.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const rateLimitService = require('../services/rate-limit.service');

// Rate limiting for search operations
const searchRateLimit = async (req, res, next) => {
  const result = await rateLimitService.checkRateLimit(req.user?._id || req.ip, 'search', req.ip);
  if (!result.allowed) {
    return res.status(429).json({
      status: 'error',
      message: 'Too many requests',
      retryAfter: Math.ceil(result.windowMs / 1000)
    });
  }
  next();
};

// ════════════════════════════════════════════════
// PUBLIC ROUTES (No auth required)
// ════════════════════════════════════════════════

/**
 * @route   GET /api/v1/trending/hashtags
 * @desc    Get trending hashtags
 * @access  Public
 */
router.get('/hashtags', searchRateLimit, trendingController.getTrendingHashtags);

/**
 * @route   GET /api/v1/trending/topics
 * @desc    Get trending topics
 * @access  Public
 */
router.get('/topics', searchRateLimit, trendingController.getTrendingTopics);

/**
 * @route   GET /api/v1/trending/categories
 * @desc    Get all available categories
 * @access  Public
 */
router.get('/categories', trendingController.getCategories);

/**
 * @route   GET /api/v1/trending/stats
 * @desc    Get trending statistics
 * @access  Public
 */
router.get('/stats', trendingController.getTrendingStats);

// ════════════════════════════════════════════════
// AUTHENTICATED ROUTES
// ════════════════════════════════════════════════

router.use(authMiddleware.protect);

/**
 * @route   GET /api/v1/trending/category/:category
 * @desc    Get trending topics by category
 * @access  Private
 */
router.get('/category/:category', searchRateLimit, trendingController.getTopicsByCategory);

/**
 * @route   GET /api/v1/trending/hashtag/:tag
 * @desc    Get hashtag details
 * @access  Private
 */
router.get('/hashtag/:tag', trendingController.getHashtagDetails);

/**
 * @route   GET /api/v1/trending/topic/:topic/:type?
 * @desc    Get topic details
 * @access  Private
 */
router.get('/topic/:topic{/:type}', trendingController.getTopicDetails);

/**
 * @route   GET /api/v1/trending/region/:region
 * @desc    Get regional trending topics
 * @access  Private
 */
router.get('/region/:region', trendingController.getRegionalTrending);

/**
 * @route   GET /api/v1/trending/search
 * @desc    Search hashtags
 * @access  Private
 */
router.get('/search', searchRateLimit, trendingController.searchHashtags);

module.exports = router;