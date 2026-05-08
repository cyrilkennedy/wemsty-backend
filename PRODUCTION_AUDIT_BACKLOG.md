# Production Audit Backlog

Use this as the working checklist after payment, queues, fan-out, email, and media cleanup.

## API Response Consistency

- New and changed success responses should use `{ success, message, data, meta }`.
- Error responses should use `{ success, message, code, errors }`.
- Existing high-traffic controllers to audit first:
  - auth
  - posts
  - feeds
  - payments
  - messages
  - circles

## Validation Coverage

- Validate `body`, `params`, and `query` with the existing Zod/validation middleware.
- Prioritize:
  - auth
  - payment initialize/verify/webhook metadata
  - post create/reply/repost
  - media register/signature
  - message send/read-state
  - circle create/channel/invite

## Pagination Coverage

- Every list endpoint should accept `limit`.
- Feeds and messages should prefer cursor pagination.
- Admin/moderation lists can use page pagination if the response includes pagination metadata.

## Index Audit

Tie every new index to a known query pattern before adding it.

Priority collections:

- `PaymentTransaction`
- `PaymentWebhookEvent`
- `MediaAsset`
- `Notification`
- `Post`
- `Follow`
- `CircleMembership`
- `MessageRead`

## Rate Limit Audit

- Auth routes: strict per IP/email.
- Payment initialization: strict per user/IP.
- Search/feed: moderate per user/IP.
- Post/message creation: moderate per user.
- Interactions: burst-tolerant but Redis-backed.
