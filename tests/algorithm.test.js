const assert = require('node:assert/strict');

const algorithmService = require('../services/algorithm.service');
const Affinity = require('../models/Affinity.model');
const UserTopicAffinity = require('../models/UserTopicAffinity.model');
const EngagementLog = require('../models/EngagementLog.model');
const FeedExposure = require('../models/FeedExposure.model');
const Post = require('../models/Post.model');
const User = require('../models/User.model');
const feedService = require('../services/feed.service');
const vectorRecommendationService = require('../services/vector-recommendation.service');

async function runAlgorithmTests() {
  const topics = algorithmService.getPostTopics({
    category: 'sports',
    content: {
      hashtags: ['Naija', '#football'],
      media: [{ type: 'image' }]
    }
  });
  assert.deepEqual(topics.sort(), ['football', 'media:image', 'naija', 'sports']);

  const highSignalPost = {
    createdAt: new Date(Date.now() - 30 * 60 * 1000),
    engagement: { likes: 4, comments: 3, reposts: 2 },
    algorithm: { saves: 2, profileClicks: 1, linkClicks: 1, avgDwellSeconds: 15 }
  };
  assert.ok(algorithmService.getEngagementVelocityScore(highSignalPost) > 0);
  assert.ok(algorithmService.getDwellScore(highSignalPost) > 0.4);
  assert.equal(algorithmService.getHashtagMultiplier({ content: { hashtags: ['a', 'b'] } }), 1);
  assert.equal(algorithmService.getHashtagMultiplier({ content: { hashtags: ['a', 'b', 'c', 'd', 'e'] } }), 0.6);

  const suppressed = algorithmService.getNegativeMultiplier({
    algorithm: { hideRate: 0.2, reportRate: 0.2, notInterestedRate: 0.2 }
  });
  assert.equal(suppressed, 0);

  const mlLow = algorithmService.calculateLightweightMlScore({
    affinityScore: 0,
    topicScore: 0,
    velocityScore: 0,
    dwellScore: 0,
    recencyScore: 0,
    negativeRate: 0
  });
  const mlHigh = algorithmService.calculateLightweightMlScore({
    affinityScore: 1,
    topicScore: 1,
    velocityScore: 1,
    dwellScore: 1,
    recencyScore: 1,
    negativeRate: 0
  });
  assert.ok(mlHigh > mlLow);

  const affinityIndexes = Affinity.schema.indexes();
  assert.ok(affinityIndexes.some(([fields, options]) =>
    fields.viewer === 1 && fields.author === 1 && options.unique === true
  ));

  const topicIndexes = UserTopicAffinity.schema.indexes();
  assert.ok(topicIndexes.some(([fields, options]) =>
    fields.user === 1 && fields.topic === 1 && options.unique === true
  ));

  const eventIndexes = EngagementLog.schema.indexes();
  assert.ok(eventIndexes.some(([fields, options]) =>
    fields.createdAt === 1 && options.expireAfterSeconds === 31536000
  ));
  const exposureIndexes = FeedExposure.schema.indexes();
  assert.ok(exposureIndexes.some(([fields]) =>
    fields.variant === 1 && fields.feedType === 1 && fields.createdAt === -1
  ));

  assert.ok(Post.schema.path('algorithm.impressions'));
  assert.ok(Post.schema.path('algorithm.lightweightMlScore'));
  assert.ok(User.schema.path('algorithm.onboardingTopics'));
  assert.ok(User.schema.path('algorithm.mutedTopics'));

  const sourceLimits = feedService.getSourceLimits(100);
  assert.equal(sourceLimits.followed, 50);
  assert.equal(sourceLimits.interest, 25);
  assert.equal(sourceLimits.trending, 10);
  assert.equal(sourceLimits.smallCreator, 10);
  assert.equal(sourceLimits.exploration, 5);
  assert.equal(sourceLimits.self, 5);
  assert.equal(sourceLimits.vector, 6);

  const merged = feedService.mergeCandidates(
    [{ _id: 'a' }, { _id: 'b' }],
    [{ _id: 'b' }, { _id: 'c' }]
  );
  assert.deepEqual(merged.map((post) => post._id), ['a', 'b', 'c']);

  const filtered = feedService.filterMutedTopicCandidates([
    { _id: '1', category: 'sports', content: { hashtags: [] } },
    { _id: '2', category: 'music', content: { hashtags: ['afrobeats'] } }
  ], new Set(['sports']));
  assert.deepEqual(filtered.map((post) => post._id), ['2']);

  const diversified = feedService.diversifyFeed([
    { _id: '1', author: 'author-1', category: 'tech' },
    { _id: '2', author: 'author-1', category: 'tech' },
    { _id: '3', author: 'author-1', category: 'tech' },
    { _id: '4', author: 'author-2', category: 'music' }
  ], 10);
  assert.deepEqual(diversified.map((post) => post._id), ['1', '2', '4']);

  assert.equal(feedService.getAlgorithmVariant({ variant: 'fresh' }), 'fresh');
  assert.equal(feedService.getAlgorithmVariant({ variant: 'unknown' }), 'balanced');
  assert.ok(feedService.getVariantWeights({ variant: 'social' }).affinity > feedService.getVariantWeights({ variant: 'fresh' }).affinity);
  assert.equal(feedService.assignVariant(null), 'balanced');
  assert.equal(feedService.assignVariant('user-a'), feedService.assignVariant('user-a'));
  assert.equal(typeof feedService.getAlgorithmAnalytics, 'function');
  assert.equal(vectorRecommendationService.enabled, process.env.ENABLE_VECTOR_RECOMMENDATIONS === 'true');
}

module.exports = runAlgorithmTests;
