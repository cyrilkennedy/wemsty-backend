const Affinity = require('../models/Affinity.model');
const UserTopicAffinity = require('../models/UserTopicAffinity.model');
const EngagementLog = require('../models/EngagementLog.model');
const FeedExposure = require('../models/FeedExposure.model');
const redisManager = require('../config/redis');

const LOCAL_TOPICS = new Set([
  'naija',
  'nigeria',
  'nollywood',
  'afrobeats',
  'japa',
  'pidgin',
  'lagos',
  'abuja',
  'ghana',
  'africa',
  'afrotech',
  'alte',
  'afropop'
]);

const TOPIC_ALIASES = {
  football: 'sports',
  soccer: 'sports',
  ucl: 'sports',
  epl: 'sports',
  music: 'entertainment',
  afrobeats: 'entertainment',
  afropop: 'entertainment',
  nollywood: 'entertainment',
  movies: 'entertainment',
  ai: 'technology',
  tech: 'technology',
  startup: 'business',
  startups: 'business',
  crypto: 'finance',
  bitcoin: 'finance',
  naija: 'nigeria',
  lagos: 'nigeria',
  abuja: 'nigeria'
};

const AFFINITY_WEIGHTS = {
  authorRepliedCount: 75,
  dmCount: 25,
  repostCount: 20,
  mentionCount: 15,
  replyCount: 13.5,
  profileVisitCount: 12,
  linkClickCount: 11,
  saveCount: 10,
  likeCount: 1
};

const ACTION_TO_AFFINITY_FIELD = {
  like: 'likeCount',
  reply: 'replyCount',
  repost: 'repostCount',
  quote: 'repostCount',
  save: 'saveCount',
  bookmark: 'saveCount',
  profile_click: 'profileVisitCount',
  link_click: 'linkClickCount',
  mention: 'mentionCount',
  dm_sent: 'dmCount',
  author_replied: 'authorRepliedCount'
};

const TOPIC_ACTION_WEIGHTS = {
  like: 1,
  reply: 13.5,
  repost: 20,
  quote: 20,
  save: 10,
  bookmark: 10,
  profile_click: 4,
  link_click: 3,
  dwell: 2,
  view: 0.5,
  impression: 0.2,
  not_interested: -8,
  hide: -10,
  report: -12
};

const VELOCITY_ACTION_WEIGHTS = {
  view: 0.2,
  impression: 0.2,
  dwell: 0.5,
  like: 1,
  reply: 13.5,
  repost: 20,
  quote: 20,
  save: 10,
  bookmark: 10,
  profile_click: 12,
  link_click: 11
};

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function sigmoid(value, divisor = 50) {
  return 1 / (1 + Math.exp(-value / divisor));
}

function normalizeTopic(topic) {
  const normalized = String(topic || '')
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/[^a-z0-9:_-]/g, '');
  return TOPIC_ALIASES[normalized] || normalized;
}

function getPostTopics(post = {}) {
  const topics = new Set();
  if (post.category) topics.add(normalizeTopic(post.category));
  for (const tag of post.content?.hashtags || []) {
    if (tag) topics.add(normalizeTopic(tag));
  }
  for (const media of post.content?.media || []) {
    if (media?.type) topics.add(normalizeTopic(`media:${media.type}`));
  }
  return [...topics].filter(Boolean);
}

function getEngagementVelocityScore(post = {}, now = new Date()) {
  const engagement = post.engagement || {};
  const ageHours = Math.max((now - new Date(post.createdAt || now)) / 3600000, 0.1);
  const algorithm = post.algorithm || {};
  const raw =
    (engagement.likes || 0) * 1 +
    (engagement.reposts || 0) * 20 +
    (engagement.comments || 0) * 13.5 +
    (algorithm.authorReplied || 0) * 75 +
    (algorithm.profileClicks || 0) * 12 +
    (algorithm.linkClicks || 0) * 11 +
    (algorithm.saves || 0) * 10;

  return clamp(raw / ageHours / 1000);
}

function getRecencyScore(post = {}, now = new Date()) {
  const mediaType = post.content?.media?.[0]?.type || 'text';
  const halfLife = {
    text: 8,
    image: 10,
    gif: 12,
    video: 24
  }[mediaType] || 8;
  const ageHours = Math.max((now - new Date(post.createdAt || now)) / 3600000, 0);
  return Math.exp(-ageHours / halfLife);
}

function getDwellScore(post = {}) {
  return clamp((post.algorithm?.avgDwellSeconds || 0) / 30);
}

