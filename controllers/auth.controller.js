// controllers/auth.controller.js

const User = require('../models/User.model');
const Post = require('../models/Post.model');
const AppError = require('../utils/AppError');
const { catchAsync } = require('../utils/catchAsync');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const OTP = require('../models/OTP.model');
const PasswordResetFeedback = require('../models/PasswordResetFeedback.model');
const { sendOTPEmail, sendPasswordResetSuccessEmail } = require('../utils/emailService');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const FEED_VISIBLE_POST_TYPES = ['original', 'quote'];

async function toSafeUserWithLiveThoughtCount(user) {
  const safeUser = user.toSafeObject();
  const thoughtsCount = await Post.countDocuments({
    author: user._id,
    postType: { $in: FEED_VISIBLE_POST_TYPES },
    status: 'active'
  });

  safeUser.posts_count = thoughtsCount;
  return safeUser;
}

// ════════════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════════════

const createAndSendTokens = async (user, statusCode, res, message = 'Success') => {
  // Generate tokens
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  // Save refresh token to database
  user.refreshTokens.push({
    token: refreshToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    deviceInfo: res.req.headers['user-agent']
  });

  // Limit refresh tokens to 5 per user (keep only most recent)
  if (user.refreshTokens.length > 5) {
    user.refreshTokens = user.refreshTokens.slice(-5);
  }

  await user.save({ validateBeforeSave: false });

  // Cookie options
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
  };

  // Set cookies
  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000 // 15 minutes
  });

  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  const safeUser = await toSafeUserWithLiveThoughtCount(user);

  // Send response
  res.status(statusCode).json({
    status: 'success',
    message,
    data: {
      user: safeUser,
      accessToken,
      refreshToken
    }
  });
};

// ════════════════════════════════════════════════
// SIGNUP - EMAIL & PASSWORD
// ════════════════════════════════════════════════
exports.signup = catchAsync(async (req, res, next) => {
  const { email, username, password, firstName, lastName } = req.body;

  // Validate required fields
  if (!email || !username || !password) {
    return next(new AppError('Please provide email, username, and password', 400));
  }

  // Check if user already exists
  const existingUser = await User.findOne({ 
    $or: [{ email }, { username }] 
  });

  if (existingUser) {
    if (existingUser.email === email) {
      return next(new AppError('Email already registered', 400));
    }
    if (existingUser.username === username) {
      return next(new AppError('Username already taken', 400));
    }
  }

  // Create user
  const user = await User.create({
    email,
    username,
    password,
    profile: {
      firstName,
      lastName,
      displayName: username
    },
    authProviders: [{
      provider: 'email',
      providerId: email,
      email
    }]
  });

  // Generate email verification token (optional - can be sent via email)
  const verificationToken = user.generateEmailVerificationToken();
  await user.save({ validateBeforeSave: false });

  // TODO: Send verification email
  // await sendVerificationEmail(user.email, verificationToken);

  // Send tokens
  return createAndSendTokens(user, 201, res, 'Account created successfully');
});

// ════════════════════════════════════════════════
// LOGIN - EMAIL & PASSWORD
// ════════════════════════════════════════════════
exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  // Find user and include password
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    return next(new AppError('Invalid email or password', 401));
  }

  // Check if account is locked
  if (user.isLocked) {
    return next(new AppError('Account is temporarily locked. Please try again later.', 403));
  }

  // Check account status
  if (user.accountStatus !== 'active') {
    return next(new AppError(`Account is ${user.accountStatus}. Please contact support.`, 403));
  }

  // Verify password
  const isPasswordCorrect = await user.comparePassword(password);

  if (!isPasswordCorrect) {
    // Increment login attempts
    await user.incLoginAttempts();
    return next(new AppError('Invalid email or password', 401));
  }

  // Reset login attempts on successful login
  await user.resetLoginAttempts();

  // Update last login
  user.lastLogin = Date.now();
  user.lastLoginIP = req.ip;
  await user.save({ validateBeforeSave: false });

  // Send tokens
  return createAndSendTokens(user, 200, res, 'Login successful');
});

