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

const REPOST_TYPES = ['repost', 'quote'];
const LIKE_SOURCE_FALLBACK = 'home_feed';

function toClientPost(post) {
  const plainPost = typeof post?.toObject === 'function' ? post.toObject() : post;
  const engagement = plainPost?.engagement || {};

  return {
    ...plainPost,
    likesCount: Number(engagement.likes || 0),
    commentsCount: Number(engagement.comments || 0),
    repostsCount: Number(engagement.reposts || 0),
    isQuote: plainPost?.postType === 'quote',
    isReply: plainPost?.postType === 'reply',
    isRepost: plainPost?.postType === 'repost' || plainPost?.postType === 'quote'
  };
}

async function syncPostCounters(postId, counters = {}) {
  const nextCounterValues = {};

  if (counters.likes) {
    nextCounterValues['engagement.likes'] = await Like.distinct('user', { post: postId }).then((users) => users.length);
  }

  if (counters.comments) {
    nextCounterValues['engagement.comments'] = await Post.countDocuments({
      parentPost: postId,
      postType: 'reply',
      status: 'active'
    });
  }

  if (counters.reposts) {
    nextCounterValues['engagement.reposts'] = await Post.distinct('author', {
      originalPost: postId,
      postType: { $in: REPOST_TYPES },
      status: 'active'
    }).then((users) => users.length);
  }

  const hasUpdates = Object.keys(nextCounterValues).length > 0;
  const updatedPost = hasUpdates
    ? await Post.findByIdAndUpdate(
      postId,
      { $set: nextCounterValues },
      { new: true }
    )
    : await Post.findById(postId);

  if (!updatedPost) {
    return null;
  }

  updatedPost.calculateSphereScore();
  await updatedPost.save({ validateBeforeSave: false });

  return updatedPost;
}

async function getCanonicalActiveRepost(userId, postId) {
  const reposts = await Post.find({
    author: userId,
    originalPost: postId,
    postType: { $in: REPOST_TYPES },
    status: 'active'
  }).sort({ createdAt: -1, _id: -1 });

  if (reposts.length === 0) {
    return null;
  }

  const [canonicalRepost, ...duplicates] = reposts;

  if (duplicates.length > 0) {
    await Post.updateMany(
      { _id: { $in: duplicates.map((repost) => repost._id) } },
      { $set: { status: 'deleted' } }
    );
  }

  return canonicalRepost;
}

async function getCanonicalLike(userId, postId) {
  const likes = await Like.find({
    user: userId,
    post: postId
  })
    .sort({ createdAt: -1, _id: -1 })
    .select('_id');

  if (likes.length === 0) {
    return null;
  }

  const [canonicalLike, ...duplicates] = likes;

  if (duplicates.length > 0) {
    await Like.deleteMany({ _id: { $in: duplicates.map((like) => like._id) } });
  }

  return canonicalLike;
}

async function getCanonicalBookmark(userId, postId) {
  const bookmarks = await Bookmark.find({
    user: userId,
    post: postId
  })
    .sort({ createdAt: -1, _id: -1 })
    .select('_id');

  if (bookmarks.length === 0) {
    return null;
  }

  const [canonicalBookmark, ...duplicates] = bookmarks;

  if (duplicates.length > 0) {
    await Bookmark.deleteMany({ _id: { $in: duplicates.map((bookmark) => bookmark._id) } });
  }

  return canonicalBookmark;
}

async function attachViewerStateToPosts(posts, userId) {
  if (!userId || posts.length === 0) {
    return posts.map((post) => toClientPost(post));
  }

  const postIds = posts.map((post) => post._id);
  const [userLikes, userBookmarks, userReposts] = await Promise.all([
    Like.find({
      user: userId,
      post: { $in: postIds }
    }).select('post'),
    Bookmark.find({
      user: userId,
      post: { $in: postIds }
    }).select('post'),
    Post.find({
      author: userId,
      originalPost: { $in: postIds },
      postType: { $in: REPOST_TYPES },
      status: 'active'
    }).select('originalPost')
  ]);

  const likedPostIds = new Set(userLikes.map((like) => like.post.toString()));
  const bookmarkedPostIds = new Set(userBookmarks.map((bookmark) => bookmark.post.toString()));
  const repostedPostIds = new Set(userReposts.map((repost) => repost.originalPost.toString()));

  return posts.map((post) => ({
    ...toClientPost(post),
    isLiked: likedPostIds.has(post._id.toString()),
    liked: likedPostIds.has(post._id.toString()),
    isBookmarked: bookmarkedPostIds.has(post._id.toString()),
    bookmarked: bookmarkedPostIds.has(post._id.toString()),
    isReposted: repostedPostIds.has(post._id.toString()),
    reposted: repostedPostIds.has(post._id.toString())
  }));
}

