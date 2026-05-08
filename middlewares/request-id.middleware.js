const { randomUUID } = require('crypto');

function requestId(req, res, next) {
  const existingId = req.headers['x-request-id'];
  req.id = Array.isArray(existingId) ? existingId[0] : existingId || randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
}

module.exports = requestId;
