// services/feed.service.js - Advanced feed ranking and candidate generation

const Post = require('../models/Post.model');
const User = require('../models/User.model');
const Follow = require('../models/Follow.model');
const Block = require('../models/Block.model');
const Mute = require('../models/Mute.model');
const Circle = require('../models/Circle.model');
const CircleMembership = require('../models/CircleMembership.model');
const redisManager = require('../config/redis');
const { kafkaManager } = require('../config/kafka');
const { sanitizeExternalUrl } = require('../utils/url-sanitizer');

class FeedService {
  constructor() {
    // Constants for ranking algorithm
    this.RECENCY_WEIGHT = 0.3;
    this.RELATIONSHIP_WEIGHT = 0.25;
    this.ENGAGEMENT_WEIGHT = 0.25;
    this.COMMUNITY_AFFINITY_WEIGHT = 0.1;
    this.LANGUAGE_MATCH_WEIGHT = 0.1;
    this.SAFETY_PENALTY = 0.5;
    this.SEEN_PENALTY = 0.3;
    
    // Time decay constants (in hours)
    this.TIME_DECAY_FACTOR = 24;
    
    // Feed cache TTL
    this.FEED_CACHE_TTL = 300; // 5 minutes
  }

  /**
   * Calculate recency score with exponential decay
   * score = e^(-ageInHours / decayFactor)
   */
  calculateRecencyScore(createdAt) {
    const now = new Date();
    const postDate = new Date(createdAt);
    const ageInHours = (now - postDate) / (1000 * 60 * 60);
    return Math.exp(-ageInHours / this.TIME_DECAY_FACTOR);
  }

  /**
   * Calculate engagement score with time decay
   * Higher weight for recent engagement
   */
  calculateEngagementScore(post, userLanguage = 'en') {
    const { likes, comments, reposts, views } = post.engagement || {};
    const likeCount = likes || 0;
    const commentCount = comments || 0;
    const repostCount = reposts || 0;
    
    // Weighted engagement (comments and reposts are more valuable)
    const baseEngagement = (likeCount * 1) + (commentCount * 2) + (repostCount * 3);
    
    // Normalize by views to get engagement rate
    const engagementRate = views > 0 ? baseEngagement / views : baseEngagement;
    
    // Log scale to prevent viral posts from dominating
    const normalizedEngagement = Math.log1p(baseEngagement);
    
    // Language match bonus
    const languageBonus = post.languageCode === userLanguage ? 1.2 : 1.0;
    
    return normalizedEngagement * engagementRate * languageBonus;
  }

  /**
   * Calculate relationship weight based on social graph
   */
  calculateRelationshipWeight(post, viewerId, followedIds = []) {
    const authorId = post.author.toString();
    
    // Direct follow relationship (highest weight)
    if (followedIds.includes(authorId)) {
      return 1.0;
    }
    
    // Friend of friend (medium weight)
    // TODO: Implement second-degree connections
    
    // No relationship (lowest weight)
    return 0.3;
  }

  /**
   * Calculate community affinity score
   */
  async calculateCommunityAffinity(post, viewerId) {
    if (!post.communityId) {
      return 0.5; // Neutral score for non-community posts
    }

    try {
      // Check if viewer is member of the community
      const membership = await CircleMembership.findOne({
        communityId: post.communityId,
        userId: viewerId,
        membershipState: 'active'
      });

      if (membership) {
        return 0.8; // High affinity for joined communities
      }

      return 0.3; // Lower affinity for non-member communities
    } catch (error) {
      console.error('Error calculating community affinity:', error.message);
      return 0.5;
    }
  }

  /**
   * Apply safety penalties based on trust signals
   */
  calculateSafetyPenalty(post, author) {
    let penalty = 0;

    // Low trust score penalty
    if (author && author.trustScore < 0.3) {
      penalty += this.SAFETY_PENALTY;
    }

    // New account penalty (less than 24 hours old)
    if (author && author.createdAt) {
      const accountAgeHours = (Date.now() - author.createdAt) / (1000 * 60 * 60);
      if (accountAgeHours < 24) {
        penalty += 0.2;
      }
    }

    // Moderation flags
    if (post.moderation && post.moderation.flagCount > 0) {
      penalty += Math.min(post.moderation.flagCount * 0.1, 0.5);
    }

    return Math.min(penalty, 1.0);
  }