function getAuthorHealthScore(author = {}) {
  const trustScore = typeof author?.trustScore === 'number' ? author.trustScore : 1;
  const reportRate = typeof author?.reportRate === 'number' ? author.reportRate : 0;
  const reputationScore = typeof author?.algorithm?.reputation?.score === 'number'
    ? author.algorithm.reputation.score
    : 1;
  return clamp(trustScore * reputationScore * (1 - clamp(reportRate)));
}

function getFollowMultiplier(isFollowing, affinityScore = 0) {
  if (!isFollowing) return 1;
  if (affinityScore > 0.7) return 2;
  if (affinityScore > 0.4) return 1.7;
  return 1.5;
}

function getLocalityMultiplier(post = {}, viewer = {}) {
  const authorCountry = post.author?.country || post.author?.profile?.country;
  const viewerCountry = viewer?.country || viewer?.profile?.country;
  const sameCountry = authorCountry && viewerCountry && authorCountry === viewerCountry;
  const isLocalTopic = getPostTopics(post).some((topic) => LOCAL_TOPICS.has(topic));
  if (sameCountry && isLocalTopic) return 1.3;
  if (sameCountry) return 1.15;
  if (isLocalTopic) return 1.1;
  return 1;
}

function getEarlyEngagementMultiplier(post = {}, now = new Date()) {
  const minutesOld = Math.max((now - new Date(post.createdAt || now)) / 60000, 0);
  if (minutesOld > 60) return 1;

  const engagement = post.engagement || {};
  const algorithm = post.algorithm || {};
  const earlyVelocity = (
    (engagement.likes || 0) +
    (engagement.comments || 0) * 13.5 +
    (engagement.reposts || 0) * 20 +
    (algorithm.saves || 0) * 10
  ) / Math.max(minutesOld, 1);

  if (minutesOld <= 30 && earlyVelocity > 5) return 1.8;
  if (minutesOld <= 60 && earlyVelocity > 2) return 1.4;
  return 1;
}

function getHashtagMultiplier(post = {}) {
  const count = post.content?.hashtags?.length || 0;
  if (count <= 2) return 1;
  if (count <= 4) return 0.85;
  return 0.6;
}

function getNegativeMultiplier(post = {}) {
  const algorithm = post.algorithm || {};
  const hideImpact = (algorithm.hideRate || 0) * 2;
  const reportImpact = (algorithm.reportRate || 0) * 3;
  const notInterestedImpact = (algorithm.notInterestedRate || 0) * 2.5;
  return clamp(1 - clamp(hideImpact + reportImpact + notInterestedImpact));
}

function calculateLightweightMlScore({ affinityScore = 0, topicScore = 0, velocityScore = 0, dwellScore = 0, recencyScore = 0, negativeRate = 0 }) {
  const logit =
    -0.55 +
    affinityScore * 1.3 +
    topicScore * 1.05 +
    velocityScore * 0.9 +
    dwellScore * 0.75 +
    recencyScore * 0.55 -
    negativeRate * 2.2;
  return clamp(1 / (1 + Math.exp(-logit)));
}

async function getAffinityScore(viewerId, authorId) {
  if (!viewerId || !authorId || viewerId.toString() === authorId.toString()) {
    return 0;
  }

  const rec = await Affinity.findOne({ viewer: viewerId, author: authorId })
    .select('normalizedScore')
    .lean();
  return rec?.normalizedScore || 0;
}

async function getTopicMatchScore(viewerId, topics = []) {
  if (!viewerId || topics.length === 0) {
    return 0;
  }
  const normalizedTopics = topics.map(normalizeTopic).filter(Boolean);

  const affinities = await UserTopicAffinity.find({
    user: viewerId,
    topic: { $in: normalizedTopics }
  }).select('score').lean();

  if (!affinities.length) return 0;
  const avg = affinities.reduce((sum, item) => sum + Math.max(0, item.score || 0), 0) / affinities.length;
  return clamp(avg / 100);
}

