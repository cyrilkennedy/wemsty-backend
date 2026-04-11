// controllers/post.controller.js

const Post = require('../models/Post.model');
const Like = require('../models/Like.model');
const Bookmark = require('../models/Bookmark.model');
const User = require('../models/User.model');
const Block = require('../models/Block.model');
const AppError = require('../utils/AppError');
const { catchAsync } = require('../utils/catchAsync');
const {
  POST_CATEGORIES,
  DEFAULT_POST_CATEGORY,
  normalizeCategorySlug,
  isValidPostCategory,
  getPostCategory
} = require('../config/post-categories');
const {
  createNotification,
  createMentionNotifications
} = require('../services/notification.service');
const { kafkaManager } = require('../config/kafka');
const realtimeEvents = require('../services/realtime-events.service');
const algoliaService = require('../services/algolia.service');

async function attachViewerStateToPosts(posts, userId) {
  if (!userId || posts.length === 0) {
    return posts.map((post) => post.toObject());
  }

  const postIds = posts.map((post) => post._id);
  const userLikes = await Like.find({
    user: userId,
    post: { $in: postIds }
  }).select('post');

  const likedPostIds = new Set(userLikes.map((like) => like.post.toString()));

  return posts.map((post) => ({
    ...post.toObject(),
    isLiked: likedPostIds.has(post._id.toString())
  }));
}

// ════════════════════════════════════════════════
// POST CREATION
// ════════════════════════════════════════════════

// Create a post
exports.createPost = catchAsync(async (req, res, next) => {
  const { text, media, visibility, sphereEligible, category } = req.body;
  const userId = req.user._id;
  const normalizedCategory = normalizeCategorySlug(category || DEFAULT_POST_CATEGORY);
  const resolvedVisibility = visibility || 'public';

  // Validate content
  if (!text && (!media || media.length === 0)) {
    return next(new AppError('Post must have text or media', 400));
  }

  if (text && text.length > 500) {
    return next(new AppError('Post text cannot exceed 500 characters', 400));
  }

  if (!isValidPostCategory(normalizedCategory)) {
    return next(new AppError('A valid post category is required', 400));
  }

  // Create post
  const post = await Post.create({
    author: userId,
    postType: 'original',
    category: normalizedCategory,
    content: {
      text,
      media: media || []
    },
    visibility: resolvedVisibility,
    sphereEligible: resolvedVisibility === 'public' ? sphereEligible !== false : false
  });

  // Increment user's post count
  await User.findByIdAndUpdate(userId, {
    $inc: { posts_count: 1 }
  });

  // Populate author details
  await post.populate('author', 'username profile.displayName profile.avatar');

  if (text) {
    await createMentionNotifications({
      text,
      actor: userId,
      type: 'mention',
      objectType: 'post',
      objectId: post._id
    });
  }

  // Emit event for search indexing (Kafka)
  await kafkaManager.emitSearchIndexEvent('index', 'post', post._id.toString(), {
    action: 'create',
    visibility: post.visibility
  });

  // Emit event for search indexing (Algolia direct fallback)
  if (algoliaService.client && post.visibility === 'public') {
    await algoliaService.savePost(post);
  }

  // Emit event for real-time updates
  realtimeEvents.emit('post.created', { post });

  // Emit event for feed distribution (Kafka)
  await kafkaManager.emitPostEvent('created', post._id, userId, {
    category: post.category,
    visibility: post.visibility
  });


  res.status(201).json({
    success: true,
    message: 'Post created successfully',
    data: {
      post,
      category: getPostCategory(post.category)
    }
  });
});

