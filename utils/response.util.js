function sendSuccess(res, { statusCode = 200, message = 'Success', data = null, meta = null } = {}) {
  const payload = {
    success: true,
    message
  };

  if (data !== null && data !== undefined) {
    payload.data = data;
  }

  if (meta !== null && meta !== undefined) {
    payload.meta = meta;
  }

  return res.status(statusCode).json(payload);
}

function sendError(res, { statusCode = 500, message = 'Something went wrong', code = 'INTERNAL_SERVER_ERROR', errors = [] } = {}) {
  return res.status(statusCode).json({
    success: false,
    message,
    code,
    errors
  });
}

module.exports = {
  sendSuccess,
  sendError
};
