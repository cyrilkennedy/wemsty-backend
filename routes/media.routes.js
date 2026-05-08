const express = require('express');
const cloudinary = require('../config/cloudinary');
const authMiddleware = require('../middlewares/auth.middleware');
const { sendSuccess } = require('../utils/response.util');
const AppError = require('../utils/AppError');
const MediaAsset = require('../models/MediaAsset.model');

const router = express.Router();

router.use(authMiddleware.protect);

router.post('/signature', (req, res, next) => {
  if (!cloudinary?.utils?.api_sign_request) {
    return next(new AppError('Cloudinary is not configured', 503));
  }

  const folder = req.body.folder || 'wemsty/uploads';
  const resourceType = req.body.resourceType || 'image';
  const timestamp = Math.round(Date.now() / 1000);
  const params = {
    folder,
    resource_type: resourceType,
    timestamp
  };

  const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);

  return sendSuccess(res, {
    message: 'Upload signature generated',
    data: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      timestamp,
      folder,
      resourceType,
      signature
    }
  });
});

router.post('/register', async (req, res, next) => {
  const {
    publicId,
    url,
    resourceType = 'image',
    attachedToType = null,
    attachedToId = null
  } = req.body || {};

  if (!publicId || !url) {
    return next(new AppError('publicId and url are required', 400));
  }

  const status = attachedToType && attachedToId ? 'attached' : 'uploaded';
  const asset = await MediaAsset.findOneAndUpdate(
    { publicId },
    {
      $set: {
        url,
        resourceType,
        owner: req.user._id,
        attachedToType,
        attachedToId,
        status,
        cleanupError: null
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Media asset registered',
    data: { asset }
  });
});

router.delete('/:publicId', async (req, res, next) => {
  if (!cloudinary?.uploader?.destroy) {
    return next(new AppError('Cloudinary is not configured', 503));
  }

  const result = await cloudinary.uploader.destroy(req.params.publicId);
  await MediaAsset.findOneAndUpdate(
    { publicId: req.params.publicId, owner: req.user._id },
    {
      $set: {
        status: 'deleted',
        deletedAt: new Date(),
        cleanupError: null
      }
    }
  );

  return sendSuccess(res, {
    message: 'Media delete requested',
    data: result
  });
});

module.exports = router;
