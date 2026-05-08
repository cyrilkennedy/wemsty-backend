const OTP = require('../models/OTP.model');
const CircleInvite = require('../models/CircleInvite.model');
const User = require('../models/User.model');
const Notification = require('../models/Notification.model');
const PaymentTransaction = require('../models/PaymentTransaction.model');
const Post = require('../models/Post.model');
const Circle = require('../models/Circle.model');
const MediaAsset = require('../models/MediaAsset.model');
const cloudinary = require('../config/cloudinary');
const paymentService = require('./payment.service');
const { searchIndexQueue } = require('../queues');
const { addJob } = require('./queue.service');

const DAY_MS = 24 * 60 * 60 * 1000;

function count(result) {
  return result?.deletedCount ?? result?.modifiedCount ?? result?.matchedCount ?? 0;
}

async function cleanupExpiredOtps(now = new Date()) {
  const result = await OTP.deleteMany({ expiresAt: { $lte: now } });
  return { deleted: count(result) };
}

async function cleanupExpiredInvites(now = new Date()) {
  const result = await CircleInvite.updateMany(
    { expiresAt: { $lte: now }, isRevoked: false },
    { $set: { isRevoked: true } }
  );
  return { revoked: count(result) };
}

async function cleanupExpiredRefreshTokens(now = new Date()) {
  const result = await User.updateMany(
    {
      refreshTokens: {
        $elemMatch: {
          $or: [
            { expiresAt: { $lte: now } },
            { revokedAt: { $ne: null } }
          ]
        }
      }
    },
    {
      $pull: {
        refreshTokens: {
          $or: [
            { expiresAt: { $lte: now } },
            { revokedAt: { $ne: null } }
          ]
        }
      }
    }
  );

  return { usersUpdated: count(result) };
}

async function archiveOldNotifications(now = new Date(), retentionDays = 90) {
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  const result = await Notification.deleteMany({
    readAt: { $ne: null, $lte: cutoff },
    createdAt: { $lte: cutoff }
  });

  return { deleted: count(result), retentionDays };
}

async function paymentVerificationSweep(now = new Date(), staleMinutes = 30) {
  const cutoff = new Date(now.getTime() - staleMinutes * 60 * 1000);
  const transactions = await PaymentTransaction.find({
    provider: 'paystack',
    status: 'pending',
    createdAt: { $lte: cutoff }
  })
    .sort({ createdAt: 1 })
    .limit(100)
    .select('reference')
    .lean();

  const results = [];
  for (const transaction of transactions) {
    try {
      await paymentService.verifyTransaction(transaction.reference);
      results.push({ reference: transaction.reference, status: 'verified' });
    } catch (error) {
      results.push({ reference: transaction.reference, status: 'failed', error: error.message });
    }
  }

  return {
    checked: transactions.length,
    verified: results.filter((item) => item.status === 'verified').length,
    failed: results.filter((item) => item.status === 'failed').length,
    results
  };
}

async function cleanupHourly(now = new Date()) {
  const [expiredOtps, expiredInvites, expiredRefreshTokens] = await Promise.all([
    cleanupExpiredOtps(now),
    cleanupExpiredInvites(now),
    cleanupExpiredRefreshTokens(now)
  ]);

  return {
    expiredOtps,
    expiredInvites,
    expiredRefreshTokens
  };
}