// Create a repost
exports.createRepost = catchAsync(async (req, res, next) => {
  const { postId, text } = req.body;
  const userId = req.user._id;

  // Find original post
  const originalPost = await Post.findById(postId);
  
  if (!originalPost) {
    return next(new AppError('Original post not found', 404));
  }

  // Check if can view original post
  const canView = await originalPost.canBeViewedBy(userId);
  if (!canView) {
    return next(new AppError('Cannot repost this post', 403));
  }

  // Check if already reposted
  const existingRepost = await Post.findOne({
    author: userId,
    originalPost: postId,
    status: 'active'
  });

  if (existingRepost) {
    return next(new AppError('You have already reposted this', 400));
  }

  // Create repost
  const repost = await Post.create({
    author: userId,
    postType: text ? 'quote' : 'repost',
    originalPost: postId,
    category: originalPost.category,
    content: {
      text: text || ''
    },
    visibility: originalPost.visibility,
    sphereEligible: originalPost.visibility === 'public'
  });

  // Update original post repost counter
  await Post.findByIdAndUpdate(postId, {
    $inc: { 'engagement.reposts': 1 }
  });

  // Populate details
  await repost.populate([
    { path: 'author', select: 'username profile.displayName profile.avatar' },
    { 
      path: 'originalPost',
      populate: { path: 'author', select: 'username profile.displayName profile.avatar' }
    }
  ]);

  await createNotification({
    recipient: originalPost.author,
    actor: userId,
    type: 'repost',
    objectType: 'post',
    objectId: originalPost._id,
    previewText: text || originalPost.content?.text || ''
  });

  if (text) {
    await createMentionNotifications({
      text,
      actor: userId,
      type: 'mention',
      objectType: 'post',
      objectId: repost._id
    });
  }

  res.status(201).json({
    success: true,
    message: 'Reposted successfully',
    data: { post: repost }
  });
});

// Create a reply/comment
exports.createReply = catchAsync(async (req, res, next) => {
  const { postId, text } = req.body;
  const userId = req.user._id;

  if (!text || text.trim() === '') {
    return next(new AppError('Reply text is required', 400));
  }

  if (text.length > 500) {
    return next(new AppError('Reply text cannot exceed 500 characters', 400));
  }

  // Find parent post
  const parentPost = await Post.findById(postId);
  
  if (!parentPost) {
    return next(new AppError('Post not found', 404));
  }

  // Check if can view parent post
  const canView = await parentPost.canBeViewedBy(userId);
  if (!canView) {
    return next(new AppError('Cannot reply to this post', 403));
  }

  // Create reply
  const reply = await Post.create({
    author: userId,
    postType: 'reply',
    parentPost: postId,
    replyTo: parentPost.author,
    category: parentPost.category,
    content: {
      text
    },
    visibility: parentPost.visibility,
    sphereEligible: false
  });

  // Update parent post comment counter
  await Post.findByIdAndUpdate(postId, {
    $inc: { 'engagement.comments': 1 }
  });

  // Populate details
  await reply.populate([
    { path: 'author', select: 'username profile.displayName profile.avatar' },
    { path: 'replyTo', select: 'username profile.displayName' }
  ]);

  await createNotification({
    recipient: parentPost.author,
    actor: userId,
    type: 'reply',
    objectType: 'post',
    objectId: parentPost._id,
    previewText: text
  });

  await createMentionNotifications({
    text,
    actor: userId,
    type: 'mention',
    objectType: 'post',
    objectId: reply._id
  });

  res.status(201).json({
    success: true,
    message: 'Reply posted successfully',
    data: { reply }
  });
});

// ════════════════════════════════════════════════
// POST RETRIEVAL
// ════════════════════════════════════════════════

// Get home feed
exports.getHomeFeed = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.max(1, parseInt(limit, 10) || 20);

  const result = await Post.getHomeFeed(userId, { page: parsedPage, limit: parsedLimit });
  const postsWithLikeStatus = await attachViewerStateToPosts(result.posts, userId);

  res.status(200).json({
    status: 'success',
    success: true,
    data: {
      feed: postsWithLikeStatus,
      items: postsWithLikeStatus,
      posts: postsWithLikeStatus,
      pagination: result.pagination
    }
  });
});

