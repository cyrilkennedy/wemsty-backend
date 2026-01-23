// models/OTP.model.js

const mongoose = require('mongoose');
const crypto = require('crypto');

const OTPSchema = new mongoose.Schema({
  // ════════════════════════════════════════════════
  // OTP DETAILS
  // ════════════════════════════════════════════════
  email: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },

  otp: {
    type: String,
    required: true
  },

  purpose: {
    type: String,
    enum: ['password_reset', 'email_verification', 'login_verification'],
    required: true
  },

  // ════════════════════════════════════════════════
  // VERIFICATION STATUS
  // ════════════════════════════════════════════════
  isVerified: {
    type: Boolean,
    default: false
  },

  verifiedAt: Date,

  // ════════════════════════════════════════════════
  // SECURITY
  // ════════════════════════════════════════════════
  attempts: {
    type: Number,
    default: 0,
    max: 5 // Max 5 attempts
  },

  expiresAt: {
    type: Date,
    required: true,
    index: true
  },

  // ════════════════════════════════════════════════
  // METADATA
  // ════════════════════════════════════════════════
  ipAddress: String,
  userAgent: String

}, {
  timestamps: true
});

// ════════════════════════════════════════════════
// INDEXES
// ════════════════════════════════════════════════
OTPSchema.index({ email: 1, purpose: 1 });
OTPSchema.index({ createdAt: 1 }, { expireAfterSeconds: 600 }); // Auto-delete after 10 minutes

// ════════════════════════════════════════════════
// STATIC METHODS
// ════════════════════════════════════════════════

// Generate OTP
OTPSchema.statics.generateOTP = function() {
  // Generate 6-digit OTP
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Create OTP record
OTPSchema.statics.createOTP = async function(email, purpose, ipAddress, userAgent) {
  // Delete any existing unverified OTPs for this email and purpose
  await this.deleteMany({ 
    email, 
    purpose, 
    isVerified: false 
  });

  const otp = this.generateOTP();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  const otpRecord = await this.create({
    email,
    otp,
    purpose,
    expiresAt,
    ipAddress,
    userAgent
  });

  return { otp, otpId: otpRecord._id };
};

// Verify OTP
OTPSchema.statics.verifyOTP = async function(email, otp, purpose) {
  const otpRecord = await this.findOne({
    email,
    purpose,
    isVerified: false,
    expiresAt: { $gt: new Date() }
  });

  if (!otpRecord) {
    return { 
      success: false, 
      error: 'OTP expired or not found. Please request a new one.' 
    };
  }

  // Check max attempts
  if (otpRecord.attempts >= 5) {
    return { 
      success: false, 
      error: 'Too many failed attempts. Please request a new OTP.' 
    };
  }

  // Increment attempts
  otpRecord.attempts += 1;
  await otpRecord.save();

  // Verify OTP
  if (otpRecord.otp !== otp) {
    const remainingAttempts = 5 - otpRecord.attempts;
    return { 
      success: false, 
      error: `Invalid OTP. ${remainingAttempts} attempts remaining.` 
    };
  }

  // Mark as verified
  otpRecord.isVerified = true;
  otpRecord.verifiedAt = Date.now();
  await otpRecord.save();

  return { 
    success: true, 
    message: 'OTP verified successfully',
    otpId: otpRecord._id 
  };
};

// Check if OTP is verified (for password reset)
OTPSchema.statics.isOTPVerified = async function(email, purpose) {
  const otpRecord = await this.findOne({
    email,
    purpose,
    isVerified: true,
    verifiedAt: { $gt: new Date(Date.now() - 30 * 60 * 1000) } // Verified within last 30 mins
  });

  return !!otpRecord;
};

module.exports = mongoose.model('OTP', OTPSchema);