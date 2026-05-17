const assert = require('node:assert/strict');

const postController = require('../controllers/post.controller');
const socialController = require('../controllers/social.controller');
const messagingController = require('../controllers/messaging.controller');
const moderationController = require('../controllers/moderation.controller');
const Post = require('../models/Post.model');

async function runProfileSupportEndpointTests() {
  assert.equal(typeof postController.getMyLikedPosts, 'function');
  assert.equal(typeof postController.getUserMediaPosts, 'function');
  assert.equal(typeof postController.getUserReposts, 'function');
  assert.equal(typeof postController.getPostReposts, 'function');
  assert.equal(typeof postController.getPostQuotes, 'function');
  assert.equal(typeof postController.trackPostView, 'function');
  assert.equal(typeof socialController.getRelationshipStatus, 'function');
  assert.equal(typeof messagingController.searchDMConversations, 'function');
  assert.equal(typeof moderationController.getReportReasons, 'function');

  const postIndexes = Post.schema.indexes();
  assert.ok(postIndexes.some(([fields]) => JSON.stringify(fields) === JSON.stringify({ author: 1, originalPost: 1 })));
}

module.exports = runProfileSupportEndpointTests;
