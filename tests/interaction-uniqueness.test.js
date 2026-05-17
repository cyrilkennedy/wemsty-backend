const assert = require('node:assert/strict');

const Like = require('../models/Like.model');
const Bookmark = require('../models/Bookmark.model');
const Post = require('../models/Post.model');

function hasUniqueIndex(model, expectedFields, expectedPartialFilter = null) {
  return model.schema.indexes().some(([fields, options]) => {
    assert.ok(fields);
    assert.ok(options);

    const sameFields = JSON.stringify(fields) === JSON.stringify(expectedFields);
    const unique = options.unique === true;
    const samePartialFilter = expectedPartialFilter
      ? JSON.stringify(options.partialFilterExpression) === JSON.stringify(expectedPartialFilter)
      : true;

    return sameFields && unique && samePartialFilter;
  });
}

async function runInteractionUniquenessTests() {
  assert.equal(
    hasUniqueIndex(Like, { user: 1, post: 1 }),
    true,
    'Like model must enforce one like per user per post'
  );

  assert.equal(
    hasUniqueIndex(Bookmark, { user: 1, post: 1 }),
    true,
    'Bookmark model must enforce one bookmark per user per post'
  );

  assert.equal(
    hasUniqueIndex(
      Post,
      { author: 1, originalPost: 1 },
      {
        postType: { $in: ['repost', 'quote'] },
        status: 'active',
        originalPost: { $exists: true }
      }
    ),
    true,
    'Post model must enforce one active repost or quote per user per original post'
  );
}

module.exports = runInteractionUniquenessTests;
