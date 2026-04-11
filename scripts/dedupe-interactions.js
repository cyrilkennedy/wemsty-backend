#!/usr/bin/env node

require('dotenv').config();

const mongoose = require('mongoose');
const connectDB = require('../config/mongodb');
const Post = require('../models/Post.model');
const Like = require('../models/Like.model');
const Bookmark = require('../models/Bookmark.model');
const User = require('../models/User.model');

const REPOST_TYPES = ['repost', 'quote'];
const FEED_VISIBLE_POST_TYPES = ['original', 'quote'];

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  return {
    dryRun: !flags.has('--apply') || flags.has('--dry-run')
  };
}

function formatCount(value) {
  return Number(value || 0).toLocaleString('en-US');
}

function toObjectId(id) {
  return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id);
}

function chunkArray(values, chunkSize = 500) {
  const chunks = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

async function processDuplicateGroups({
  model,
  match,
  groupId,
  dryRun,
  onGroup
}) {
  const pipeline = [];

  if (match && Object.keys(match).length > 0) {
    pipeline.push({ $match: match });
  }

  pipeline.push(
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $group: {
        _id: groupId,
        ids: { $push: '$_id' },
        count: { $sum: 1 }
      }
    },
    { $match: { count: { $gt: 1 } } }
  );

  const cursor = model.aggregate(pipeline).cursor({ batchSize: 100 });

  let groups = 0;
  let duplicates = 0;

  for await (const group of cursor) {
    groups += 1;
    const duplicateIds = group.ids.slice(1);
    duplicates += duplicateIds.length;
    await onGroup({ groupId: group._id, duplicateIds, dryRun });
  }

  return { groups, duplicates };
}

async function recomputeLikeCounters(affectedPostIds, dryRun) {
  if (dryRun || affectedPostIds.size === 0) {
    return;
  }

  const postIds = Array.from(affectedPostIds);

  for (const chunk of chunkArray(postIds, 300)) {
    const objectIds = chunk.map(toObjectId);
    const counts = await Like.aggregate([
      { $match: { post: { $in: objectIds } } },
      { $group: { _id: '$post', users: { $addToSet: '$user' } } },
      { $project: { _id: 1, count: { $size: '$users' } } }
    ]);

    const countByPostId = new Map(counts.map((row) => [row._id.toString(), Number(row.count || 0)]));
    const updates = objectIds.map((postId) => ({
      updateOne: {
        filter: { _id: postId },
        update: { $set: { 'engagement.likes': countByPostId.get(postId.toString()) || 0 } }
      }
    }));

    if (updates.length > 0) {
      await Post.bulkWrite(updates, { ordered: false });
    }
  }
}

async function recomputeRepostCounters(affectedOriginalPostIds, dryRun) {
  if (dryRun || affectedOriginalPostIds.size === 0) {
    return;
  }

  const postIds = Array.from(affectedOriginalPostIds);

  for (const chunk of chunkArray(postIds, 300)) {
    const objectIds = chunk.map(toObjectId);
    const counts = await Post.aggregate([
      {
        $match: {
          originalPost: { $in: objectIds },
          postType: { $in: REPOST_TYPES },
          status: 'active'
        }
      },
      { $group: { _id: '$originalPost', users: { $addToSet: '$author' } } },
      { $project: { _id: 1, count: { $size: '$users' } } }
    ]);

    const countByPostId = new Map(counts.map((row) => [row._id.toString(), Number(row.count || 0)]));
    const updates = objectIds.map((postId) => ({
      updateOne: {
        filter: { _id: postId },
        update: { $set: { 'engagement.reposts': countByPostId.get(postId.toString()) || 0 } }
      }
    }));

    if (updates.length > 0) {
      await Post.bulkWrite(updates, { ordered: false });
    }
  }
}

async function recomputeDerivedScores(affectedPostIds, dryRun) {
  if (dryRun || affectedPostIds.size === 0) {
    return;
  }

  const postIds = Array.from(affectedPostIds);

  for (const chunk of chunkArray(postIds, 150)) {
    const objectIds = chunk.map(toObjectId);
    const posts = await Post.find({ _id: { $in: objectIds } });

    for (const post of posts) {
      const likes = Number(post.engagement?.likes || 0);
      const comments = Number(post.engagement?.comments || 0);
      const reposts = Number(post.engagement?.reposts || 0);

      post.engagement.score = (likes * 1) + (comments * 2) + (reposts * 3);
      post.calculateSphereScore();

      await post.save({ validateBeforeSave: false });
    }
  }
}