  /**
   * Calculate seen penalty to avoid showing duplicate content
   */
  async calculateSeenPenalty(postId, viewerId, seenPosts = new Set()) {
    if (seenPosts.has(postId.toString())) {
      return this.SEEN_PENALTY;
    }
    return 0;
  }

  /**
   * Main ranking formula from SPEC-1:
   * score = recency_decay + relationship_weight + engagement_weight + community_affinity + language_match - safety_penalty - seen_penalty
   */
  async calculatePostScore(post, viewerId, context = {}) {
    const {
      followedIds = [],
      seenPosts = new Set(),
      userLanguage = 'en',
      author = null
    } = context;

    // Get author if not provided
    let authorData = author;
    if (!authorData && post.author) {
      try {
        authorData = await User.findById(post.author).select('trustScore createdAt');
      } catch (error) {
        console.error('Error fetching author:', error.message);
      }
    }

    // Calculate individual components
    const recencyScore = this.calculateRecencyScore(post.createdAt);
    const relationshipScore = this.calculateRelationshipWeight(post, viewerId, followedIds);
    const engagementScore = this.calculateEngagementScore(post, userLanguage);
    const communityAffinity = await this.calculateCommunityAffinity(post, viewerId);
    const languageMatch = post.languageCode === userLanguage ? 0.1 : 0;
    const safetyPenalty = this.calculateSafetyPenalty(post, authorData);
    const seenPenalty = await this.calculateSeenPenalty(post._id, viewerId, seenPosts);

    // Apply weights from SPEC-1
    const finalScore = 
      (recencyScore * this.RECENCY_WEIGHT) +
      (relationshipScore * this.RELATIONSHIP_WEIGHT) +
      (engagementScore * this.ENGAGEMENT_WEIGHT) +
      (communityAffinity * this.COMMUNITY_AFFINITY_WEIGHT) +
      (languageMatch * this.LANGUAGE_MATCH_WEIGHT) -
      (safetyPenalty * this.SAFETY_PENALTY) -
      (seenPenalty * this.SEEN_PENALTY);

    return Math.max(0, finalScore); // Ensure non-negative
  }

  /**
   * Get home feed for a user (following-based feed)
   * Uses hybrid fan-out: push for normal users, pull for large accounts
   */
  async getHomeFeed(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      useCache = true
    } = options;

