const mongoose = require('mongoose');
const crypto = require('crypto');
const Circle = require('../models/Circle.model');
const CircleMembership = require('../models/CircleMembership.model');
const CircleChannel = require('../models/CircleChannel.model');
const CircleRole = require('../models/CircleRole.model');
const CircleInvite = require('../models/CircleInvite.model');
const Post = require('../models/Post.model');
const AppError = require('../utils/AppError');
const { catchAsync } = require('../utils/catchAsync');
const { createNotification } = require('../services/notification.service');
const { hasPermission, resolvePermissions } = require('../services/circle-permissions.service');
const { writeAuditLog } = require('../services/audit.service');

function slugify(value = '') {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function findCircleByIdentifier(identifier) {
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    return Circle.findById(identifier);
  }

  return Circle.findOne({ slug: identifier.toLowerCase() });
}

async function getMembership(circleId, userId) {
  if (!userId) {
    return null;
  }

  return CircleMembership.findOne({
    circle: circleId,
    user: userId
  });
}

function canManageCircle(membership, user) {
  if (!membership || membership.status !== 'active') {
    return false;
  }

  return user.role === 'admin' || membership.roles.includes('owner') || membership.roles.includes('moderator');
}

function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

exports.listCircles = catchAsync(async (req, res) => {
  const { q, page = 1, limit = 20 } = req.query;

  const query = {
    visibility: 'public',
    'moderation.status': 'active'
  };

  if (q) {
    query.$text = { $search: q };
  }

  const circles = await Circle.find(query)
    .populate('owner', 'username profile.displayName profile.avatar')
    .sort(q ? { score: { $meta: 'textScore' } } : { memberCount: -1, lastActivityAt: -1 })
    .limit(parseInt(limit, 10))
    .skip((parseInt(page, 10) - 1) * parseInt(limit, 10));

  const total = await Circle.countDocuments(query);

  res.status(200).json({
    success: true,
    data: {
      circles,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    }
  });
});

exports.getCircle = catchAsync(async (req, res, next) => {
  const circle = await findCircleByIdentifier(req.params.identifier);
  if (!circle || circle.moderation.status === 'removed') {
    return next(new AppError('Circle not found', 404));
  }

  const membership = await getMembership(circle._id, req.user?._id);
  const isMember = membership?.status === 'active';
  const isOwner = circle.owner.toString() === req.user?._id?.toString();

  if (circle.visibility !== 'public' && !isMember && !isOwner && req.user?.role !== 'admin') {
    return next(new AppError('Circle not found', 404));
  }

  const channelsQuery = { circle: circle._id };
  if (!isMember && !isOwner) {
    channelsQuery.visibility = 'public';
  }

  const channels = await CircleChannel.find(channelsQuery)
    .sort({ isPinned: -1, position: 1, createdAt: 1 })
    .select('name slug kind topic visibility isDefault lastMessageAt');

  await circle.populate('owner', 'username profile.displayName profile.avatar');
  await circle.populate({
    path: 'pinnedPostIds',
    select: 'content.text author createdAt',
    populate: { path: 'author', select: 'username profile.displayName profile.avatar' }
  });

  const permissions = await resolvePermissions(membership);

  res.status(200).json({
    success: true,
    data: {
      circle,
      membership,
      permissions,
      channels
    }
  });
});

