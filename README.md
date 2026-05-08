# Wemsty Backend

Wemsty Backend is a Node.js, Express, MongoDB, and Socket.IO API for a social platform with authentication, profiles, posts, social graph features, circles, messaging, notifications, feeds, trending/search, moderation, payments, Redis helpers, and Kafka event publishing.

## Documentation

- [Project documentation](PROJECT_DOCUMENTATION.md): full system-level overview of what has been built, including architecture, modules, features, models, realtime, integrations, operations, and known gaps.
- [API documentation](API_DOCUMENTATION.md): endpoint reference, request/response guidance, realtime event contract, and frontend integration notes.
- [Production checklist](PRODUCTION_CHECKLIST.md): environment variables, Redis/MongoDB setup, hardening, observability, and pre-launch verification.

## Quick Start

Install dependencies:

```bash
npm install
```

Run in development:

```bash
npm run dev
```

Run normally:

```bash
npm start
```

Health check:

```bash
curl http://localhost:3001/api/health
```

## Main Entry Point

The application starts from `server.js`, connects MongoDB, attempts optional Redis and Kafka connections, initializes realtime Socket.IO services, mounts API routes under `/api`, and listens on `PORT` or `3001`.

## Email Provider

Brevo is the selected production SMTP provider for custom-domain transactional email. Configure it with:

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<your Brevo SMTP login>
SMTP_PASS=<your Brevo SMTP key>
SMTP_FROM=noreply@wemsty.com
```

Before sending production email, verify the domain in Brevo and add the required SPF, DKIM, and DMARC DNS records.

After adding Brevo SMTP credentials, send a test email with:

```bash
npm run email:smoke -- you@example.com
```

## All-In-One Container

For MVP testing, the Docker image starts the API, BullMQ worker, and scheduler together under PM2:

```bash
docker build -t wemsty-backend-all-in-one .
docker run --env-file .env -p 3001:3001 wemsty-backend-all-in-one
```

Local Compose can run the same combined shape with:

```bash
docker compose --profile all-in-one up --build all-in-one mongo redis
```

Run only one replica of this all-in-one container. Multiple replicas will start multiple schedulers and can enqueue duplicate scheduled jobs.

## Queue Dashboard

BullMQ queues are exposed through a protected dashboard at:

```text
/api/queues
```

Set `QUEUE_DASHBOARD_TOKEN` and send it as either:

```http
Authorization: Bearer <token>
```

or:

```http
X-Queue-Dashboard-Token: <token>
```
