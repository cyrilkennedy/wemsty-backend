const assert = require('node:assert/strict');

const maintenanceService = require('../services/maintenance.service');
const OTP = require('../models/OTP.model');
const CircleInvite = require('../models/CircleInvite.model');
const User = require('../models/User.model');
const Notification = require('../models/Notification.model');
const PaymentTransaction = require('../models/PaymentTransaction.model');
const Post = require('../models/Post.model');
const Circle = require('../models/Circle.model');
const MediaAsset = require('../models/MediaAsset.model');
const cloudinary = require('../config/cloudinary');
const { searchIndexQueue } = require('../queues');
const paymentService = require('../services/payment.service');

function chainLean(result) {
  return {
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    select() {
      return this;
    },
    async lean() {
      return result;
    }
  };
}

async function runMaintenanceTests() {
  const originalOtpDeleteMany = OTP.deleteMany;
  const originalInviteUpdateMany = CircleInvite.updateMany;
  const originalUserUpdateMany = User.updateMany;
  const originalNotificationDeleteMany = Notification.deleteMany;
  const originalTransactionFind = PaymentTransaction.find;
  const originalVerifyTransaction = paymentService.verifyTransaction;
  const originalPostFind = Post.find;
  const originalUserFind = User.find;
  const originalCircleFind = Circle.find;
  const originalSearchAdd = searchIndexQueue.add;
  const originalEnableQueuesInTest = process.env.ENABLE_QUEUES_IN_TEST;
  const originalMediaFind = MediaAsset.find;
  const originalCloudinaryDestroy = cloudinary.uploader.destroy;

  try {
    process.env.ENABLE_QUEUES_IN_TEST = 'true';
    let otpQuery = null;
    OTP.deleteMany = async (query) => {
      otpQuery = query;
      return { deletedCount: 2 };
    };

    let inviteQuery = null;
    CircleInvite.updateMany = async (query) => {
      inviteQuery = query;
      return { modifiedCount: 3 };
    };

    let userUpdate = null;
    User.updateMany = async (query, update) => {
      userUpdate = { query, update };
      return { modifiedCount: 4 };
    };

    const now = new Date('2026-05-07T12:00:00.000Z');
    const hourly = await maintenanceService.runMaintenanceJob('hourly-cleanup', {
      now: now.toISOString()
    });

    assert.equal(hourly.expiredOtps.deleted, 2);
    assert.equal(hourly.expiredInvites.revoked, 3);
    assert.equal(hourly.expiredRefreshTokens.usersUpdated, 4);
    assert.deepEqual(otpQuery, { expiresAt: { $lte: now } });
    assert.equal(inviteQuery.isRevoked, false);
    assert.ok(userUpdate.update.$pull.refreshTokens.$or);

    let notificationQuery = null;
    Notification.deleteMany = async (query) => {
      notificationQuery = query;
      return { deletedCount: 5 };
    };

    const archive = await maintenanceService.runMaintenanceJob('notification-archive', {
      now: now.toISOString(),
      retentionDays: 30
    });
    assert.equal(archive.deleted, 5);
    assert.equal(archive.retentionDays, 30);
    assert.ok(notificationQuery.readAt.$lte instanceof Date);

    PaymentTransaction.find = () => chainLean([
      { reference: 'pending-reference-1' },
      { reference: 'pending-reference-2' }
    ]);

    const verifiedReferences = [];
    paymentService.verifyTransaction = async (reference) => {
      verifiedReferences.push(reference);
      if (reference === 'pending-reference-2') {
        throw new Error('verification failed');
      }
      return { reference };
    };

    const sweep = await maintenanceService.runMaintenanceJob('payment-verification-sweep', {
      now: now.toISOString(),
      staleMinutes: 15
    });
    assert.equal(sweep.checked, 2);
    assert.equal(sweep.verified, 1);
    assert.equal(sweep.failed, 1);
    assert.deepEqual(verifiedReferences, ['pending-reference-1', 'pending-reference-2']);

    const skipped = await maintenanceService.runMaintenanceJob('stale-presence-cleanup');
    assert.equal(skipped.skipped, true);

    Post.find = (query) => {
      if (query.status === 'active') {
        return chainLean([{ _id: { toString: () => 'public-post-1' } }]);
      }
      return chainLean([{ _id: { toString: () => 'deleted-post-1' } }]);
    };
    User.find = () => chainLean([{ _id: { toString: () => 'user-1' } }]);
    Circle.find = () => chainLean([{ _id: { toString: () => 'circle-1' } }]);

    const searchJobs = [];
    searchIndexQueue.add = async (name, data) => {
      searchJobs.push({ name, data });
    };

    const repair = await maintenanceService.runMaintenanceJob('algolia-repair', {
      now: now.toISOString(),
      days: 7,
      limit: 10
    });

    assert.equal(repair.enqueued, 4);
    assert.equal(searchJobs.length, 4);
    assert.deepEqual(searchJobs.map((job) => job.data.action), ['save', 'delete', 'save', 'save']);

    const mediaSaves = [];
    MediaAsset.find = () => ({
      sort() {
        return this;
      },
      limit() {
        return Promise.resolve([
          {
            publicId: 'orphan-ok',
            resourceType: 'image',
            status: 'uploaded',
            async save() {
              mediaSaves.push({ publicId: this.publicId, status: this.status, error: this.cleanupError });
            }
          },
          {
            publicId: 'orphan-fail',
            resourceType: 'image',
            status: 'uploaded',
            async save() {
              mediaSaves.push({ publicId: this.publicId, status: this.status, error: this.cleanupError });
            }
          }
        ]);
      }
    });
    cloudinary.uploader.destroy = async (publicId) => {
      if (publicId === 'orphan-fail') {
        throw new Error('cloudinary unavailable');
      }
      return { result: 'ok' };
    };

    const mediaCleanup = await maintenanceService.runMaintenanceJob('orphan-media-cleanup', {
      now: now.toISOString(),
      olderThanHours: 1,
      limit: 10
    });
    assert.equal(mediaCleanup.checked, 2);
    assert.equal(mediaCleanup.deleted, 1);
    assert.equal(mediaCleanup.failed, 1);
    assert.deepEqual(mediaSaves.map((item) => item.status), ['deleted', 'cleanup_failed']);
  } finally {
    if (originalEnableQueuesInTest === undefined) {
      delete process.env.ENABLE_QUEUES_IN_TEST;
    } else {
      process.env.ENABLE_QUEUES_IN_TEST = originalEnableQueuesInTest;
    }

    OTP.deleteMany = originalOtpDeleteMany;
    CircleInvite.updateMany = originalInviteUpdateMany;
    User.updateMany = originalUserUpdateMany;
    Notification.deleteMany = originalNotificationDeleteMany;
    PaymentTransaction.find = originalTransactionFind;
    paymentService.verifyTransaction = originalVerifyTransaction;
    Post.find = originalPostFind;
    User.find = originalUserFind;
    Circle.find = originalCircleFind;
    searchIndexQueue.add = originalSearchAdd;
    MediaAsset.find = originalMediaFind;
    cloudinary.uploader.destroy = originalCloudinaryDestroy;
  }
}

module.exports = runMaintenanceTests;