// Get Sphere/For You feed
exports.getSphereFeed = catchAsync(async (req, res, next) => {
  const userId = req.user?._id;
  const { page = 1, limit = 20, mode = 'top' } = req.query;
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.max(1, parseInt(limit, 10) || 20);

  const result = await Post.getSphereFeed(userId, { page: parsedPage, limit: parsedLimit, mode });
  const feed = await attachViewerStateToPosts(result.posts, userId);

  res.status(200).json({
    status: 'success',
    success: true,
    data: {
      feed,
      items: feed,
      posts: feed,
      pagination: result.pagination
    }
  });
});

exports.listCategories = catchAsync(async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      categories: POST_CATEGORIES
    }
  });
});

exports.getCategoryFeed = catchAsync(async (req, res, next) => {
  const userId = req.user?._id;
  const { categorySlug } = req.params;
  const { page = 1, limit = 20, mode = 'latest' } = req.query;
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.max(1, parseInt(limit, 10) || 20);
  const category = getPostCategory(categorySlug);

  if (!category) {
    return next(new AppError('Category not found', 404));
  }

  const result = await Post.getCategoryFeed(category.slug, userId, { page: parsedPage, limit: parsedLimit, mode });
  const feed = await attachViewerStateToPosts(result.posts, userId);

  res.status(200).json({
    status: 'success',
    success: true,
    data: {
      category,
      feed,
      items: feed,
      posts: feed,
      pagination: result.pagination
    }
  });
});

// Get single post
exports.getPost = catchAsync(async (req, res, next) => {
  const { postId } = req.params;
  const userId = req.user?._id;

  const post = await Post.findById(postId)
    .populate('author', 'username profile.displayName profile.avatar isEmailVerified')
    .populate({
      path: 'originalPost',
      populate: { path: 'author', select: 'username profile.displayName profile.avatar' }
    });

  if (!post || post.status === 'deleted') {
    return next(new AppError('Post not found', 404));
  }

  // Check if user can view
  if (userId) {
    const canView = await post.canBeViewedBy(userId);
    if (!canView) {
      return next(new AppError('Post not found', 404));
    }

    // Check if liked by current user
    const isLiked = await Like.isLikedByUser(userId, postId);
    const isBookmarked = await Bookmark.exists({ user: userId, post: postId });

    // Increment views
    await post.incrementViews();

    return res.status(200).json({
      success: true,
      data: {
        post: {
          ...post.toObject(),
          isLiked,
          isBookmarked
        }
      }
    });
  }

  res.status(200).json({
    success: true,
    data: { post }
  });
});

// Get post thread (with replies)
exports.getPostThread = catchAsync(async (req, res, next) => {
  const { postId } = req.params;
  const userId = req.user?._id;

  const { post, replies } = await Post.getThread(postId, userId);

  if (!post || post.status === 'deleted') {
    return next(new AppError('Post not found', 404));
  }

  // Check if user can view
  if (userId) {
    const canView = await post.canBeViewedBy(userId);
    if (!canView) {
      return next(new AppError('Post not found', 404));
    }

    // Check liked status for all posts in thread
    const allPostIds = [post._id, ...replies.map(r => r._id)];
    const userLikes = await Like.find({ 
      user: userId, 
      post: { $in: allPostIds } 
    }).select('post');
    
    const likedPostIds = new Set(userLikes.map(l => l.post.toString()));

    return res.status(200).json({
      success: true,
      data: {
        post: {
          ...post.toObject(),
          isLiked: likedPostIds.has(post._id.toString())
        },
        replies: replies.map(r => ({
          ...r.toObject(),
          isLiked: likedPostIds.has(r._id.toString())
        }))
      }
    });
  }

  res.status(200).json({
    success: true,
    data: { post, replies }
  });
});

