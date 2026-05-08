let Sentry = null;

function initializeSentry(app) {
  if (!process.env.SENTRY_DSN) {
    return null;
  }

  Sentry = require('@sentry/node');
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0)
  });

  if (app && Sentry.setupExpressErrorHandler) {
    Sentry.setupExpressErrorHandler(app);
  }

  return Sentry;
}

function captureException(error, context = {}) {
  if (Sentry) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => scope.setExtra(key, value));
      Sentry.captureException(error);
    });
  }
}

module.exports = {
  initializeSentry,
  captureException
};