// ════════════════════════════════════════════════
// GOOGLE OAUTH SIGNUP/LOGIN
// ════════════════════════════════════════════════
exports.googleAuth = catchAsync(async (req, res, next) => {
  const { idToken } = req.body;

  if (!idToken) {
    return next(new AppError('Please provide Google ID token', 400));
  }

  // Verify Google token
  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });
  } catch (error) {
    return next(new AppError('Invalid Google token', 401));
  }

  const payload = ticket.getPayload();
  const { sub: googleId, email, name, picture, email_verified } = payload;

  if (!email) {
    return next(new AppError('No email found in Google account', 400));
  }

  // Check if user exists with this email
  let user = await User.findOne({ email });

  if (user) {
    // User exists - check if Google provider is already linked
    const googleProvider = user.authProviders.find(p => p.provider === 'google');
    
    if (!googleProvider) {
      // Link Google account to existing user
      user.authProviders.push({
        provider: 'google',
        providerId: googleId,
        email
      });
    }

    // Update Google email verification status
    if (email_verified) {
      user.isEmailVerified = true;
    }

    await user.save({ validateBeforeSave: false });

  } else {
    // Create new user
    const username = email.split('@')[0] + Math.floor(Math.random() * 1000);

    user = await User.create({
      email,
      username,
      isEmailVerified: email_verified || false,
      profile: {
        displayName: name,
        avatar: picture
      },
      authProviders: [{
        provider: 'google',
        providerId: googleId,
        email
      }],
      accountStatus: 'active'
    });
  }

  // Update last login
  user.lastLogin = Date.now();
  user.lastLoginIP = req.ip;
  await user.save({ validateBeforeSave: false });

  // Send tokens
  return createAndSendTokens(user, 200, res, 'Google authentication successful');
});

// ════════════════════════════════════════════════
// REFRESH ACCESS TOKEN
// ════════════════════════════════════════════════
exports.refreshToken = catchAsync(async (req, res, next) => {
  // User and refresh token are attached by middleware
  const user = req.user;
  const oldRefreshToken = req.refreshToken;

  // Remove old refresh token
  user.refreshTokens = user.refreshTokens.filter(rt => rt.token !== oldRefreshToken);

  // Generate new tokens
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();

  // Save new refresh token
  user.refreshTokens.push({
    token: refreshToken,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    deviceInfo: req.headers['user-agent']
  });

  await user.save({ validateBeforeSave: false });

  // Cookie options
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
  };

  // Set new cookies
  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000
  });

  res.cookie('refreshToken', refreshToken, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.status(200).json({
    status: 'success',
    message: 'Token refreshed successfully',
    data: {
      accessToken,
      refreshToken
    }
  });
});

// ════════════════════════════════════════════════
// LOGOUT
// ════════════════════════════════════════════════
exports.logout = catchAsync(async (req, res, next) => {
  const user = req.user;
  const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

  if (refreshToken) {
    // Remove specific refresh token
    user.refreshTokens = user.refreshTokens.filter(rt => rt.token !== refreshToken);
    await user.save({ validateBeforeSave: false });
  }

  // Clear cookies
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');

  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully'
  });
});

// ════════════════════════════════════════════════
// LOGOUT ALL DEVICES
// ════════════════════════════════════════════════
exports.logoutAll = catchAsync(async (req, res, next) => {
  const user = req.user;

  // Invalidate all tokens
  await user.invalidateAllTokens();

  // Clear cookies
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');

  res.status(200).json({
    status: 'success',
    message: 'Logged out from all devices successfully'
  });
});

// ════════════════════════════════════════════════
// VERIFY EMAIL
// ════════════════════════════════════════════════
exports.verifyEmail = catchAsync(async (req, res, next) => {
  const { token } = req.body;

  if (!token) {
    return next(new AppError('Verification token is required', 400));
  }

  // Verify token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_EMAIL_SECRET);
  } catch (error) {
    return next(new AppError('Invalid or expired verification token', 400));
  }

  // Find user
  const user = await User.findById(decoded.userId);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  if (user.isEmailVerified) {
    return next(new AppError('Email already verified', 400));
  }

  // Verify email
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: 'Email verified successfully'
  });
});

