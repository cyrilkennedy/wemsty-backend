# Wemsty Backend API Documentation

## Table of Contents
- [Overview](#overview)
- [Who This Doc Is For](#who-this-doc-is-for)
- [Local Setup Checklist](#local-setup-checklist)
- [Quick Start](#quick-start)
- [First API Flow (Copy/Paste)](#first-api-flow-copypaste)
- [API Conventions](#api-conventions)
  - [Base URL](#base-url)
  - [Authentication](#authentication)
  - [Access Levels](#access-levels)
  - [Response Shapes in This Codebase](#response-shapes-in-this-codebase)
  - [Pagination](#pagination)
  - [HTTP Status Codes](#http-status-codes)
  - [Rate Limits](#rate-limits)
- [Endpoints](#endpoints)
  - [Health](#health)
  - [Authentication Endpoints](#authentication-endpoints)
  - [Users](#users)
  - [Posts](#posts)
  - [Social](#social)
  - [Circles](#circles)
  - [Messages](#messages)
  - [Notifications](#notifications)
  - [Notification Preferences](#notification-preferences)
  - [Feed](#feed)
  - [Trending](#trending)
  - [Search](#search)
  - [Payments](#payments)
  - [Moderation](#moderation)
- [Frontend Engineer Contract (Per API)](#frontend-engineer-contract-per-api)
- [Realtime (WebSocket)](#realtime-websocket)
- [Data Models](#data-models)
- [Additional Notes](#additional-notes)

---

## Overview

Wemsty is a social platform API with support for:
- Authentication (email/password and Google OAuth)
- User profiles and social graph (follow, block, mute)
- Posts, replies, reposts, and bookmarks
- Circles (community spaces), channels, and direct messages
- Notifications and feed ranking
- Trending/search, payments, and moderation

**API version:** `4.0`

---

## Who This Doc Is For

This document is written for:
- Junior backend developers integrating frontend/mobile apps
- Developers using Postman, Insomnia, or `curl`
- Developers who need practical request/response examples first, then full endpoint reference

If you are new to JWT auth, start with:
1. [Quick Start](#quick-start)
2. [First API Flow (Copy/Paste)](#first-api-flow-copypaste)
3. [Authentication Endpoints](#authentication-endpoints)

---

## Local Setup Checklist

Before testing endpoints, confirm:
- API server is running on `http://localhost:3001`
- MongoDB is connected (check `GET /health`)
- You have a test account (or create one with `POST /auth/signup`)
- You are sending JSON with `Content-Type: application/json`
- For protected routes, you include `Authorization: Bearer <accessToken>`

---

## Quick Start

1. Create an account with `POST /auth/signup` or sign in with `POST /auth/login`.
2. Save the returned access and refresh tokens.
3. Send authenticated requests with:

```http
Authorization: Bearer <access_token>
```

4. When access token expires, call `POST /auth/refresh` with a valid refresh token.
5. Call `GET /auth/me` to confirm the authenticated session.

---

## First API Flow (Copy/Paste)

Use this exact flow when onboarding a new frontend dev.

1. Signup

```bash
curl -X POST http://localhost:3001/api/auth/signup ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"junior@example.com\",\"username\":\"junior_dev\",\"password\":\"password123\"}"
```

2. Login and copy `data.accessToken` from the response

```bash
curl -X POST http://localhost:3001/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"junior@example.com\",\"password\":\"password123\"}"
```

3. Get my profile

```bash
curl http://localhost:3001/api/users/profile ^
  -H "Authorization: Bearer <accessToken>"
```

4. Update profile (bio + avatar URL)

```bash
curl -X PATCH http://localhost:3001/api/users/profile ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer <accessToken>" ^
  -d "{\"profile\":{\"displayName\":\"Junior Dev\",\"bio\":\"Building with Wemsty API\",\"avatar\":\"https://example.com/avatar.jpg\"}}"
```

---

## API Conventions

### Base URL

All routes are relative to:

```text
http://localhost:3001/api
```

### Authentication

Most routes require JWT authentication.

```http
Authorization: Bearer <your_jwt_token>
```

Token behavior:
- Access token: short-lived (15 minutes), used for API calls
- Refresh token: longer-lived (7 days), used to issue new access tokens

Tokens are returned in response bodies and also set as HTTP-only cookies.

### Access Levels

- `Public`: no authentication required
- `Public (Optional Auth)`: works without auth, but returns richer data when authenticated
- `Private`: authenticated user required
- `Private/Admin`: admin role required
- `Private/Admin, Moderator`: admin or moderator role required

### Response Shapes in This Codebase

This backend currently uses **two success response styles** depending on module.

Style A:

```json
{
  "status": "success",
  "message": "Operation completed successfully",
  "data": {}
}
```

Style B:

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {}
}
```

Error responses are usually one of these:

```json
{
  "status": "fail",
  "message": "Validation or request error"
}
```

```json
{
  "status": "error",
  "message": "Server error",
  "stack": "Only in development"
}
```

Junior-dev tip: always check `response.ok` first, then read `message`, then parse `data`.

### Pagination

List endpoints typically accept:
- `page` (default `1`)
- `limit` (default `20`)

Paginated responses include:

```json
{
  "status": "success",
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

### Rate Limits

| Category | Limit | Window |
|----------|-------|--------|
| Authentication | 5 requests | 15 minutes |
| General Auth | 10 requests | 15 minutes |
| Posts | 30 requests | 15 minutes |
| Interactions | 60 requests | 1 minute |
| Follow Actions | 100 requests | 1 hour |
| Global API | 100 requests | 15 minutes |

When throttled, the API returns `429` and a `retryAfter` field.

---

## Endpoints

### Health

#### GET `/health`
Check API and infrastructure status.

Access: `Public`

Example response:

```json
{
  "status": "ok",
  "message": "Wemsty Backend v4.0 is running",
  "environment": "development",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "database": "MongoDB Connected"
}
```

#### Frontend Engineer Expectations
- Call this endpoint on app startup and before running smoke/integration tests.
- If this fails or reports infrastructure issues, block authenticated flows and show a service status banner.
- Do not cache this response for long periods in production clients.

---

### Authentication Endpoints

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| POST | `/auth/signup` | Public | Register a new account |
| POST | `/auth/login` | Public | Sign in with email/password |
| POST | `/auth/google` | Public | Sign in with Google OAuth |
| POST | `/auth/refresh` | Public | Issue a new access token |
| GET | `/auth/me` | Private | Get current authenticated user |
| POST | `/auth/logout` | Private | Logout current device/session |
| POST | `/auth/logout-all` | Private | Logout all active sessions |
| POST | `/auth/change-password` | Private | Change password while logged in |
| POST | `/auth/forgot-password` | Public | Legacy reset request flow |
| POST | `/auth/reset-password` | Public | Legacy reset completion flow |
| POST | `/auth/password-reset/request` | Public | OTP reset step 1 |
| POST | `/auth/password-reset/verify-otp` | Public | OTP reset step 2 |
| POST | `/auth/password-reset/reset` | Public | OTP reset step 3 |
| POST | `/auth/password-reset/feedback` | Public | Optional user feedback for reset flow |
| POST | `/auth/password-reset/resend-otp` | Public | Resend password-reset OTP |
| POST | `/auth/verify-email` | Public | Verify email token |
| POST | `/auth/resend-verification` | Private | Resend verification email |

Signup request:

```json
{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "password123"
}
```

Signup validation:
- `email`: required, valid format
- `username`: 3-30 chars, letters/numbers/underscores only
- `password`: minimum 8 chars

Login request:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Google auth request:

```json
{
  "idToken": "google_id_token_from_client"
}
```

Refresh token request:

Use either:
- `refreshToken` in JSON body
- `refreshToken` cookie (if your client keeps cookies)

Body example:

```json
{
  "refreshToken": "<refresh_token>"
}
```

Change password request:

```json
{
  "currentPassword": "old_password",
  "newPassword": "new_password"
}
```

OTP reset flow payloads:

```json
{
  "email": "user@example.com"
}
```

```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

```json
{
  "token": "verified_token",
  "newPassword": "new_password"
}
```

Email verification request:

```json
{
  "token": "email_verification_token"
}
```

#### Frontend Engineer Expectations
- Persist access/refresh tokens securely and replace them whenever `/auth/refresh` succeeds.
- Implement a single automatic retry for `401` responses, then hard logout if refresh fails.
- Treat `/auth/forgot-password` and OTP reset request flows as privacy-preserving: never expose whether an account exists.
- Reconnect realtime socket after login/logout/token refresh changes.
- Expect rate limiting (`429`) on auth endpoints and display cooldown messaging.

---

### Users

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/users/handle/:username` | Public (Optional Auth) | Get public profile by username |
| GET | `/users/profile` | Private | Get own full profile |
| PATCH | `/users/profile` | Private | Update own profile |
| DELETE | `/users/account` | Private | Delete/deactivate own account |
| GET | `/users` | Private/Admin | Admin user listing |
| PATCH | `/users/:id/role` | Private/Admin | Update role |
| PATCH | `/users/:id/status` | Private/Admin, Moderator | Update account status |

Update profile payload (all fields optional):

Important: profile fields must be sent inside `profile`.

```json
{
  "username": "johndoe",
  "profile": {
    "firstName": "John",
    "lastName": "Doe",
    "displayName": "John Doe",
    "bio": "Updated bio",
    "avatar": "https://example.com/avatar.jpg",
    "location": "New York, USA",
    "website": "https://johndoe.com",
    "phoneNumber": "+2348000000000"
  }
}
```

Common mistake:
- Sending `"displayName"` at root level will not update the profile.
- Use `"profile.displayName"` via nested `profile` object.

Profile media note:
- `profile.avatar` is currently a string URL field.
- There is no dedicated backend endpoint yet for direct avatar/cover file upload.
- `coverImage` is not currently part of the `User` schema.

Admin list filters:
- `page`, `limit`
- `search` (username or email)
- `role`

Role update payload:

```json
{
  "role": "moderator"
}
```

Valid roles: `user`, `creator`, `moderator`, `admin`

Status update payload:

```json
{
  "status": "active"
}
```

Valid statuses: `active`, `suspended`, `banned`

#### Frontend Engineer Expectations
- Always send profile edits inside `profile` object; root-level profile fields will be ignored.
- Use server-returned user object to overwrite local profile state after any successful profile mutation.
- For admin/moderator views, treat `/users` filters and pagination as server-driven state.
- For account deletion, clear all local auth/session/cache state immediately after success.

---

### Posts

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/posts/trending` | Public (Optional Auth) | Trending posts |
| GET | `/posts/categories` | Public | Supported post categories |
| GET | `/posts/sphere` | Public (Optional Auth) | Public discovery feed |
| GET | `/posts/category/:categorySlug` | Public (Optional Auth) | Category feed |
| GET | `/posts/search` | Public (Optional Auth) | Search posts |
| GET | `/posts/:postId` | Public (Optional Auth) | Get a single post |
| GET | `/posts/:postId/thread` | Public (Optional Auth) | Thread view (post + replies) |
| GET | `/posts/user/:username` | Public (Optional Auth) | User post feed |
| GET | `/posts/feed/home` | Private | Following-based home feed |
| GET | `/posts/feed/sphere` | Private | Authenticated discovery feed |
| POST | `/posts` | Private | Create post |
| POST | `/posts/repost` | Private | Create repost or quote repost (idempotent create) |
| DELETE | `/posts/repost/:postId` | Private | Explicitly remove repost/quote repost |
| POST | `/posts/reply` | Private | Reply to post |
| PATCH | `/posts/reply/:replyId` | Private | Edit own comment (reply) |
| DELETE | `/posts/reply/:replyId` | Private | Delete own comment (reply) |
| POST | `/posts/reply/:replyId/like` | Private | Like a comment/reply (idempotent) |
| DELETE | `/posts/reply/:replyId/like` | Private | Unlike a comment/reply (idempotent) |
| POST | `/posts/:postId/like` | Private | Like a post (idempotent) |
| DELETE | `/posts/:postId/like` | Private | Explicit unlike (idempotent) |
| GET | `/posts/:postId/likes` | Private | List post likes |
| POST | `/posts/:postId/bookmark` | Private | Bookmark post (idempotent) |
| DELETE | `/posts/:postId/bookmark` | Private | Explicit unbookmark (idempotent) |
| GET | `/posts/bookmarks/me` | Private | List own bookmarks |
| DELETE | `/posts/:postId` | Private | Delete own post |

Common query params:
- `page`, `limit`
- `category` where applicable
- `sort` for `/posts/search`: `relevance`, `recent`, `popular`
- `type` for `/posts/user/:username`: `posts`, `replies`, `all`

Create post payload:

```json
{
  "text": "Post content here",
  "category": "general",
  "media": [
    {
      "type": "image",
      "url": "https://..."
    }
  ],
  "visibility": "public",
  "sphereEligible": true
}
```

Notes:
- At least one of `text` or `media` is required.
- `text` max length is 500 characters.
- Valid `visibility`: `public`, `followers`, `private`.

Rate limit: `30` posts per `15` minutes.

Repost payload:

```json
{
  "postId": "post_id_to_repost",
  "text": "Optional quote text"
}
```

Repost behavior:
- If no active repost exists, this creates one.
- If an active repost exists and `text` is provided, it updates the existing repost into a quote repost.
- If an active repost exists and `text` is empty/missing, the API returns "already reposted".
- To remove repost, use `DELETE /posts/repost/:postId`.

Reply payload:

```json
{
  "postId": "parent_post_id",
  "text": "Reply content"
}
```

Edit comment payload (`PATCH /posts/reply/:replyId`):

```json
{
  "text": "Updated comment text"
}
```

Interaction summary:
- Like: `POST /posts/:postId/like`
- Unlike: `DELETE /posts/:postId/like`
- Like comment: `POST /posts/reply/:replyId/like`
- Unlike comment: `DELETE /posts/reply/:replyId/like`
- Bookmark: `POST /posts/:postId/bookmark`
- Unbookmark: `DELETE /posts/:postId/bookmark`
- Repost/quote create: `POST /posts/repost`
- Explicit unrepost: `DELETE /posts/repost/:postId`

#### Frontend Engineer Expectations
- Never compute like/repost/bookmark counters locally; always trust backend counters in responses/events.
- Treat interaction endpoints as idempotent and update UI from response booleans (`liked`, `bookmarked`, `reposted`).
- For profile thought timeline, default to `GET /posts/user/:username` without `includeReposts=true`.
- Use `text` in `/posts/repost` only when creating/updating a quote repost UI flow.
- Comments are unlimited per account; comment count source of truth is post payload `commentsCount`.

---

### Social

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| POST | `/social/follow/:userId` | Private | Follow user |
| DELETE | `/social/follow/:userId` | Private | Unfollow user |
| GET | `/social/follow/status/:userId` | Private | Follow relationship status |
| GET | `/social/follow-requests` | Private | Pending follow requests |
| POST | `/social/follow-requests/:requestId/accept` | Private | Accept request |
| POST | `/social/follow-requests/:requestId/reject` | Private | Reject request |
| GET | `/social/followers/:userId` | Private | User followers |
| GET | `/social/following/:userId` | Private | User following |
| GET | `/social/mutual/:userId` | Private | Mutual followers |
| GET | `/social/suggestions` | Private | Follow suggestions |
| POST | `/social/block/:userId` | Private | Block user |
| DELETE | `/social/block/:userId` | Private | Unblock user |
| GET | `/social/blocked` | Private | List blocked users |
| POST | `/social/mute/:userId` | Private | Mute user |
| DELETE | `/social/mute/:userId` | Private | Unmute user |
| GET | `/social/muted` | Private | List muted users |

Pagination applies to follower/following lists.

#### Frontend Engineer Expectations
- Drive follow button state from `/social/follow/status/:userId` or mutation response status.
- Handle private-account follow behavior (`PENDING`) in UI distinctly from accepted follow.
- Refresh follower/following counts after follow/unfollow/accept/reject actions.
- Remove blocked/muted users from relevant feeds and visible lists immediately.

---

### Circles

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/circles` | Public | List public circles |
| GET | `/circles/view/:identifier` | Public (Optional Auth) | Get circle by id or slug |
| GET | `/circles/me/memberships` | Private | My circle memberships |
| POST | `/circles` | Private | Create circle |
| POST | `/circles/invites/:code/redeem` | Private | Redeem invite code |
| GET | `/circles/:circleId/members` | Private | Circle members (member-only) |
| GET | `/circles/:circleId/channels` | Private | Circle channels (member-only) |
| GET | `/circles/:circleId/roles` | Private | Circle roles (member-only) |
| POST | `/circles/:circleId/roles` | Private | Create role (admin-only) |
| POST | `/circles/:circleId/roles/assign` | Private | Assign role (admin-only) |
| GET | `/circles/:circleId/invites` | Private | List invites (admin-only) |
| POST | `/circles/:circleId/invites` | Private | Create invite (admin-only) |
| POST | `/circles/:circleId/join` | Private | Join circle |
| POST | `/circles/:circleId/leave` | Private | Leave circle |
| POST | `/circles/:circleId/channels` | Private | Create channel (admin-only) |
| POST | `/circles/:circleId/channels/:channelId/pin` | Private | Pin channel (admin-only) |
| POST | `/circles/:circleId/posts/:postId/pin` | Private | Pin post (admin-only) |

Create circle payload:

```json
{
  "name": "My Circle",
  "description": "Circle description",
  "slug": "my-circle",
  "isPrivate": false,
  "avatar": "avatar_url"
}
```

Redeem invite payload:

```json
{
  "code": "invite_code"
}
```

#### Frontend Engineer Expectations
- Use circle `membership` and resolved `permissions` from backend to gate admin/moderator UI actions.
- Always refresh channel/member lists after role/assign/invite/join/leave mutations.
- For pin endpoints, send `{ "pinned": false }` to unpin; default behavior pins when omitted.
- On join/leave/redeem actions, update local membership state and counts from server responses.

---

### Messages

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/messages/channels/:circleId/:channelId` | Private | Channel messages |
| POST | `/messages/channels/:circleId/:channelId` | Private | Send channel message |
| GET | `/messages/reads` | Private | Conversation read states |
| POST | `/messages/reads` | Private | Update read state |
| GET | `/messages/dm/conversations` | Private | DM conversation list |
| POST | `/messages/dm/conversations/:userId` | Private | Get/create DM conversation |
| GET | `/messages/dm/conversations/:conversationId/messages` | Private | DM messages |
| POST | `/messages/dm/conversations/:conversationId/messages` | Private | Send DM message |

Message list query params:
- `page`, `limit`
- `before` (timestamp cursor)

Send message payload:

```json
{
  "content": "Message content",
  "media": []
}
```

Read state update payload:

```json
{
  "conversationId": "conversation_id",
  "lastReadMessageId": "message_id"
}
```

#### Frontend Engineer Expectations
- Use server pagination for messages; avoid assuming full history is returned in one call.
- Reconcile optimistic messages with server-returned message objects after send endpoints.
- Keep read-state source of truth on backend (`/messages/reads`) and patch UI from returned read state.
- Enforce access errors (`403/404`) by routing users out of unauthorized channel/conversation screens.

---

### Notifications

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/notifications` | Private | List notifications |
| GET | `/notifications/unread-count` | Private | Unread count |
| PATCH | `/notifications/read-all` | Private | Mark all read |
| PATCH | `/notifications/:notificationId/read` | Private | Mark one read |

Notification list filters:
- `page`, `limit`
- `unread` (boolean)

Unread count response:

```json
{
  "status": "success",
  "data": {
    "count": 5
  }
}
```

#### Frontend Engineer Expectations
- Use `/notifications/unread-count` for header badge sync and refresh after mark-read actions.
- After `PATCH /notifications/read-all`, set all local items read without waiting for next poll cycle.
- Merge notification list pagination from backend instead of client-calculated cursors.

---

### Notification Preferences

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/notifications/preferences` | Private | Get preference settings |
| PUT | `/notifications/preferences` | Private | Update preferences |
| GET | `/notifications/preferences/defaults` | Private | Get default preferences |
| POST | `/notifications/preferences/reset` | Private | Reset to defaults |
| POST | `/notifications/preferences/enable-all` | Private | Enable all notifications |
| POST | `/notifications/preferences/disable-all` | Private | Disable all notifications |
| GET | `/notifications/preferences/summary` | Private | Preference summary |
| POST | `/notifications/preferences/test` | Private | Send test notification |

Update preferences payload:

```json
{
  "email": {
    "likes": true,
    "comments": true,
    "follows": true
  },
  "push": {
    "likes": true,
    "comments": false
  }
}
```

#### Frontend Engineer Expectations
- Send only boolean values for known keys under `email`, `push`, and `sms`.
- Rehydrate preference form from server response after each update/reset/enable-all/disable-all action.
- Use `/notifications/preferences/summary` for compact settings cards instead of computing counts client-side.
- Optional test endpoint supports `?type=<channel>` query and should show immediate success/failure toast.

---

### Feed

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/feed/home` | Private | Home feed |
| POST | `/feed/home/refresh` | Private | Refresh feed cache |
| GET | `/feed/sphere` | Private | Discovery feed |
| GET | `/feed/sphere/category/:category` | Private | Category discovery feed |
| GET | `/feed/ranking/:postId` | Private | Ranking debug data |

Feed queries commonly use `page` and `limit`.

#### Frontend Engineer Expectations
- Treat returned `items`, `feed`, and `posts` aliases as equivalent feed arrays.
- For pull-to-refresh/manual refresh UX, call `POST /feed/home/refresh` then refetch first page.
- Respect `mode` and cache flags from UI controls when calling sphere/discovery endpoints.
- Gracefully handle feed throttling (`429`) with retry delay from `retryAfter`.

---

### Trending

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/trending/hashtags` | Public | Trending hashtags |
| GET | `/trending/topics` | Public | Trending topics |
| GET | `/trending/categories` | Public | Available categories |
| GET | `/trending/stats` | Public | Trending statistics |
| GET | `/trending/category/:category` | Private | Category-specific trending |
| GET | `/trending/hashtag/:tag` | Private | Hashtag details |
| GET | `/trending/topic/:topic` | Private | Topic details |
| GET | `/trending/region/:region` | Private | Region trending |
| GET | `/trending/search` | Private | Hashtag search |

Common query params:
- `/trending/hashtags`: `limit` (default `10`)
- `/trending/topic/:topic`: optional `type`
- `/trending/search`: `q`

Example hashtag response:

```json
{
  "status": "success",
  "data": [
    {
      "tag": "wemsty",
      "count": 1234,
      "trend": "up"
    }
  ]
}
```

#### Frontend Engineer Expectations
- Use query params (`limit`, `category`, `timeWindow`, etc.) as explicit UI filter state.
- Keep public vs private trending endpoint behavior consistent with auth state.
- For topic/hashtag detail routes, treat `404` as normal empty state (invalid or expired trend).

---

### Search

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/search` | Public (Optional Auth) | Unified search across posts/users/hashtags |

Query parameters:
- `q` (required)
- `type`: `all`, `posts`, `users`, `hashtags`
- `page`, `limit`

#### Frontend Engineer Expectations
- Always debounce search input and avoid calling endpoint when `q` is empty.
- Render grouped sections directly from backend arrays (`users`, `posts`, `circles`, `categories`).
- Do not assume every type is returned; handle empty arrays independently per section.

---

### Payments

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| POST | `/payments/webhook` | Public | Paystack webhook (signature verified) |
| POST | `/payments/initialize` | Private | Start payment |
| GET | `/payments/verify/:reference` | Private | Verify payment |
| GET | `/payments/history` | Private | Transaction history |

Initialize payment payload:

```json
{
  "amount": 1000,
  "plan": "premium_monthly",
  "email": "user@example.com"
}
```

`amount` is in kobo. Example: `1000` equals `NGN 10.00`.

#### Frontend Engineer Expectations
- Convert user-facing currency amount to kobo before calling `/payments/initialize`.
- Never call webhook endpoint from frontend; it is strictly provider-to-backend.
- Verify transaction status with `/payments/verify/:reference` before finalizing paid UX states.
- Keep payment history UI resilient to empty transaction arrays.

---

### Moderation

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| POST | `/moderation/reports` | Private | Create report |
| GET | `/moderation/reports` | Private/Admin, Moderator | List reports |
| POST | `/moderation/reports/:reportId/actions` | Private/Admin, Moderator | Apply moderation action |
| GET | `/moderation/audit-logs` | Private/Admin, Moderator | View moderation logs |

Create report payload:

```json
{
  "targetType": "post",
  "targetId": "target_id",
  "reason": "spam",
  "description": "Additional details"
}
```

Valid `targetType`: `post`, `user`, `comment`

Report list filters:
- `page`, `limit`
- `status`: `pending`, `resolved`, `dismissed`
- `type`

Action payload:

```json
{
  "action": "dismiss",
  "reason": "No violation found",
  "duration": null
}
```

Valid actions: `dismiss`, `warn`, `suspend`, `ban`, `delete`

#### Frontend Engineer Expectations
- Use moderation endpoints only for authorized admin/moderator surfaces.
- Report creation must send required fields (`targetType`, `targetId`, `reasonCode`) and prevent duplicate submissions in UI.
- Drive moderation queue state from server `status` + pagination, not local assumptions.
- Show clear audit trail context using `/moderation/audit-logs` filters.

---

## Frontend Engineer Contract (Per API)

This section is the strict frontend contract for every mounted API route.

### Global Expectations (All Endpoints)

1. Send `Authorization: Bearer <accessToken>` for every `Private` endpoint.
2. On `401`, call `POST /auth/refresh` once, then retry the failed request once.
3. Treat interaction endpoints (`like`, `bookmark`, `repost`) as idempotent and always trust server booleans/counters from response.
4. Always handle both success styles in this codebase: `status: "success"` and `success: true`.
5. For paginated endpoints, persist `page`, `limit`, and `hasMore` in UI state.
6. On `429`, wait `retryAfter` seconds before retrying.
7. For optional-auth endpoints, include token when available so viewer state (`liked`, `bookmarked`, `reposted`) is returned.

### Health Contract

| Endpoint | Frontend must send | Frontend must do after response |
|---|---|---|
| `GET /health` | No auth. | Use for startup health check and show maintenance/offline banner if not healthy. |

### Authentication Contract

| Endpoint | Frontend must send | Frontend must do after response |
|---|---|---|
| `GET /auth/test` | No auth. Dev only. | Use only in local/dev diagnostics, not product UI. |
| `POST /auth/signup` | JSON: `email`, `username`, `password` (8+ chars). | Save `accessToken`/`refreshToken`, hydrate auth store, route user into onboarding. |
| `POST /auth/login` | JSON: `email`, `password`. | Save returned tokens and user object; connect realtime socket with new token. |
| `POST /auth/google` | JSON: `idToken` from Google SDK. | Same handling as normal login. |
| `POST /auth/refresh` | Refresh token in body (`refreshToken`) or cookie. | Replace access token, replay one pending 401 request, logout if refresh fails. |
| `POST /auth/forgot-password` | JSON with email. | Show generic success message regardless of account existence. |
| `POST /auth/reset-password` | JSON: `token`, `newPassword`. | Route to login and clear stale auth state. |
| `POST /auth/password-reset/request` | JSON: `email`. | Start OTP stepper UI and countdown timer. |
| `POST /auth/password-reset/verify-otp` | JSON: `email`, `otp`. | Store returned reset token (if present) in memory only and move to reset step. |
| `POST /auth/password-reset/reset` | JSON: `token`, `newPassword`. | Force new login flow after success. |
| `POST /auth/password-reset/feedback` | JSON feedback payload from UI form. | Fire-and-forget UX; do not block auth flow on this endpoint. |
| `POST /auth/password-reset/resend-otp` | JSON: `email`. | Restart OTP timer and keep user in same step. |
| `POST /auth/verify-email` | JSON: `token` from verification link. | Mark user as verified in state and remove verification banner. |
| `GET /auth/me` | Bearer token. | Use as source of truth for session restoration on app boot. |
| `POST /auth/logout` | Bearer token. | Clear local tokens/user cache and disconnect realtime socket. |
| `POST /auth/logout-all` | Bearer token. | Clear local tokens and prompt re-login on all client tabs/devices. |
| `POST /auth/change-password` | Bearer token + JSON: `currentPassword`, `newPassword`. | Show success and optionally require token refresh/re-auth for sensitive screens. |
| `POST /auth/resend-verification` | Bearer token. | Show cooldown UI and "email sent" status. |

### Users Contract

| Endpoint | Frontend must send | Frontend must do after response |
|---|---|---|
| `GET /users/handle/:username` | Optional bearer token. | Render public profile header and counters from server response. |
| `GET /users/profile` | Bearer token. | Hydrate editable profile form from full user object. |
| `PATCH /users/profile` | Bearer token + JSON; profile fields must be nested under `profile`. | Replace local user state with returned user object. |
| `DELETE /users/account` | Bearer token + `confirmDelete: "DELETE"` and `password` (for password users). | Hard logout client and route to account-deleted screen. |
| `GET /users` | Bearer token (admin/moderator) + optional `page`, `limit`, `search`, `status`, `role`. | Drive admin user table with pagination/filter chips. |
| `PATCH /users/:id/role` | Bearer token (admin) + JSON: `role`. | Update row immediately in admin table from response. |
| `PATCH /users/:id/status` | Bearer token (admin/moderator) + JSON: `status`, optional `reason`. | Update moderation/admin UI badge and action history. |

### Posts Contract

| Endpoint | Frontend must send | Frontend must do after response |
|---|---|---|
| `GET /posts/trending` | Optional bearer token + optional `page`, `limit`, `timeframe`, `category`. | Populate trending feed and trust server counts/flags. |
| `GET /posts/categories` | No auth. | Use as source for category tabs/selectors. |
| `GET /posts/sphere` | Optional bearer token + optional `page`, `limit`, `mode`. | Render discovery feed; mode should match active tab (`top`/`latest`). |
| `GET /posts/category/:categorySlug` | Optional bearer token + optional `page`, `limit`, `mode`. | Render category feed and category metadata from server. |
| `GET /posts/search` | Optional bearer token + required `q`; optional `page`, `limit`, `category`. | Debounce query in UI and show empty/error states for missing/invalid search. |
| `GET /posts/:postId` | Optional bearer token. | Use as canonical post detail payload (includes viewer booleans when authed). |
| `GET /posts/:postId/thread` | Optional bearer token. | Build thread view from `post` + `replies`; do not compute counts client-side. |
| `GET /posts/user/:username` | Optional bearer token + optional `page`, `limit`, `includeReplies`, `includeReposts`. | Default profile "Thoughts" tab should keep `includeReposts=false` unless a repost tab exists. |
| `GET /posts/feed/home` | Bearer token + optional `page`, `limit`. | Render following feed and persist pagination cursor/state. |
| `GET /posts/feed/sphere` | Bearer token + optional `page`, `limit`, `mode`. | Render authenticated discovery feed and reuse same card contracts as public feed. |
| `POST /posts` | Bearer token + JSON with `text` or `media`; optional `category`, `visibility`, `sphereEligible`. | Insert returned post from server response; never fabricate ids/counters locally. |
| `POST /posts/repost` | Bearer token + JSON: `postId`; optional `text` for quote only. | For plain repost, do not create custom local post card; use returned `reposted` flags/counters. |
| `DELETE /posts/repost/:postId` | Bearer token. | Set `reposted=false` and replace counter from returned `repostsCount`. |
| `POST /posts/reply` | Bearer token + JSON: `postId`, `text`. | Add reply using returned reply payload and update parent comments count from response. |
| `PATCH /posts/reply/:replyId` | Bearer token + JSON: `text`. | Replace edited comment content from response object. |
| `DELETE /posts/reply/:replyId` | Bearer token. | Remove comment from UI and refresh or patch parent comment count. |
| `POST /posts/reply/:replyId/like` | Bearer token + optional `source`. | Update like state from response (`liked`, `likesCount`) only. |
| `DELETE /posts/reply/:replyId/like` | Bearer token. | Update comment like state/counter from response only. |
| `POST /posts/:postId/like` | Bearer token + optional `source`. | Update post like state from server response (idempotent). |
| `DELETE /posts/:postId/like` | Bearer token. | Update post like state from server response (idempotent). |
| `GET /posts/:postId/likes` | Bearer token + optional `page`, `limit`. | Render likes modal/list with pagination. |
| `POST /posts/:postId/bookmark` | Bearer token + optional `collection`. | Toggle bookmark UI using `bookmarked` field from response. |
| `DELETE /posts/:postId/bookmark` | Bearer token. | Toggle bookmark UI using response fields only. |
| `GET /posts/bookmarks/me` | Bearer token + optional `page`, `limit`, `collection`. | Render saved posts screen from returned bookmark list. |
| `DELETE /posts/:postId` | Bearer token. | Remove post from visible feeds/profile and re-request current page if needed. |

### Social Contract

| Endpoint | Frontend must send | Frontend must do after response |
|---|---|---|
| `POST /social/follow/:userId` | Bearer token. | Set follow button by returned status (`ACCEPTED` or `PENDING`). |
| `DELETE /social/follow/:userId` | Bearer token. | Set follow button to unfollowed and refresh follower counters. |
| `GET /social/follow/status/:userId` | Bearer token. | Use for profile button state sync on mount/refresh. |
| `GET /social/follow-requests` | Bearer token + optional `page`, `limit`. | Render incoming requests queue with pagination. |
| `POST /social/follow-requests/:requestId/accept` | Bearer token. | Remove request from queue and update follower counts/badges. |
| `POST /social/follow-requests/:requestId/reject` | Bearer token. | Remove request from queue without follow state change. |
| `GET /social/followers/:userId` | Bearer token + optional `page`, `limit`. | Render followers tab with pagination and total count. |
| `GET /social/following/:userId` | Bearer token + optional `page`, `limit`. | Render following tab with pagination and total count. |
| `GET /social/mutual/:userId` | Bearer token. | Show mutual connections list/chips in profile context. |
| `GET /social/suggestions` | Bearer token + optional `limit`. | Render suggestion cards and consume lazily. |
| `POST /social/block/:userId` | Bearer token. | Immediately hide blocked user's content and invalidate active chat/thread views. |
| `DELETE /social/block/:userId` | Bearer token. | Allow profile/content to appear again after unblock. |
| `GET /social/blocked` | Bearer token + optional `page`, `limit`. | Render blocked users management list. |
| `POST /social/mute/:userId` | Bearer token. | Hide muted user's content from feeds according to UI rules. |
| `DELETE /social/mute/:userId` | Bearer token. | Restore muted user's content in feed composition. |
| `GET /social/muted` | Bearer token + optional `page`, `limit`. | Render muted users management list. |

### Circles Contract

| Endpoint | Frontend must send | Frontend must do after response |
|---|---|---|
| `GET /circles` | Optional `q`, `page`, `limit`. | Render discover circles list with pagination. |
| `GET /circles/view/:identifier` | Optional bearer token. | Render circle details; respect membership/permission fields in response. |
| `GET /circles/me/memberships` | Bearer token. | Build "My Circles" dashboard from returned memberships. |
| `POST /circles` | Bearer token + JSON: `name` required; optional `slug`, `description`, `visibility`, `tags`, `icon`, `banner`. | Route user to newly created circle page from returned circle object. |
| `POST /circles/invites/:code/redeem` | Bearer token; invite code in path. | Join user to circle and refresh memberships + circle header stats. |
| `GET /circles/:circleId/members` | Bearer token. | Render members directory from returned member objects. |
| `GET /circles/:circleId/channels` | Bearer token. | Render channel list in returned order. |
| `GET /circles/:circleId/roles` | Bearer token. | Populate role management UI. |
| `POST /circles/:circleId/roles` | Bearer token + JSON: `name`, optional `permissions`, `priority`. | Insert new role into role table from response. |
| `POST /circles/:circleId/roles/assign` | Bearer token + JSON: `memberId`, `roleId`, optional `assign` boolean. | Update member role badges from returned membership. |
| `GET /circles/:circleId/invites` | Bearer token. | Render invite admin list with status/usage. |
| `POST /circles/:circleId/invites` | Bearer token + optional `expiresAt`, `maxUses`. | Show generated invite code and copy/share controls. |
| `POST /circles/:circleId/join` | Bearer token. | Update join button and circle member count instantly from response. |
| `POST /circles/:circleId/leave` | Bearer token. | Remove circle from "My Circles" and route away if user is in that circle view. |
| `POST /circles/:circleId/channels` | Bearer token + JSON: `name` required; optional `kind`, `topic`, `visibility`. | Add created channel to channel list. |
| `POST /circles/:circleId/channels/:channelId/pin` | Bearer token + optional JSON: `pinned` (default true). | Reflect pinned state in channel ordering and pin icon. |
| `POST /circles/:circleId/posts/:postId/pin` | Bearer token + optional JSON: `pinned` (default true). | Reflect pinned posts widget from returned `pinnedPostIds`. |

### Messages Contract

| Endpoint | Frontend must send | Frontend must do after response |
|---|---|---|
| `GET /messages/channels/:circleId/:channelId` | Bearer token + optional `page`, `limit`. | Render channel thread; paginate older messages upward. |
| `POST /messages/channels/:circleId/:channelId` | Bearer token + JSON: `bodyText`; optional `replyToMessageId`. | Append returned message and reconcile optimistic placeholder by id/timestamp. |
| `GET /messages/reads` | Bearer token. | Hydrate unread badges/read receipts state. |
| `POST /messages/reads` | Bearer token + JSON: `scopeType`, `scopeId`, optional `lastReadMessageId`. | Update read indicators and unread counters. |
| `GET /messages/dm/conversations` | Bearer token. | Render DM inbox list sorted by server order. |
| `POST /messages/dm/conversations/:userId` | Bearer token. | Open or create DM thread and route to conversation UI. |
| `GET /messages/dm/conversations/:conversationId/messages` | Bearer token + optional `page`, `limit`. | Render DM messages with pagination; use server as source of truth. |
| `POST /messages/dm/conversations/:conversationId/messages` | Bearer token + JSON: `bodyText`. | Append returned DM message and sync optimistic state. |

### Notifications Contract

| Endpoint | Frontend must send | Frontend must do after response |
|---|---|---|
| `GET /notifications` | Bearer token + optional `page`, `limit`. | Render notifications list and unread badge using returned `unreadCount`. |
| `GET /notifications/unread-count` | Bearer token. | Poll or refresh badge count in header/nav. |
| `PATCH /notifications/read-all` | Bearer token. | Mark all local notifications as read and set unread badge to zero. |
| `PATCH /notifications/:notificationId/read` | Bearer token. | Mark only that notification as read in local list. |

### Notification Preferences Contract

| Endpoint | Frontend must send | Frontend must do after response |
|---|---|---|
| `GET /notifications/preferences` | Bearer token. | Hydrate preferences form toggles from response. |
| `PUT /notifications/preferences` | Bearer token + nested boolean matrix (`email`, `push`, `sms` actions). | Persist toggles and display save confirmation. |
| `GET /notifications/preferences/defaults` | Bearer token. | Use to power "Reset to default preview" UI. |
| `POST /notifications/preferences/reset` | Bearer token. | Replace form state with returned defaults. |
| `POST /notifications/preferences/enable-all` | Bearer token. | Set all toggles to on in UI using response payload. |
| `POST /notifications/preferences/disable-all` | Bearer token. | Set all toggles to off in UI using response payload. |
| `GET /notifications/preferences/summary` | Bearer token. | Render compact settings summary (enabled counts per channel). |
| `POST /notifications/preferences/test` | Bearer token + optional query `type`. | Show immediate toast/status that test notification was sent. |

### Feed Contract

| Endpoint | Frontend must send | Frontend must do after response |
|---|---|---|
| `GET /feed/home` | Bearer token + optional `page`, `limit`, `useCache`. | Render following feed from `items`/`feed`/`posts`; respect pagination from response. |
| `POST /feed/home/refresh` | Bearer token. | Invalidate local feed cache and re-fetch first page after success. |
| `GET /feed/sphere` | Bearer token + optional `page`, `limit`, `mode`, `useCache`. | Render discovery feed and mode switcher (`top`/`latest`) using server results. |
| `GET /feed/sphere/category/:category` | Bearer token + optional `page`, `limit`, `mode`. | Render category-filtered discovery feed. |
| `GET /feed/ranking/:postId` | Bearer token. | Use only for internal debug tooling, not regular end-user surfaces. |

### Trending Contract

| Endpoint | Frontend must send | Frontend must do after response |
|---|---|---|
| `GET /trending/hashtags` | Optional auth + optional `limit`, `category`, `timeWindow`. | Render hashtag trends and trend deltas from response list. |
| `GET /trending/topics` | Optional auth + optional `limit`, `category`, `status`, `timeWindow`. | Render topic trends and filters from query params. |
| `GET /trending/categories` | No auth. | Use to build trend category tabs/selectors. |
| `GET /trending/stats` | No auth. | Show analytics counters in admin/insight widgets. |
| `GET /trending/category/:category` | Bearer token + optional `limit`, `status`. | Render category-specific trending cards. |
| `GET /trending/hashtag/:tag` | Bearer token. | Render hashtag detail page and related tags. |
| `GET /trending/topic/:topic/:type?` | Bearer token. | Render topic details; default `type` is backend-defined fallback. |
| `GET /trending/region/:region` | Bearer token + optional `limit`. | Render regional trend widgets/maps. |
| `GET /trending/search` | Bearer token + required `q`; optional `limit`. | Debounce search and show empty state when `q` is missing. |

### Search Contract

| Endpoint | Frontend must send | Frontend must do after response |
|---|---|---|
| `GET /search` | Required `q`; optional `type` (`all`, `users`, `posts`, `circles`, `categories`), optional `limit`. | Use returned grouped arrays (`users`, `posts`, `circles`, `categories`) and avoid client-side regrouping logic. |

### Payments Contract

| Endpoint | Frontend must send | Frontend must do after response |
|---|---|---|
| `POST /payments/webhook` | Backend-to-backend only (Paystack signature). | Frontend must never call this endpoint directly. |
| `POST /payments/initialize` | Bearer token + JSON: `amount` required, optional `metadata`. | Redirect user to payment authorization URL returned by backend/paystack payload. |
| `GET /payments/verify/:reference` | Bearer token + reference path param. | Confirm transaction state and update subscription/purchase UI accordingly. |
| `GET /payments/history` | Bearer token. | Render payment history list (currently may be empty placeholder). |

### Moderation Contract

| Endpoint | Frontend must send | Frontend must do after response |
|---|---|---|
| `POST /moderation/reports` | Bearer token + JSON: `targetType`, `targetId`, `reasonCode`; optional `detailsText`. | Show report submitted confirmation and disable duplicate report action for same target. |
| `GET /moderation/reports` | Bearer token (admin/moderator) + optional `status`, `page`, `limit`. | Render moderation queue with pagination and status filters. |
| `POST /moderation/reports/:reportId/actions` | Bearer token (admin/moderator) + JSON: `actionType`, optional `reasonText`. | Update moderation queue row status and surface applied action details. |
| `GET /moderation/audit-logs` | Bearer token (admin/moderator) + optional `objectType`, `actionType`, `page`, `limit`. | Render audit timeline and preserve server ordering. |

---

## Realtime (WebSocket)

Wemsty uses Socket.IO with the `/realtime` namespace.

### Connection Rules

- Use a valid **access token** in `auth.token` when connecting.
- Namespace must be `/realtime` (not root namespace).
- On token refresh, update `socket.auth.token` and reconnect.

### Frontend Listener Template

```javascript
import { io } from 'socket.io-client';

let socket;

export function connectRealtime(accessToken, handlers = {}) {
  socket = io('https://wemsty-backend.onrender.com/realtime', {
    transports: ['websocket'],
    auth: { token: accessToken }
  });

  socket.on('connect', () => {
    handlers.onConnect?.(socket.id);
  });

  socket.on('connect_error', (err) => {
    handlers.onError?.(err);
  });

  // Post live updates
  socket.on('post.liked.updated', (payload) => handlers.onPostLiked?.(payload));
  socket.on('post.reposted.updated', (payload) => handlers.onPostReposted?.(payload));
  socket.on('post.created', ({ post }) => handlers.onPostCreated?.(post));

  // Backward-compatible aliases (optional)
  socket.on('post:liked', (payload) => handlers.onPostLiked?.(payload));
  socket.on('post:reposted', (payload) => handlers.onPostReposted?.(payload));

  // Messaging and notifications
  socket.on('channel.message.created', ({ message }) => handlers.onChannelMessage?.(message));
  socket.on('dm.message.created', ({ message }) => handlers.onDmMessage?.(message));
  socket.on('notifications.unread.updated', (payload) => handlers.onUnreadCount?.(payload));

  // Presence and typing
  socket.on('presence.updated', (payload) => handlers.onPresence?.(payload));
  socket.on('channel.typing.updated', (payload) => handlers.onTyping?.(payload));

  return socket;
}

export function updateRealtimeToken(newAccessToken) {
  if (!socket) return;
  socket.auth = { token: newAccessToken };
  socket.disconnect();
  socket.connect();
}

export function disconnectRealtime() {
  if (!socket) return;
  socket.disconnect();
  socket = null;
}
```

Basic connection example:

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3001/realtime', {
  auth: {
    token: 'your_jwt_access_token'
  }
});
```

### Client -> Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `channel.join` | `{ channelId, circleId? }` | Join a channel room |
| `channel.leave` | `{ channelId }` | Leave a channel room |
| `channel.message.create` | `{ channelId, circleId?, bodyText, clientMessageId?, replyToMessageId? }` | Send channel message |
| `dm.open` | `{ conversationId }` or `{ userId }` | Open/create DM conversation |
| `dm.message.create` | `{ conversationId, bodyText, clientMessageId? }` | Send DM message |
| `channel.typing.start` | `{ channelId, circleId? }` | Start typing state |
| `channel.typing.stop` | `{ channelId }` | Stop typing state |
| `read.update` | `{ scopeType, scopeId, lastReadMessageId? }` | Update read state |
| `presence.heartbeat` | `{ status: "online" | "away" | "offline" }` | Update presence |

### Server -> Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `notifications.unread.updated` | `{ unreadCount }` | Unread notification count changed |
| `channel.message.created` | `{ message }` | New channel message |
| `dm.message.created` | `{ message }` | New DM message |
| `presence.updated` | `{ userId, status, at }` | Presence state changed |
| `channel.typing.updated` | `{ channelId, userIds }` | Channel typing users updated |
| `post.created` | `{ post }` | New post published |
| `post:liked` | `{ postId, likesCount, userId, liked, isLiked }` | Legacy like update event (emitted only if `ENABLE_SOCKET_LEGACY_EVENTS=true`) |
| `post.liked.updated` | `{ postId, likesCount, userId, liked, isLiked }` | Primary like update event |
| `post:reposted` | `{ postId, repostsCount, userId, reposted }` | Legacy repost update event (emitted only if `ENABLE_SOCKET_LEGACY_EVENTS=true`) |
| `post.reposted.updated` | `{ postId, repostsCount, userId, reposted }` | Primary repost update event |

Realtime handling tip:
- Always update counts (`likesCount`, `repostsCount`) for everyone.
- Only update the current user's local button state from socket when `payload.userId === currentUserId`.

Ack pattern:
- Most client-emitted events support callback ack.
- Success shape: `{ ok: true, ... }`
- Failure shape: `{ ok: false, error: { code, message } }`

---

## Data Models

These are representative structures and may include additional fields.

### User

```javascript
{
  _id: "ObjectId",
  email: "user@example.com",
  username: "johndoe",
  accountStatus: "active",
  isEmailVerified: true,
  role: "user",
  profile: {
    firstName: "John",
    lastName: "Doe",
    displayName: "John Doe",
    avatar: "avatar_url",
    bio: "User bio",
    location: "City, Country",
    website: "https://example.com",
    phoneNumber: "+2348000000000"
  },
  followers_count: 100,
  following_count: 50,
  posts_count: 25,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
}
```

### Post

```javascript
{
  _id: "ObjectId",
  author: "user_id",
  postType: "original",
  category: "general",
  content: {
    text: "Post content",
    media: [{ type: "image", url: "https://..." }]
  },
  visibility: "public",
  sphereEligible: true,
  originalPost: null,
  parentPost: null,
  replyTo: null,
  engagement: {
    likes: 42,
    comments: 10,
    reposts: 5,
    views: 100
  },
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
}
```

### Notification

```javascript
{
  _id: "ObjectId",
  user: "user_id",
  type: "like",
  actor: "user_id",
  target: "post_id",
  message: "John liked your post",
  isRead: false,
  createdAt: "2024-01-01T00:00:00.000Z"
}
```

### Circle

```javascript
{
  _id: "ObjectId",
  name: "My Circle",
  slug: "my-circle",
  description: "Circle description",
  avatar: "avatar_url",
  owner: "user_id",
  isPrivate: false,
  membersCount: 50,
  channels: ["channel_id1", "channel_id2"],
  createdAt: "2024-01-01T00:00:00.000Z"
}
```

---

## Additional Notes

### File Uploads
Current state:
- Profile avatar is stored as a URL string (`profile.avatar`).
- Dedicated profile image upload endpoints are not wired yet in this codebase.
- For now, upload media using your own storage flow and save the returned URL.

### Sorting
Some list endpoints support sorting. Use endpoint-specific `sort` values where provided.

### CORS
In development, CORS allows all origins. Restrict allowed origins in production configuration.

### Kafka (Event Streaming)
Kafka is used for asynchronous background events (post activity, search indexing, notifications).

Production env vars:
- `KAFKA_BROKERS` (comma-separated, e.g. `broker1:9092,broker2:9092`)
- `KAFKA_CLIENT_ID` (optional, default: `wemsty-backend`)
- `KAFKA_PARTITIONS` (optional, default: `3`)
- `KAFKA_REPLICATION` (optional, default: `1`)

Runtime behavior:
- Backend tries to connect to Kafka at startup.
- If Kafka is unavailable, API still runs (fail-open), but events are not streamed.
- You should see `Kafka: Connected` in logs when healthy.

### Common Beginner Issues
- `401 Unauthorized`: Access token missing, expired, or wrong token type.
- `400 Invalid updates`: You sent disallowed fields in `PATCH /users/profile`.
- `403 Forbidden`: Account status/role does not allow the action.
- `404 Not Found`: Route is correct but resource id/username does not exist.
- `429 Too Many Requests`: Wait for `retryAfter` and retry later.
- `Post already liked/reposted/bookmarked`: this is expected for idempotent `POST` interaction endpoints.
- `Post already unliked/unreposted/unbookmarked`: this is expected for idempotent `DELETE` interaction endpoints.

---

**Last updated:** 2026-04-11