// ════════════════════════════════════════════════
// POST CREATION
// ════════════════════════════════════════════════

// Create a post
exports.createPost = catchAsync(async (req, res, next) => {
  const { text, media, visibility, sphereEligible, category } = req.body || {};
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
      post: toClientPost(post),
      category: getPostCategory(post.category)
    }
  });
});

// Create a repost
exports.createRepost = catchAsync(async (req, res, next) => {
  const { postId, text } = req.body || {};
  const userId = req.user._id;
  const quoteText = typeof text === 'string' ? text.trim() : '';

  if (!postId) {
    return next(new AppError('postId is required', 400));
  }

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
  const existingRepost = await getCanonicalActiveRepost(userId, postId);

  if (existingRepost) {
    if (quoteText) {
      existingRepost.postType = 'quote';
      existingRepost.content = {
        ...existingRepost.content,
        text: quoteText
      };

      await existingRepost.save({ validateBeforeSave: false });
      await existingRepost.populate([
        { path: 'author', select: 'username profile.displayName profile.avatar' },
        {
          path: 'originalPost',
          populate: { path: 'author', select: 'username profile.displayName profile.avatar' }
        }
      ]);
      const updatedOriginalPost = await syncPostCounters(postId, { reposts: true });
      realtimeEvents.emit('post.reposted', {
        postId,
        repostsCount: updatedOriginalPost?.engagement?.reposts || 0,
        userId,
        reposted: true
      });

      return res.status(200).json({
        success: true,
        message: 'Quote updated successfully',
        data: {
          post: toClientPost(existingRepost),
          reposted: true,
          isReposted: true,
          repostsCount: updatedOriginalPost?.engagement?.reposts ?? originalPost.engagement?.reposts ?? 0
        }
      });
    }

    const syncedOriginalPost = await syncPostCounters(postId, { reposts: true });
    realtimeEvents.emit('post.reposted', {
      postId,
      repostsCount: syncedOriginalPost?.engagement?.reposts || 0,
      userId,
      reposted: true
    });

    return res.status(200).json({
      success: true,
      message: 'Post already reposted. Use DELETE /api/posts/repost/:postId to unrepost.',
      data: {
        reposted: true,
        isReposted: true,
        postId,
        repostsCount: syncedOriginalPost?.engagement?.reposts ?? 0
      }
    });
  }

  let repost;
  try {
    repost = await Post.create({
      author: userId,
      postType: quoteText ? 'quote' : 'repost',
      originalPost: postId,
      category: originalPost.category,
      content: {
        text: quoteText || ''
      },
      visibility: originalPost.visibility,
      sphereEligible: originalPost.visibility === 'public'
    });
  } catch (error) {
    if (error?.code === 11000) {
      const safeExistingRepost = await getCanonicalActiveRepost(userId, postId);

      if (safeExistingRepost) {
        await safeExistingRepost.populate([
        { path: 'author', select: 'username profile.displayName profile.avatar' },
        {
          path: 'originalPost',
          populate: { path: 'author', select: 'username profile.displayName profile.avatar' }
        }
        ]);
      }
      const updatedOriginalPost = await syncPostCounters(postId, { reposts: true });
      realtimeEvents.emit('post.reposted', {
        postId,
        repostsCount: updatedOriginalPost?.engagement?.reposts || 0,
        userId,
        reposted: true
      });

      return res.status(200).json({
        success: true,
        message: 'Post already reposted',
        data: {
          post: safeExistingRepost ? toClientPost(safeExistingRepost) : null,
          reposted: true,
          isReposted: true,
          repostsCount: updatedOriginalPost?.engagement?.reposts ?? 0
        }
      });
    }
    throw error;
  }

  const canonicalRepost = await getCanonicalActiveRepost(userId, postId);
  if (canonicalRepost) {
    repost = canonicalRepost;
  }
  const updatedOriginalPost = await syncPostCounters(postId, { reposts: true });

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
    previewText: quoteText || originalPost.content?.text || ''
  });

  if (quoteText) {
    await createMentionNotifications({
      text: quoteText,
      actor: userId,
      type: 'mention',
      objectType: 'post',
      objectId: repost._id
    });
  }

  res.status(201).json({
    success: true,
    message: quoteText ? 'Quote repost created successfully' : 'Reposted successfully',
    data: {
      post: toClientPost(repost),
      reposted: true,
      isReposted: true,
      repostsCount: updatedOriginalPost?.engagement?.reposts || 0
    }
  });

  realtimeEvents.emit('post.reposted', {
    postId,
    repostsCount: updatedOriginalPost?.engagement?.reposts || 0,
    userId,
    reposted: true
  });
});

