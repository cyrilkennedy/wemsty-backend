const jwt = require('jsonwebtoken');

const User = require('../models/User.model');

function createSocketAuthError(message, code = 'UNAUTHORIZED') {
  const error = new Error(message);
  error.data = { code, message };
  return error;
}

async function authenticateSocketToken(token) {
  if (!token) {
    throw createSocketAuthError('Authentication token is required');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw createSocketAuthError('Your session has expired. Please log in again.');
    }

    throw createSocketAuthError('Invalid token. Please log in again.');
  }

  if (decoded.type !== 'access') {
    throw createSocketAuthError('Invalid token type.');
  }

  const user = await User.findById(decoded.userId).select('+password');
  if (!user) {
    throw createSocketAuthError('The user belonging to this token no longer exists.');
  }

  if (user.accountStatus !== 'active') {
    throw createSocketAuthError(`Account is ${user.accountStatus}. Please contact support.`, 'FORBIDDEN');
  }

  if (user.isLocked) {
    throw createSocketAuthError('Account is temporarily locked due to too many failed login attempts.', 'FORBIDDEN');
  }

  if (decoded.tokenVersion !== user.tokenVersion) {
    throw createSocketAuthError('This session has been invalidated. Please log in again.');
  }

  if (user.changedPasswordAfter(decoded.iat)) {
    throw createSocketAuthError('Password was recently changed. Please log in again.');
  }

  return user;
}

module.exports = {
  authenticateSocketToken,
  createSocketAuthError
};
