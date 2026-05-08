const express = require('express');
const mongoose = require('mongoose');
const redisManager = require('../config/redis');
const { kafkaManager } = require('../config/kafka');
const { sendSuccess } = require('../utils/response.util');
const metrics = require('../services/metrics.service');

const router = express.Router();

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatUptime(seconds = 0) {
  const totalSeconds = Math.floor(seconds);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

function shouldRenderHtml(req) {
  const accept = req.headers.accept || '';
  return accept.includes('text/html') && !accept.includes('application/json');
}

function renderHealthPage({ version, environment, uptime, timestamp, contactEmail }) {
  const safeVersion = escapeHtml(version);
  const safeEnvironment = escapeHtml(environment);
  const safeUptime = escapeHtml(formatUptime(uptime));
  const safeTimestamp = escapeHtml(timestamp);
  const safeContactEmail = contactEmail ? escapeHtml(contactEmail) : null;
  const contactMarkup = safeContactEmail
    ? `<div class="meta-row"><span>Contact</span><strong>${safeContactEmail}</strong></div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Wemsty Health</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #141827;
      --muted: #667085;
      --line: #d9e2f1;
      --panel: #ffffff;
      --wash: #f6f8fc;
      --green: #18a058;
      --green-dark: #0f7a42;
      --blue: #2454d6;
      --gold: #f2b441;
    }

    * {
      box-sizing: border-box;
    }

    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      background:
        radial-gradient(circle at 18% 18%, rgba(36, 84, 214, 0.12), transparent 34%),
        radial-gradient(circle at 82% 12%, rgba(242, 180, 65, 0.16), transparent 32%),
        linear-gradient(135deg, #fbfcff 0%, var(--wash) 58%, #eef4ff 100%);
      color: var(--ink);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 32px 16px;
    }

    main {
      width: min(720px, 100%);
      border: 1px solid var(--line);
      border-radius: 28px;
      background: rgba(255, 255, 255, 0.88);
      box-shadow: 0 24px 80px rgba(20, 24, 39, 0.12);
      overflow: hidden;
    }

    .hero {
      position: relative;
      padding: 42px;
      display: grid;
      gap: 28px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 800;
      letter-spacing: 0;
    }

    .mark {
      width: 42px;
      height: 42px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      color: #fff;
      background: linear-gradient(135deg, var(--blue), var(--green));
      box-shadow: 0 12px 28px rgba(36, 84, 214, 0.25);
    }

    .status {
      display: flex;
      align-items: center;
      gap: 18px;
    }

    .runner {
      position: relative;
      width: 72px;
      height: 72px;
      flex: 0 0 auto;
    }

    .runner::before,
    .runner::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: rgba(24, 160, 88, 0.16);
      animation: pulse 1.8s ease-out infinite;
    }

    .runner::after {
      animation-delay: 0.9s;
    }

    .runner-core {
      position: absolute;
      inset: 13px;
      border-radius: 50%;
      background: var(--green);
      display: grid;
      place-items: center;
      color: #fff;
      font-weight: 900;
      box-shadow: 0 12px 32px rgba(24, 160, 88, 0.34);
      animation: bob 1.2s ease-in-out infinite;
    }

    h1 {
      margin: 0;
      font-size: clamp(36px, 7vw, 64px);
      line-height: 0.96;
      letter-spacing: 0;
    }

    p {
      max-width: 560px;
      margin: 14px 0 0;
      color: var(--muted);
      font-size: 17px;
      line-height: 1.65;
    }

    .pill {
      width: fit-content;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(24, 160, 88, 0.22);
      border-radius: 999px;
      padding: 8px 12px;
      color: var(--green-dark);
      background: rgba(24, 160, 88, 0.08);
      font-size: 14px;
      font-weight: 700;
    }

    .dot {
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: var(--green);
      box-shadow: 0 0 0 5px rgba(24, 160, 88, 0.14);
    }

    .meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      border-top: 1px solid var(--line);
      background: var(--panel);
    }

    .meta-row {
      min-width: 0;
      padding: 20px 24px;
      border-top: 1px solid var(--line);
    }

    .meta-row:nth-child(-n + 2) {
      border-top: 0;
    }

    .meta-row:nth-child(odd) {
      border-right: 1px solid var(--line);
    }

    .meta-row span {
      display: block;
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 7px;
    }

    .meta-row strong {
      display: block;
      min-width: 0;
      overflow-wrap: anywhere;
      font-size: 16px;
    }

    @keyframes pulse {
      from {
        transform: scale(0.62);
        opacity: 0.95;
      }
      to {
        transform: scale(1.32);
        opacity: 0;
      }
    }

    @keyframes bob {
      0%, 100% {
        transform: translateY(0);
      }
      50% {
        transform: translateY(-4px);
      }
    }

    @media (max-width: 640px) {
      .hero {
        padding: 28px;
      }

      .status {
        align-items: flex-start;
        flex-direction: column;
      }

      .meta {
        grid-template-columns: 1fr;
      }

      .meta-row,
      .meta-row:nth-child(odd),
      .meta-row:nth-child(-n + 2) {
        border-right: 0;
        border-top: 1px solid var(--line);
      }

      .meta-row:first-child {
        border-top: 0;
      }
    }
  </style>
</head>
<body>
  <main aria-label="Wemsty health status">
    <section class="hero">
      <div class="brand">
        <div class="mark" aria-hidden="true">W</div>
        <span>Wemsty Backend</span>
      </div>
      <div class="status">
        <div class="runner" aria-hidden="true"><div class="runner-core">OK</div></div>
        <div>
          <div class="pill"><span class="dot" aria-hidden="true"></span> Live status</div>
          <h1>Wemsty is running</h1>
          <p>The API is awake, responding, and ready to serve the Wemsty app.</p>
        </div>
      </div>
    </section>
    <section class="meta" aria-label="Runtime details">
      <div class="meta-row"><span>Version</span><strong>${safeVersion}</strong></div>
      <div class="meta-row"><span>Environment</span><strong>${safeEnvironment}</strong></div>
      <div class="meta-row"><span>Uptime</span><strong>${safeUptime}</strong></div>
      <div class="meta-row"><span>Timestamp</span><strong>${safeTimestamp}</strong></div>
      ${contactMarkup}
    </section>
  </main>
</body>
</html>`;
}

function requireInternalHealthToken(req, res, next) {
  const token = process.env.HEALTHCHECK_TOKEN;
  if (!token) {
    return next();
  }

  if (req.headers['x-healthcheck-token'] !== token) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden',
      code: 'FORBIDDEN',
      errors: []
    });
  }

  next();
}

router.get('/', (req, res) => {
  const data = {
    version: process.env.API_VERSION || '4.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };

  if (shouldRenderHtml(req)) {
    return res
      .status(200)
      .type('html')
      .send(renderHealthPage({
        ...data,
        contactEmail: process.env.SMTP_FROM || null
      }));
  }

  return sendSuccess(res, {
    message: 'Wemsty Backend is running',
    data
  });
});

router.get('/deep', requireInternalHealthToken, async (req, res) => {
  const mongoState = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const redisState = redisManager.isConnected ? 'connected' : 'disconnected';
  const kafkaState = kafkaManager.isConnected ? 'connected' : 'disconnected';

  const status = mongoState === 'connected'
    ? redisState === 'connected' ? 'ok' : 'degraded'
    : 'error';

  const payload = {
    success: status !== 'error',
    message: status === 'ok' ? 'All required services are healthy' : 'One or more services are degraded',
    data: {
      status,
      services: {
        mongodb: mongoState,
        redis: redisState,
        kafka: kafkaState
      },
      metrics: metrics.snapshot(),
      timestamp: new Date().toISOString()
    }
  };

  return res.status(status === 'error' ? 503 : 200).json(payload);
});

module.exports = router;
