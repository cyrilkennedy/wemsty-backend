const AuditLog = require('../models/AuditLog.model');

async function writeAuditLog({
  actor = null,
  actionType,
  objectType,
  objectId = null,
  payload = {}
}) {
  if (!actionType || !objectType) {
    return null;
  }

  return AuditLog.create({
    actor,
    actionType,
    objectType,
    objectId,
    payload
  });
}

module.exports = {
  writeAuditLog
};
