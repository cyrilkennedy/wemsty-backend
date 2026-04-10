# Wemsty Backend - Production Deployment Checklist

## 🔒 Security

- [ ] **CORS Configuration**: Restrict to your actual frontend domains
  ```javascript
  // In server.js
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://yourdomain.com']
  ```

- [ ] **Environment Variables**: Ensure all secrets are properly set
  - `JWT_SECRET`
  - `JWT_ACCESS_SECRET`
  - `JWT_REFRESH_SECRET`
  - `MONGODB_URI`
  - `ALGOLIA_APP_ID` & `ALGOLIA_ADMIN_KEY`
  - `PAYSTACK_SECRET_KEY`
  - Database credentials

- [ ] **Rate Limiting**: Consider stricter limits for production
  - Auth: 5 requests/15min ✓
  - Global: Consider reducing from 100 to 50 requests/15min

- [ ] **HTTPS**: Ensure your server is behind HTTPS in production
  - Use a reverse proxy (nginx, Apache) with SSL/TLS
  - Set `trust proxy` correctly

- [ ] **Helmet.js**: Already configured ✓
  - CSP is disabled for development; consider enabling for production

---

## 🐛 Code Issues to Fix

### 1. Remove Debug Middleware in Production
```javascript
// In server.js - wrap in development check
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`🔍 Request received: ${req.method} ${req.path}`);
    console.log('Headers:', req.headers);
    next();
  });
}
```

### 2. Enable Error Handler
```javascript
// In server.js - uncomment this line
app.use(errorMiddleware);
```

### 3. Fix Duplicate Index Warning
In `models/UserProfile.model.js`, remove duplicate index definition.

---

## 📊 Monitoring & Logging

- [ ] **Logging**: Set up proper logging (Winston, Pino, etc.)
- [ ] **Error Tracking**: Integrate with Sentry or similar
- [ ] **Performance Monitoring**: Consider APM tools (New Relic, DataDog)
- [ ] **Health Checks**: Already have `/api/health` endpoint ✓

---

## 🗄️ Database

- [ ] **MongoDB Atlas**: 
  - Ensure cluster is properly sized for production
  - Set up backup schedules
  - Configure IP whitelist (or allow all if using VPC peering)

- [ ] **Indexes**: Verify all necessary indexes are created
- [ ] **Connection Pool**: Current settings (maxPoolSize: 10) should be reviewed based on expected load

---

## 🚀 Performance

- [ ] **Caching**: 
  - Redis is configured ✓
  - Consider caching frequently accessed data

- [ ] **Compression**: Enable response compression
  ```javascript
  const compression = require('compression');
  app.use(compression());
  ```

- [ ] **Static Assets**: Serve static assets via CDN
- [ ] **Database Queries**: Ensure proper indexing and query optimization

---

## 🔄 Deployment

- [ ] **Process Manager**: Use PM2 or similar
  ```bash
  npm install -g pm2
  pm2 start server.js --name wemsty-backend
  pm2 save
  pm2 startup
  ```

- [ ] **Environment**: Set `NODE_ENV=production`
- [ ] **Build Process**: If using TypeScript, ensure proper build
- [ ] **Rollback Plan**: Have a rollback strategy

---

## 🛡️ Security Headers (Additional)

Consider adding these headers via Helmet or manually:

```javascript
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
```

---

## 📝 Environment Variables for Production

Add these to your `.env` or environment configuration:

```env
# Server
NODE_ENV=production
PORT=3001

# CORS
ALLOWED_ORIGINS=https://wemsty.com,https://www.wemsty.com

# Database
MONGODB_URI=mongodb+srv://...

# Security
JWT_SECRET=...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...

# External Services
ALGOLIA_APP_ID=...
ALGOLIA_ADMIN_KEY=...
PAYSTACK_SECRET_KEY=...

# Email (if using)
EMAIL_HOST=...
EMAIL_PORT=...
EMAIL_USER=...
EMAIL_PASS=...

# Redis (if using)
REDIS_URL=...

# Optional: Feature Flags
ENABLE_RATE_LIMITING=true
ENABLE_LOGGING=true
LOG_LEVEL=info
```

---

## ✅ Pre-Launch Testing

- [ ] Test all authentication flows
- [ ] Test file uploads
- [ ] Test payment integration (use test mode first)
- [ ] Load test with expected traffic
- [ ] Test error scenarios
- [ ] Verify monitoring and alerting
- [ ] Test database backup and restore

---

## 🆘 Emergency Contacts

- **Server Issues**: Check logs, restart PM2
- **Database Issues**: Check MongoDB Atlas dashboard
- **Payment Issues**: Check Paystack dashboard
- **Security Issues**: Review logs, rotate secrets if compromised

---

**Last Updated**: 2024
**Version**: 4.0