exports.createCircle = catchAsync(async (req, res, next) => {
  const { name, slug, description, visibility, tags, icon, banner } = req.body;

  if (!name) {
    return next(new AppError('Circle name is required', 400));
  }

  const normalizedSlug = slugify(slug || name);
  if (!normalizedSlug) {
    return next(new AppError('A valid circle slug is required', 400));
  }

  const existingCircle = await Circle.findOne({ slug: normalizedSlug });
  if (existingCircle) {
    return next(new AppError('Circle slug already taken', 400));
  }

  const circle = await Circle.create({
    owner: req.user._id,
    name,
    slug: normalizedSlug,
    description: description || '',
    visibility: visibility || 'public',
    tags: Array.isArray(tags) ? tags : [],
    icon: icon || null,
    banner: banner || null
  });

  await CircleMembership.create({
    circle: circle._id,
    user: req.user._id,
    status: 'active',
    roles: ['owner', 'moderator', 'member'],
    roleIds: []
  });

  await CircleRole.insertMany([
    {
      circle: circle._id,
      name: 'Owner',
      slug: 'owner',
      priority: 100,
      permissions: ['circle.manage', 'circle.invites.manage', 'channel.create', 'channel.pin', 'message.send', 'message.moderate', 'member.manage', 'role.manage'],
      isSystemRole: true
    },
    {
      circle: circle._id,
      name: 'Moderator',
      slug: 'moderator',
      priority: 80,
      permissions: ['circle.invites.manage', 'channel.create', 'channel.pin', 'message.send', 'message.moderate', 'member.manage'],
      isSystemRole: true
    },
    {
      circle: circle._id,
      name: 'Member',
      slug: 'member',
      priority: 10,
      permissions: ['message.send'],
      isSystemRole: true
    }
  ]);

  await CircleChannel.create({
    circle: circle._id,
    name: 'general',
    slug: 'general',
    kind: 'text',
    topic: 'Welcome to the circle',
    position: 0,
    visibility: 'members_only',
    isDefault: true
  });

  await circle.populate('owner', 'username profile.displayName profile.avatar');
  await writeAuditLog({
    actor: req.user._id,
    actionType: 'circle.created',
    objectType: 'circle',
    objectId: circle._id,
    payload: { slug: circle.slug, visibility: circle.visibility }
  });

  res.status(201).json({
    success: true,
    message: 'Circle created successfully',
    data: { circle }
  });
});

exports.joinCircle = catchAsync(async (req, res, next) => {
  const circle = await Circle.findById(req.params.circleId);
  if (!circle || circle.moderation.status === 'removed') {
    return next(new AppError('Circle not found', 404));
  }

  let membership = await CircleMembership.findOne({
    circle: circle._id,
    user: req.user._id
  });

  if (membership?.status === 'banned') {
    return next(new AppError('You are banned from this circle', 403));
  }

  if (membership?.status === 'active') {
    return next(new AppError('You are already a member of this circle', 400));
  }

  if (circle.visibility !== 'public') {
    return next(new AppError('This circle requires an invite to join', 403));
  }

  if (membership) {
    membership.status = 'active';
    membership.roles = membership.roles?.length ? membership.roles : ['member'];
    membership.roleIds = membership.roleIds || [];
    membership.joinedAt = new Date();
    await membership.save();
  } else {
    membership = await CircleMembership.create({
      circle: circle._id,
      user: req.user._id,
      status: 'active',
      roles: ['member'],
      roleIds: []
    });
  }

  await Circle.findByIdAndUpdate(circle._id, {
    $inc: { memberCount: 1 },
    $set: { lastActivityAt: new Date() }
  });

  await createNotification({
    recipient: circle.owner,
    actor: req.user._id,
    type: 'circle_activity',
    objectType: 'circle',
    objectId: circle._id,
    circle: circle._id,
    previewText: `${req.user.username} joined ${circle.name}`
  });

  await writeAuditLog({
    actor: req.user._id,
    actionType: 'circle.joined',
    objectType: 'circle',
    objectId: circle._id,
    payload: { userId: req.user._id }
  });

  res.status(200).json({
    success: true,
    message: 'Joined circle successfully',
    data: { membership }
  });
});

exports.leaveCircle = catchAsync(async (req, res, next) => {
  const circle = await Circle.findById(req.params.circleId);
  if (!circle) {
    return next(new AppError('Circle not found', 404));
  }

  const membership = await CircleMembership.findOne({
    circle: circle._id,
    user: req.user._id,
    status: 'active'
  });

  if (!membership) {
    return next(new AppError('You are not a member of this circle', 400));
  }

  if (membership.roles.includes('owner')) {
    return next(new AppError('Transfer ownership before leaving this circle', 400));
  }

  membership.status = 'left';
  await membership.save();

  await Circle.findByIdAndUpdate(circle._id, {
    $inc: { memberCount: -1 },
    $set: { lastActivityAt: new Date() }
  });

  await writeAuditLog({
    actor: req.user._id,
    actionType: 'circle.left',
    objectType: 'circle',
    objectId: circle._id,
    payload: { userId: req.user._id }
  });

  res.status(200).json({
    success: true,
    message: 'Left circle successfully'
  });
});