async function updateAffinity(viewerId, authorId, action) {
  if (!viewerId || !authorId || viewerId.toString() === authorId.toString()) {
    return null;
  }

  const field = ACTION_TO_AFFINITY_FIELD[action];
  const negativeAdjust = {
    not_interested: -8,
    hide: -10,
    report: -12
  }[action] || 0;

  const inc = {};
  if (field) inc[field] = 1;
  if (negativeAdjust < 0) {
    inc.negativeCount = 1;
    inc.rawScore = negativeAdjust;
  }

  const rec = await Affinity.findOneAndUpdate(
    { viewer: viewerId, author: authorId },
    { $inc: inc, $set: { lastInteractionAt: new Date() } },
    { upsert: true, new: true }
  );

  const positiveRaw = Object.entries(AFFINITY_WEIGHTS)
    .reduce((sum, [key, weight]) => sum + (rec[key] || 0) * weight, 0);
  const raw = positiveRaw + (rec.rawScore || 0);
  rec.normalizedScore = sigmoid(raw, 50);
  await rec.save();
  return rec;
}

async function updateTopicAffinity(userId, post, action) {
  if (!userId) return [];
  const topics = getPostTopics(post);
  const weight = TOPIC_ACTION_WEIGHTS[action] ?? 0;
  if (topics.length === 0 || weight === 0) return [];

  return Promise.all(topics.map((topic) => UserTopicAffinity.findOneAndUpdate(
    { user: userId, topic },
    {
      $inc: {
        score: weight,
        ...(weight > 0 ? { positiveCount: 1 } : { negativeCount: 1 })
      },
      $set: { lastActionAt: new Date() }
    },
    { upsert: true, new: true }
  )));
}

async function logEngagementEvent({ userId, post, action, dwellSeconds = 0, metadata = {} }) {
  if (!post?._id || !action) return null;
  return EngagementLog.create({
    user: userId || undefined,
    post: post._id,
    author: post.author,
    action,
    dwellSeconds,
    metadata
  });
}

async function recordProfileInteraction({ viewerId, authorId, action = 'profile_click', metadata = {} }) {
  if (!viewerId || !authorId || viewerId.toString() === authorId.toString()) {
    return null;
  }

  return updateAffinity(viewerId, authorId, action, metadata);
}

async function recordVelocitySignal(postId, action, at = new Date()) {
  if (!redisManager.isConnected || !redisManager.client || !postId) {
    return false;
  }

  const weight = VELOCITY_ACTION_WEIGHTS[action] || 0;
  if (weight <= 0) return false;

  const bucketMs = 15 * 60 * 1000;
  const bucket = Math.floor(at.getTime() / bucketMs) * bucketMs;
  const postKey = postId.toString();

  try {
    await redisManager.client.zIncrBy(`feed:velocity:${bucket}`, weight, postKey);
    await redisManager.client.expire(`feed:velocity:${bucket}`, 60 * 60);
    await redisManager.client.zIncrBy('feed:velocity:rolling', weight, postKey);
    await redisManager.client.expire('feed:velocity:rolling', 60 * 60);
    return true;
  } catch (error) {
    console.error('Redis velocity signal failed:', error.message);
    return false;
  }
}

async function recordSessionSignal(userId, post, action) {
  if (!redisManager.isConnected || !redisManager.client || !userId || !post) {
    return false;
  }

  const topics = getPostTopics(post);
  if (topics.length === 0) return false;

  const weight = TOPIC_ACTION_WEIGHTS[action] || 0;
  if (weight === 0) return false;

  try {
    const key = `feed:session:${userId}:topics`;
    for (const topic of topics) {
      await redisManager.client.zIncrBy(key, weight, topic);
    }
    await redisManager.client.expire(key, 60 * 60);
    return true;
  } catch (error) {
    console.error('Redis session signal failed:', error.message);
    return false;
  }
}

function getExposureOutcomeUpdate(action, dwellSeconds = 0) {
  const set = {};
  if (action === 'view' || action === 'impression') set['outcome.viewed'] = true;
  if (action === 'like') set['outcome.liked'] = true;
  if (action === 'reply') set['outcome.replied'] = true;
  if (action === 'repost' || action === 'quote') set['outcome.reposted'] = true;
  if (action === 'bookmark' || action === 'save') set['outcome.bookmarked'] = true;
  if (action === 'hide') set['outcome.hidden'] = true;
  if (action === 'not_interested') set['outcome.notInterested'] = true;
  if (action === 'dwell') {
    set['outcome.viewed'] = true;
    set['outcome.dwellSeconds'] = Math.max(0, Number(dwellSeconds) || 0);
  }
  return set;
}

async function updateLatestExposureOutcome({ userId, postId, action, dwellSeconds = 0 }) {
  if (!userId || !postId || !action) return null;
  const set = getExposureOutcomeUpdate(action, dwellSeconds);
  if (Object.keys(set).length === 0) return null;

  return FeedExposure.findOneAndUpdate(
    {
      user: userId,
      post: postId,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    },
    { $set: set },
    { sort: { createdAt: -1 }, new: true }
  ).lean();
}

