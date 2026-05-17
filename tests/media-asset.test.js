const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const MediaAsset = require('../models/MediaAsset.model');

async function runMediaAssetTests() {
  const ownerId = new mongoose.Types.ObjectId();

  const flexibleAsset = new MediaAsset({
    publicId: 'wemsty/custom/cover-photo-1',
    url: 'https://res.cloudinary.com/demo/image/upload/v1/wemsty/custom/cover-photo-1.jpg',
    resourceType: 'image',
    usage: 'cover_photo',
    owner: ownerId,
    attachedToType: 'profile_cover',
    attachedToId: ownerId,
    metadata: {
      placement: 'profile-header',
      randomPayload: {
        crop: 'wide',
        source: 'mobile'
      }
    },
    tags: ['cover', 'profile']
  });

  assert.equal(flexibleAsset.validateSync(), undefined);
  assert.equal(flexibleAsset.usage, 'cover_photo');
  assert.equal(flexibleAsset.attachedToType, 'profile_cover');
  assert.equal(flexibleAsset.metadata.randomPayload.crop, 'wide');

  const rawAsset = new MediaAsset({
    publicId: 'wemsty/random/file-1',
    url: 'https://res.cloudinary.com/demo/raw/upload/v1/wemsty/random/file-1.pdf',
    resourceType: 'raw',
    usage: 'random_stuff',
    owner: ownerId,
    metadata: {
      any: 'json can live here'
    }
  });

  assert.equal(rawAsset.validateSync(), undefined);
  assert.equal(rawAsset.usage, 'random_stuff');

  const textAsset = new MediaAsset({
    publicId: 'wemsty/text/user-1/text-1',
    resourceType: 'text',
    usage: 'profile_note',
    owner: ownerId,
    text: 'This can store text from the app.',
    metadata: {
      source: 'settings-screen'
    }
  });

  assert.equal(textAsset.validateSync(), undefined);
  assert.equal(textAsset.url, undefined);
  assert.equal(textAsset.text, 'This can store text from the app.');

  const missingMediaUrl = new MediaAsset({
    publicId: 'wemsty/random/missing-url',
    resourceType: 'image',
    usage: 'cover_photo',
    owner: ownerId
  });

  assert.ok(missingMediaUrl.validateSync().errors.url);

  const invalidUsage = new MediaAsset({
    publicId: 'wemsty/bad/file',
    url: 'https://example.com/file.jpg',
    resourceType: 'image',
    usage: 'Cover Photo With Spaces',
    owner: ownerId
  });

  assert.ok(invalidUsage.validateSync().errors.usage);

  assert.ok(MediaAsset.schema.path('metadata'));
  assert.ok(MediaAsset.schema.path('tags'));
  assert.ok(MediaAsset.schema.path('text'));

  const indexes = MediaAsset.schema.indexes();
  assert.ok(indexes.some(([fields]) => JSON.stringify(fields) === JSON.stringify({ owner: 1, usage: 1, createdAt: -1 })));
}

module.exports = runMediaAssetTests;
