# Wemsty Render Deployment Verification

Use this checklist for the MVP all-in-one Docker deployment. Keep the service replica count at `1` while the API, worker, and scheduler run together under PM2.

## Required Services

- Render Web Service from `render.yaml`
- Render Key Value Redis from `render.yaml`
- MongoDB Atlas database
- Brevo SMTP account with verified sender/domain
- Cloudinary, Algolia, Paystack, and Sentry credentials where enabled

## Required Render Environment Variables

Set every `sync: false` variable from `render.yaml` before the first deploy.

Minimum required values:

- `MONGODB_URI`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_EMAIL_SECRET`
- `JWT_RESET_SECRET`
- `ALLOWED_ORIGINS`
- `QUEUE_DASHBOARD_TOKEN`
- `SMTP_HOST=smtp-relay.brevo.com`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_WEBHOOK_SECRET`
- `ALGOLIA_APP_ID`
- `ALGOLIA_ADMIN_KEY`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

## First Deploy Checks

1. Confirm PM2 starts all processes:
   - `wemsty-api`
   - `wemsty-worker`
   - `wemsty-scheduler`
2. Confirm the service binds to Render's injected `PORT`.
3. Confirm `/api/health` returns HTTP `200`.
4. Confirm `/api/queues` returns `401` or `403` without `x-queue-token`.
5. Confirm `/api/queues` loads when `x-queue-token` equals `QUEUE_DASHBOARD_TOKEN`.
6. Confirm Redis connection logs are healthy.
7. Confirm worker logs show BullMQ workers started.
8. Confirm scheduler logs show cron jobs registered.
9. Trigger a harmless queued job and confirm the worker completes it.
10. Run the Brevo smoke test against a real inbox:
    ```bash
    npm run email:smoke -- you@example.com
    ```

## Smoke Test Commands

Local or deployed HTTP smoke:

```bash
BASE_URL=https://your-render-service.onrender.com k6 run load-tests/smoke.js
```

NPM wrapper:

```bash
BASE_URL=https://your-render-service.onrender.com npm run load:smoke
```

## Production Notes

- This all-in-one service is for MVP validation, not long-term scale.
- Keep replicas at `1`; multiple all-in-one replicas can duplicate scheduler work.
- When traffic grows, split into separate API, worker, and scheduler services.
- Do not use ping hacks as the reliability strategy for background jobs.
