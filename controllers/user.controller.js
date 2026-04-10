// controllers/user.controller.js

const User = require('../models/User.model');
const UserProfile = require('../models/UserProfile.model');
const Follow = require('../models/Follow.model');
const Block = require('../models/Block.model');
const AppError = require('../utils/AppError');
const { catchAsync } = require('../utils/catchAsync');
const { writeAuditLog } = require('../services/audit.service');

// ════════════════════════════════════════════════
// GET CURRENT USER PROFILE
// ════════════════════════════════════════════════
exports.getProfile = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  res.status(200).json({
    success: true,
    data: {
      user: user.toSafeObject()
    }
  });
});

// ════════════════════════════════════════════════
// UPDATE USER PROFILE
// ════════════════════════════════════════════════
exports.updateProfile = catchAsync(async (req, res, next) => {
  // Fields that can be updated
  const allowedUpdates = [
    'username',
    'profile.firstName',
    'profile.lastName',
    'profile.displayName',
    'profile.bio',
    'profile.avatar',
    'profile.location',
    'profile.website',
    'profile.phoneNumber'
  ];

  // Check if trying to update restricted fields
  const updates = Object.keys(req.body);
  const isValidUpdate = updates.every(update => {
    return allowedUpdates.some(allowed => {
      if (allowed.includes('.')) {
        // Handle nested fields
        return update === allowed || update.startsWith(allowed.split('.')[0]);
      }
      return update === allowed;
    });
  });

  if (!isValidUpdate) {
    return next(new AppError('Invalid updates. Some fields cannot be modified.', 400));
  }

  // Check username uniqueness if updating username
  if (req.body.username && req.body.username !== req.user.username) {
    const existingUser = await User.findOne({ username: req.body.username });
    if (existingUser) {
      return next(new AppError('Username already taken', 400));
    }
  }

  // Handle nested profile updates
  if (req.body.profile) {
    req.user.profile = {
      ...req.user.profile,
      ...req.body.profile
    };
    delete req.body.profile;
  }

  // Update other fields
  Object.keys(req.body).forEach(key => {
    if (allowedUpdates.includes(key)) {
      req.user[key] = req.body[key];
    }
  });

  await req.user.save({ validateBeforeSave: true });

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      user: req.user.toSafeObject()
    }
  });
});

// ════════════════════════════════════════════════
// DELETE/DEACTIVATE ACCOUNT
// ════════════════════════════════════════════════
exports.deleteAccount = catchAsync(async (req, res, next) => {
  const { password, confirmDelete } = req.body;

  if (!confirmDelete || confirmDelete !== 'DELETE') {
    return next(new AppError('Please confirm account deletion by sending confirmDelete: "DELETE"', 400));
  }

  // Verify password for email/password users
  const user = await User.findById(req.user._id).select('+password');
  
  if (user.password) {
    if (!password) {
      return next(new AppError('Password is required to delete account', 400));
    }

    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) {
      return next(new AppError('Incorrect password', 401));
    }
  }

  // Soft delete - change account status
  user.accountStatus = 'deleted';
  user.email = `deleted_${Date.now()}_${user.email}`; // Free up email for reuse
  user.username = `deleted_${Date.now()}_${user.username}`; // Free up username

  // Invalidate all tokens
  await user.invalidateAllTokens();

  res.status(200).json({
    success: true,
    message: 'Account deleted successfully'
  });

  // Optional: Schedule permanent deletion after 30 days
  // TODO: Implement permanent deletion scheduler
});

// ════════════════════════════════════════════════
// GET USER BY USERNAME (PUBLIC)
// ════════════════════════════════════════════════
exports.getUserByUsername = catchAsync(async (req, res, next) => {
  const { username } = req.params;

  const user = await User.findOne({ 
    username,
    accountStatus: 'active'
  });

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Return limited public profile
  const publicProfile = {
    _id: user._id,
    username: user.username,
    profile: {
      displayName: user.profile?.displayName,
      avatar: user.profile?.avatar,
      bio: user.profile?.bio,
      location: user.profile?.location,
      website: user.profile?.website
    },
    role: user.role,
    createdAt: user.createdAt
  };

  res.status(200).json({
    success: true,
    data: {
      user: publicProfile
    }
  });
});

// ════════════════════════════════════════════════
// GET ALL USERS (ADMIN)
// ════════════════════════════════════════════════
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const { 
    page = 1, 
    limit = 20, 
    status, 
    role, 
    search 
  } = req.query;

  // Build query
  const query = {};
  
  if (status) {
    query.accountStatus = status;
  }
  
  if (role) {
    query.role = role;
  }
  
  if (search) {
    query.$or = [
      { email: { $regex: search, $options: 'i' } },
      { username: { $regex: search, $options: 'i' } }
    ];
  }

  // Execute query with pagination
  const users = await User.find(query)
    .select('-password -refreshTokens -emailVerificationToken -passwordResetToken')
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .sort({ createdAt: -1 });

  const count = await User.countDocuments(query);

  res.status(200).json({
    success: true,
    data: {
      users,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalUsers: count
    }
  });
});

// ════════════════════════════════════════════════
// UPDATE USER ROLE (ADMIN)
// ════════════════════════════════════════════════
exports.updateUserRole = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { role } = req.body;

  const validRoles = ['user', 'creator', 'moderator', 'admin'];
  
  if (!role || !validRoles.includes(role)) {
    return next(new AppError('Invalid role', 400));
  }

  const user = await User.findById(id);
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Prevent demoting yourself
  if (user._id.toString() === req.user._id.toString()) {
    return next(new AppError('You cannot change your own role', 400));
  }

  user.role = role;
  await user.save({ validateBeforeSave: false });

  await writeAuditLog({
    actor: req.user._id,
    actionType: 'user.role.updated',
    objectType: 'user',
    objectId: user._id,
    payload: { role }
  });

  res.status(200).json({
    success: true,
    message: 'User role updated successfully',
    data: {
      user: user.toSafeObject()
    }
  });
});

// ════════════════════════════════════════════════
// UPDATE ACCOUNT STATUS (ADMIN/MODERATOR)
// ════════════════════════════════════════════════
exports.updateAccountStatus = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  const validStatuses = ['active', 'suspended', 'banned'];
  
  if (!status || !validStatuses.includes(status)) {
    return next(new AppError('Invalid status', 400));
  }

  const user = await User.findById(id);
  
  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Prevent changing your own status
  if (user._id.toString() === req.user._id.toString()) {
    return next(new AppError('You cannot change your own account status', 400));
  }

  // Prevent moderators from affecting admins
  if (req.user.role === 'moderator' && user.role === 'admin') {
    return next(new AppError('Moderators cannot modify admin accounts', 403));
  }

  user.accountStatus = status;

  // Invalidate all tokens if suspending or banning
  if (status === 'suspended' || status === 'banned') {
    await user.invalidateAllTokens();
  }

  await writeAuditLog({
    actor: req.user._id,
    actionType: 'user.status.updated',
    objectType: 'user',
    objectId: user._id,
    payload: { status, reason: reason || '' }
  });

  res.status(200).json({
    success: true,
    message: `Account ${status} successfully`,
    data: {
      user: user.toSafeObject()
    }
  });
});