async function getSessionTopicScore(userId, topics = []) {
  if (!redisManager.isConnected || !redisManager.client || !userId || topics.length === 0) {
    return 0;
  }

  try {
    const key = `feed:session:${userId}:topics`;
    let score = 0;
    for (const topic of topics.map(normalizeTopic).filter(Boolean)) {
      const value = await redisManager.client.zScore(key, topic);
      score += Number(value || 0);
    }
    return clamp(score / 50);
  } catch (error) {
    console.error('Redis session topic read failed:', error.message);
    return 0;
  }
}

async function updatePostAlgorithmMetrics(post, action, dwellSeconds = 0) {
  post.algorithm = post.algorithm || {};
  const algorithm = post.algorithm;

  if (action === 'view' || action === 'impression') {
    algorithm.impressions = (algorithm.impressions || 0) + 1;
  }
  if (action === 'save' || action === 'bookmark') algorithm.saves = (algorithm.saves || 0) + 1;
  if (action === 'profile_click') algorithm.profileClicks = (algorithm.profileClicks || 0) + 1;
  if (action === 'link_click') algorithm.linkClicks = (algorithm.linkClicks || 0) + 1;
  if (action === 'author_replied') algorithm.authorReplied = (algorithm.authorReplied || 0) + 1;
  if (action === 'hide') algorithm.hideCount = (algorithm.hideCount || 0) + 1;
  if (action === 'not_interested') algorithm.notInterestedCount = (algorithm.notInterestedCount || 0) + 1;
  if (action === 'report') algorithm.reportCount = (algorithm.reportCount || 0) + 1;

  if (action === 'dwell' && dwellSeconds >= 1) {
    algorithm.impressions = (algorithm.impressions || 0) + 1;
    algorithm.totalDwellSeconds = (algorithm.totalDwellSeconds || 0) + dwellSeconds;
  }

  const impressions = Math.max(algorithm.impressions || post.engagement?.views || 0, 1);
  algorithm.avgDwellSeconds = (algorithm.totalDwellSeconds || 0) / impressions;
  algorithm.hideRate = (algorithm.hideCount || 0) / impressions;
  algorithm.reportRate = (algorithm.reportCount || 0) / impressions;
  algorithm.notInterestedRate = (algorithm.notInterestedCount || 0) / impressions;

  if (!algorithm.budgetExhausted && (algorithm.impressions || 0) >= (algorithm.impressionBudget || 200)) {
    algorithm.budgetExhausted = true;
  }

  if (typeof post.markModified === 'function') {
    post.markModified('algorithm');
  }
}

async function recordEngagement({ userId, post, action, dwellSeconds = 0, metadata = {}, updatePost = true }) {
  if (!post || !action) return null;

  await logEngagementEvent({ userId, post, action, dwellSeconds, metadata });
  await recordVelocitySignal(post._id, action);
  await recordSessionSignal(userId, post, action);
  await updateLatestExposureOutcome({ userId, postId: post._id, action, dwellSeconds });
  await Promise.all([
    updateAffinity(userId, post.author, action),
    updateTopicAffinity(userId, post, action)
  ]);

  if (updatePost && typeof post.save === 'function') {
    await updatePostAlgorithmMetrics(post, action, dwellSeconds);
    await post.save({ validateBeforeSave: false });
  }

  return { recorded: true };
}

async function safeRecordEngagement(payload) {
  try {
    return await recordEngagement(payload);
  } catch (error) {
    console.error('Algorithm engagement recording failed:', error.message);
    return null;
  }
}

module.exports = {
  AFFINITY_WEIGHTS,
  TOPIC_ACTION_WEIGHTS,
  calculateLightweightMlScore,
  clamp,
  getAffinityScore,
  getDwellScore,
  getEarlyEngagementMultiplier,
  getEngagementVelocityScore,
  getFollowMultiplier,
  getHashtagMultiplier,
  getLocalityMultiplier,
  getNegativeMultiplier,
  getPostTopics,
  getRecencyScore,
  getTopicMatchScore,
  getAuthorHealthScore,
  logEngagementEvent,
  normalizeTopic,
  recordEngagement,
  recordProfileInteraction,
  recordSessionSignal,
  getSessionTopicScore,
  recordVelocitySignal,
  safeRecordEngagement,
  updateAffinity,
  updateLatestExposureOutcome,
  updatePostAlgorithmMetrics,
  updateTopicAffinity
};
