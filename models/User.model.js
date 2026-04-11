// models/User.model.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sanitizeExternalUrl } = require('../utils/url-sanitizer');

const UserSchema = new mongoose.Schema({
  // ────────────────────────────────────────────────
  // CORE IDENTITY
  // ────────────────────────────────────────────────
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
  },

  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },

  // ────────────────────────────────────────────────
  // AUTHENTICATION
  // ────────────────────────────────────────────────
  password: {
    type: String,
    required: function() {
      // Password required only if using email/password auth
      return !this.authProviders || this.authProviders.length === 0;
    },
    minlength: [8, 'Password must be at least 8 characters'],
    select: false // Never return password in queries by default
  },

  authProviders: [{
    provider: {
      type: String,
      enum: ['email', 'google'],
      required: true
    },
    providerId: {
      type: String,
      required: true
    },
    email: String,
    linkedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // ────────────────────────────────────────────────
  // ACCOUNT STATUS
  // ────────────────────────────────────────────────
  accountStatus: {
    type: String,
    enum: ['pending', 'active', 'suspended', 'banned', 'deleted'],
    default: 'active'
  },

  isEmailVerified: {
    type: Boolean,
    default: false
  },

  emailVerificationToken: String,
  emailVerificationExpires: Date,

  // ────────────────────────────────────────────────
  // AUTHORIZATION & ROLES
  // ────────────────────────────────────────────────
  role: {
    type: String,
    enum: ['user', 'creator', 'moderator', 'admin'],
    default: 'user'
  },

  permissions: [{
    type: String
  }],

  // ────────────────────────────────────────────────
  // PROFILE
  // ────────────────────────────────────────────────
  profile: {
    firstName: String,
    lastName: String,
    displayName: String,
    avatar: String,
    bio: String,
    location: String,
    website: String,
    phoneNumber: String
  },

  // ────────────────────────────────────────────────
  // SECURITY
  // ────────────────────────────────────────────────
  passwordResetToken: String,
  passwordResetExpires: Date,
  passwordChangedAt: Date,

  tokenVersion: {
    type: Number,
    default: 0
  },

  // Security tracking
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,

  lastLogin: Date,
  lastLoginIP: String,

  // ────────────────────────────────────────────────
  // SOCIAL COUNTERS (DENORMALIZED)
  // ────────────────────────────────────────────────
  followers_count: {
    type: Number,
    default: 0,
    min: 0
  },

  following_count: {
    type: Number,
    default: 0,
    min: 0
  },

  posts_count: {
    type: Number,
    default: 0,
    min: 0
  },

  // ────────────────────────────────────────────────
  // METADATA
  // ────────────────────────────────────────────────
  refreshTokens: [{
    token: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: Date,
    deviceInfo: String
  }]

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ════════════════════════════════════════════════
// INDEXES
// ════════════════════════════════════════════════
UserSchema.index({ 'authProviders.providerId': 1 });
UserSchema.index({ accountStatus: 1 });

// ════════════════════════════════════════════════
// VIRTUALS
// ════════════════════════════════════════════════
UserSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

UserSchema.virtual('fullName').get(function() {
  if (this.profile?.firstName && this.profile?.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName}`;
  }
  return this.profile?.displayName || this.username;
});

// ════════════════════════════════════════════════
// PRE-SAVE MIDDLEWARE
// ════════════════════════════════════════════════

// Hash password before saving
UserSchema.pre('save', async function() {
  // Only hash if password is modified
  if (!this.isModified('password')) return;

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  
  // Update passwordChangedAt if this is a password change (not initial creation)
  if (!this.isNew) {
    this.passwordChangedAt = Date.now() - 1000; // 1 second ago to ensure tokens are valid
  }
});

// ════════════════════════════════════════════════
// INSTANCE METHODS
// ════════════════════════════════════════════════

// Compare password
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate access token
UserSchema.methods.generateAccessToken = function() {
  return jwt.sign(
    {
      userId: this._id,
      email: this.email,
      role: this.role,
      tokenVersion: this.tokenVersion,
      type: 'access'
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' }
  );
};

// Generate refresh token
UserSchema.methods.generateRefreshToken = function() {
  return jwt.sign(
    {
      userId: this._id,
      tokenVersion: this.tokenVersion,
      type: 'refresh'
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' }
  );
};

// Generate email verification token
UserSchema.methods.generateEmailVerificationToken = function() {
  const token = jwt.sign(
    { userId: this._id, email: this.email },
    process.env.JWT_EMAIL_SECRET,
    { expiresIn: '24h' }
  );
  
  this.emailVerificationToken = token;
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  
  return token;
};

// Generate password reset token
UserSchema.methods.generatePasswordResetToken = function() {
  const token = jwt.sign(
    { userId: this._id, email: this.email },
    process.env.JWT_RESET_SECRET,
    { expiresIn: '1h' }
  );
  
  this.passwordResetToken = token;
  this.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
  
  return token;
};

// Check if password was changed after token was issued
UserSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Increment login attempts
UserSchema.methods.incLoginAttempts = async function() {
  // Reset if lock has expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { loginAttempts: 1 },
      $unset: { lockUntil: 1 }
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000; // 2 hours

  // Lock account after max attempts
  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + lockTime };
  }

  return this.updateOne(updates);
};

// Reset login attempts
UserSchema.methods.resetLoginAttempts = async function() {
  return this.updateOne({
    $set: { loginAttempts: 0 },
    $unset: { lockUntil: 1 }
  });
};

// Invalidate all tokens
UserSchema.methods.invalidateAllTokens = async function() {
  this.tokenVersion += 1;
  this.refreshTokens = [];
  return this.save();
};

// Get safe user object (without sensitive data)
UserSchema.methods.toSafeObject = function() {
  const obj = this.toObject();
  if (obj?.profile?.avatar) {
    obj.profile.avatar = sanitizeExternalUrl(obj.profile.avatar);
  }
  delete obj.password;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  delete obj.emailVerificationToken;
  delete obj.emailVerificationExpires;
  delete obj.refreshTokens;
  delete obj.loginAttempts;
  delete obj.lockUntil;
  delete obj.tokenVersion;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('User', UserSchema);