// ════════════════════════════════════════════════
// RESEND VERIFICATION EMAIL
// ════════════════════════════════════════════════
exports.resendVerification = catchAsync(async (req, res, next) => {
  const user = req.user;

  if (user.isEmailVerified) {
    return next(new AppError('Email already verified', 400));
  }

  // Generate new token
  const token = user.generateEmailVerificationToken();
  await user.save({ validateBeforeSave: false });

  // TODO: Send email
  // await sendVerificationEmail(user.email, token);

  res.status(200).json({
    status: 'success',
    message: 'Verification email sent',
    data: { token } // Remove in production
  });
});

// ════════════════════════════════════════════════
// FORGOT PASSWORD
// ════════════════════════════════════════════════
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new AppError('Please provide email address', 400));
  }

  const user = await User.findOne({ email });

  // Don't reveal if user exists
  if (!user) {
    return res.status(200).json({
      status: 'success',
      message: 'If the email exists, a reset link has been sent'
    });
  }

  // Generate reset token
  const resetToken = user.generatePasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // TODO: Send reset email
  // await sendPasswordResetEmail(user.email, resetToken);

  res.status(200).json({
    status: 'success',
    message: 'Password reset instructions sent to email',
    data: { resetToken } // Remove in production
  });
});

// ════════════════════════════════════════════════
// RESET PASSWORD
// ════════════════════════════════════════════════
exports.resetPassword = catchAsync(async (req, res, next) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return next(new AppError('Please provide token and new password', 400));
  }

  // Verify token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_RESET_SECRET);
  } catch (error) {
    return next(new AppError('Invalid or expired reset token', 400));
  }

  // Find user
  const user = await User.findById(decoded.userId);

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Update password
  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.passwordChangedAt = Date.now();

  // Invalidate all existing tokens
  await user.invalidateAllTokens();

  res.status(200).json({
    status: 'success',
    message: 'Password reset successful. Please log in with your new password.'
  });
});

// ════════════════════════════════════════════════
// CHANGE PASSWORD (AUTHENTICATED)
// ════════════════════════════════════════════════
exports.changePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(new AppError('Please provide current and new password', 400));
  }

  // Get user with password
  const user = await User.findById(req.user._id).select('+password');

  // Verify current password
  const isCorrect = await user.comparePassword(currentPassword);
  if (!isCorrect) {
    return next(new AppError('Current password is incorrect', 401));
  }

  // Update password
  user.password = newPassword;
  await user.save();

  // Invalidate all tokens except current session (optional)
  // await user.invalidateAllTokens();

  res.status(200).json({
    status: 'success',
    message: 'Password changed successfully'
  });
});

// ════════════════════════════════════════════════
// GET CURRENT USER
// ════════════════════════════════════════════════
exports.getMe = catchAsync(async (req, res, next) => {
  const safeUser = await toSafeUserWithLiveThoughtCount(req.user);

  res.status(200).json({
    status: 'success',
    data: {
      user: safeUser
    }
  });
});

// ════════════════════════════════════════════════
// STEP 1: REQUEST PASSWORD RESET (SEND OTP)
// ════════════════════════════════════════════════
exports.requestPasswordReset = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new AppError('Please provide email address', 400));
  }

  // Check if user exists
  const user = await User.findOne({ email, accountStatus: 'active' });

  // Don't reveal if user exists or not (security)
  if (!user) {
    return res.status(200).json({
      status: 'success',
      message: 'If an account exists with this email, you will receive a verification code shortly.'
    });
  }

  // Generate and save OTP
  const { otp } = await OTP.createOTP(
    email,
    'password_reset',
    req.ip,
    req.headers['user-agent']
  );

  // Send OTP email
  const emailResult = await sendOTPEmail(email, otp, 'password_reset');

  if (!emailResult.success) {
    return next(new AppError('Failed to send verification email. Please try again.', 500));
  }

  res.status(200).json({
    status: 'success',
    message: 'Verification code sent to your email. Please check your inbox.',
    data: {
      email,
      expiresIn: '10 minutes'
    }
  });
});

// ════════════════════════════════════════════════
// STEP 2: VERIFY OTP
// ════════════════════════════════════════════════
exports.verifyPasswordResetOTP = catchAsync(async (req, res, next) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return next(new AppError('Please provide email and OTP code', 400));
  }

  // Verify OTP
  const result = await OTP.verifyOTP(email, otp, 'password_reset');

  if (!result.success) {
    return next(new AppError(result.error, 400));
  }

  // Generate a temporary token for password reset (valid for 30 minutes)
  const resetToken = jwt.sign(
    { email, otpId: result.otpId, purpose: 'password_reset' },
    process.env.JWT_RESET_SECRET,
    { expiresIn: '30m' }
  );

  res.status(200).json({
    status: 'success',
    message: 'OTP verified successfully. You can now reset your password.',
    data: {
      resetToken,
      expiresIn: '30 minutes'
    }
  });
});

