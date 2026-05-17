require('dotenv').config();

const mongoose = require('mongoose');
const EngagementLog = require('../models/EngagementLog.model');
const FeedExposure = require('../models/FeedExposure.model');

const POSITIVE_ACTIONS = new Set(['like', 'reply', 'repost', 'quote', 'bookmark', 'save', 'profile_click', 'link_click', 'dwell']);
const NEGATIVE_ACTIONS = new Set(['hide', 'not_interested', 'report']);

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const requestedSinceDays = Number(process.env.TRAIN_SINCE_DAYS || 30);
  const sinceDays = Number.isFinite(requestedSinceDays) ? Math.max(1, requestedSinceDays) : 30;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const rows = await EngagementLog.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: '$action',
        count: { $sum: 1 },
        avgDwellSeconds: { $avg: '$dwellSeconds' }
      }
    },
    { $sort: { count: -1 } }
  ]);
  const variantRows = await FeedExposure.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: '$variant',
        exposures: { $sum: 1 },
        liked: { $sum: { $cond: ['$outcome.liked', 1, 0] } },
        replied: { $sum: { $cond: ['$outcome.replied', 1, 0] } },
        reposted: { $sum: { $cond: ['$outcome.reposted', 1, 0] } },
        bookmarked: { $sum: { $cond: ['$outcome.bookmarked', 1, 0] } },
        hidden: { $sum: { $cond: ['$outcome.hidden', 1, 0] } },
        notInterested: { $sum: { $cond: ['$outcome.notInterested', 1, 0] } },
        avgDwellSeconds: { $avg: '$outcome.dwellSeconds' }
      }
    },
    { $sort: { exposures: -1 } }
  ]);

  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const denominator = Math.max(total, 1);
  const positive = rows
    .filter((row) => POSITIVE_ACTIONS.has(row._id))
    .reduce((sum, row) => sum + row.count, 0);
  const negative = rows
    .filter((row) => NEGATIVE_ACTIONS.has(row._id))
    .reduce((sum, row) => sum + row.count, 0);
  const satisfactionRate = positive / denominator;
  const negativeRate = negative / denominator;

  const recommendedWeights = {
    affinity: Number((0.2 + satisfactionRate * 0.08).toFixed(4)),
    topic: Number((0.15 + satisfactionRate * 0.05).toFixed(4)),
    velocity: Number((0.16 + Math.max(0, 0.12 - negativeRate)).toFixed(4)),
    recency: Number((0.14 + negativeRate * 0.08).toFixed(4)),
    dwell: Number((0.08 + satisfactionRate * 0.04).toFixed(4))
  };
  const variantComparison = variantRows.map((row) => {
    const exposures = Math.max(row.exposures || 0, 1);
    const positiveScore =
      (row.liked || 0) +
      (row.replied || 0) * 3 +
      (row.reposted || 0) * 4 +
      (row.bookmarked || 0) * 3;
    const negativeScore = (row.hidden || 0) * 3 + (row.notInterested || 0) * 2;
    return {
      variant: row._id || 'unknown',
      exposures: row.exposures || 0,
      positiveRate: Number((positiveScore / exposures).toFixed(4)),
      negativeRate: Number((negativeScore / exposures).toFixed(4)),
      avgDwellSeconds: Number((row.avgDwellSeconds || 0).toFixed(2))
    };
  });

  const report = {
    since,
    totalEvents: total,
    positiveEvents: positive,
    negativeEvents: negative,
    satisfactionRate: Number(satisfactionRate.toFixed(4)),
    negativeRate: Number(negativeRate.toFixed(4)),
    actionBreakdown: rows,
    variantComparison,
    recommendedWeights
  };

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
