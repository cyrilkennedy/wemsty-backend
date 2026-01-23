// routes/social.routes.js

const express = require('express');
const router = express.Router();
const socialController = require('../controllers/social.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const rateLimit = require('express-rate-limit');

// ════════════════════════════════════════════════
// RATE LIMITERS
// ════════════════════════════════════════════════

// Prevent mass following
const followLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: 'Too many follow actions. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// ════════════════════════════════════════════════
// ALL ROUTES REQUIRE AUTHENTICATION
// ════════════════════════════════════════════════
router.use(authMiddleware.protect);

// ════════════════════════════════════════════════
// FOLLOW ROUTES
// ════════════════════════════════════════════════

/**
 * @route   POST /api/social/follow/:userId
 * @desc    Follow a user
 * @access  Private
 */
router.post('/follow/:userId', followLimiter, socialController.followUser);

/**
 * @route   DELETE /api/social/follow/:userId
 * @desc    Unfollow a user
 * @access  Private
 */
router.delete('/follow/:userId', socialController.unfollowUser);

/**
 * @route   GET /api/social/follow/status/:userId
 * @desc    Check follow status with a user
 * @access  Private
 */
router.get('/follow/status/:userId', socialController.checkFollowStatus);

/**
 * @route   GET /api/social/follow-requests
 * @desc    Get pending follow requests
 * @access  Private
 */
router.get('/follow-requests', socialController.getFollowRequests);

/**
 * @route   POST /api/social/follow-requests/:requestId/accept
 * @desc    Accept a follow request
 * @access  Private
 */
router.post('/follow-requests/:requestId/accept', socialController.acceptFollowRequest);

/**
 * @route   POST /api/social/follow-requests/:requestId/reject
 * @desc    Reject a follow request
 * @access  Private
 */
router.post('/follow-requests/:requestId/reject', socialController.rejectFollowRequest);

/**
 * @route   GET /api/social/followers/:userId
 * @desc    Get user's followers
 * @access  Private
 */
router.get('/followers/:userId', socialController.getFollowers);

/**
 * @route   GET /api/social/following/:userId
 * @desc    Get users that a user follows
 * @access  Private
 */
router.get('/following/:userId', socialController.getFollowing);

/**
 * @route   GET /api/social/mutual/:userId
 * @desc    Get mutual followers with a user
 * @access  Private
 */
router.get('/mutual/:userId', socialController.getMutualFollowers);

/**
 * @route   GET /api/social/suggestions
 * @desc    Get follow suggestions
 * @access  Private
 */
router.get('/suggestions', socialController.getFollowSuggestions);

// ════════════════════════════════════════════════
// BLOCK ROUTES
// ════════════════════════════════════════════════

/**
 * @route   POST /api/social/block/:userId
 * @desc    Block a user
 * @access  Private
 */
router.post('/block/:userId', socialController.blockUser);

/**
 * @route   DELETE /api/social/block/:userId
 * @desc    Unblock a user
 * @access  Private
 */
router.delete('/block/:userId', socialController.unblockUser);

/**
 * @route   GET /api/social/blocked
 * @desc    Get blocked users
 * @access  Private
 */
router.get('/blocked', socialController.getBlockedUsers);

// ════════════════════════════════════════════════
// MUTE ROUTES
// ════════════════════════════════════════════════

/**
 * @route   POST /api/social/mute/:userId
 * @desc    Mute a user
 * @access  Private
 */
router.post('/mute/:userId', socialController.muteUser);

/**
 * @route   DELETE /api/social/mute/:userId
 * @desc    Unmute a user
 * @access  Private
 */
router.delete('/mute/:userId', socialController.unmuteUser);

/**
 * @route   GET /api/social/muted
 * @desc    Get muted users
 * @access  Private
 */
router.get('/muted', socialController.getMutedUsers);

module.exports = router;