// Create a reply/comment
exports.createReply = catchAsync(async (req, res, next) => {
  const { postId, text } = req.body || {};
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
  const updatedParentPost = await syncPostCounters(postId, { comments: true });

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
    data: {
      reply: toClientPost(reply),
      commentsCount: updatedParentPost?.engagement?.comments || 0
    }
  });
});

// Edit a reply/comment
exports.editReply = catchAsync(async (req, res, next) => {
  const { replyId } = req.params;
  const userId = req.user._id;
  const { text } = req.body || {};

  if (!text || text.trim() === '') {
    return next(new AppError('Reply text is required', 400));
  }

  if (text.length > 500) {
    return next(new AppError('Reply text cannot exceed 500 characters', 400));
  }

  const reply = await Post.findById(replyId);
  if (!reply || reply.status === 'deleted' || reply.postType !== 'reply') {
    return next(new AppError('Comment not found', 404));
  }

  if (!reply.author.equals(userId) && req.user.role !== 'admin') {
    return next(new AppError('You can only edit your own comment', 403));
  }

  reply.content = {
    ...reply.content,
    text: text.trim()
  };
  reply.isEdited = true;
  reply.editedAt = new Date();

  await reply.save({ validateBeforeSave: false });
  await reply.populate([
    { path: 'author', select: 'username profile.displayName profile.avatar' },
    { path: 'replyTo', select: 'username profile.displayName' }
  ]);

  res.status(200).json({
    success: true,
    message: 'Comment updated successfully',
    data: { reply: toClientPost(reply) }
  });
});

// Delete a reply/comment
exports.deleteReply = catchAsync(async (req, res, next) => {
  const { replyId } = req.params;
  const userId = req.user._id;

  const reply = await Post.findById(replyId);
  if (!reply || reply.status === 'deleted' || reply.postType !== 'reply') {
    return next(new AppError('Comment not found', 404));
  }

  if (!reply.author.equals(userId) && req.user.role !== 'admin') {
    return next(new AppError('You can only delete your own comment', 403));
  }

  reply.status = 'deleted';
  await reply.save({ validateBeforeSave: false });

  if (reply.parentPost) {
    await syncPostCounters(reply.parentPost, { comments: true });
  }

  res.status(200).json({
    success: true,
    message: 'Comment deleted successfully',
    data: {
      deleted: true,
      replyId
    }
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
    const [isLiked, isBookmarked, repostDoc] = await Promise.all([
      Like.isLikedByUser(userId, postId),
      Bookmark.exists({ user: userId, post: postId }),
      Post.findOne({
        author: userId,
        originalPost: postId,
        postType: { $in: REPOST_TYPES },
        status: 'active'
      }).select('_id')
    ]);
    const isReposted = !!repostDoc;

    // Increment views
    await post.incrementViews();

    return res.status(200).json({
      success: true,
      data: {
        post: {
          ...toClientPost(post),
          isLiked,
          liked: !!isLiked,
          isBookmarked: !!isBookmarked,
          bookmarked: !!isBookmarked,
          isReposted,
          reposted: isReposted
        }
      }
    });
  }

  res.status(200).json({
    success: true,
    data: { post: toClientPost(post) }
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
          ...toClientPost(post),
          isLiked: likedPostIds.has(post._id.toString()),
          liked: likedPostIds.has(post._id.toString())
        },
        replies: replies.map(r => ({
          ...toClientPost(r),
          isLiked: likedPostIds.has(r._id.toString()),
          liked: likedPostIds.has(r._id.toString())
        }))
      }
    });
  }

  res.status(200).json({
    success: true,
    data: {
      post: toClientPost(post),
      replies: replies.map((reply) => toClientPost(reply))
    }
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
      posts: result.posts.map((post) => toClientPost(post)),
      pagination: result.pagination
    }
  });
});

// ════════════════════════════════════════════════
// POST INTERACTIONS
// ════════════════════════════════════════════════

