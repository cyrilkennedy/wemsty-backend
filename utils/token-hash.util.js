const crypto = require('crypto');

function hashToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  return crypto.createHash('sha256').update(token).digest('hex');
}

function matchesTokenHash(token, tokenHash) {
  const candidateHash = hashToken(token);

  if (!candidateHash || !tokenHash || candidateHash.length !== tokenHash.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(tokenHash));
}

module.exports = {
  hashToken,
  matchesTokenHash
};
