# Security Audit Notes

Last reviewed: 2026-05-08

## Command Run

```bash
npm audit fix
npm uninstall paystack
npm install nodemailer@^8.0.7
npm audit --audit-level=moderate
```

## Result

The normal non-breaking audit fix was applied first. Then the legacy `paystack` package was replaced with an internal Paystack HTTP client, removing the deprecated `request` dependency chain. Nodemailer was upgraded to the audited fixed major version after confirming the app only uses stable SMTP APIs.

- 17 vulnerabilities before the initial fix
- 6 vulnerabilities after the initial fix
- 0 vulnerabilities after replacing `paystack` and upgrading Nodemailer

## Remaining Findings

| Package Path | Severity | Status | Notes |
| --- | --- | --- | --- |
| None | None | Resolved | `npm audit --audit-level=moderate` currently reports zero vulnerabilities. |

## Recommended Next Security Work

1. Run the Brevo SMTP smoke test with real credentials before production email launch.
2. Keep the internal Paystack client covered by tests when adding new Paystack endpoints.
3. Re-run before every deploy:
   ```bash
   npm audit --audit-level=moderate
   npm test
   npm run email:smoke -- you@example.com
   ```

## Current Mitigations

- Paystack integration now uses a small internal HTTPS client.
- Paystack webhooks verify signatures.
- Webhook events are stored before processing.
- Payment transaction references are treated idempotently.
- Payment webhook processing is queued.
- Brevo SMTP credentials remain environment-only.