async function emitLikeSideEffects({ targetPost, actorId, liked, likesCount }) {
  realtimeEvents.emit('post.liked', {
    postId: targetPost._id,
    likesCount,
    userId: actorId,
    liked: !!liked,
    isLiked: !!liked
  });

  await kafkaManager.emitPostEvent('liked', targetPost._id, actorId, {
    likesCount,
    isLiked: !!liked
  });

  if (algoliaService.client && targetPost.visibility === 'public') {
    await algoliaService.updatePost(targetPost._id, {
      'engagement.likes': likesCount
    });
  }
}

// Like post (idempotent create)
exports.toggleLike = catchAsync(async (req, res, next) => {
  const { postId } = req.params;
  const userId = req.user._id;
  const { source } = req.body || {};
  const likeSource = source || LIKE_SOURCE_FALLBACK;

  const post = await Post.findById(postId);
  if (!post || post.status === 'deleted') {
    return next(new AppError('Post not found', 404));
  }

  const canView = await post.canBeViewedBy(userId);
  if (!canView) {
    return next(new AppError('Cannot interact with this post', 403));
  }

  let createdLike = false;
  const existingLike = await getCanonicalLike(userId, postId);

  if (!existingLike) {
    try {
      await Like.create({ user: userId, post: postId, metadata: { source: likeSource } });
      createdLike = true;
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
      await getCanonicalLike(userId, postId);
    }
  }

  const updatedPost = await syncPostCounters(postId, { likes: true });
  const likesCount = updatedPost?.engagement?.likes || 0;

  if (createdLike && !post.author.equals(userId)) {
    await createNotification({
      recipient: post.author,
      actor: userId,
      type: 'like',
      objectType: 'post',
      objectId: post._id,
      previewText: post.content?.text || ''
    });
  }

  await emitLikeSideEffects({
    targetPost: post,
    actorId: userId,
    liked: true,
    likesCount
  });

  res.status(200).json({
    success: true,
    message: createdLike ? 'Post liked' : 'Post already liked',
    data: {
      liked: true,
      isLiked: true,
      likesCount,
      action: createdLike ? 'liked' : 'already_liked'
    }
  });
});

// Explicit unlike endpoint (idempotent)
exports.unlikePost = catchAsync(async (req, res, next) => {
  const { postId } = req.params;
  const userId = req.user._id;

  const post = await Post.findById(postId);
  if (!post || post.status === 'deleted') {
    return next(new AppError('Post not found', 404));
  }

  const deleteResult = await Like.deleteMany({ user: userId, post: postId });
  const removed = Number(deleteResult?.deletedCount || 0) > 0;
  const updatedPost = await syncPostCounters(postId, { likes: true });
  const likesCount = updatedPost?.engagement?.likes || 0;

  await emitLikeSideEffects({
    targetPost: post,
    actorId: userId,
    liked: false,
    likesCount
  });

  res.status(200).json({
    success: true,
    message: removed ? 'Post unliked' : 'Post already unliked',
    data: {
      liked: false,
      isLiked: false,
      likesCount,
      action: removed ? 'unliked' : 'already_unliked'
    }
  });
});

// Like comment/reply (idempotent create)
exports.likeReply = catchAsync(async (req, res, next) => {
  const { replyId } = req.params;
  const userId = req.user._id;
  const { source } = req.body || {};
  const likeSource = source || 'thread';

  const reply = await Post.findById(replyId);
  if (!reply || reply.status === 'deleted' || reply.postType !== 'reply') {
    return next(new AppError('Comment not found', 404));
  }

  const canView = await reply.canBeViewedBy(userId);
  if (!canView) {
    return next(new AppError('Cannot interact with this comment', 403));
  }

  let createdLike = false;
  const existingLike = await getCanonicalLike(userId, replyId);

  if (!existingLike) {
    try {
      await Like.create({ user: userId, post: replyId, metadata: { source: likeSource } });
      createdLike = true;
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
      await getCanonicalLike(userId, replyId);
    }
  }

  const updatedReply = await syncPostCounters(replyId, { likes: true });
  const likesCount = updatedReply?.engagement?.likes || 0;

  if (createdLike && !reply.author.equals(userId)) {
    await createNotification({
      recipient: reply.author,
      actor: userId,
      type: 'like',
      objectType: 'post',
      objectId: reply._id,
      previewText: reply.content?.text || ''
    });
  }

  await emitLikeSideEffects({
    targetPost: reply,
    actorId: userId,
    liked: true,
    likesCount
  });

  res.status(200).json({
    success: true,
    message: createdLike ? 'Comment liked' : 'Comment already liked',
    data: {
      commentId: replyId,
      liked: true,
      isLiked: true,
      likesCount,
      action: createdLike ? 'liked' : 'already_liked'
    }
  });
});

