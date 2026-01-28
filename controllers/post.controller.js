// controllers/post.controller.js

const Post = require('../models/Post.model');
const Like = require('../models/Like.model');
const Bookmark = require('../models/Bookmark.model');
const User = require('../models/User.model');
const Block = require('../models/Block.model');
const AppError = require('../utils/AppError');
const { catchAsync } = require('../utils/catchAsync');

// ════════════════════════════════════════════════
// POST CREATION
// ════════════════════════════════════════════════

// Create a post
exports.createPost = catchAsync(async (req, res, next) => {
  const { text, media, visibility, sphereEligible } = req.body;
  const userId = req.user._id;

  // Validate content
  if (!text && (!media || media.length === 0)) {
    return next(new AppError('Post must have text or media', 400));
  }

  if (text && text.length > 280) {
    return next(new AppError('Post text cannot exceed 280 characters', 400));
  }

  // Create post
  const post = await Post.create({
    author: userId,
    postType: 'original',
    content: {
      text,
      media: media || []
    },
    visibility: visibility || 'public',
    sphereEligible: sphereEligible !== false
  });

  // Increment user's post count
  await User.findByIdAndUpdate(userId, {
    $inc: { posts_count: 1 }
  });

  // Populate author details
  await post.populate('author', 'username profile.displayName profile.avatar');

  // TODO: Emit event for feed distribution
  // eventEmitter.emit('post.created', { postId: post._id, authorId: userId });

  res.status(201).json({
    success: true,
    message: 'Post created successfully',
    data: { post }
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
    content: {
      text: text || ''
    },
    visibility: originalPost.visibility
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
    content: {
      text
    },
    visibility: parentPost.visibility
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

  // TODO: Emit event for notifications
  // eventEmitter.emit('reply.created', { replyId: reply._id, parentId: postId });

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

  const result = await Post.getHomeFeed(userId, { page, limit });

  // Check which posts are liked by current user
  const postIds = result.posts.map(p => p._id);
  const userLikes = await Like.find({ 
    user: userId, 
    post: { $in: postIds } 
  }).select('post');
  
  const likedPostIds = new Set(userLikes.map(l => l.post.toString()));

  // Add liked status to posts
  const postsWithLikeStatus = result.posts.map(post => ({
    ...post.toObject(),
    isLiked: likedPostIds.has(post._id.toString())
  }));

  res.status(200).json({
    success: true,
    data: {
      feed: postsWithLikeStatus,
      pagination: result.pagination
    }
  });
});

// Get Sphere/For You feed
exports.getSphereFeed = catchAsync(async (req, res, next) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;

  const result = await Post.getSphereFeed(userId, { page, limit });

  res.status(200).json({
    success: true,
    data: {
      feed: result.posts,
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
  const { q, page = 1, limit = 20 } = req.query;
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

  // Text search
  const posts = await Post.find({
    $text: { $search: q },
    author: { $nin: blockedIds },
    visibility: 'public',
    status: 'active'
  })
    .populate('author', 'username profile.displayName profile.avatar')
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .skip((page - 1) * limit);

  const total = await Post.countDocuments({
    $text: { $search: q },
    visibility: 'public',
    status: 'active'
  });

  res.status(200).json({
    success: true,
    data: {
      posts,
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
  const { page = 1, limit = 20, timeframe = '24h' } = req.query;
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

  const posts = await Post.find({
    createdAt: { $gte: timeThreshold },
    author: { $nin: blockedIds },
    visibility: 'public',
    status: 'active'
  })
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