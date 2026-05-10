# Plunk Production Email Checklist

Plunk is the production email API provider for Wemsty.

## Required Environment Variables

```env
PLUNK_API_KEY=your_plunk_api_key
SMTP_FROM=noreply@yourdomain.com
SMTP_TEST_TO=your_test_inbox@example.com
```

`PLUNK_API_KEY` can be found in your Plunk dashboard under API Keys.

## DNS Requirements

Configure these records in the domain DNS provider, then verify them in Plunk (useplunk.com):

- **DKIM**: Add the CNAME records provided by Plunk to your DNS.
- **SPF**: Plunk usually handles this via their dedicated IP/infrastructure, but follow their dashboard instructions for any required TXT records.
- **DMARC**: Ensure your domain has a valid DMARC record (e.g., `v=DMARC1; p=none;`).

## Smoke Test

Run this after the environment variables are configured:

```bash
node scripts/plunk-smoke-test.js your_test_inbox@example.com
```

Acceptance:

- The command exits successfully.
- The test email reaches the inbox.
- The message does not land in spam.
- Plunk dashboard shows the email as delivered.

## Production Notes

- Use dedicated senders such as `noreply@yourdomain.com`, `security@yourdomain.com`, and `support@yourdomain.com`.
- Keep OTP/security emails short and transactional.
- Monitor your delivery rates in the Plunk dashboard.