// ════════════════════════════════════════════════
// STEP 3: RESET PASSWORD (AFTER OTP VERIFICATION)
// ════════════════════════════════════════════════
exports.resetPasswordWithOTP = catchAsync(async (req, res, next) => {
  const { resetToken, newPassword } = req.body;

  if (!resetToken || !newPassword) {
    return next(new AppError('Please provide reset token and new password', 400));
  }

  // Validate password strength
  if (newPassword.length < 8) {
    return next(new AppError('Password must be at least 8 characters long', 400));
  }

  // Verify reset token
  let decoded;
  try {
    decoded = jwt.verify(resetToken, process.env.JWT_RESET_SECRET);
  } catch (error) {
    return next(new AppError('Invalid or expired reset token. Please request a new OTP.', 400));
  }

  // Check if OTP was verified
  const otpVerified = await OTP.isOTPVerified(decoded.email, 'password_reset');
  if (!otpVerified) {
    return next(new AppError('OTP verification expired. Please request a new code.', 400));
  }

  // Find user
  const user = await User.findOne({ email: decoded.email });
  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Update password
  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.passwordChangedAt = Date.now();
  await user.save();

  // Invalidate all existing tokens (force re-login on all devices)
  await user.invalidateAllTokens();

  // Delete used OTP records
  await OTP.deleteMany({ email: decoded.email, purpose: 'password_reset' });

  // Send success email
  await sendPasswordResetSuccessEmail(user.email);

  res.status(200).json({
    status: 'success',
    message: 'Password reset successful! You can now log in with your new password.'
  });
});

// ════════════════════════════════════════════════
// STEP 4: SUBMIT FEEDBACK (OPTIONAL BUT RECOMMENDED)
// ════════════════════════════════════════════════
exports.submitPasswordResetFeedback = catchAsync(async (req, res, next) => {
  const { email, reason, additionalDetails } = req.body;

  if (!email || !reason) {
    return next(new AppError('Please provide email and reason', 400));
  }

  const validReasons = [
    'forgot_password',
    'security_concern', 
    'account_compromised',
    'regular_update',
    'other'
  ];

  if (!validReasons.includes(reason)) {
    return next(new AppError('Invalid reason provided', 400));
  }

  // Find user
  const user = await User.findOne({ email });
  if (!user) {
    // Don't reveal if user exists
    return res.status(200).json({
      status: 'success',
      message: 'Thank you for your feedback!'
    });
  }

  // Save feedback
  await PasswordResetFeedback.create({
    user: user._id,
    reason,
    additionalDetails: additionalDetails || '',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  });

  res.status(200).json({
    status: 'success',
    message: 'Thank you for your feedback! This helps us improve security.'
  });
});

// ════════════════════════════════════════════════
// RESEND OTP (IF EXPIRED OR NOT RECEIVED)
// ════════════════════════════════════════════════
exports.resendPasswordResetOTP = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new AppError('Please provide email address', 400));
  }

  // Check rate limiting (prevent spam)
  const recentOTP = await OTP.findOne({
    email,
    purpose: 'password_reset',
    createdAt: { $gt: new Date(Date.now() - 60 * 1000) } // Last minute
  });

  if (recentOTP) {
    return next(new AppError('Please wait 1 minute before requesting a new code', 429));
  }

  // Check if user exists
  const user = await User.findOne({ email, accountStatus: 'active' });

  if (!user) {
    return res.status(200).json({
      status: 'success',
      message: 'If an account exists with this email, you will receive a new verification code.'
    });
  }

  // Generate new OTP
  const { otp } = await OTP.createOTP(
    email,
    'password_reset',
    req.ip,
    req.headers['user-agent']
  );

  // Send OTP email
  await sendOTPEmail(email, otp, 'password_reset');

  res.status(200).json({
    status: 'success',
    message: 'A new verification code has been sent to your email.'
  });
});
