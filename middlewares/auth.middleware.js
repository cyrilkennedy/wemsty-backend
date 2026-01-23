// middlewares/auth.middleware.js

const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const AppError = require('../utils/AppError');
const { catchAsync } = require('../utils/catchAsync');

// ════════════════════════════════════════════════
// PROTECT ROUTES - REQUIRE AUTHENTICATION
// ════════════════════════════════════════════════
exports.protect = catchAsync(async (req, res, next) => {
  let token;

  // 1) Get token from header or cookie
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return next(new AppError('You are not logged in. Please log in to access this resource.', 401));
  }

  // 2) Verify token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Your session has expired. Please log in again.', 401));
    }
    if (error.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token. Please log in again.', 401));
    }
    return next(new AppError('Authentication failed.', 401));
  }

  // 3) Check if token type is correct
  if (decoded.type !== 'access') {
    return next(new AppError('Invalid token type.', 401));
  }

  // 4) Check if user still exists
  const user = await User.findById(decoded.userId).select('+password');
  if (!user) {
    return next(new AppError('The user belonging to this token no longer exists.', 401));
  }

  // 5) Check if account is active
  if (user.accountStatus !== 'active') {
    return next(new AppError(`Account is ${user.accountStatus}. Please contact support.`, 403));
  }

  // 6) Check if account is locked
  if (user.isLocked) {
    return next(new AppError('Account is temporarily locked due to too many failed login attempts.', 403));
  }

  // 7) Check if token version matches (for global logout)
  if (decoded.tokenVersion !== user.tokenVersion) {
    return next(new AppError('This session has been invalidated. Please log in again.', 401));
  }

  // 8) Check if user changed password after token was issued
  if (user.changedPasswordAfter(decoded.iat)) {
    return next(new AppError('Password was recently changed. Please log in again.', 401));
  }

  // 9) Grant access - attach user to request
  req.user = user;
  next();
});

// ════════════════════════════════════════════════
// OPTIONAL AUTHENTICATION - DON'T FAIL IF NO TOKEN
// ════════════════════════════════════════════════
exports.optionalAuth = catchAsync(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    
    if (decoded.type === 'access') {
      const user = await User.findById(decoded.userId);
      
      if (user && 
          user.accountStatus === 'active' && 
          !user.isLocked && 
          decoded.tokenVersion === user.tokenVersion) {
        req.user = user;
      }
    }
  } catch (error) {
    // Silently fail - just don't attach user
  }

  next();
});

// ════════════════════════════════════════════════
// RESTRICT TO SPECIFIC ROLES
// ════════════════════════════════════════════════
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('You are not logged in.', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action.', 403));
    }

    next();
  };
};

// ════════════════════════════════════════════════
// VERIFY EMAIL REQUIRED
// ════════════════════════════════════════════════
exports.requireEmailVerification = (req, res, next) => {
  if (!req.user) {
    return next(new AppError('You are not logged in.', 401));
  }

  if (!req.user.isEmailVerified) {
    return next(new AppError('Please verify your email address to access this resource.', 403));
  }

  next();
};

// ════════════════════════════════════════════════
// VERIFY RESOURCE OWNERSHIP
// ════════════════════════════════════════════════
exports.verifyOwnership = (resourceUserField = 'user') => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('You are not logged in.', 401));
    }

    // Admins can access any resource
    if (req.user.role === 'admin') {
      return next();
    }

    // Check if resource belongs to user
    const resource = req.resource; // Should be set by previous middleware
    
    if (!resource) {
      return next(new AppError('Resource not found.', 404));
    }

    const resourceUserId = resource[resourceUserField]?.toString() || resource[resourceUserField];
    const currentUserId = req.user._id.toString();

    if (resourceUserId !== currentUserId) {
      return next(new AppError('You do not have permission to access this resource.', 403));
    }

    next();
  };
};

// ════════════════════════════════════════════════
// VERIFY REFRESH TOKEN
// ════════════════════════════════════════════════
exports.verifyRefreshToken = catchAsync(async (req, res, next) => {
  let token;

  // Get refresh token from body or cookie
  if (req.body.refreshToken) {
    token = req.body.refreshToken;
  } else if (req.cookies?.refreshToken) {
    token = req.cookies.refreshToken;
  }

  if (!token) {
    return next(new AppError('No refresh token provided.', 401));
  }

  // Verify token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Refresh token has expired. Please log in again.', 401));
    }
    return next(new AppError('Invalid refresh token.', 401));
  }

  // Check token type
  if (decoded.type !== 'refresh') {
    return next(new AppError('Invalid token type.', 401));
  }

  // Find user
  const user = await User.findById(decoded.userId);
  if (!user) {
    return next(new AppError('User not found.', 401));
  }

  // Check account status
  if (user.accountStatus !== 'active') {
    return next(new AppError(`Account is ${user.accountStatus}.`, 403));
  }

  // Check token version
  if (decoded.tokenVersion !== user.tokenVersion) {
    return next(new AppError('This session has been invalidated. Please log in again.', 401));
  }

  // Check if token exists in user's refresh tokens
  const tokenExists = user.refreshTokens.some(rt => rt.token === token);
  if (!tokenExists) {
    return next(new AppError('Invalid refresh token.', 401));
  }

  req.user = user;
  req.refreshToken = token;
  next();
});