exports.getMyCircles = catchAsync(async (req, res) => {
  const memberships = await CircleMembership.find({
    user: req.user._id,
    status: 'active'
  })
    .populate({
      path: 'circle',
      match: { 'moderation.status': { $ne: 'removed' } }
    })
    .sort({ updatedAt: -1 });

  const circles = memberships
    .filter((membership) => membership.circle)
    .map((membership) => ({
      ...membership.circle.toObject(),
      membership
    }));

  res.status(200).json({
    success: true,
    data: { circles }
  });
});

exports.getCircleMembers = catchAsync(async (req, res, next) => {
  const circle = await Circle.findById(req.params.circleId);
  if (!circle) {
    return next(new AppError('Circle not found', 404));
  }

  const requesterMembership = await getMembership(circle._id, req.user._id);
  if (circle.visibility !== 'public' && requesterMembership?.status !== 'active' && req.user.role !== 'admin') {
    return next(new AppError('You do not have access to this circle', 403));
  }

  const members = await CircleMembership.find({
    circle: circle._id,
    status: 'active'
  })
    .populate('user', 'username profile.displayName profile.avatar role')
    .sort({ joinedAt: 1 });

  res.status(200).json({
    success: true,
    data: {
      members: members.map((membership) => ({
        ...membership.user.toObject(),
        membership
      }))
    }
  });
});

exports.createChannel = catchAsync(async (req, res, next) => {
  const { circleId } = req.params;
  const { name, kind, topic, visibility } = req.body;

  const circle = await Circle.findById(circleId);
  if (!circle) {
    return next(new AppError('Circle not found', 404));
  }

  const membership = await getMembership(circleId, req.user._id);
  const canCreateChannel = await hasPermission(membership, 'channel.create', req.user.role);
  if (!canCreateChannel) {
    return next(new AppError('You do not have permission to manage channels', 403));
  }

  if (!name) {
    return next(new AppError('Channel name is required', 400));
  }

  const slug = slugify(name);
  const exists = await CircleChannel.findOne({ circle: circleId, slug });
  if (exists) {
    return next(new AppError('Channel name already exists in this circle', 400));
  }

  const currentCount = await CircleChannel.countDocuments({ circle: circleId });
  const channel = await CircleChannel.create({
    circle: circleId,
    name,
    slug,
    kind: kind || 'text',
    topic: topic || '',
    visibility: visibility || 'members_only',
    position: currentCount
  });

  await Circle.findByIdAndUpdate(circleId, {
    $inc: { channelCount: 1 },
    $set: { lastActivityAt: new Date() }
  });

  await writeAuditLog({
    actor: req.user._id,
    actionType: 'circle.channel.created',
    objectType: 'channel',
    objectId: channel._id,
    payload: { circleId, name: channel.name, visibility: channel.visibility }
  });

  res.status(201).json({
    success: true,
    message: 'Channel created successfully',
    data: { channel }
  });
});

exports.getCircleChannels = catchAsync(async (req, res, next) => {
  const circle = await Circle.findById(req.params.circleId);
  if (!circle) {
    return next(new AppError('Circle not found', 404));
  }

  const membership = await getMembership(circle._id, req.user?._id);
  const isMember = membership?.status === 'active';

  if (circle.visibility !== 'public' && !isMember && req.user?.role !== 'admin') {
    return next(new AppError('You do not have access to this circle', 403));
  }

  const query = { circle: circle._id };
  if (!isMember && req.user?.role !== 'admin') {
    query.visibility = 'public';
  }

  const channels = await CircleChannel.find(query)
    .sort({ position: 1, createdAt: 1 });

  res.status(200).json({
    success: true,
    data: { channels }
  });
});

exports.listRoles = catchAsync(async (req, res, next) => {
  const circle = await Circle.findById(req.params.circleId);
  if (!circle) {
    return next(new AppError('Circle not found', 404));
  }

  const membership = await getMembership(circle._id, req.user._id);
  const canView = membership?.status === 'active' || req.user.role === 'admin';
  if (!canView) {
    return next(new AppError('You do not have access to this circle', 403));
  }

  const roles = await CircleRole.find({ circle: circle._id }).sort({ priority: -1, createdAt: 1 });

  res.status(200).json({
    success: true,
    data: { roles }
  });
});

