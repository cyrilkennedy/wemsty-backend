# Brevo Production Email Checklist

Brevo is the production SMTP provider for Wemsty.

## Required Environment Variables

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_brevo_smtp_login
SMTP_PASS=your_brevo_smtp_key
SMTP_FROM=noreply@yourdomain.com
SMTP_TEST_TO=your_test_inbox@example.com
```

`SMTP_PASS` must be a Brevo SMTP key, not the normal Brevo account password.

## DNS Requirements

Configure these records in the domain DNS provider, then verify them in Brevo:

- SPF: authorize Brevo to send mail for the domain.
- DKIM: add the Brevo-provided DKIM records exactly as shown.
- DMARC: add a DMARC TXT record, starting with a monitoring policy such as `p=none`, then tighten later.

Use the exact hostnames and values from Brevo because they can differ by account/domain.

## Smoke Test

Run this after the env vars and DNS records are configured:

```bash
npm run email:smoke -- your_test_inbox@example.com
```

Acceptance:

- The command exits successfully.
- The test email reaches the inbox.
- The message does not land in spam.
- Brevo shows the sender/domain as verified.

## Production Notes

- Use dedicated senders such as `noreply@yourdomain.com`, `security@yourdomain.com`, and `support@yourdomain.com`.
- Keep OTP/security emails short and transactional.
- Watch bounce and complaint rates in Brevo before increasing volume.
