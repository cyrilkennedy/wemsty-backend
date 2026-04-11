# Wemsty Backend - Production Checklist

This checklist is written for junior developers. Follow from top to bottom.

## 1) Must-have environment variables

- [ ] `NODE_ENV=production`
- [ ] `PORT` (Render usually sets this automatically)
- [ ] `MONGODB_URI`
- [ ] `JWT_SECRET`
- [ ] `JWT_ACCESS_SECRET`
- [ ] `JWT_REFRESH_SECRET`
- [ ] `ALGOLIA_APP_ID`
- [ ] `ALGOLIA_ADMIN_KEY`
- [ ] `PAYSTACK_SECRET_KEY`
- [ ] `ALLOWED_ORIGINS` (comma-separated frontend domains)

Recommended performance vars:

- [ ] `MONGODB_MAX_POOL_SIZE` (default in code: `10`)
- [ ] `MONGODB_MIN_POOL_SIZE` (default in code: `2`)

Redis var:

- [ ] `REDIS_URL` (example: `redis://default:password@host:6379`)

## 2) Redis: what it is doing in this project

Redis is used for cache acceleration (especially feed caching), and helper utilities used by realtime features.

Current behavior in `server.js`:

- The app tries to connect to Redis during startup.
- If Redis is unavailable, the app still starts (fail-open behavior).
- You will see logs like:
  - `Redis: Connected` when successful
  - `Redis: Unavailable, continuing without cache acceleration` when not available

So yes, Redis is important for speed, but it is not a hard blocker for boot.

## 3) Redis production setup steps

- [ ] Create a Redis instance (Upstash, Redis Cloud, or Render Redis)
- [ ] Copy its connection string into `REDIS_URL`
- [ ] Redeploy backend
- [ ] Check deployment logs for `Redis: Connected`
- [ ] Call your hot feed endpoints and confirm faster repeated responses

If you do not set `REDIS_URL`, the backend will try `redis://localhost:6379`, which usually fails on cloud hosts.

## 4) MongoDB performance checks

- [ ] Confirm indexes exist for high-traffic queries
- [ ] Keep query projections small (do not select unnecessary fields)
- [ ] Use pagination (`page`, `limit`) on list endpoints
- [ ] Tune pool values based on real traffic:
  - Start with `MONGODB_MAX_POOL_SIZE=10`
  - Start with `MONGODB_MIN_POOL_SIZE=2`
  - Increase max pool gradually after monitoring

## 5) API and server hardening

- [ ] Restrict CORS to real frontend domains (avoid wildcard in production)
- [ ] Keep rate limits enabled
- [ ] Re-enable/confirm global production error middleware
- [ ] Remove verbose request-debug logging in production
- [ ] Keep HTTPS termination enabled at your platform/proxy

## 6) Observability

- [ ] Structured app logs (Winston/Pino)
- [ ] Error tracking (Sentry or similar)
- [ ] Alerts for 5xx spikes
- [ ] Monitor MongoDB latency and connection count
- [ ] Monitor Redis memory, evictions, and connection status

## 7) Pre-launch verification

- [ ] Auth flow (`/api/auth/login`, `/api/auth/me`) works with valid token
- [ ] Create/read posts work without 500 errors
- [ ] Like/unlike/repost/unrepost/bookmark/unbookmark endpoints return expected status
- [ ] Comment create/edit/delete works
- [ ] Sphere and home feeds return data and not endless loading state
- [ ] Socket client can connect and receive realtime events

## 8) Quick troubleshooting

`401 Unauthorized`:

- Usually token/cookie issue from frontend auth state.
- Verify `Authorization: Bearer <token>` or cookie config and CORS credentials.

`500` + `req.body is undefined`:

- Ensure `Content-Type: application/json` and request body is sent.

Redis unreachable:

- Check `REDIS_URL`
- Check provider IP/network rules
- Confirm TLS/port requirements from provider docs

## 9) Deployment notes

- [ ] Keep rollback plan ready
- [ ] Backup policy enabled in MongoDB Atlas
- [ ] Smoke test immediately after each deploy

---

Last Updated: 2026-04-11
Version: 4.1
