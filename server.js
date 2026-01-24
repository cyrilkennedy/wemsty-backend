// server.js - Main entry point for Wemsty Backend

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import configs & middlewares
const connectDB = require('./config/mongodb');
const errorMiddleware = require('./middlewares/error.middleware');

// Import routes
const authRoutes = require('./routes/auth.routes');
const postRoutes = require('./routes/post.routes');
const socialRoutes = require('./routes/social.routes');
// const userRoutes = require('./routes/user.routes'); // Create this file

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
connectDB();

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
// app.use('/api/users', userRoutes); // Uncomment after creating user.routes.js
app.use('/api/posts', postRoutes);

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

// Global error handler (must be last)
app.use(errorMiddleware);

// ────────────────────────────────────────────────
// START SERVER
// ────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`═══════════════════════════════════════════════`);
  console.log(`🚀 Wemsty Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`CORS: Enabled for all origins`);
  console.log(`MongoDB: Connected`);
  console.log(`═══════════════════════════════════════════════`);
});

// ────────────────────────────────────────────────
// GRACEFUL SHUTDOWN & ERROR HANDLING
// ────────────────────────────────────────────────

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ UNHANDLED REJECTION! Shutting down...');
  console.error(err.name, err.message);
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION! Shutting down...');
  console.error(err.name, err.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Process terminated');
    process.exit(0);
  });
});

module.exports = app;