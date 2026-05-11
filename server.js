require('dotenv').config();

const { initializeSentry } = require('./config/sentry');
initializeSentry(); // Initialize Sentry as early as possible for full instrumentation

const http = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/mongodb');
const redisManager = require('./config/redis');
const { kafkaManager, DEFAULT_TOPICS } = require('./config/kafka');
const logger = require('./config/logger');
const requestId = require('./middlewares/request-id.middleware');
const httpLogger = require('./middlewares/http-logger.middleware');
const responseNormalizer = require('./middlewares/response-normalizer.middleware');
const errorMiddleware = require('./middlewares/error.middleware');
const { initializeRealtime } = require('./services/realtime.service');

const authRoutes = require('./routes/auth.routes');
const postRoutes = require('./routes/post.routes');
const socialRoutes = require('./routes/social.routes');
const userRoutes = require('./routes/user.routes');
const circlesRoutes = require('./routes/circles.routes');
const messagesRoutes = require('./routes/messages.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const moderationRoutes = require('./routes/moderation.routes');
const searchRoutes = require('./routes/search.routes');
const feedRoutes = require('./routes/feed.routes');
const trendingRoutes = require('./routes/trending.routes');
const paymentRoutes = require('./routes/payment.routes');
const notificationPrefRoutes = require('./routes/notification-preferences.routes');
const healthRoutes = require('./routes/health.routes');
const mediaRoutes = require('./routes/media.routes');
const queueRoutes = require('./routes/queue.routes');
const mobileRoutes = require('./routes/mobile.routes');

const app = express();
const PORT = process.env.PORT || 3001;

let server;

function getAllowedOrigins() {
  const configured = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const defaults = [
    'https://wemsty.com',
    'https://www.wemsty.com',
    'https://localhost',
    'http://localhost',
    'capacitor://localhost'
  ];

  const origins = [...new Set([...defaults, ...configured])];

  if (process.env.NODE_ENV !== 'production') {
    return [
      ...origins,
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ];
  }

  return origins;
}

function configureApp() {
  app.set('trust proxy', 1);

  // Attach Sentry error handler to the app
  const { initializeSentry: attachSentry } = require('./config/sentry');
  attachSentry(app);

  app.use(requestId);
  app.use(responseNormalizer);
  app.use(httpLogger);
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));

  const allowedOrigins = getAllowedOrigins();
  app.use(cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (process.env.NODE_ENV !== 'production' && allowedOrigins.length === 0) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id', 'X-Healthcheck-Token'],
    exposedHeaders: ['Set-Cookie', 'X-Request-Id'],
    optionsSuccessStatus: 204
  }));

  app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
      if (req.originalUrl === '/api/payments/webhook') {
        req.rawBody = buf;
      }
    }
  }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  if (process.env.ENABLE_RATE_LIMITING !== 'false') {
    app.use(rateLimit({
      windowMs: 15 * 60 * 1000,
      max: Number(process.env.GLOBAL_RATE_LIMIT_MAX || 100),
      message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.',
        code: 'RATE_LIMITED',
        errors: []
      },
      standardHeaders: true,
      legacyHeaders: false,
      validate: { trustProxy: false }
    }));
  }

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/social', socialRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/posts', postRoutes);
  app.use('/api/circles', circlesRoutes);
  app.use('/api/messages', messagesRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/moderation', moderationRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/feed', feedRoutes);
  app.use('/api/trending', trendingRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/media', mediaRoutes);
  app.use('/api/queues', queueRoutes);
  app.use('/api/notifications/preferences', notificationPrefRoutes);
  app.use('/api/mobile', mobileRoutes);

  app.get('/', (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Welcome to Wemsty API',
      data: {
        version: process.env.API_VERSION || '4.0',
        documentation: '/api/docs'
      }
    });
  });

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: 'Route not found',
      code: 'ROUTE_NOT_FOUND',
      errors: [],
      path: req.originalUrl
    });
  });

  app.use(errorMiddleware);
}

configureApp();

async function connectOptionalInfrastructure() {
  if (process.env.ENABLE_REDIS_CACHE !== 'false') {
    try {
      await redisManager.connect();
      logger.info('Redis connected');
    } catch (redisError) {
      const message = 'Redis unavailable; queues, cache, realtime adapter, and Redis-backed rate limits are degraded';
      if (process.env.NODE_ENV === 'production' && process.env.REQUIRE_REDIS === 'true') {
        throw redisError;
      }
      logger.warn({ err: redisError }, message);
    }
  } else {
    logger.info('Redis cache is disabled via ENABLE_REDIS_CACHE');
  }

  try {
    await kafkaManager.connect();
    await kafkaManager.createTopics(DEFAULT_TOPICS);
    logger.info('Kafka connected');
  } catch (kafkaError) {
    logger.warn({ err: kafkaError }, 'Kafka unavailable; event streaming is degraded');
  }
}

async function startServer() {
  try {
    // 1. Mandatory connection: Database
    await connectDB();

    // 2. Create the server
    const httpServer = http.createServer(app);
    
    // 3. Start listening IMMEDIATELY (prevents Render port scan timeout)
    server = httpServer.listen(PORT, '0.0.0.0', () => {
      logger.info({
        port: PORT,
        host: '0.0.0.0',
        environment: process.env.NODE_ENV || 'development',
        realtimeNamespace: '/realtime',
        corsOrigins: getAllowedOrigins()
      }, '✅ Wemsty Backend is listening and ready');

      // 4. Connect optional infrastructure in the background after listening
      connectOptionalInfrastructure().catch(err => {
        logger.error({ err }, 'Background infrastructure initialization failed');
      });

      // 5. Initialize Realtime (socket.io, etc)
      initializeRealtime(httpServer).catch(err => {
        logger.error({ err }, 'Realtime initialization failed');
      });
    });

    return server;
  } catch (error) {
    logger.error({ err: error }, '❌ Critical: Failed to start server');
    process.exit(1);
  }
}

async function shutdown(signal) {
  logger.info({ signal }, 'Shutdown signal received');

  if (server) {
    server.close(async () => {
      await redisManager.close().catch(() => {});
      await kafkaManager.disconnect().catch(() => {});
      process.exit(0);
    });
    return;
  }

  await redisManager.close().catch(() => {});
  await kafkaManager.disconnect().catch(() => {});
  process.exit(0);
}

process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled promise rejection');
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception');
  shutdown('uncaughtException');
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (require.main === module) {
  startServer();
}

module.exports = app;
