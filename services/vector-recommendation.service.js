const Post = require('../models/Post.model');
const algorithmService = require('./algorithm.service');

class VectorRecommendationService {
  constructor() {
    this.enabled = process.env.ENABLE_VECTOR_RECOMMENDATIONS === 'true';
  }

  async getSimilarPosts(post, options = {}) {
    if (!this.enabled || !post) {
      return [];
    }

    const { limit = 20, blockedUsers = [] } = options;
    const topics = algorithmService.getPostTopics(post);
    if (topics.length === 0) {
      return [];
    }

    return Post.find({
      _id: { $ne: post._id },
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
      .then((posts) => posts.map((item) => ({ ...item, _candidateSource: 'vector_stub' })));
  }
}

module.exports = new VectorRecommendationService();
