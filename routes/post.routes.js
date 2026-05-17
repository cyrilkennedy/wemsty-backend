// routes/post.routes.js

const express = require('express');
const router = express.Router();
const postController = require('../controllers/post.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const rateLimit = require('express-rate-limit');

// ════════════════════════════════════════════════
// RATE LIMITERS
// ════════════════════════════════════════════════

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 posts per 15 minutes
  message: 'Too many posts created. Please try again later.'
});

const interactionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 interactions per minute
  message: 'Too many interactions. Please slow down.'
});

// ════════════════════════════════════════════════
// PUBLIC ROUTES (Optional Authentication)
// ════════════════════════════════════════════════

/**
 * @route   GET /api/posts/trending
 * @desc    Get trending posts
 * @access  Public
 */
router.get('/trending', authMiddleware.optionalAuth, postController.getTrending);

/**
 * @route   GET /api/posts/categories
 * @desc    List supported Wemsty categories
 * @access  Public
 */
router.get('/categories', postController.listCategories);

/**
 * @route   GET /api/posts/sphere
 * @desc    Get public Sphere feed
 * @access  Public
 */
router.get('/sphere', authMiddleware.optionalAuth, postController.getSphereFeed);

/**
 * @route   GET /api/posts/category/:categorySlug
 * @desc    Get posts for a category feed
 * @access  Public
 */
router.get('/category/:categorySlug', authMiddleware.optionalAuth, postController.getCategoryFeed);

/**
 * @route   GET /api/posts/search
 * @desc    Search posts
 * @access  Public
 */
router.get('/search', authMiddleware.optionalAuth, postController.searchPosts);

router.get('/likes/me', authMiddleware.protect, postController.getMyLikedPosts);
router.get('/bookmarks/me', authMiddleware.protect, postController.getBookmarks);
router.get('/user/:username/media', authMiddleware.optionalAuth, postController.getUserMediaPosts);
router.get('/user/:username/reposts', authMiddleware.optionalAuth, postController.getUserReposts);
router.get('/user/:username', authMiddleware.optionalAuth, postController.getUserPosts);

/**
 * @route   GET /api/posts/:postId
 * @desc    Get single post
 * @access  Public
 */
router.get('/:postId', authMiddleware.optionalAuth, postController.getPost);

/**
 * @route   GET /api/posts/:postId/thread
 * @desc    Get post with all replies (thread view)
 * @access  Public
 */
router.get('/:postId/thread', authMiddleware.optionalAuth, postController.getPostThread);
router.get('/:postId/reposts', authMiddleware.optionalAuth, postController.getPostReposts);
router.get('/:postId/quotes', authMiddleware.optionalAuth, postController.getPostQuotes);
router.post('/:postId/view', authMiddleware.optionalAuth, postController.trackPostView);

// ════════════════════════════════════════════════
// PROTECTED ROUTES (Require Authentication)
// ════════════════════════════════════════════════

// All routes below require authentication
router.use(authMiddleware.protect);

router.use('/feed', (req, res, next) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Link', '</api/feed>; rel="successor-version"');
  next();
});

/**
 * @route   GET /api/posts/feed/home
 * @desc    Get home feed (posts from following)
 * @access  Private
 */
router.get('/feed/home', postController.getHomeFeed);

/**
 * @route   GET /api/posts/feed/sphere
 * @desc    Get Sphere/For You feed (discovery)
 * @access  Private
 */
router.get('/feed/sphere', postController.getSphereFeed);

/**
 * @route   POST /api/posts
 * @desc    Create a new post
 * @access  Private
 */
router.post('/', postLimiter, postController.createPost);

/**
 * @route   POST /api/posts/repost
 * @desc    Repost or quote repost
 * @access  Private
 */
router.post('/repost', postLimiter, postController.createRepost);
router.delete('/repost/:postId', interactionLimiter, postController.removeRepost);

/**
 * @route   POST /api/posts/reply
 * @desc    Reply to a post (comment)
 * @access  Private
 */
router.post('/reply', postLimiter, postController.createReply);
router.patch('/reply/:replyId', interactionLimiter, postController.editReply);
router.delete('/reply/:replyId', interactionLimiter, postController.deleteReply);
router.post('/reply/:replyId/like', interactionLimiter, postController.likeReply);
router.delete('/reply/:replyId/like', interactionLimiter, postController.unlikeReply);

/**
 * @route   POST /api/posts/:postId/like
 * @desc    Like a post (idempotent)
 * @access  Private
 */
router.post('/:postId/like', interactionLimiter, postController.toggleLike);
router.delete('/:postId/like', interactionLimiter, postController.unlikePost);
router.post('/:postId/engagement', interactionLimiter, postController.trackPostEngagement);
router.post('/:postId/link-click', interactionLimiter, postController.trackPostLinkClick);

/**
 * @route   GET /api/posts/:postId/likes
 * @desc    Get users who liked a post
 * @access  Private
 */
router.get('/:postId/likes', postController.getPostLikes);

/**
 * @route   POST /api/posts/:postId/bookmark
 * @desc    Bookmark a post (idempotent)
 * @access  Private
 */
router.post('/:postId/bookmark', postController.toggleBookmark);
router.delete('/:postId/bookmark', postController.unbookmarkPost);

/**
 * @route   DELETE /api/posts/:postId
 * @desc    Delete a post
 * @access  Private
 */
router.delete('/:postId', postController.deletePost);

module.exports = router;