async function algoliaRepair(now = new Date(), options = {}) {
  const days = Number(options.days || 7);
  const limit = Number(options.limit || 250);
  const cutoff = new Date(now.getTime() - days * DAY_MS);

  const [publicPosts, nonPublicPosts, users, circles] = await Promise.all([
    Post.find({
      status: 'active',
      visibility: 'public',
      postType: { $in: ['original', 'quote'] },
      updatedAt: { $gte: cutoff }
    }).sort({ updatedAt: -1 }).limit(limit).lean(),
    Post.find({
      $or: [
        { status: { $in: ['deleted', 'hidden', 'shadow_hidden'] } },
        { visibility: { $ne: 'public' } }
      ],
      updatedAt: { $gte: cutoff }
    }).sort({ updatedAt: -1 }).limit(limit).select('_id').lean(),
    User.find({
      accountStatus: 'active',
      updatedAt: { $gte: cutoff }
    }).sort({ updatedAt: -1 }).limit(limit).lean(),
    Circle.find({
      visibility: 'public',
      'moderation.status': 'active',
      updatedAt: { $gte: cutoff }
    }).sort({ updatedAt: -1 }).limit(limit).lean()
  ]);

  let enqueued = 0;

  for (const post of publicPosts) {
    await addJob(searchIndexQueue, 'index-entity', {
      action: 'save',
      entityType: 'post',
      entityId: post._id.toString(),
      payload: post
    });
    enqueued += 1;
  }

  for (const post of nonPublicPosts) {
    await addJob(searchIndexQueue, 'index-entity', {
      action: 'delete',
      entityType: 'post',
      entityId: post._id.toString()
    });
    enqueued += 1;
  }

  for (const user of users) {
    await addJob(searchIndexQueue, 'index-entity', {
      action: 'save',
      entityType: 'user',
      entityId: user._id.toString(),
      payload: user
    });
    enqueued += 1;
  }

  for (const circle of circles) {
    await addJob(searchIndexQueue, 'index-entity', {
      action: 'save',
      entityType: 'circle',
      entityId: circle._id.toString(),
      payload: circle
    });
    enqueued += 1;
  }

  return {
    enqueued,
    publicPosts: publicPosts.length,
    deletedPosts: nonPublicPosts.length,
    users: users.length,
    circles: circles.length,
    cutoff
  };
}

async function orphanMediaCleanup(now = new Date(), options = {}) {
  const olderThanHours = Number(options.olderThanHours || 24);
  const limit = Number(options.limit || 100);
  const cutoff = new Date(now.getTime() - olderThanHours * 60 * 60 * 1000);

  const assets = await MediaAsset.find({
    status: 'uploaded',
    attachedToId: null,
    createdAt: { $lte: cutoff }
  })
    .sort({ createdAt: 1 })
    .limit(limit);

  const results = [];
  for (const asset of assets) {
    try {
      if (cloudinary?.uploader?.destroy) {
        await cloudinary.uploader.destroy(asset.publicId, {
          resource_type: asset.resourceType || 'image'
        });
      }

      asset.status = 'deleted';
      asset.deletedAt = now;
      asset.cleanupError = null;
      await asset.save();
      results.push({ publicId: asset.publicId, status: 'deleted' });
    } catch (error) {
      asset.status = 'cleanup_failed';
      asset.cleanupError = error.message;
      await asset.save();
      results.push({ publicId: asset.publicId, status: 'cleanup_failed', error: error.message });
    }
  }

  return {
    checked: assets.length,
    deleted: results.filter((item) => item.status === 'deleted').length,
    failed: results.filter((item) => item.status === 'cleanup_failed').length,
    results
  };
}

async function runMaintenanceJob(name, data = {}) {
  const now = data.now ? new Date(data.now) : new Date();

  switch (name) {
    case 'expired-otp-cleanup':
      return cleanupExpiredOtps(now);
    case 'expired-invite-cleanup':
      return cleanupExpiredInvites(now);
    case 'expired-refresh-token-cleanup':
      return cleanupExpiredRefreshTokens(now);
    case 'hourly-cleanup':
      return cleanupHourly(now);
    case 'notification-archive':
      return archiveOldNotifications(now, Number(data.retentionDays || 90));
    case 'payment-verification-sweep':
      return paymentVerificationSweep(now, Number(data.staleMinutes || 30));
    case 'stale-presence-cleanup':
      return { skipped: true, reason: 'Redis presence keys expire automatically via TTL' };
    case 'counter-reconciliation':
      return { skipped: true, reason: 'Counter reconciliation requires entity-specific processors' };
    case 'orphan-media-cleanup':
      return orphanMediaCleanup(now, data);
    case 'algolia-repair':
      return algoliaRepair(now, data);
    default:
      throw new Error(`Unknown maintenance job: ${name}`);
  }
}

module.exports = {
  cleanupExpiredOtps,
  cleanupExpiredInvites,
  cleanupExpiredRefreshTokens,
  archiveOldNotifications,
  paymentVerificationSweep,
  algoliaRepair,
  orphanMediaCleanup,
  cleanupHourly,
  runMaintenanceJob
};
