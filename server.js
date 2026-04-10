// server.js - Main entry point for Wemsty Backend

require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import configs & middlewares
const connectDB = require('./config/mongodb');
const errorMiddleware = require('./middlewares/error.middleware');
const { initializeRealtime } = require('./services/realtime.service');

// Import routes
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

const app = express();

// ────────────────────────────────────────────────
// TRUST PROXY - Required for rate limiting behind proxies (Render, Heroku, etc.)
// ────────────────────────────────────────────────
app.set('trust proxy', 1); // Trust first proxy

// ────────────────────────────────────────────────
// SECURITY & MIDDLEWARE
// ────────────────────────────────────────────────

// Security headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// CORS - Allow all origins (for development/testing)
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser
app.use(cookieParser());

// Global rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false }, // Disable validation warnings
});
app.use(limiter);

// ────────────────────────────────────────────────
// DATABASE CONNECTION
// ────────────────────────────────────────────────
// Note: connectDB() is called in the main function below to ensure proper startup order

// ────────────────────────────────────────────────
// DEBUG MIDDLEWARE - Find where "next is not a function" happens
// ────────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`
🔍 Request received: ${req.method} ${req.path}`);
  console.log('Headers:', req.headers);
  next();
});

// ────────────────────────────────────────────────
// ROUTES
// ────────────────────────────────────────────────
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
app.use('/api/notifications/preferences', notificationPrefRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Wemsty Backend v4.0 is running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    database: 'MongoDB Connected'
  });
});

// Root route
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to Wemsty API',
    version: '4.0',
    documentation: '/api/docs'
  });
});

// ────────────────────────────────────────────────
// ERROR HANDLING
// ────────────────────────────────────────────────

// 404 handler - must be before error middleware
app.use((req, res, next) => {
  res.status(404).json({ 
    success: false,
    error: 'Route not found',
    path: req.originalUrl
  });
});

// TEMPORARY - Simple error handler to test
app.use((err, req, res, next) => {
  console.error('❌ Error caught:', err);
  console.error('Error stack:', err.stack);
  
  res.status(err.statusCode || 500).json({
    status: 'error',
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Global error handler (must be last) - COMMENTED OUT FOR TESTING
// app.use(errorMiddleware);

// ────────────────────────────────────────────────
// START SERVER
// ────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

// Store server reference for graceful shutdown
let server;

// Main function to ensure proper startup order
async function startServer() {
  try {
    // Connect to database first
    await connectDB();
    
    // Create HTTP server
    const httpServer = http.createServer(app);
    
    // Initialize realtime services
    initializeRealtime(httpServer);
    
    // Start server
    server = httpServer.listen(PORT, () => {
      console.log(`═══════════════════════════════════════════════`);
      console.log(`🚀 Wemsty Backend running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`CORS: Enabled for all origins`);
      console.log(`MongoDB: Connected`);
      console.log(`Realtime namespace: /realtime`);
      console.log(`═══════════════════════════════════════════════`);
    });
    
    return server;
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// ────────────────────────────────────────────────
// GRACEFUL SHUTDOWN & ERROR HANDLING
// ────────────────────────────────────────────────

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION! Shutting down...');
  console.error(err.name, err.message);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION! Shutting down...');
  console.error(err.name, err.message);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received. Shutting down gracefully...');
  if (server) {
    server.close(() => {
      console.log('✅ Process terminated');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Start the server
startServer();

module.exports = app;