    try {
      // Try to get from cache first
      if (useCache) {
        const cachedFeed = await this.getCachedFeed(userId, page, limit);
        if (cachedFeed) {
          return cachedFeed;
        }
      }

      // Build candidate set from followed users
      const followedUsers = await Follow.find({
        follower: userId,
        status: 'ACCEPTED'
      }).select('following');

      const followedIds = followedUsers.map(f => f.following.toString());

      // Get blocked and muted users
      const blockedUsers = await this.getBlockedAndMutedUsers(userId);

      // Get candidate posts from followed users
      const candidates = await this.getCandidatesFromFollowed(
        userId,
        followedIds,
        blockedUsers,
        limit * 3 // Get more candidates for ranking
      );

      // Score and rank candidates
      const scoredPosts = await this.scoreAndRankCandidates(
        candidates,
        userId,
        { followedIds }
      );

      // Paginate results
      const startIndex = (page - 1) * limit;
      const paginatedPosts = scoredPosts.slice(startIndex, startIndex + limit);

      // Hydrate posts with author and engagement data
      const hydratedPosts = await this.hydratePosts(paginatedPosts, userId);
      const payload = {
        items: hydratedPosts,
        pagination: {
          page,
          limit,
          total: scoredPosts.length,
          pages: Math.ceil(scoredPosts.length / limit),
          hasMore: startIndex + limit < scoredPosts.length
        }
      };

      // Cache the results
      await this.cacheFeed(userId, payload, page, limit);

      return payload;
    } catch (error) {
      console.error('Error getting home feed:', error.message);
      throw error;
    }
  }

  /**
   * Get Sphere/For You feed (discovery feed)
   */
  async getSphereFeed(userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      mode = 'top', // 'top' or 'latest'
      useCache = true
    } = options;

    try {
      // Try cache first
      if (useCache) {
        const cachedFeed = await this.getCachedSphereFeed(userId, page, limit, mode);
        if (cachedFeed) {
          return cachedFeed;
        }
      }

      // Get blocked users
      const blockedUsers = await this.getBlockedAndMutedUsers(userId);

      // Get candidate posts for discovery
      const candidates = await this.getCandidatesForDiscovery(
        userId,
        blockedUsers,
        limit * 3,
        mode
      );

      // Score and rank candidates
      const scoredPosts = await this.scoreAndRankCandidates(
        candidates,
        userId,
        {}
      );

      // Paginate results
      const startIndex = (page - 1) * limit;
      const paginatedPosts = scoredPosts.slice(startIndex, startIndex + limit);

      // Hydrate posts
      const hydratedPosts = await this.hydratePosts(paginatedPosts, userId);
      const payload = {
        items: hydratedPosts,
        pagination: {
          page,
          limit,
          total: scoredPosts.length,
          pages: Math.ceil(scoredPosts.length / limit),
          hasMore: startIndex + limit < scoredPosts.length
        }
      };

      // Cache results
      await this.cacheSphereFeed(userId, payload, page, limit, mode);

      return payload;
    } catch (error) {
      console.error('Error getting sphere feed:', error.message);
      throw error;
    }
  }

  /**
   * Get candidates from followed users
   */
  async getCandidatesFromFollowed(userId, followedIds, blockedUsers, limit = 60) {
    if (followedIds.length === 0) {
      return [];
    }

    const query = {
      author: { $in: followedIds, $nin: blockedUsers },
      status: 'active',
      visibility: { $in: ['public', 'followers'] },
      sphereEligible: true
    };

    return Post.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Get candidates for discovery (Sphere/For You)
   */
  async getCandidatesForDiscovery(userId, blockedUsers, limit = 60, mode = 'top') {
    const query = {
      author: { $nin: blockedUsers },
      status: 'active',
      visibility: 'public',
      sphereEligible: true
    };

    const sort = mode === 'latest'
      ? { createdAt: -1 }
      : { sphereScore: -1, 'engagement.score': -1, createdAt: -1 };

    return Post.find(query)
      .sort(sort)
      .limit(limit)
      .lean();
  }

  /**
   * Score and rank candidates
   */
  async scoreAndRankCandidates(candidates, viewerId, context = {}) {
    if (!candidates.length) {
      return [];
    }

    const authorIds = [...new Set(
      candidates
        .map((post) => post.author?.toString())
        .filter(Boolean)
    )];

    const authors = await User.find({ _id: { $in: authorIds } })
      .select('_id trustScore createdAt')
      .lean();
    const authorMap = new Map(authors.map((author) => [author._id.toString(), author]));

    const scored = await Promise.all(
      candidates.map(async (post) => {
        const score = await this.calculatePostScore(post, viewerId, {
          ...context,
          author: authorMap.get(post.author?.toString()) || null
        });
        return { ...post, _score: score };
      })
    );

    // Sort by score descending
    return scored.sort((a, b) => b._score - a._score);
  }

  /**
   * Hydrate posts with author and viewer state
   */
  async hydratePosts(posts, viewerId) {
    if (!posts.length) {
      return [];
    }

    const postIds = posts.map((post) => post._id);
    const authorIds = [...new Set(
      posts
        .map((post) => post.author?.toString())
        .filter(Boolean)
    )];

    const [authors, likesAgg, commentsAgg, repostsAgg] = await Promise.all([
      User.find({ _id: { $in: authorIds } })
        .select('username profile.displayName profile.avatar isEmailVerified trustScore')
        .lean(),
      require('../models/Like.model').aggregate([
        { $match: { post: { $in: postIds } } },
        { $group: { _id: '$post', users: { $addToSet: '$user' } } },
        { $project: { count: { $size: '$users' } } }
      ]),
      Post.aggregate([
        {
          $match: {
            parentPost: { $in: postIds },
            postType: 'reply',
            status: 'active'
          }
        },
        { $group: { _id: '$parentPost', count: { $sum: 1 } } }
      ]),
      Post.aggregate([
        {
          $match: {
            originalPost: { $in: postIds },
            postType: { $in: ['repost', 'quote'] },
            status: 'active'
          }
        },
        { $group: { _id: { post: '$originalPost', author: '$author' } } },
        { $group: { _id: '$_id.post', count: { $sum: 1 } } }
      ])
    ]);
    const authorMap = new Map(
      authors.map((author) => [
        author._id.toString(),
        {
          ...author,
          profile: author.profile
            ? {
              ...author.profile,
              avatar: sanitizeExternalUrl(author.profile.avatar)
            }
            : author.profile
        }
      ])
    );
    const likesCountMap = new Map(likesAgg.map((item) => [item._id.toString(), Number(item.count || 0)]));
    const commentsCountMap = new Map(commentsAgg.map((item) => [item._id.toString(), Number(item.count || 0)]));
    const repostsCountMap = new Map(repostsAgg.map((item) => [item._id.toString(), Number(item.count || 0)]));

    let likedIds = new Set();
    let repostedIds = new Set();
    let bookmarkedIds = new Set();

    if (viewerId) {
      const [likes, reposts, bookmarks] = await Promise.all([
        require('../models/Like.model')
          .find({ post: { $in: postIds }, user: viewerId })
          .select('post')
          .lean(),
        Post.find({
          author: viewerId,
          originalPost: { $in: postIds },
          postType: { $in: ['repost', 'quote'] },
          status: 'active'
        })
          .select('originalPost')
          .lean(),
        require('../models/Bookmark.model')
          .find({ post: { $in: postIds }, user: viewerId })
          .select('post')
          .lean()
      ]);

      likedIds = new Set(likes.map((item) => item.post.toString()));
      repostedIds = new Set(reposts.map((item) => item.originalPost.toString()));
      bookmarkedIds = new Set(bookmarks.map((item) => item.post.toString()));
    }

    return posts.map((post) => {
      const postId = post._id.toString();
      const engagement = {
        ...(post.engagement || {}),
        likes: likesCountMap.get(postId) ?? 0,
        comments: commentsCountMap.get(postId) ?? 0,
        reposts: repostsCountMap.get(postId) ?? 0
      };
      return {
        post: {
          id: post._id,
          author: authorMap.get(post.author?.toString()) || { username: 'deleted', profile: {} },
          content: post.content,
          postType: post.postType,
          visibility: post.visibility,
          engagement,
          likesCount: engagement.likes,
          commentsCount: engagement.comments,
          repostsCount: engagement.reposts,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
          sphereScore: post.sphereScore,
          moderation: post.moderation
        },
        viewerState: {
          liked: likedIds.has(postId),
          reposted: repostedIds.has(postId),
          bookmarked: bookmarkedIds.has(postId)
        },
        rank: {
          score: post._score,
          reason: this.getRankReason(post, viewerId)
        }
      };
    });
  }

  /**
   * Get viewer's interaction state with a post
   */
  async getViewerPostState(postId, viewerId) {
    if (!viewerId) {
      return { liked: false, reposted: false, bookmarked: false };
    }

    const [like, repost, bookmark] = await Promise.all([
      require('../models/Like.model').findOne({ post: postId, user: viewerId }).lean(),
      Post.findOne({
        author: viewerId,
        originalPost: postId,
        postType: { $in: ['repost', 'quote'] },
        status: 'active'
      }).select('_id').lean(),
      require('../models/Bookmark.model').findOne({ post: postId, user: viewerId }).lean()
    ]);

    return {
      liked: !!like,
      reposted: !!repost,
      bookmarked: !!bookmark
    };
  }

  /**
   * Get blocked and muted users for a viewer
   */
  async getBlockedAndMutedUsers(userId) {
    const [blocked, muted] = await Promise.all([
      Block.find({
        $or: [
          { blocker: userId },
          { blocked: userId }
        ]
      }).select('blocker blocked'),
      Mute.find({ muter: userId }).select('muted')
    ]);

    const blockedIds = new Set();
    
    blocked.forEach(b => {
      if (b.blocker.equals(userId)) {
        blockedIds.add(b.blocked.toString());
      } else {
        blockedIds.add(b.blocker.toString());
      }
    });

    muted.forEach(m => {
      blockedIds.add(m.muted.toString());
    });

    return [...blockedIds];
  }

  /**
   * Get rank reason for debugging/transparency
   */
  getRankReason(post, viewerId) {
    const reasons = [];
    
    if (post.author && viewerId) {
      // Check if author is followed
      // This would need to be passed in context for efficiency
      reasons.push('following');
    }
    
    if (post.engagement && post.engagement.likes > 10) {
      reasons.push('trending');
    }
    
    if (post.createdAt) {
      const ageHours = (Date.now() - new Date(post.createdAt)) / (1000 * 60 * 60);
      if (ageHours < 1) {
        reasons.push('recent');
      }
    }

    return reasons.join('+') || 'recommended';
  }

  /**
   * Cache management methods
   */
  async getCachedFeed(userId, page, limit) {
    const cacheKey = `feed:home:${userId}:${page}:${limit}`;
    return redisManager.get(cacheKey);
  }

  async cacheFeed(userId, posts, page, limit) {
    const cacheKey = `feed:home:${userId}:${page}:${limit}`;
    await redisManager.set(cacheKey, posts, this.FEED_CACHE_TTL);
  }

  async getCachedSphereFeed(userId, page, limit, mode) {
    const cacheKey = `feed:sphere:${userId}:${page}:${limit}:${mode}`;
    return redisManager.get(cacheKey);
  }

  async cacheSphereFeed(userId, posts, page, limit, mode) {
    const cacheKey = `feed:sphere:${userId}:${page}:${limit}:${mode}`;
    await redisManager.set(cacheKey, posts, this.FEED_CACHE_TTL);
  }

  /**
   * Invalidate user's feed cache (call when they follow/unfollow someone)
   */
  async invalidateFeedCache(userId) {
    // Clear all feed caches for this user
    // In production, you'd use a more sophisticated cache invalidation strategy
    const pattern = `feed:*:${userId}:*`;
    // This would require Redis SCAN, for now we'll just clear the most recent
    await redisManager.del(`feed:home:${userId}:1:20`);
    await redisManager.del(`feed:sphere:${userId}:1:20:top`);
  }

  /**
   * Process a new post event to update relevant feeds
   */
  async processNewPost(post) {
    try {
      // Get author's followers
      const followers = await Follow.find({ following: post.author }).select('follower');
      
      // For each follower, add post to their feed cache
      for (const follower of followers) {
        const score = await this.calculatePostScore(post, follower.follower, {
          followedIds: [post.author.toString()]
        });
        
        await redisManager.addPostToFeedCache(follower.follower.toString(), post._id.toString(), score);
      }

      // Emit event for search indexing
      await kafkaManager.emitSearchIndexEvent('index', 'post', post._id.toString(), {
        action: 'create',
        visibility: post.visibility
      });

    } catch (error) {
      console.error('Error processing new post:', error.message);
    }
  }

  /**
   * Update post engagement scores (call when post gets likes/comments)
   */
  async updatePostEngagement(postId) {
    try {
      const post = await Post.findById(postId);
      if (!post) return;

      // Recalculate sphere score
      post.calculateSphereScore();
      await post.save();

      // Invalidate relevant caches
      const author = await User.findById(post.author);
      if (author) {
        await this.invalidateFeedCache(author._id.toString());
      }

      // Emit event for search reindexing
      await kafkaManager.emitSearchIndexEvent('update', 'post', postId.toString(), {
        action: 'update',
        engagement: post.engagement
      });

    } catch (error) {
      console.error('Error updating post engagement:', error.message);
    }
  }
}

module.exports = new FeedService();
