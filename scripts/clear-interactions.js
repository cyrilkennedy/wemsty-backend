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

async function recomputeAllUserThoughtCounts() {
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

  if (counts.length > 0) {
    await User.bulkWrite(
      counts.map((row) => ({
        updateOne: {
          filter: { _id: row._id },
          update: { $set: { posts_count: Number(row.count || 0) } }
        }
      })),
      { ordered: false }
    );
  }
}

async function recomputePostScores() {
  const cursor = Post.find({ status: 'active' }).cursor();

  for await (const post of cursor) {
    post.engagement.likes = 0;
    post.engagement.reposts = 0;
    post.engagement.velocity = 0;
    post.calculateSphereScore();
    await post.save({ validateBeforeSave: false });
  }
}

async function main() {
  const { dryRun } = parseArgs(process.argv);

  console.log(`\nInteraction wipe started (${dryRun ? 'DRY RUN' : 'APPLY'} mode)\n`);
  await connectDB();

  const [likesBefore, bookmarksBefore, repostsBefore] = await Promise.all([
    Like.countDocuments({}),
    Bookmark.countDocuments({}),
    Post.countDocuments({
      postType: { $in: REPOST_TYPES },
      status: { $ne: 'deleted' }
    })
  ]);

  if (!dryRun) {
    await Like.deleteMany({});
    await Bookmark.deleteMany({});
    await Post.updateMany(
      {
        postType: { $in: REPOST_TYPES },
        status: { $ne: 'deleted' }
      },
      { $set: { status: 'deleted' } }
    );

    await Post.updateMany(
      {},
      {
        $set: {
          'engagement.likes': 0,
          'engagement.reposts': 0,
          'engagement.velocity': 0
        }
      }
    );

    await recomputePostScores();
    await recomputeAllUserThoughtCounts();
  }

  const [likesAfter, bookmarksAfter, repostsAfter] = dryRun
    ? [likesBefore, bookmarksBefore, repostsBefore]
    : await Promise.all([
      Like.countDocuments({}),
      Bookmark.countDocuments({}),
      Post.countDocuments({
        postType: { $in: REPOST_TYPES },
        status: { $ne: 'deleted' }
      })
    ]);

  console.log('Summary');
  console.log(`- Likes: before=${formatCount(likesBefore)}, after=${formatCount(likesAfter)}`);
  console.log(`- Bookmarks: before=${formatCount(bookmarksBefore)}, after=${formatCount(bookmarksAfter)}`);
  console.log(`- Reposts/Quotes: before=${formatCount(repostsBefore)}, after=${formatCount(repostsAfter)}`);

  if (dryRun) {
    console.log('\nDry run complete. Re-run with --apply to execute destructive changes.');
  } else {
    console.log('\nAll likes, bookmarks, and repost/quote entries have been cleared.');
  }
}

main()
  .catch((error) => {
    console.error('\nInteraction wipe failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
