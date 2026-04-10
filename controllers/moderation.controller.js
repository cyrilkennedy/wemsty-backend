const User = require('../models/User.model');
const Post = require('../models/Post.model');
const Circle = require('../models/Circle.model');
const CircleMessage = require('../models/CircleMessage.model');
const DMMessage = require('../models/DMMessage.model');
const Report = require('../models/Report.model');
const ModerationAction = require('../models/ModerationAction.model');
const AuditLog = require('../models/AuditLog.model');
const AppError = require('../utils/AppError');
const { catchAsync } = require('../utils/catchAsync');
const { writeAuditLog } = require('../services/audit.service');

function getTargetModel(targetType) {
  return {
    user: User,
    post: Post,
    circle: Circle,
    circle_message: CircleMessage,
    dm_message: DMMessage
  }[targetType];
}

exports.createReport = catchAsync(async (req, res, next) => {
  const { targetType, targetId, reasonCode, detailsText } = req.body;

  if (!targetType || !targetId || !reasonCode) {
    return next(new AppError('targetType, targetId, and reasonCode are required', 400));
  }

  const TargetModel = getTargetModel(targetType);
  if (!TargetModel) {
    return next(new AppError('Invalid report target type', 400));
  }

  const target = await TargetModel.findById(targetId);
  if (!target) {
    return next(new AppError('Target not found', 404));
  }

  const existing = await Report.findOne({
    reporter: req.user._id,
    targetType,
    targetId
  });

  if (existing) {
    return next(new AppError('You have already reported this content', 400));
  }

  const report = await Report.create({
    reporter: req.user._id,
    targetType,
    targetId,
    reasonCode,
    detailsText: detailsText || ''
  });

  await writeAuditLog({
    actor: req.user._id,
    actionType: 'report.created',
    objectType: targetType,
    objectId: targetId,
    payload: { reasonCode }
  });

  if (targetType === 'post') {
    await Post.findByIdAndUpdate(targetId, { $inc: { 'moderation.flagCount': 1 } });
  }

  if (targetType === 'circle') {
    await Circle.findByIdAndUpdate(targetId, { $inc: { 'moderation.reportCount': 1 } });
  }

  res.status(201).json({
    success: true,
    message: 'Report submitted successfully',
    data: { report }
  });
});

exports.listReports = catchAsync(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const query = {};

  if (status) {
    query.status = status;
  }

  const reports = await Report.find(query)
    .populate('reporter', 'username profile.displayName profile.avatar')
    .populate('reviewedBy', 'username profile.displayName')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit, 10))
    .skip((parseInt(page, 10) - 1) * parseInt(limit, 10));

  const total = await Report.countDocuments(query);

  res.status(200).json({
    success: true,
    data: {
      reports,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    }
  });
});

exports.takeModerationAction = catchAsync(async (req, res, next) => {
  const { reportId } = req.params;
  const { actionType, reasonText } = req.body;

  const report = await Report.findById(reportId);
  if (!report) {
    return next(new AppError('Report not found', 404));
  }

  const TargetModel = getTargetModel(report.targetType);
  const target = await TargetModel.findById(report.targetId);
  if (!target) {
    return next(new AppError('Report target not found', 404));
  }

  if (actionType === 'hide' || actionType === 'remove') {
    const field = report.targetType === 'user' ? 'accountStatus' : 'moderationState';

    if (report.targetType === 'user') {
      target.accountStatus = actionType === 'remove' ? 'banned' : 'suspended';
      await target.invalidateAllTokens();
    } else if (report.targetType === 'circle') {
      target.moderation.status = actionType === 'remove' ? 'removed' : 'hidden';
    } else {
      target[field] = actionType === 'remove' ? 'removed' : 'hidden';
    }

    await target.save({ validateBeforeSave: false });
  }

  report.status = actionType === 'dismiss_report' ? 'dismissed' : 'actioned';
  report.reviewedBy = req.user._id;
  report.reviewedAt = new Date();
  await report.save();

  const moderationAction = await ModerationAction.create({
    targetType: report.targetType,
    targetId: report.targetId,
    actionType,
    actor: req.user._id,
    report: report._id,
    reasonText: reasonText || ''
  });

  await writeAuditLog({
    actor: req.user._id,
    actionType: `moderation.${actionType}`,
    objectType: report.targetType,
    objectId: report.targetId,
    payload: { reportId: report._id, reasonText: reasonText || '' }
  });

  res.status(200).json({
    success: true,
    message: 'Moderation action recorded',
    data: {
      report,
      moderationAction
    }
  });
});

exports.listAuditLogs = catchAsync(async (req, res) => {
  const { objectType, actionType, page = 1, limit = 50 } = req.query;
  const query = {};

  if (objectType) {
    query.objectType = objectType;
  }

  if (actionType) {
    query.actionType = actionType;
  }

  const logs = await AuditLog.find(query)
    .populate('actor', 'username profile.displayName')
    .sort({ createdAt: -1 })
    .limit(parseInt(limit, 10))
    .skip((parseInt(page, 10) - 1) * parseInt(limit, 10));

  const total = await AuditLog.countDocuments(query);

  res.status(200).json({
    success: true,
    data: {
      logs,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    }
  });
});
