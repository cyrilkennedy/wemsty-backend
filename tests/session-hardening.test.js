const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.JWT_EMAIL_SECRET = process.env.JWT_EMAIL_SECRET || 'test-email-secret';
process.env.JWT_RESET_SECRET = process.env.JWT_RESET_SECRET || 'test-reset-secret';

const User = require('../models/User.model');
const { verifyRefreshToken } = require('../middlewares/auth.middleware');
const { hashToken, matchesTokenHash } = require('../utils/token-hash.util');

function invokeMiddleware(middleware, req) {
  return new Promise((resolve) => {
    middleware(req, {}, (error) => resolve(error));
  });
}

async function runSessionHardeningTests() {
  const rawToken = 'refresh-token-that-should-never-be-stored';
  const tokenHash = hashToken(rawToken);

  assert.match(tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(tokenHash, rawToken);
  assert.equal(hashToken(rawToken), tokenHash);
  assert.equal(matchesTokenHash(rawToken, tokenHash), true);
  assert.equal(matchesTokenHash('wrong-refresh-token', tokenHash), false);
  assert.equal(matchesTokenHash(rawToken, null), false);

  const refreshTokenSchema = User.schema.path('refreshTokens').schema;
  assert.ok(refreshTokenSchema.path('tokenHash'));
  assert.equal(refreshTokenSchema.path('token'), undefined);
  assert.ok(refreshTokenSchema.path('createdAt'));
  assert.ok(refreshTokenSchema.path('expiresAt'));
  assert.ok(refreshTokenSchema.path('deviceInfo'));
  assert.ok(refreshTokenSchema.path('ipAddress'));
  assert.ok(refreshTokenSchema.path('lastUsedAt'));
  assert.ok(refreshTokenSchema.path('revokedAt'));

  const user = new User({
    email: 'session-hardening@example.com',
    username: 'sessionhardening',
    password: 'password123',
    authProviders: [{
      provider: 'email',
      providerId: 'session-hardening@example.com',
      email: 'session-hardening@example.com'
    }],
    refreshTokens: [{
      tokenHash,
      deviceInfo: 'Node test runner',
      ipAddress: '127.0.0.1',
      lastUsedAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000)
    }]
  });

  const storedSession = user.refreshTokens[0].toObject();
  assert.equal(storedSession.token, undefined);
  assert.equal(storedSession.tokenHash, tokenHash);

  const safeUser = user.toSafeObject();
  assert.equal(safeUser.refreshTokens, undefined);
  assert.equal(safeUser.password, undefined);
  assert.equal(safeUser.tokenVersion, undefined);

  const refreshToken = jwt.sign(
    { userId: user._id, tokenVersion: 0, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  const fakeSession = {
    _id: { toString: () => 'session-id-1' },
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  };
  const fakeUser = {
    accountStatus: 'active',
    tokenVersion: 0,
    refreshTokens: [fakeSession],
    save: async () => {}
  };

  const originalFindById = User.findById;
  User.findById = async () => fakeUser;

  try {
    const req = {
      body: { refreshToken },
      cookies: {},
      headers: {}
    };
    const successError = await invokeMiddleware(verifyRefreshToken, req);
    assert.equal(successError, undefined);
    assert.equal(req.refreshToken, refreshToken);
    assert.equal(req.refreshTokenHash, fakeSession.tokenHash);
    assert.equal(req.refreshSessionId, 'session-id-1');
    assert.ok(fakeSession.lastUsedAt instanceof Date);

    fakeSession.revokedAt = new Date();
    const revokedReq = {
      body: { refreshToken },
      cookies: {},
      headers: {}
    };
    const revokedError = await invokeMiddleware(verifyRefreshToken, revokedReq);
    assert.equal(revokedError.statusCode, 401);
    assert.equal(revokedError.message, 'Invalid refresh token.');
  } finally {
    User.findById = originalFindById;
  }
}

module.exports = runSessionHardeningTests;
