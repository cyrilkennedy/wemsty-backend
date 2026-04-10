const User = require('../models/User.model');
const Post = require('../models/Post.model');
const Circle = require('../models/Circle.model');
const { POST_CATEGORIES } = require('../config/post-categories');
const { catchAsync } = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const algoliaService = require('../services/algolia.service');

exports.searchAll = catchAsync(async (req, res, next) => {
  const { q, type = 'all', limit = 10 } = req.query;

  if (!q || !q.trim()) {
    return next(new AppError('Search query is required', 400));
  }

  const safeLimit = Math.min(parseInt(limit, 10) || 10, 25);
  const regex = new RegExp(q.trim(), 'i');

  let users = [];
  let posts = [];
  let circles = [];
  let categories = [];

  const useAlgolia = !!algoliaService.client;

  if (type === 'all' || type === 'users') {
    if (useAlgolia) {
      const result = await algoliaService.search(q, { index: 'users', hitsPerPage: safeLimit });
      users = result.hits;
    } else {
      users = await User.find({
        accountStatus: 'active',
        $or: [{ username: regex }, { 'profile.displayName': regex }]
      })
        .select('username profile.displayName profile.avatar followers_count following_count')
        .limit(safeLimit);
    }
  }

  if (type === 'all' || type === 'posts') {
    if (useAlgolia) {
      const result = await algoliaService.search(q, { index: 'posts', hitsPerPage: safeLimit });
      posts = result.hits;
      // In production, you might want to hydrate these from DB if you need full populated objects
    } else {
      posts = await Post.find({
        visibility: 'public',
        status: 'active',
        $or: [{ 'content.text': regex }, { 'content.hashtags': regex }, { category: regex }]
      })
        .populate('author', 'username profile.displayName profile.avatar')
        .sort({ createdAt: -1 })
        .limit(safeLimit);
    }
  }

  if (type === 'all' || type === 'circles') {
    if (useAlgolia) {
      const result = await algoliaService.search(q, { index: 'circles', hitsPerPage: safeLimit });
      circles = result.hits;
    } else {
      circles = await Circle.find({
        visibility: 'public',
        'moderation.status': 'active',
        $or: [{ name: regex }, { slug: regex }, { description: regex }]
      })
        .populate('owner', 'username profile.displayName profile.avatar')
        .sort({ memberCount: -1, lastActivityAt: -1 })
        .limit(safeLimit);
    }
  }

  if (type === 'all' || type === 'categories') {
    const term = q.trim().toLowerCase();
    categories = POST_CATEGORIES.filter((category) =>
      category.slug.includes(term) || category.name.toLowerCase().includes(term)
    ).slice(0, safeLimit);
  }

  res.status(200).json({
    success: true,
    data: {
      users,
      posts,
      circles,
      categories
    }
  });
});
