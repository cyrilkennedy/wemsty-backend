const assert = require('node:assert/strict');

const feedService = require('../services/feed.service');
const Post = require('../models/Post.model');

function chainPosts(posts) {
  return {
    sort() {
      return this;
    },
    limit() {
      return Promise.resolve(posts);
    }
  };
}

async function runFeedWorkerTests() {
  const originalFind = Post.find;
  const originalGetCandidatesForDiscovery = feedService.getCandidatesForDiscovery;
  const originalScoreAndRankCandidates = feedService.scoreAndRankCandidates;
  const originalHydratePosts = feedService.hydratePosts;
  const originalCacheSphereFeed = feedService.cacheSphereFeed;

  try {
    const activePost = {
      _id: 'post-1',
      status: 'active',
      visibility: 'public',
      sphereEligible: true,
      postType: 'original',
      createdAt: new Date('2026-05-07T10:00:00.000Z'),
      updatedAt: new Date('2026-05-07T10:30:00.000Z'),
      engagement: { likes: 10, comments: 2, reposts: 1, score: 0, velocity: 0 },
      sphereScore: 0,
      calculateSphereScore() {
        this.sphereScore = 42;
        return this.sphereScore;
      },
      async save() {
        this.saved = true;
      }
    };
    let firstCall = true;
    let refreshQuery = null;

    Post.find = (query) => {
      refreshQuery = query;
      if (firstCall) {
        firstCall = false;
        return chainPosts([activePost]);
      }
      return chainPosts([]);
    };

    const refresh = await feedService.refreshTrendingScores({
      now: new Date('2026-05-07T12:00:00.000Z'),
      days: 7,
      batchSize: 10
    });

    assert.equal(refresh.processed, 1);
    assert.equal(refresh.updated, 1);
    assert.equal(activePost.engagement.score, 57);
    assert.equal(activePost.engagement.velocity, 28.5);
    assert.equal(activePost.sphereScore, 42);
    assert.equal(activePost.saved, true);
    assert.equal(refreshQuery.status, 'active');
    assert.equal(refreshQuery.visibility, 'public');
    assert.deepEqual(refreshQuery.postType, { $in: ['original', 'quote'] });

    const cached = [];
    feedService.getCandidatesForDiscovery = async (userId, blockedUsers, limit, mode) => ([
      { _id: `${mode}-post`, createdAt: new Date(), engagement: {} }
    ]);
    feedService.scoreAndRankCandidates = async (posts) => posts.map((post) => ({ ...post, _score: 1 }));
    feedService.hydratePosts = async (posts) => posts.map((post) => ({ post: { id: post._id } }));
    feedService.cacheSphereFeed = async (userId, payload, page, limit, mode) => {
      cached.push({ userId, payload, page, limit, mode });
    };

    const hotCache = await feedService.refreshHotFeedCache({ page: 1, limit: 5, modes: ['top', 'latest'] });
    assert.equal(hotCache.results.length, 2);
    assert.equal(cached.length, 2);
    assert.equal(cached[0].userId, 'guest');
    assert.equal(cached[0].mode, 'top');
    assert.equal(cached[1].mode, 'latest');
  } finally {
    Post.find = originalFind;
    feedService.getCandidatesForDiscovery = originalGetCandidatesForDiscovery;
    feedService.scoreAndRankCandidates = originalScoreAndRankCandidates;
    feedService.hydratePosts = originalHydratePosts;
    feedService.cacheSphereFeed = originalCacheSphereFeed;
  }
}

module.exports = runFeedWorkerTests;