async function ensureUniqueIndexes(dryRun) {
  if (dryRun) {
    return;
  }

  await Like.collection.createIndex({ user: 1, post: 1 }, { unique: true });
  await Bookmark.collection.createIndex({ user: 1, post: 1 }, { unique: true });
  await Post.collection.createIndex(
    { author: 1, originalPost: 1 },
    {
      unique: true,
      partialFilterExpression: {
        postType: { $in: REPOST_TYPES },
        status: 'active',
        originalPost: { $exists: true }
      }
    }
  );
}

async function recomputeAllUserThoughtCounts(dryRun) {
  if (dryRun) {
    return;
  }

  const counts = await Post.aggregate([
    {
      $match: {
        status: 'active',
        postType: { $in: FEED_VISIBLE_POST_TYPES }
      }
    },
    { $group: { _id: '$author', count: { $sum: 1 } } }
  ]);

  await User.updateMany({}, { $set: { posts_count: 0 } });

  const updates = counts.map((row) => ({
    updateOne: {
      filter: { _id: row._id },
      update: { $set: { posts_count: Number(row.count || 0) } }
    }
  }));

  if (updates.length > 0) {
    await User.bulkWrite(updates, { ordered: false });
  }
}

async function main() {
  const { dryRun } = parseArgs(process.argv);
  const affectedLikePostIds = new Set();
  const affectedRepostOriginalIds = new Set();

  console.log(`\nInteraction dedupe started (${dryRun ? 'DRY RUN' : 'APPLY'} mode)\n`);

  await connectDB();

  const likeStats = await processDuplicateGroups({
    model: Like,
    groupId: { user: '$user', post: '$post' },
    dryRun,
    onGroup: async ({ groupId, duplicateIds }) => {
      affectedLikePostIds.add(groupId.post.toString());
      if (!dryRun && duplicateIds.length > 0) {
        await Like.deleteMany({ _id: { $in: duplicateIds } });
      }
    }
  });

  const bookmarkStats = await processDuplicateGroups({
    model: Bookmark,
    groupId: { user: '$user', post: '$post' },
    dryRun,
    onGroup: async ({ duplicateIds }) => {
      if (!dryRun && duplicateIds.length > 0) {
        await Bookmark.deleteMany({ _id: { $in: duplicateIds } });
      }
    }
  });

  const repostStats = await processDuplicateGroups({
    model: Post,
    match: {
      postType: { $in: REPOST_TYPES },
      status: 'active',
      originalPost: { $exists: true }
    },
    groupId: { author: '$author', originalPost: '$originalPost' },
    dryRun,
    onGroup: async ({ groupId, duplicateIds }) => {
      affectedRepostOriginalIds.add(groupId.originalPost.toString());
      if (!dryRun && duplicateIds.length > 0) {
        await Post.updateMany(
          { _id: { $in: duplicateIds } },
          { $set: { status: 'deleted' } }
        );
      }
    }
  });

  if (!dryRun) {
    await recomputeLikeCounters(affectedLikePostIds, dryRun);
    await recomputeRepostCounters(affectedRepostOriginalIds, dryRun);

    const allAffectedPosts = new Set([
      ...Array.from(affectedLikePostIds),
      ...Array.from(affectedRepostOriginalIds)
    ]);
    await recomputeDerivedScores(allAffectedPosts, dryRun);
    await recomputeAllUserThoughtCounts(dryRun);
    await ensureUniqueIndexes(dryRun);
  }

  console.log('Summary');
  console.log(`- Likes: groups=${formatCount(likeStats.groups)}, removed=${formatCount(likeStats.duplicates)}`);
  console.log(`- Bookmarks: groups=${formatCount(bookmarkStats.groups)}, removed=${formatCount(bookmarkStats.duplicates)}`);
  console.log(`- Reposts: groups=${formatCount(repostStats.groups)}, removed=${formatCount(repostStats.duplicates)}`);
  console.log(`- Affected posts (likes): ${formatCount(affectedLikePostIds.size)}`);
  console.log(`- Affected posts (reposts): ${formatCount(affectedRepostOriginalIds.size)}`);

  if (dryRun) {
    console.log('\nDry run complete. Re-run with --apply to execute changes.');
  } else {
    console.log('\nCleanup completed and unique indexes ensured.');
  }
}

main()
  .catch((error) => {
    console.error('\nDedupe failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
