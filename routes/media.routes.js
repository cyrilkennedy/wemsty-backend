const express = require('express');
const crypto = require('crypto');
const cloudinary = require('../config/cloudinary');
const authMiddleware = require('../middlewares/auth.middleware');
const { sendSuccess } = require('../utils/response.util');
const AppError = require('../utils/AppError');
const MediaAsset = require('../models/MediaAsset.model');

const router = express.Router();

router.use(authMiddleware.protect);

const ALLOWED_RESOURCE_TYPES = new Set(['image', 'video', 'raw', 'text']);
const UPLOAD_RESOURCE_TYPES = new Set(['image', 'video', 'raw']);
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

function normalizeSlug(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized || fallback;
}

function assertSlug(value, fieldName, next, { required = false } = {}) {
  const normalized = normalizeSlug(value, required ? null : undefined);

  if (required && !normalized) {
    next(new AppError(`${fieldName} is required`, 400));
    return null;
  }

  if (normalized !== undefined && normalized !== null && !SLUG_PATTERN.test(normalized)) {
    next(new AppError(`${fieldName} must be a lowercase slug using letters, numbers, hyphen, or underscore`, 400));
    return null;
  }

  return normalized;
}

function assertResourceType(resourceType, next) {
  const normalized = normalizeSlug(resourceType, 'image');

  if (!ALLOWED_RESOURCE_TYPES.has(normalized)) {
    next(new AppError('resourceType must be one of image, video, raw, or text', 400));
    return null;
  }

  return normalized;
}

function getTextPayload(body = {}) {
  if (typeof body.text === 'string') return body.text;
  if (typeof body.content === 'string') return body.content;
  if (body.content && typeof body.content.text === 'string') return body.content.text;
  return null;
}

router.post('/signature', (req, res, next) => {
  if (!cloudinary?.utils?.api_sign_request) {
    return next(new AppError('Cloudinary is not configured', 503));
  }

  const usage = assertSlug(req.body.usage || req.body.assetType, 'usage', next) || 'general';
  const resourceType = assertResourceType(req.body.resourceType, next);
  if (!resourceType) return null;
  if (!UPLOAD_RESOURCE_TYPES.has(resourceType)) {
    return next(new AppError('Text assets do not need an upload signature. Store them with POST /api/media/assets.', 400));
  }

  const folder = req.body.folder || `wemsty/${usage}`;
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
      usage,
      resourceType,
      signature
    }
  });
});

async function registerMediaAsset(req, res, next) {
  const textPayload = getTextPayload(req.body);
  const hasTextPayload = typeof textPayload === 'string' && textPayload.trim().length > 0;
  const {
    publicId = hasTextPayload ? `wemsty/text/${req.user._id}/${Date.now()}-${crypto.randomUUID()}` : null,
    url,
    resourceType = hasTextPayload && !url ? 'text' : 'image',
    usage = 'general',
    attachedToType = null,
    attachedToId = null
  } = req.body || {};

  if (!publicId) {
    return next(new AppError('publicId is required for media assets', 400));
  }

  const normalizedResourceType = assertResourceType(resourceType, next);
  const normalizedUsage = assertSlug(usage, 'usage', next) || 'general';
  const normalizedAttachedToType = assertSlug(attachedToType, 'attachedToType', next);
  if (!normalizedResourceType || !normalizedUsage || normalizedAttachedToType === null) {
    return null;
  }

  if (normalizedResourceType === 'text' && !hasTextPayload) {
    return next(new AppError('text is required when resourceType is text', 400));
  }

  if (normalizedResourceType !== 'text' && !url) {
    return next(new AppError('url is required for media assets', 400));
  }

  const status = attachedToType && attachedToId ? 'attached' : 'uploaded';
  const update = {
    resourceType: normalizedResourceType,
    usage: normalizedUsage,
    owner: req.user._id,
    attachedToType: normalizedAttachedToType || null,
    attachedToId,
    status,
    metadata: req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {},
    tags: Array.isArray(req.body.tags) ? req.body.tags.slice(0, 20) : [],
    cleanupError: null
  };

  if (url) update.url = url;
  if (normalizedResourceType === 'text') update.text = textPayload.trim();

  const asset = await MediaAsset.findOneAndUpdate(
    { publicId },
    {
      $set: update
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Media asset registered',
    data: { asset }
  });
}