exports.createRole = catchAsync(async (req, res, next) => {
  const { circleId } = req.params;
  const { name, permissions = [], priority = 20 } = req.body;

  const circle = await Circle.findById(circleId);
  if (!circle) {
    return next(new AppError('Circle not found', 404));
  }

  const membership = await getMembership(circleId, req.user._id);
  const allowed = await hasPermission(membership, 'role.manage', req.user.role);
  if (!allowed) {
    return next(new AppError('You do not have permission to manage roles', 403));
  }

  if (!name) {
    return next(new AppError('Role name is required', 400));
  }

  const slug = slugify(name);
  const existing = await CircleRole.findOne({ circle: circleId, slug });
  if (existing) {
    return next(new AppError('A role with that name already exists', 400));
  }

  const role = await CircleRole.create({
    circle: circleId,
    name,
    slug,
    permissions,
    priority,
    isSystemRole: false
  });

  await writeAuditLog({
    actor: req.user._id,
    actionType: 'circle.role.created',
    objectType: 'circle_role',
    objectId: role._id,
    payload: { circleId, permissions }
  });

  res.status(201).json({
    success: true,
    message: 'Role created successfully',
    data: { role }
  });
});

exports.assignRole = catchAsync(async (req, res, next) => {
  const { circleId } = req.params;
  const { memberId, roleId, assign = true } = req.body;

  const membership = await getMembership(circleId, req.user._id);
  const allowed = await hasPermission(membership, 'role.manage', req.user.role);
  if (!allowed) {
    return next(new AppError('You do not have permission to assign roles', 403));
  }

  const targetMembership = await CircleMembership.findOne({
    circle: circleId,
    user: memberId,
    status: 'active'
  });
  if (!targetMembership) {
    return next(new AppError('Member not found', 404));
  }

  const role = await CircleRole.findOne({ _id: roleId, circle: circleId });
  if (!role) {
    return next(new AppError('Role not found', 404));
  }

  const currentIds = new Set((targetMembership.roleIds || []).map((id) => id.toString()));
  if (assign) {
    currentIds.add(role._id.toString());
  } else {
    currentIds.delete(role._id.toString());
  }

  targetMembership.roleIds = [...currentIds];
  await targetMembership.save();

  await writeAuditLog({
    actor: req.user._id,
    actionType: assign ? 'circle.role.assigned' : 'circle.role.removed',
    objectType: 'circle_membership',
    objectId: targetMembership._id,
    payload: { circleId, memberId, roleId }
  });

  res.status(200).json({
    success: true,
    message: assign ? 'Role assigned successfully' : 'Role removed successfully',
    data: { membership: targetMembership }
  });
});

exports.listInvites = catchAsync(async (req, res, next) => {
  const { circleId } = req.params;
  const membership = await getMembership(circleId, req.user._id);
  const allowed = await hasPermission(membership, 'circle.invites.manage', req.user.role);
  if (!allowed) {
    return next(new AppError('You do not have permission to view invites', 403));
  }

  const invites = await CircleInvite.find({ circle: circleId })
    .sort({ createdAt: -1 })
    .populate('createdBy', 'username profile.displayName');

  res.status(200).json({
    success: true,
    data: { invites }
  });
});

exports.createInvite = catchAsync(async (req, res, next) => {
  const { circleId } = req.params;
  const { expiresAt, maxUses } = req.body;

  const circle = await Circle.findById(circleId);
  if (!circle) {
    return next(new AppError('Circle not found', 404));
  }

  const membership = await getMembership(circleId, req.user._id);
  const allowed = await hasPermission(membership, 'circle.invites.manage', req.user.role);
  if (!allowed) {
    return next(new AppError('You do not have permission to create invites', 403));
  }

  const invite = await CircleInvite.create({
    circle: circleId,
    code: generateInviteCode(),
    createdBy: req.user._id,
    expiresAt: expiresAt || null,
    maxUses: maxUses || null
  });

  await writeAuditLog({
    actor: req.user._id,
    actionType: 'circle.invite.created',
    objectType: 'circle_invite',
    objectId: invite._id,
    payload: { circleId, code: invite.code, maxUses: invite.maxUses, expiresAt: invite.expiresAt }
  });

  res.status(201).json({
    success: true,
    message: 'Invite created successfully',
    data: { invite }
  });
});