// Get user's posts (profile feed)
exports.getUserPosts = catchAsync(async (req, res, next) => {
  const { username } = req.params;
  const { page = 1, limit = 20, includeReplies } = req.query;
  const viewerId = req.user?._id;

  // Find user
  const user = await User.findOne({ username });
  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Check if blocked
  if (viewerId) {
    const isBlocked = await Block.isBlocked(viewerId, user._id);
    if (isBlocked) {
      return next(new AppError('User not found', 404));
    }
  }

  const result = await Post.getUserPosts(user._id, viewerId, {
    page,
    limit,
    includeReplies: includeReplies === 'true'
  });

  res.status(200).json({
    success: true,
    data: {
      posts: result.posts,
      pagination: result.pagination
    }
  });
});

// ════════════════════════════════════════════════
// POST INTERACTIONS
// ════════════════════════════════════════════════

// Like/Unlike post
exports.toggleLike = catchAsync(async (req, res, next) => {
  const { postId } = req.params;
  const userId = req.user._id;
  const { source } = req.body;

  // Check if post exists
  const post = await Post.findById(postId);
  if (!post || post.status === 'deleted') {
    return next(new AppError('Post not found', 404));
  }

  // Check if can view post
  const canView = await post.canBeViewedBy(userId);
  if (!canView) {
    return next(new AppError('Cannot interact with this post', 403));
  }

  // Toggle like
  const result = await Like.toggleLike(userId, postId, source);

  // Recalculate sphere score
  const updatedPost = await Post.findById(postId);
  updatedPost.calculateSphereScore();
  await updatedPost.save({ validateBeforeSave: false });

  if (result.liked) {
    await createNotification({
      recipient: post.author,
      actor: userId,
      type: 'like',
      objectType: 'post',
      objectId: post._id,
      previewText: post.content?.text || ''
    });
  }

  // Emit real-time update
  realtimeEvents.emit('post.liked', { 
    postId: post._id, 
    likesCount: updatedPost.engagement.likes,
    userId: userId 
  });

  // Emit Kafka event for engagement tracking
  await kafkaManager.emitPostEvent('liked', post._id, userId, {
    likesCount: updatedPost.engagement.likes,
    isLiked: result.liked
  });

  // Update Algolia if public
  if (algoliaService.client && post.visibility === 'public') {
    await algoliaService.updatePost(post._id, {
      'engagement.likes': updatedPost.engagement.likes
    });
  }

  res.status(200).json({
    success: true,
    message: result.message,
    data: {
      liked: result.liked,
      likesCount: updatedPost.engagement.likes
    }
  });
});

// Get users who liked a post
exports.getPostLikes = catchAsync(async (req, res, next) => {
  const { postId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  // Check if post exists
  const post = await Post.findById(postId);
  if (!post) {
    return next(new AppError('Post not found', 404));
  }

  const result = await Like.getLikes(postId, { page, limit });

  res.status(200).json({
    success: true,
    data: {
      likes: result.likes,
      pagination: result.pagination
    }
  });
});

// Bookmark/Unbookmark post
exports.toggleBookmark = catchAsync(async (req, res, next) => {
  const { postId } = req.params;
  const userId = req.user._id;
  const { collection } = req.body;

  // Check if post exists
  const post = await Post.findById(postId);
  if (!post || post.status === 'deleted') {
    return next(new AppError('Post not found', 404));
  }

  const result = await Bookmark.toggleBookmark(userId, postId, collection);

  res.status(200).json({
    success: true,
    message: result.message,
    data: {
      bookmarked: result.bookmarked
    }
  });
});

// Get user's bookmarks
exports.getBookmarks = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { page = 1, limit = 20, collection } = req.query;

  const result = await Bookmark.getUserBookmarks(userId, { page, limit, collection });

  res.status(200).json({
    success: true,
    data: {
      bookmarks: result.bookmarks,
      pagination: result.pagination
    }
  });
});