router.post('/register', registerMediaAsset);
router.post('/assets', registerMediaAsset);

router.get('/assets', async (req, res, next) => {
  const usage = assertSlug(req.query.usage, 'usage', next);
  const status = assertSlug(req.query.status, 'status', next);
  if (usage === null || status === null) {
    return null;
  }

  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const query = { owner: req.user._id };

  if (usage) query.usage = usage;
  if (status) query.status = status;

  const [assets, total] = await Promise.all([
    MediaAsset.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit),
    MediaAsset.countDocuments(query)
  ]);

  return sendSuccess(res, {
    message: 'Media assets retrieved',
    data: { assets },
    meta: {
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

router.patch('/assets/:publicId', async (req, res, next) => {
  const usage = assertSlug(req.body.usage, 'usage', next);
  const attachedToType = assertSlug(req.body.attachedToType, 'attachedToType', next);
  if (usage === null || attachedToType === null) {
    return null;
  }

  const update = {
    cleanupError: null
  };

  if (usage) update.usage = usage;
  if (Object.prototype.hasOwnProperty.call(req.body, 'attachedToType')) {
    update.attachedToType = attachedToType || null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'attachedToId')) {
    update.attachedToId = req.body.attachedToId || null;
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'metadata')) {
    update.metadata = req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'text') || Object.prototype.hasOwnProperty.call(req.body, 'content')) {
    const textPayload = getTextPayload(req.body);
    if (typeof textPayload !== 'string' || textPayload.trim().length === 0) {
      return next(new AppError('text must not be empty', 400));
    }
    update.resourceType = 'text';
    update.text = textPayload.trim();
  }
  if (Array.isArray(req.body.tags)) {
    update.tags = req.body.tags.slice(0, 20);
  }

  const attachmentChanged = Object.prototype.hasOwnProperty.call(req.body, 'attachedToType') ||
    Object.prototype.hasOwnProperty.call(req.body, 'attachedToId');
  if (attachmentChanged) {
    const nextAttachedToType = Object.prototype.hasOwnProperty.call(update, 'attachedToType') ? update.attachedToType : undefined;
    const nextAttachedToId = Object.prototype.hasOwnProperty.call(update, 'attachedToId') ? update.attachedToId : undefined;
    update.status = nextAttachedToType && nextAttachedToId ? 'attached' : 'uploaded';
  }

  const asset = await MediaAsset.findOneAndUpdate(
    { publicId: req.params.publicId, owner: req.user._id },
    { $set: update },
    { new: true }
  );

  if (!asset) {
    return next(new AppError('Media asset not found', 404));
  }

  return sendSuccess(res, {
    message: 'Media asset updated',
    data: { asset }
  });
});

router.delete('/:publicId', async (req, res, next) => {
  const asset = await MediaAsset.findOne({ publicId: req.params.publicId, owner: req.user._id });

  if (!asset) {
    return next(new AppError('Media asset not found', 404));
  }

  let result = { resourceType: asset.resourceType, skippedExternalDelete: asset.resourceType === 'text' };

  if (asset.resourceType !== 'text') {
    if (!cloudinary?.uploader?.destroy) {
      return next(new AppError('Cloudinary is not configured', 503));
    }

    result = await cloudinary.uploader.destroy(req.params.publicId, {
      resource_type: asset.resourceType
    });
  }

  asset.status = 'deleted';
  asset.deletedAt = new Date();
  asset.cleanupError = null;
  await asset.save();

  return sendSuccess(res, {
    message: asset.resourceType === 'text' ? 'Text asset deleted' : 'Media delete requested',
    data: result
  });
});

module.exports = router;