// Unlike comment/reply (idempotent)
exports.unlikeReply = catchAsync(async (req, res, next) => {
  const { replyId } = req.params;
  const userId = req.user._id;

  const reply = await Post.findById(replyId);
  if (!reply || reply.status === 'deleted' || reply.postType !== 'reply') {
    return next(new AppError('Comment not found', 404));
  }

  const deleteResult = await Like.deleteMany({ user: userId, post: replyId });
  const removed = Number(deleteResult?.deletedCount || 0) > 0;
  const updatedReply = await syncPostCounters(replyId, { likes: true });
  const likesCount = updatedReply?.engagement?.likes || 0;

  await emitLikeSideEffects({
    targetPost: reply,
    actorId: userId,
    liked: false,
    likesCount
  });

  res.status(200).json({
    success: true,
    message: removed ? 'Comment unliked' : 'Comment already unliked',
    data: {
      commentId: replyId,
      liked: false,
      isLiked: false,
      likesCount,
      action: removed ? 'unliked' : 'already_unliked'
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

// Bookmark post (idempotent create)
exports.toggleBookmark = catchAsync(async (req, res, next) => {
  const { postId } = req.params;
  const userId = req.user._id;
  const { collection } = req.body || {};

  // Check if post exists
  const post = await Post.findById(postId);
  if (!post || post.status === 'deleted') {
    return next(new AppError('Post not found', 404));
  }

  const existingBookmark = await getCanonicalBookmark(userId, postId);
  let createdBookmark = false;

  if (!existingBookmark) {
    try {
      await Bookmark.create({
        user: userId,
        post: postId,
        folderName: collection || 'default'
      });
      createdBookmark = true;
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
      await getCanonicalBookmark(userId, postId);
    }
  }

  res.status(200).json({
    success: true,
    message: createdBookmark ? 'Post bookmarked' : 'Post already bookmarked',
    data: {
      bookmarked: true,
      isBookmarked: true,
      action: createdBookmark ? 'bookmarked' : 'already_bookmarked'
    }
  });
});

// Explicit unbookmark endpoint (idempotent)
exports.unbookmarkPost = catchAsync(async (req, res, next) => {
  const { postId } = req.params;
  const userId = req.user._id;

  const post = await Post.findById(postId);
  if (!post || post.status === 'deleted') {
    return next(new AppError('Post not found', 404));
  }

  const deleteResult = await Bookmark.deleteMany({ user: userId, post: postId });
  const removed = Number(deleteResult?.deletedCount || 0) > 0;

  res.status(200).json({
    success: true,
    message: removed ? 'Bookmark removed' : 'Post already unbookmarked',
    data: {
      bookmarked: false,
      isBookmarked: false,
      action: removed ? 'unbookmarked' : 'already_unbookmarked'
    }
  });
});

// Remove repost explicitly
exports.removeRepost = catchAsync(async (req, res, next) => {
  const { postId } = req.params;
  const userId = req.user._id;

  const originalPost = await Post.findById(postId);
  if (!originalPost || originalPost.status === 'deleted') {
    return next(new AppError('Post not found', 404));
  }

  const reposts = await Post.find({
    author: userId,
    originalPost: postId,
    postType: { $in: REPOST_TYPES },
    status: 'active'
  }).select('_id');

  const repostIds = reposts.map((item) => item._id);

  if (repostIds.length === 0) {
    const updatedOriginalPost = await syncPostCounters(postId, { reposts: true });
    realtimeEvents.emit('post.reposted', {
      postId,
      repostsCount: updatedOriginalPost?.engagement?.reposts || 0,
      userId,
      reposted: false
    });

    return res.status(200).json({
      success: true,
      message: 'Post already unreposted',
      data: {
        reposted: false,
        isReposted: false,
        postId,
        repostsCount: updatedOriginalPost?.engagement?.reposts || 0,
        action: 'already_unreposted'
      }
    });
  }

  await Post.updateMany(
    { _id: { $in: repostIds } },
    { $set: { status: 'deleted' } }
  );
  const updatedOriginalPost = await syncPostCounters(postId, { reposts: true });

  realtimeEvents.emit('post.reposted', {
    postId,
    repostsCount: updatedOriginalPost?.engagement?.reposts || 0,
    userId,
    reposted: false
  });

  res.status(200).json({
    success: true,
    message: 'Repost removed successfully',
    data: {
      reposted: false,
      isReposted: false,
      postId,
      repostsCount: updatedOriginalPost?.engagement?.reposts || 0,
      action: 'unreposted'
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