// ════════════════════════════════════════════════
// POST MANAGEMENT
// ════════════════════════════════════════════════

// Delete post
exports.deletePost = catchAsync(async (req, res, next) => {
  const { postId } = req.params;
  const userId = req.user._id;

  const post = await Post.findById(postId);

  if (!post) {
    return next(new AppError('Post not found', 404));
  }

  // Check ownership
  if (!post.author.equals(userId) && req.user.role !== 'admin') {
    return next(new AppError('You can only delete your own posts', 403));
  }

  // Soft delete
  post.status = 'deleted';
  await post.save();

  // Decrement user's post count
  await User.findByIdAndUpdate(post.author, {
    $inc: { posts_count: -1 }
  });

  res.status(200).json({
    success: true,
    message: 'Post deleted successfully'
  });
});

// Search posts
exports.searchPosts = catchAsync(async (req, res, next) => {
  const { q, page = 1, limit = 20, category } = req.query;
  const userId = req.user?._id;

  if (!q) {
    return next(new AppError('Search query is required', 400));
  }

  // Get blocked users
  let blockedIds = [];
  if (userId) {
    const blocked = await Block.find({
      $or: [{ blocker: userId }, { blocked: userId }]
    });
    blockedIds = blocked.map(b => 
      b.blocker.equals(userId) ? b.blocked : b.blocker
    );
  }

  const normalizedCategory = category ? normalizeCategorySlug(category) : null;
  if (normalizedCategory && !isValidPostCategory(normalizedCategory)) {
    return next(new AppError('Invalid category filter', 400));
  }

  // Text search
  const searchQuery = {
    $text: { $search: q },
    author: { $nin: blockedIds },
    visibility: 'public',
    status: 'active'
  };

  if (normalizedCategory) {
    searchQuery.category = normalizedCategory;
  }

  const posts = await Post.find(searchQuery)
    .populate('author', 'username profile.displayName profile.avatar')
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .skip((page - 1) * limit);

  const total = await Post.countDocuments({
    $text: { $search: q },
    ...(normalizedCategory ? { category: normalizedCategory } : {}),
    visibility: 'public',
    status: 'active'
  });

  const matchedCategories = POST_CATEGORIES.filter((item) => {
    const term = q.trim().toLowerCase();
    return item.slug.includes(term) || item.name.toLowerCase().includes(term);
  });

  res.status(200).json({
    success: true,
    data: {
      posts,
      categories: matchedCategories,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

// Get trending posts
exports.getTrending = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20, timeframe = '24h', category } = req.query;
  const userId = req.user?._id;

  // Calculate time threshold
  const hours = timeframe === '24h' ? 24 : timeframe === '7d' ? 168 : 24;
  const timeThreshold = new Date(Date.now() - hours * 60 * 60 * 1000);

  // Get blocked users
  let blockedIds = [];
  if (userId) {
    const blocked = await Block.find({
      $or: [{ blocker: userId }, { blocked: userId }]
    });
    blockedIds = blocked.map(b => 
      b.blocker.equals(userId) ? b.blocked : b.blocker
    );
  }

  const normalizedCategory = category ? normalizeCategorySlug(category) : null;
  if (normalizedCategory && !isValidPostCategory(normalizedCategory)) {
    return next(new AppError('Invalid category filter', 400));
  }

  const trendingQuery = {
    createdAt: { $gte: timeThreshold },
    author: { $nin: blockedIds },
    visibility: 'public',
    status: 'active'
  };

  if (normalizedCategory) {
    trendingQuery.category = normalizedCategory;
  }

  const posts = await Post.find(trendingQuery)
    .populate('author', 'username profile.displayName profile.avatar')
    .sort({ 'engagement.score': -1, 'engagement.velocity': -1 })
    .limit(limit)
    .skip((page - 1) * limit);

  res.status(200).json({
    success: true,
    data: {
      posts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    }
  });
});
