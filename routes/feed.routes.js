// routes/feed.routes.js - Feed API routes

const express = require('express');
const router = express.Router();
const feedController = require('../controllers/feed.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const rateLimitService = require('../services/rate-limit.service');

// Apply authentication to all routes
router.use(authMiddleware.protect);

// Rate limiting for feed operations
const feedRateLimit = async (req, res, next) => {
  const result = await rateLimitService.checkRateLimit(req.user._id, 'get_feed', req.ip);
  if (!result.allowed) {
    return res.status(429).json({
      status: 'error',
      message: 'Too many feed requests',
      retryAfter: Math.ceil(result.windowMs / 1000)
    });
  }
  next();
};

// ════════════════════════════════════════════════
// HOME FEED ROUTES
// ════════════════════════════════════════════════

/**
 * @route   GET /api/v1/feed/home
 * @desc    Get home feed (following-based)
 * @access  Private
 */
router.get('/home', feedRateLimit, feedController.getHomeFeed);

/**
 * @route   POST /api/v1/feed/home/refresh
 * @desc    Refresh feed cache
 * @access  Private
 */
router.post('/home/refresh', feedController.refreshFeedCache);

// ════════════════════════════════════════════════
// SPHERE FEED ROUTES
// ════════════════════════════════════════════════

/**
 * @route   GET /api/v1/feed/sphere
 * @desc    Get Sphere feed (discovery/For You)
 * @access  Private
 */
router.get('/sphere', feedRateLimit, feedController.getSphereFeed);

/**
 * @route   GET /api/v1/feed/sphere/:category
 * @desc    Get category-specific feed
 * @access  Private
 */
router.get('/sphere/category/:category', feedRateLimit, feedController.getCategoryFeed);

// ════════════════════════════════════════════════
// DEBUG AND ANALYTICS ROUTES
// ════════════════════════════════════════════════

/**
 * @route   GET /api/v1/feed/ranking/:postId
 * @desc    Get feed ranking information for a post (debug)
 * @access  Private
 */
router.get('/ranking/:postId', feedController.getFeedRankingInfo);

module.exports = router;