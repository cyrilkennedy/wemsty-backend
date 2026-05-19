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
const algorithmService = require('./algorithm.service');
const EngagementLog = require('../models/EngagementLog.model');
const UserTopicAffinity = require('../models/UserTopicAffinity.model');
const FeedExposure = require('../models/FeedExposure.model');
const vectorRecommendationService = require('./vector-recommendation.service');
const mongoose = require('mongoose');
const crypto = require('crypto');

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
    this.FOR_YOU_SOURCE_QUOTAS = {
      followed: 0.5,
      interest: 0.25,
      trending: 0.1,
      smallCreator: 0.1,
      exploration: 0.05
    };
    this.NEW_USER_EVENT_THRESHOLD = 50;
    this.ALGORITHM_VERSION = process.env.FEED_ALGORITHM_VERSION || 'wemsty-v2';
    this.AB_VARIANTS = {
      balanced: { affinity: 0.23, topic: 0.17, velocity: 0.18, recency: 0.16, dwell: 0.09 },
      fresh: { affinity: 0.18, topic: 0.15, velocity: 0.2, recency: 0.24, dwell: 0.08 },
      social: { affinity: 0.3, topic: 0.14, velocity: 0.16, recency: 0.13, dwell: 0.08 }
    };
    this.COLLABORATIVE_QUOTA = 0.08;
  }

  normalizeScore(value, cap = 1) {
    if (!Number.isFinite(Number(value))) return 0;
    return Math.max(0, Math.min(Number(value), cap)) / cap;
  }

  getAlgorithmVariant(context = {}) {
    const requested = context.variant || process.env.FEED_ALGORITHM_VARIANT || 'balanced';
    return this.AB_VARIANTS[requested] ? requested : 'balanced';
  }

  getVariantWeights(context = {}) {
    return this.AB_VARIANTS[this.getAlgorithmVariant(context)];
  }

  assignVariant(userId) {
    const variants = Object.keys(this.AB_VARIANTS);
    if (!userId || variants.length === 0) return 'balanced';
    const hash = crypto
      .createHash('sha256')
      .update(`${userId}:${this.ALGORITHM_VERSION}`)
      .digest('hex');
    const bucket = parseInt(hash.slice(0, 8), 16) % variants.length;
    return variants[bucket] || 'balanced';
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
    const algorithm = post.algorithm || {};
    
    // Weighted engagement. Replies/reposts/bookmarks/profile clicks are much stronger signals than likes.
    const baseEngagement =
      (likeCount * 1) +
      (commentCount * 13.5) +
      (repostCount * 20) +
      ((algorithm.saves || 0) * 10) +
      ((algorithm.profileClicks || 0) * 12) +
      ((algorithm.linkClicks || 0) * 11) +
      ((algorithm.authorReplied || 0) * 75);
    
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
    const breakdown = await this.getPostScoreBreakdown(post, viewerId, context);
    return breakdown.finalScore;
  }

  async getPostScoreBreakdown(post, viewerId, context = {}) {
    const {
      followedIds = [],
      seenPosts = new Set(),
      userLanguage = 'en',
      author = null,
      viewer = null
    } = context;
    const weights = this.getVariantWeights(context);

    // Get author if not provided
    let authorData = author;
    if (!authorData && post.author) {
      try {
        authorData = await User.findById(post.author).select('trustScore createdAt profile algorithm.reputation');
      } catch (error) {
        console.error('Error fetching author:', error.message);
      }
    }

    const topics = algorithmService.getPostTopics(post);
    const affinityScore = await algorithmService.getAffinityScore(viewerId, post.author);
    const topicScore = await algorithmService.getTopicMatchScore(viewerId, topics);
    const sessionTopicScore = await algorithmService.getSessionTopicScore(viewerId, topics);
    const velocityScore = algorithmService.getEngagementVelocityScore(post);
    const recencyScore = this.calculateRecencyScore(post.createdAt);
    const engagementScore = this.normalizeScore(this.calculateEngagementScore(post, userLanguage), 25);
    const communityAffinity = await this.calculateCommunityAffinity(post, viewerId);
    const languageMatch = post.languageCode === userLanguage ? 0.1 : 0;
    const safetyPenalty = this.calculateSafetyPenalty(post, authorData);
    const seenPenalty = await this.calculateSeenPenalty(post._id, viewerId, seenPosts);
    const dwellScore = algorithmService.getDwellScore(post);
    const authorHealthScore = algorithmService.getAuthorHealthScore(authorData || {});
    const relationshipScore = Math.max(
      this.calculateRelationshipWeight(post, viewerId, followedIds),
      affinityScore
    );
    const negativeRate = Math.min(
      (post.algorithm?.hideRate || 0) +
      (post.algorithm?.reportRate || 0) +
      (post.algorithm?.notInterestedRate || 0),
      1
    );
    const lightweightMlScore = algorithmService.calculateLightweightMlScore({
      affinityScore,
      topicScore,
      velocityScore,
      dwellScore,
      recencyScore,
      negativeRate
    });

    const base =
      (affinityScore * weights.affinity) +
      (topicScore * weights.topic) +
      (sessionTopicScore * 0.04) +
      (velocityScore * weights.velocity) +
      (recencyScore * weights.recency) +
      (dwellScore * weights.dwell) +
      (relationshipScore * 0.07) +
      (communityAffinity * 0.04) +
      (authorHealthScore * 0.03) +
      (engagementScore * 0.02) +
      (lightweightMlScore * 0.01) +
      languageMatch;

    const followMultiplier = algorithmService.getFollowMultiplier(
      followedIds.includes(post.author?.toString()),
      affinityScore
    );
    const localityMultiplier = algorithmService.getLocalityMultiplier(
      { ...post, author: authorData || post.author },
      viewer || {}
    );
    const earlyMultiplier = algorithmService.getEarlyEngagementMultiplier(post);
    const hashtagMultiplier = algorithmService.getHashtagMultiplier(post);
    const negativeMultiplier = algorithmService.getNegativeMultiplier(post);

    const finalScore =
      (base * followMultiplier * localityMultiplier * earlyMultiplier * hashtagMultiplier * negativeMultiplier) -
      (safetyPenalty * this.SAFETY_PENALTY) -
      (seenPenalty * this.SEEN_PENALTY);

    return {
      finalScore: Math.max(0, finalScore),
      algorithmVersion: this.ALGORITHM_VERSION,
      variant: this.getAlgorithmVariant(context),
      weights,
      signals: {
        affinityScore,
        topicScore,
        sessionTopicScore,
        velocityScore,
        recencyScore,
        dwellScore,
        relationshipScore,
        communityAffinity,
        authorHealthScore,
        engagementScore,
        lightweightMlScore,
        languageMatch,
        safetyPenalty,
        seenPenalty
      },
      multipliers: {
        followMultiplier,
        localityMultiplier,
        earlyMultiplier,
        hashtagMultiplier,
        negativeMultiplier
      }
    };
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
      const viewer = await User.findById(userId).select('_id profile createdAt').lean();

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
        { followedIds, viewer }
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
      useCache = true,
      variant = null
    } = options;
    const resolvedVariant = variant || this.assignVariant(userId);

    try {
      // Try cache first
      if (useCache) {
        const cachedFeed = await this.getCachedSphereFeed(userId, page, limit, mode, resolvedVariant);
        if (cachedFeed) {
          return cachedFeed;
        }
      }

      const viewer = userId
        ? await User.findById(userId).select('_id profile createdAt algorithm').lean()
        : null;

      // Get blocked users
      const blockedUsers = userId ? await this.getBlockedAndMutedUsers(userId) : [];

      const candidates = mode === 'latest'
        ? await this.getCandidatesForDiscovery(userId, blockedUsers, limit * 3, mode)
        : await this.buildForYouCandidatePool(userId, viewer, blockedUsers, limit * 6);

      // Score and rank candidates
      const scoredPosts = await this.scoreAndRankCandidates(
        candidates,
        userId,
        { viewer, pageSize: limit * 3, variant: resolvedVariant }
      );

      // Paginate results
      const startIndex = (page - 1) * limit;
      const paginatedPosts = scoredPosts.slice(startIndex, startIndex + limit);

      // Hydrate posts
      const hydratedPosts = await this.hydratePosts(paginatedPosts, userId);
      await this.recordFeedExposures({
        userId,
        posts: paginatedPosts,
        feedType: 'sphere',
        variant: resolvedVariant,
        requestId: options.requestId
      });
      const payload = {
        items: hydratedPosts,
        algorithm: {
          version: this.ALGORITHM_VERSION,
          variant: resolvedVariant
        },
        pagination: {
          page,
          limit,
          total: scoredPosts.length,
          pages: Math.ceil(scoredPosts.length / limit),
          hasMore: startIndex + limit < scoredPosts.length
        }
      };

      // Cache results
      await this.cacheSphereFeed(userId, payload, page, limit, mode, resolvedVariant);

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
      : { 'algorithm.lightweightMlScore': -1, sphereScore: -1, 'engagement.score': -1, createdAt: -1 };

    let candidates = await Post.find(query)
      .sort(sort)
      .limit(limit)
      .lean();

    if (userId && mode !== 'latest') {
      const interestCandidates = await this.getCandidatesByUserInterests(userId, blockedUsers, Math.ceil(limit * 0.35));
      candidates = this.mergeCandidates(candidates, interestCandidates).slice(0, limit);
    }

    return candidates;
  }

  getSourceLimits(totalLimit = 120) {
    const limit = Math.max(20, totalLimit);
    const quotas = this.FOR_YOU_SOURCE_QUOTAS;
    return {
      followed: Math.max(0, Math.round(limit * quotas.followed)),
      interest: Math.max(0, Math.round(limit * quotas.interest)),
      trending: Math.max(1, Math.round(limit * quotas.trending)),
      smallCreator: Math.max(1, Math.round(limit * quotas.smallCreator)),
      exploration: Math.max(1, Math.round(limit * quotas.exploration)),
      socialProof: Math.max(3, Math.round(limit * 0.12)),
      self: Math.max(3, Math.round(limit * 0.05)),
      vector: Math.max(0, Math.round(limit * 0.06))
    };
  }

  async isNewUserForFeed(userId, viewer = null) {
    if (!userId) return false;
    const count = await EngagementLog.countDocuments({ user: userId });
    const hasOnboardingTopics = Array.isArray(viewer?.algorithm?.onboardingTopics)
      && viewer.algorithm.onboardingTopics.length > 0;
    return hasOnboardingTopics && count < this.NEW_USER_EVENT_THRESHOLD;
  }

  async buildForYouCandidatePool(userId, viewer, blockedUsers, limit = 120) {
    const safeLimit = Math.max(40, limit);
    const sourceLimits = this.getSourceLimits(safeLimit);
    const followedDocs = userId
      ? await Follow.find({ follower: userId, status: 'ACCEPTED' }).select('following').lean()
      : [];
    const followedIds = followedDocs.map((item) => item.following.toString());
    const mutedTopics = new Set((viewer?.algorithm?.mutedTopics || []).map((topic) => String(topic).toLowerCase()));

    if (await this.isNewUserForFeed(userId, viewer)) {
      const own = await this.getViewerOwnCandidates(userId, blockedUsers, sourceLimits.self);
      const onboarding = await this.getOnboardingCandidates(viewer, blockedUsers, sourceLimits.interest + sourceLimits.exploration);
      const trending = await this.getTrendingCandidates(blockedUsers, sourceLimits.trending);
      const smallCreators = await this.getSmallCreatorCandidates(blockedUsers, sourceLimits.smallCreator);
      return this.filterMutedTopicCandidates(
        this.mergeCandidates(own, onboarding, trending, smallCreators),
        mutedTopics
      ).slice(0, safeLimit);
    }

    const [
      own,
      followed,
      interest,
      collaborative,
      vector,
      trending,
      smallCreators,
      exploration,
      socialProof
    ] = await Promise.all([
      this.getViewerOwnCandidates(userId, blockedUsers, sourceLimits.self),
      this.getCandidatesFromFollowed(userId, followedIds, blockedUsers, sourceLimits.followed),
      this.getCandidatesByUserInterests(userId, blockedUsers, sourceLimits.interest),
      this.getCollaborativeCandidates(userId, blockedUsers, Math.max(5, Math.round(safeLimit * this.COLLABORATIVE_QUOTA))),
      this.getVectorCandidates(userId, blockedUsers, sourceLimits.vector),
      this.getTrendingCandidates(blockedUsers, sourceLimits.trending),
      this.getSmallCreatorCandidates(blockedUsers, sourceLimits.smallCreator),
      this.getExplorationCandidates(blockedUsers, sourceLimits.exploration),
      this.getSocialProofCandidates(userId, followedIds, blockedUsers, sourceLimits.socialProof)
    ]);

    return this.filterMutedTopicCandidates(
      this.mergeCandidates(own, socialProof, interest, collaborative, vector, followed, trending, smallCreators, exploration),
      mutedTopics
    ).slice(0, safeLimit);
  }

  async getViewerOwnCandidates(userId, blockedUsers, limit = 5) {
    if (!userId || limit <= 0) return [];
    if (blockedUsers.map((id) => id.toString()).includes(userId.toString())) return [];

    return Post.find({
      author: userId,
      status: 'active',
      visibility: 'public',
      sphereEligible: true,
      postType: { $in: ['original', 'quote'] }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .then((posts) => posts.map((post) => ({ ...post, _candidateSource: 'self' })));
  }

  async getVectorCandidates(userId, blockedUsers, limit = 12) {
    if (!userId || limit <= 0) return [];
    const recent = await EngagementLog.findOne({
      user: userId,
      action: { $in: ['like', 'reply', 'repost', 'quote', 'bookmark', 'dwell', 'link_click'] }
    })
      .sort({ createdAt: -1 })
      .select('post')
      .lean();
    if (!recent?.post) return [];

    const anchorPost = await Post.findById(recent.post).lean();
    return vectorRecommendationService.getSimilarPosts(anchorPost, { blockedUsers, limit });
  }

  async getOnboardingCandidates(viewer, blockedUsers, limit = 30) {
    const topics = (viewer?.algorithm?.onboardingTopics || [])
      .map((topic) => String(topic).toLowerCase())
      .filter(Boolean);
    if (topics.length === 0) return [];

    return Post.find({
      author: { $nin: blockedUsers },
      status: 'active',
      visibility: 'public',
      sphereEligible: true,
      postType: { $in: ['original', 'quote'] },
      $or: [
        { category: { $in: topics } },
        { 'content.hashtags': { $in: topics } }
      ]
    })
      .sort({ 'algorithm.lightweightMlScore': -1, sphereScore: -1, createdAt: -1 })
      .limit(limit)
      .lean()
      .then((posts) => posts.map((post) => ({ ...post, _candidateSource: 'onboarding' })));
  }

  async getCandidatesByUserInterests(userId, blockedUsers, limit = 20) {
    if (!userId || limit <= 0) return [];
    const topTopics = await UserTopicAffinity.find({ user: userId, score: { $gt: 0 } })
      .sort({ score: -1 })
      .limit(8)
      .select('topic')
      .lean();
    const topics = topTopics.map((item) => item.topic).filter(Boolean);
    if (topics.length === 0) return [];

    return Post.find({
      author: { $nin: blockedUsers },
      status: 'active',
      visibility: 'public',
      sphereEligible: true,
      postType: { $in: ['original', 'quote'] },
      $or: [
        { category: { $in: topics } },
        { 'content.hashtags': { $in: topics } }
      ]
    })
      .sort({ 'algorithm.lightweightMlScore': -1, sphereScore: -1, createdAt: -1 })
      .limit(limit)
      .lean()
      .then((posts) => posts.map((post) => ({ ...post, _candidateSource: 'interest' })));
  }

  async getCollaborativeCandidates(userId, blockedUsers, limit = 15) {
    if (!userId || limit <= 0) return [];
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const myTopics = await UserTopicAffinity.find({ user: userId, score: { $gt: 0 } })
      .sort({ score: -1 })
      .limit(8)
      .select('topic')
      .lean();
    const topics = myTopics.map((item) => item.topic);
    if (topics.length === 0) return [];

    const similarUsers = await UserTopicAffinity.aggregate([
      { $match: { user: { $ne: new mongoose.Types.ObjectId(userId) }, topic: { $in: topics }, score: { $gt: 0 } } },
      { $group: { _id: '$user', overlap: { $sum: '$score' }, topics: { $addToSet: '$topic' } } },
      { $sort: { overlap: -1 } },
      { $limit: 100 }
    ]);
    const similarUserIds = similarUsers.map((item) => item._id);
    if (similarUserIds.length === 0) return [];

    const engagedPosts = await EngagementLog.aggregate([
      {
        $match: {
          user: { $in: similarUserIds },
          action: { $in: ['like', 'reply', 'repost', 'quote', 'bookmark', 'dwell'] },
          createdAt: { $gte: since }
        }
      },
      { $group: { _id: '$post', score: { $sum: 1 }, users: { $addToSet: '$user' } } },
      { $sort: { score: -1 } },
      { $limit: limit * 2 }
    ]);
    if (!engagedPosts.length) return [];

    const posts = await Post.find({
      _id: { $in: engagedPosts.map((item) => item._id) },
      author: { $nin: blockedUsers },
      status: 'active',
      visibility: 'public',
      sphereEligible: true,
      postType: { $in: ['original', 'quote'] }
    }).lean();
    const scoreMap = new Map(engagedPosts.map((item) => [item._id.toString(), item]));

    return posts.map((post) => ({
      ...post,
      _candidateSource: 'collaborative',
      collaborativeProof: {
        count: scoreMap.get(post._id.toString())?.score || 0
      }
    })).slice(0, limit);
  }

  async getTrendingCandidates(blockedUsers, limit = 20) {
    const redisIds = await this.getRedisVelocityPostIds(limit);
    if (redisIds.length > 0) {
      const posts = await Post.find({
        _id: { $in: redisIds },
        author: { $nin: blockedUsers },
        status: 'active',
        visibility: 'public',
        sphereEligible: true,
        postType: { $in: ['original', 'quote'] }
      }).lean();
      const byId = new Map(posts.map((post) => [post._id.toString(), post]));
      return redisIds
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((post) => ({ ...post, _candidateSource: 'trending' }));
    }

    return Post.find({
      author: { $nin: blockedUsers },
      status: 'active',
      visibility: 'public',
      sphereEligible: true,
      postType: { $in: ['original', 'quote'] },
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    })
      .sort({ 'engagement.velocity': -1, 'engagement.score': -1, createdAt: -1 })
      .limit(limit)
      .lean()
      .then((posts) => posts.map((post) => ({ ...post, _candidateSource: 'trending' })));
  }

  async getRedisVelocityPostIds(limit = 20) {
    if (!redisManager.isConnected || !redisManager.client) return [];
    try {
      return await redisManager.client.zRange('feed:velocity:rolling', 0, limit - 1, { REV: true });
    } catch (error) {
      console.error('Redis velocity read failed:', error.message);
      return [];
    }
  }

  async getSmallCreatorCandidates(blockedUsers, limit = 20) {
    const smallCreators = await User.find({
      accountStatus: 'active',
      followers_count: { $lte: 1000 },
      _id: { $nin: blockedUsers }
    })
      .select('_id')
      .sort({ followers_count: 1, createdAt: -1 })
      .limit(Math.max(limit * 5, 25))
      .lean();
    const authorIds = smallCreators.map((user) => user._id);
    if (authorIds.length === 0) return [];

    return Post.find({
      author: { $in: authorIds, $nin: blockedUsers },
      status: 'active',
      visibility: 'public',
      sphereEligible: true,
      postType: { $in: ['original', 'quote'] },
      'algorithm.notInterestedRate': { $lt: 0.25 },
      'algorithm.hideRate': { $lt: 0.25 }
    })
      .sort({ createdAt: -1, sphereScore: -1 })
      .limit(limit)
      .lean()
      .then((posts) => posts.map((post) => ({ ...post, _candidateSource: 'small_creator' })));
  }

  async getExplorationCandidates(blockedUsers, limit = 10) {
    return Post.find({
      author: { $nin: blockedUsers },
      status: 'active',
      visibility: 'public',
      sphereEligible: true,
      postType: { $in: ['original', 'quote'] },
      'algorithm.notInterestedRate': { $lt: 0.3 },
      'algorithm.hideRate': { $lt: 0.3 }
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
      .then((posts) => posts.map((post) => ({ ...post, _candidateSource: 'exploration' })));
  }

  async getSocialProofCandidates(userId, followedIds, blockedUsers, limit = 15) {
    if (!userId || !followedIds.length) return [];
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const proof = await EngagementLog.aggregate([
      {
        $match: {
          user: { $in: followedIds.map((id) => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id) },
          action: { $in: ['like', 'repost', 'quote', 'reply', 'bookmark'] },
          createdAt: { $gte: since }
        }
      },
      {
        $group: {
          _id: '$post',
          count: { $sum: 1 },
          users: { $addToSet: '$user' }
        }
      },
      { $match: { count: { $gte: 2 } } },
      { $sort: { count: -1 } },
      { $limit: limit }
    ]);

    if (!proof.length) return [];
    const proofMap = new Map(proof.map((item) => [item._id.toString(), item]));
    const posts = await Post.find({
      _id: { $in: proof.map((item) => item._id) },
      author: { $nin: blockedUsers },
      status: 'active',
      visibility: 'public',
      sphereEligible: true,
      postType: { $in: ['original', 'quote'] }
    }).lean();

    return posts.map((post) => {
      const item = proofMap.get(post._id.toString());
      return {
        ...post,
        _candidateSource: 'social_proof',
        socialProof: {
          count: item?.count || 0,
          users: (item?.users || []).slice(0, 3)
        }
      };
    });
  }

  mergeCandidates(...groups) {
    const seen = new Set();
    const merged = [];
    for (const post of groups.flat()) {
      const key = post._id?.toString();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(post);
    }
    return merged;
  }

  filterMutedTopicCandidates(posts = [], mutedTopics = new Set()) {
    if (!mutedTopics || mutedTopics.size === 0) return posts;
    return posts.filter((post) => {
      const topics = algorithmService.getPostTopics(post);
      return !topics.some((topic) => mutedTopics.has(topic));
    });
  }

  async recordFeedExposures({ userId, posts = [], feedType = 'sphere', variant = 'balanced', requestId = null }) {
    if (!posts.length) return { inserted: 0 };
    const docs = posts.map((post, index) => ({
      user: userId || undefined,
      post: post._id,
      author: post.author,
      feedType,
      source: post._candidateSource || 'ranked',
      variant: this.getAlgorithmVariant({ variant }),
      algorithmVersion: this.ALGORITHM_VERSION,
      rankPosition: index + 1,
      score: post._score || 0,
      requestId
    }));

    try {
      await FeedExposure.insertMany(docs, { ordered: false });
      return { inserted: docs.length };
    } catch (error) {
      console.error('Feed exposure recording failed:', error.message);
      return { inserted: 0, error: error.message };
    }
  }

  async getAlgorithmAnalytics(options = {}) {
    const requestedDays = Number(options.days || 7);
    const days = Number.isFinite(requestedDays) ? Math.max(1, requestedDays) : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [eventsByAction, exposuresBySource, exposuresByVariant, topTopics] = await Promise.all([
      EngagementLog.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$action', count: { $sum: 1 }, avgDwellSeconds: { $avg: '$dwellSeconds' } } },
        { $sort: { count: -1 } }
      ]),
      FeedExposure.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$source', count: { $sum: 1 }, avgScore: { $avg: '$score' } } },
        { $sort: { count: -1 } }
      ]),
      FeedExposure.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: '$variant',
            count: { $sum: 1 },
            likes: { $sum: { $cond: ['$outcome.liked', 1, 0] } },
            hides: { $sum: { $cond: ['$outcome.hidden', 1, 0] } },
            notInterested: { $sum: { $cond: ['$outcome.notInterested', 1, 0] } },
            avgDwellSeconds: { $avg: '$outcome.dwellSeconds' }
          }
        },
        { $sort: { count: -1 } }
      ]),
      UserTopicAffinity.aggregate([
        { $group: { _id: '$topic', users: { $sum: 1 }, avgScore: { $avg: '$score' } } },
        { $sort: { users: -1, avgScore: -1 } },
        { $limit: 20 }
      ])
    ]);

    return {
      since,
      algorithmVersion: this.ALGORITHM_VERSION,
      eventsByAction,
      exposuresBySource,
      exposuresByVariant,
      topTopics
    };
  }

  diversifyFeed(posts, pageSize = 30) {
    const authorCount = new Map();
    const result = [];
    let lastTopic = null;
    let sameTopicCount = 0;

    for (const post of posts) {
      const authorId = post.author?.toString();
      const authorSeen = (authorCount.get(authorId) || 0) + 1;
      if (authorId && authorSeen > 2) continue;

      const topic = algorithmService.getPostTopics(post)[0] || post.category || 'general';
      if (topic === lastTopic) {
        sameTopicCount += 1;
      } else {
        lastTopic = topic;
        sameTopicCount = 1;
      }
      if (sameTopicCount > 3) continue;

      if (authorId) authorCount.set(authorId, authorSeen);
      result.push(post);
      if (result.length >= pageSize) break;
    }

    return result;
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
      .select('_id trustScore createdAt profile algorithm.reputation')
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

    // Sort by score descending and then apply diversity caps.
    return this.diversifyFeed(scored.sort((a, b) => b._score - a._score), context.pageSize || scored.length);
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
          reason: this.getRankReason(post, viewerId),
          source: post._candidateSource || 'ranked'
        },
        socialProof: post.socialProof || null
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
    const cacheKey = `feed:${this.ALGORITHM_VERSION}:home:${userId}:${page}:${limit}`;
    return redisManager.get(cacheKey);
  }

  async cacheFeed(userId, posts, page, limit) {
    const cacheKey = `feed:${this.ALGORITHM_VERSION}:home:${userId}:${page}:${limit}`;
    await redisManager.set(cacheKey, posts, this.FEED_CACHE_TTL);
  }

  async getCachedSphereFeed(userId, page, limit, mode, variant = null) {
    const cacheKey = `feed:${this.ALGORITHM_VERSION}:sphere:${userId}:${page}:${limit}:${mode}:${this.getAlgorithmVariant({ variant })}`;
    return redisManager.get(cacheKey);
  }

  async cacheSphereFeed(userId, posts, page, limit, mode, variant = null) {
    const cacheKey = `feed:${this.ALGORITHM_VERSION}:sphere:${userId}:${page}:${limit}:${mode}:${this.getAlgorithmVariant({ variant })}`;
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
    await redisManager.del(`feed:${this.ALGORITHM_VERSION}:home:${userId}:1:20`);
    await redisManager.del(`feed:${this.ALGORITHM_VERSION}:sphere:${userId}:1:20:top:balanced`);
  }

  async recalculateCreatorReputation(authorId, options = {}) {
    const since = options.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const posts = await Post.find({
      author: authorId,
      createdAt: { $gte: since }
    }).select('algorithm engagement').lean();

    const totals = posts.reduce((acc, post) => {
      const impressions = Math.max(post.algorithm?.impressions || post.engagement?.views || 0, 0);
      acc.impressions += impressions;
      acc.reports += post.algorithm?.reportCount || 0;
      acc.hides += post.algorithm?.hideCount || 0;
      acc.notInterested += post.algorithm?.notInterestedCount || 0;
      return acc;
    }, { impressions: 0, reports: 0, hides: 0, notInterested: 0 });

    const denominator = Math.max(totals.impressions, 1);
    const reportRate = totals.reports / denominator;
    const hideRate = totals.hides / denominator;
    const notInterestedRate = totals.notInterested / denominator;
    const score = Math.max(0, 1 - Math.min((reportRate * 3) + (hideRate * 2) + (notInterestedRate * 2.5), 1));

    await User.findByIdAndUpdate(authorId, {
      $set: {
        'algorithm.reputation': {
          score,
          reportRate,
          hideRate,
          notInterestedRate,
          lastCalculatedAt: new Date()
        }
      }
    });

    return { authorId, score, reportRate, hideRate, notInterestedRate, posts: posts.length };
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

  async refreshTrendingScores(options = {}) {
    const {
      days = 7,
      batchSize = 100,
      now = new Date()
    } = options;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    let processed = 0;
    let updated = 0;
    let cursor = null;

    while (true) {
      const query = {
        status: 'active',
        visibility: 'public',
        sphereEligible: true,
        postType: { $in: ['original', 'quote'] },
        updatedAt: { $gte: cutoff }
      };

      if (cursor) {
        query._id = { $gt: cursor };
      }

      const posts = await Post.find(query)
        .sort({ _id: 1 })
        .limit(batchSize);

      if (posts.length === 0) {
        break;
      }

      for (const post of posts) {
        const oldSphereScore = post.sphereScore || 0;
        const oldEngagementScore = post.engagement?.score || 0;
        const oldVelocity = post.engagement?.velocity || 0;
        const { likes = 0, comments = 0, reposts = 0 } = post.engagement || {};
        const algorithm = post.algorithm || {};
        const ageHours = Math.max((now - post.createdAt) / (1000 * 60 * 60), 1 / 60);

        post.engagement.score =
          (likes * 1) +
          (comments * 13.5) +
          (reposts * 20) +
          ((algorithm.saves || 0) * 10) +
          ((algorithm.profileClicks || 0) * 12) +
          ((algorithm.linkClicks || 0) * 11) +
          ((algorithm.authorReplied || 0) * 75);
        post.engagement.velocity = post.engagement.score / ageHours;
        algorithm.lightweightMlScore = algorithmService.calculateLightweightMlScore({
          affinityScore: 0,
          topicScore: 0,
          velocityScore: algorithmService.getEngagementVelocityScore(post, now),
          dwellScore: algorithmService.getDwellScore(post),
          recencyScore: algorithmService.getRecencyScore(post, now),
          negativeRate: Math.min(
            (algorithm.hideRate || 0) +
            (algorithm.reportRate || 0) +
            (algorithm.notInterestedRate || 0),
            1
          )
        });
        post.algorithm = algorithm;
        post.calculateSphereScore();

        if (
          post.sphereScore !== oldSphereScore ||
          post.engagement.score !== oldEngagementScore ||
          post.engagement.velocity !== oldVelocity
        ) {
          await post.save({ validateBeforeSave: false });
          updated += 1;
        }

        processed += 1;
      }

      cursor = posts[posts.length - 1]._id;
    }

    return { processed, updated, cutoff };
  }

  async refreshHotFeedCache(options = {}) {
    const {
      page = 1,
      limit = 20,
      modes = ['top', 'latest']
    } = options;
    const results = [];

    for (const mode of modes) {
      const candidates = await this.getCandidatesForDiscovery(null, [], limit * 3, mode);
      const scoredPosts = mode === 'latest'
        ? candidates
        : await this.scoreAndRankCandidates(candidates, null, {});
      const hydratedPosts = await this.hydratePosts(scoredPosts.slice(0, limit), null);
      const payload = {
        items: hydratedPosts,
        pagination: {
          page,
          limit,
          total: scoredPosts.length,
          pages: Math.ceil(scoredPosts.length / limit),
          hasMore: scoredPosts.length > limit
        }
      };

      await this.cacheSphereFeed('guest', payload, page, limit, mode);
      results.push({ mode, cached: payload.items.length });
    }

    return { results };
  }
}

module.exports = new FeedService();
