const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_RESET_SECRET = process.env.JWT_RESET_SECRET || 'test-reset-secret';

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function invoke(handler, req) {
  const res = createResponse();
  return new Promise((resolve) => {
    handler(req, res, (error) => resolve({ error, res }));
  });
}

async function runPasswordResetTests() {
  const emailServicePath = require.resolve('../utils/emailService');
  const originalEmailModule = require.cache[emailServicePath];

  require.cache[emailServicePath] = {
    id: emailServicePath,
    filename: emailServicePath,
    loaded: true,
    exports: {
      sendOTPEmail: async () => ({ success: true }),
      sendPasswordResetSuccessEmail: async () => ({ success: true })
    }
  };

  const controllerPath = require.resolve('../controllers/auth.controller');
  delete require.cache[controllerPath];

  const User = require('../models/User.model');
  const OTP = require('../models/OTP.model');
  const originalFindOne = User.findOne;
  const originalVerifyOTP = OTP.verifyOTP;
  const originalIsOTPVerified = OTP.isOTPVerified;
  const originalDeleteMany = OTP.deleteMany;

  try {
    const authController = require('../controllers/auth.controller');
    const deletedQueries = [];
    const user = {
      email: 'reset@example.com',
      password: 'oldPassword123',
      passwordResetToken: 'old-token',
      passwordResetExpires: new Date(),
      passwordChangedAt: null,
      saveCalled: false,
      invalidated: false,
      save: async function save() {
        this.saveCalled = true;
      },
      invalidateAllTokens: async function invalidateAllTokens() {
        this.invalidated = true;
      }
    };

    User.findOne = async (query) => {
      assert.equal(query.email, 'reset@example.com');
      return user;
    };
    OTP.deleteMany = async (query) => {
      deletedQueries.push(query);
      return { deletedCount: 1 };
    };

    OTP.verifyOTP = async (email, otp, purpose) => {
      assert.equal(email, 'reset@example.com');
      assert.equal(otp, '123456');
      assert.equal(purpose, 'password_reset');
      return { success: true, otpId: 'otp-id-1' };
    };

    const directResult = await invoke(authController.resetPasswordWithOTP, {
      body: {
        email: 'reset@example.com',
        otp: '123456',
        newPassword: 'newPassword123'
      }
    });

    assert.equal(directResult.error, undefined);
    assert.equal(directResult.res.statusCode, 200);
    assert.equal(directResult.res.body.status, 'success');
    assert.equal(user.password, 'newPassword123');
    assert.equal(user.passwordResetToken, undefined);
    assert.equal(user.passwordResetExpires, undefined);
    assert.equal(user.saveCalled, true);
    assert.equal(user.invalidated, true);
    assert.deepEqual(deletedQueries.at(-1), {
      email: 'reset@example.com',
      purpose: 'password_reset'
    });

    user.password = 'oldPassword123';
    user.saveCalled = false;
    user.invalidated = false;

    OTP.isOTPVerified = async (email, purpose) => {
      assert.equal(email, 'reset@example.com');
      assert.equal(purpose, 'password_reset');
      return true;
    };

    const resetToken = jwt.sign(
      { email: 'reset@example.com', otpId: 'otp-id-1', purpose: 'password_reset' },
      process.env.JWT_RESET_SECRET,
      { expiresIn: '30m' }
    );

    const tokenResult = await invoke(authController.resetPasswordWithOTP, {
      body: {
        resetToken,
        newPassword: 'anotherPassword123'
      }
    });

    assert.equal(tokenResult.error, undefined);
    assert.equal(tokenResult.res.statusCode, 200);
    assert.equal(user.password, 'anotherPassword123');
    assert.equal(user.saveCalled, true);
    assert.equal(user.invalidated, true);

    const missingResult = await invoke(authController.resetPasswordWithOTP, {
      body: {
        newPassword: 'newPassword123'
      }
    });

    assert.equal(missingResult.res.statusCode, null);
    assert.equal(missingResult.error.statusCode, 400);
    assert.match(missingResult.error.message, /reset token|email, OTP/);

    OTP.verifyOTP = async () => ({
      success: false,
      error: 'Invalid OTP. 4 attempts remaining.'
    });

    const invalidOtpResult = await invoke(authController.resetPasswordWithOTP, {
      body: {
        email: 'reset@example.com',
        otp: '000000',
        newPassword: 'newPassword123'
      }
    });

    assert.equal(invalidOtpResult.error.statusCode, 400);
    assert.equal(invalidOtpResult.error.message, 'Invalid OTP. 4 attempts remaining.');
  } finally {
    User.findOne = originalFindOne;
    OTP.verifyOTP = originalVerifyOTP;
    OTP.isOTPVerified = originalIsOTPVerified;
    OTP.deleteMany = originalDeleteMany;
    delete require.cache[controllerPath];

    if (originalEmailModule) {
      require.cache[emailServicePath] = originalEmailModule;
    } else {
      delete require.cache[emailServicePath];
    }
  }
}

module.exports = runPasswordResetTests;