exports.redeemInvite = catchAsync(async (req, res, next) => {
  const invite = await CircleInvite.findOne({
    code: req.params.code.toUpperCase(),
    isRevoked: false
  });

  if (!invite) {
    return next(new AppError('Invite not found', 404));
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return next(new AppError('Invite has expired', 400));
  }

  if (invite.maxUses && invite.usedCount >= invite.maxUses) {
    return next(new AppError('Invite usage limit reached', 400));
  }

  const circle = await Circle.findById(invite.circle);
  if (!circle || circle.moderation.status === 'removed') {
    return next(new AppError('Circle not found', 404));
  }

  let membership = await CircleMembership.findOne({
    circle: invite.circle,
    user: req.user._id
  });

  if (membership?.status === 'banned') {
    return next(new AppError('You are banned from this circle', 403));
  }

  if (membership?.status === 'active') {
    return next(new AppError('You are already a member of this circle', 400));
  }

  if (membership) {
    membership.status = 'active';
    membership.roles = membership.roles?.length ? membership.roles : ['member'];
    membership.roleIds = membership.roleIds || [];
    membership.joinedAt = new Date();
    await membership.save();
  } else {
    membership = await CircleMembership.create({
      circle: invite.circle,
      user: req.user._id,
      status: 'active',
      roles: ['member'],
      roleIds: []
    });
  }

  invite.usedCount += 1;
  await invite.save();

  await Circle.findByIdAndUpdate(invite.circle, {
    $inc: { memberCount: 1 },
    $set: { lastActivityAt: new Date() }
  });

  await writeAuditLog({
    actor: req.user._id,
    actionType: 'circle.invite.redeemed',
    objectType: 'circle_invite',
    objectId: invite._id,
    payload: { circleId: invite.circle, code: invite.code }
  });

  res.status(200).json({
    success: true,
    message: 'Invite redeemed successfully',
    data: { membership, circleId: invite.circle }
  });
});

exports.pinChannel = catchAsync(async (req, res, next) => {
  const { circleId, channelId } = req.params;
  const membership = await getMembership(circleId, req.user._id);
  const allowed = await hasPermission(membership, 'channel.pin', req.user.role);
  if (!allowed) {
    return next(new AppError('You do not have permission to pin channels', 403));
  }

  const channel = await CircleChannel.findOne({ _id: channelId, circle: circleId });
  if (!channel) {
    return next(new AppError('Channel not found', 404));
  }

  channel.isPinned = req.body.pinned !== false;
  await channel.save();

  const circle = await Circle.findById(circleId);
  const pinnedIds = new Set((circle.pinnedChannelIds || []).map((id) => id.toString()));
  if (channel.isPinned) {
    pinnedIds.add(channel._id.toString());
  } else {
    pinnedIds.delete(channel._id.toString());
  }
  circle.pinnedChannelIds = [...pinnedIds];
  await circle.save();

  await writeAuditLog({
    actor: req.user._id,
    actionType: channel.isPinned ? 'circle.channel.pinned' : 'circle.channel.unpinned',
    objectType: 'channel',
    objectId: channel._id,
    payload: { circleId }
  });

  res.status(200).json({
    success: true,
    message: channel.isPinned ? 'Channel pinned' : 'Channel unpinned',
    data: { channel }
  });
});

exports.pinPost = catchAsync(async (req, res, next) => {
  const { circleId, postId } = req.params;
  const membership = await getMembership(circleId, req.user._id);
  const allowed = await hasPermission(membership, 'channel.pin', req.user.role);
  if (!allowed) {
    return next(new AppError('You do not have permission to pin posts', 403));
  }

  const post = await Post.findById(postId);
  if (!post || post.status === 'deleted') {
    return next(new AppError('Post not found', 404));
  }

  const circle = await Circle.findById(circleId);
  if (!circle) {
    return next(new AppError('Circle not found', 404));
  }

  const pinnedIds = new Set((circle.pinnedPostIds || []).map((id) => id.toString()));
  const shouldPin = req.body.pinned !== false;
  if (shouldPin) {
    pinnedIds.add(post._id.toString());
  } else {
    pinnedIds.delete(post._id.toString());
  }
  circle.pinnedPostIds = [...pinnedIds];
  await circle.save();

  await writeAuditLog({
    actor: req.user._id,
    actionType: shouldPin ? 'circle.post.pinned' : 'circle.post.unpinned',
    objectType: 'post',
    objectId: post._id,
    payload: { circleId }
  });

  res.status(200).json({
    success: true,
    message: shouldPin ? 'Post pinned' : 'Post unpinned',
    data: { pinnedPostIds: circle.pinnedPostIds }
  });
});
