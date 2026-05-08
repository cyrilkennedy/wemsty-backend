const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.refreshToken',
      'req.body.token',
      'req.body.otp',
      'req.body.newPassword',
      'req.body.currentPassword'
    ],
    remove: true
  }
});

module.exports = logger;
