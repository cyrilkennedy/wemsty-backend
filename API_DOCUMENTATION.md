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
  - [Current Mounted API Surface](#current-mounted-api-surface)
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
  - [Media & Universal Assets](#media--universal-assets)
  - [Queue Dashboard](#queue-dashboard)
  - [Payments](#payments)
  - [Moderation](#moderation)
  - [Mobile Updates](#mobile-updates)
- [Frontend Engineer Contract (Per API)](#frontend-engineer-contract-per-api)
- [Realtime (WebSocket)](#realtime-websocket)
- [Data Models](#data-models)
- [Environment Variables & Infrastructure](#environment-variables--infrastructure)
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
- API server is running on `https://api.wemsty.com`
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
curl -X POST https://api.wemsty.com/api/auth/signup ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"junior@example.com\",\"username\":\"junior_dev\",\"password\":\"password123\"}"
```

2. Login and copy `data.accessToken` from the response

```bash
curl -X POST https://api.wemsty.com/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"junior@example.com\",\"password\":\"password123\"}"
```

3. Get my profile

```bash
curl https://api.wemsty.com/api/users/profile ^
  -H "Authorization: Bearer <accessToken>"
```

4. Update profile (bio + avatar URL)

```bash
curl -X PATCH https://api.wemsty.com/api/users/profile ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer <accessToken>" ^
  -d "{\"profile\":{\"displayName\":\"Junior Dev\",\"bio\":\"Building with Wemsty API\",\"avatar\":\"https://example.com/avatar.jpg\"}}"
```

---

## API Conventions

### Base URL

All routes are relative to:

```text
https://api.wemsty.com/api
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

The standard response shape for new and production-hardened endpoints is:

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {},
  "meta": {}
}
```

Some older controllers still return this legacy success shape:

```json
{
  "status": "success",
  "message": "Operation completed successfully",
  "data": {}
}
```

Standard error shape:

```json
{
  "success": false,
  "message": "Validation or request error",
  "code": "VALIDATION_ERROR",
  "errors": []
}
```

Some legacy errors may still use:

```json
{
  "status": "fail",
  "message": "Validation or request error"
}
```

Development-only server errors may include stack traces:

```json
{
  "success": false,
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

Paginated responses usually include either `pagination` in `data` or `meta.pagination`:

```json
{
  "success": true,
  "data": {
    "items": []
  },
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "pages": 5
    }
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

### Current Mounted API Surface

All mounted routes below are relative to:

```text
https://api.wemsty.com/api
```

Root service route:

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/` | Public | API welcome JSON with version |

Health and operations:

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/health` | Public | JSON health for API clients, HTML status page for browsers |
| GET | `/health/deep` | Public or token-protected | Deep health, protected by `x-healthcheck-token` when `HEALTHCHECK_TOKEN` is set |
| ANY | `/queues/*` | Private dashboard token | Bull Board queue dashboard, requires `x-queue-dashboard-token` or bearer `QUEUE_DASHBOARD_TOKEN` |

Authentication:

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| POST | `/auth/signup` | Public | Register account |
| POST | `/auth/login` | Public | Login |
| POST | `/auth/google` | Public | Google OAuth login |
| POST | `/auth/refresh` | Public + refresh token | Refresh access token |
| POST | `/auth/forgot-password` | Public | Legacy password reset request |
| POST | `/auth/reset-password` | Public | Legacy password reset completion |
| POST | `/auth/verify-email` | Public | Verify email token |
| POST | `/auth/password-reset/request` | Public | Send password reset OTP |
| POST | `/auth/password-reset/verify-otp` | Public | Verify OTP and return reset token |
| POST | `/auth/password-reset/reset` | Public | Reset with `resetToken + newPassword` or `email + otp + newPassword` |
| POST | `/auth/password-reset/feedback` | Public | Submit reset feedback |
| POST | `/auth/password-reset/resend-otp` | Public | Resend reset OTP |
| GET | `/auth/me` | Private | Current authenticated user |
| POST | `/auth/logout` | Private | Logout current session |
| POST | `/auth/logout-all` | Private | Logout all sessions |
| GET | `/auth/sessions` | Private | List active sessions without token hashes |
| DELETE | `/auth/sessions/:sessionId` | Private | Revoke one session |
| POST | `/auth/change-password` | Private | Change password while logged in |
| POST | `/auth/resend-verification` | Private | Resend verification email |

Users and social:

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/users/handle/:username` | Public optional auth | Public profile |
| GET | `/users/profile` | Private | Own profile |
| PATCH | `/users/profile` | Private | Update own profile |
| PATCH | `/users/feed-preferences` | Private | Update onboarding and muted topics for the feed algorithm |
| POST | `/users/:userId/profile-click` | Private | Track profile visit/click affinity |
| DELETE | `/users/account` | Private | Delete/deactivate own account |
| GET | `/users` | Admin/moderator | Admin user list |
| PATCH | `/users/:id/role` | Admin | Update role |
| PATCH | `/users/:id/status` | Admin/moderator | Update status |
| POST | `/social/follow/:userId` | Private | Follow user |
| DELETE | `/social/follow/:userId` | Private | Unfollow user |
| GET | `/social/follow/status/:userId` | Private | Follow status |
| GET | `/social/follow-requests` | Private | Pending follow requests |
| POST | `/social/follow-requests/:requestId/accept` | Private | Accept follow request |
| POST | `/social/follow-requests/:requestId/reject` | Private | Reject follow request |
| GET | `/social/followers/:userId` | Private | Followers |
| GET | `/social/following/:userId` | Private | Following |
| GET | `/social/mutual/:userId` | Private | Mutual followers |
| GET | `/social/suggestions` | Private | Follow suggestions |
| GET | `/social/relationship/:userId` | Private | Combined follow/mute/block profile button state |
| POST | `/social/block/:userId` | Private | Block user |
| DELETE | `/social/block/:userId` | Private | Unblock user |
| GET | `/social/blocked` | Private | Blocked users |
| POST | `/social/mute/:userId` | Private | Mute user |
| DELETE | `/social/mute/:userId` | Private | Unmute user |
| GET | `/social/muted` | Private | Muted users |
| GET | `/social/relationship/:userId` | Private | Combined follow/mute/block relationship status |

Posts and feeds:

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/posts/trending` | Public optional auth | Trending posts |
| GET | `/posts/categories` | Public | Post categories |
| GET | `/posts/sphere` | Public optional auth | Public Sphere feed |
| GET | `/posts/category/:categorySlug` | Public optional auth | Category feed |
| GET | `/posts/search` | Public optional auth | Post search |
| GET | `/posts/likes/me` | Private | Current user's liked posts |
| GET | `/posts/:postId` | Public optional auth | Single post |
| GET | `/posts/:postId/thread` | Public optional auth | Post thread |
| GET | `/posts/:postId/reposts` | Public optional auth | Users who reposted the post |
| GET | `/posts/:postId/quotes` | Public optional auth | Quote reposts for the post |
| POST | `/posts/:postId/view` | Public optional auth | Track meaningful post view |
| POST | `/posts/:postId/engagement` | Private | Track feed algorithm signals such as dwell, hide, not interested, profile click, and link click |
| POST | `/posts/:postId/link-click` | Private | Track outbound link click for ranking |
| GET | `/posts/user/:username` | Public optional auth | User profile post feed |
| GET | `/posts/user/:username/media` | Public optional auth | User media posts |
| GET | `/posts/user/:username/reposts` | Public optional auth | User reposts and quote reposts |
| GET | `/posts/feed/home` | Private deprecated | Compatibility home feed; prefer `/feed/home` |
| GET | `/posts/feed/sphere` | Private deprecated | Compatibility Sphere feed; prefer `/feed/sphere` |
| POST | `/posts` | Private | Create post |
| POST | `/posts/repost` | Private | Create/update repost or quote |
| DELETE | `/posts/repost/:postId` | Private | Remove repost/quote |
| POST | `/posts/reply` | Private | Create reply/comment |
| PATCH | `/posts/reply/:replyId` | Private | Edit reply/comment |
| DELETE | `/posts/reply/:replyId` | Private | Delete reply/comment |
| POST | `/posts/reply/:replyId/like` | Private | Like reply idempotently |
| DELETE | `/posts/reply/:replyId/like` | Private | Unlike reply idempotently |
| POST | `/posts/:postId/like` | Private | Like post idempotently |
| DELETE | `/posts/:postId/like` | Private | Unlike post idempotently |
| GET | `/posts/:postId/likes` | Private | List post likes |
| POST | `/posts/:postId/bookmark` | Private | Bookmark idempotently |
| DELETE | `/posts/:postId/bookmark` | Private | Remove bookmark idempotently |
| GET | `/posts/bookmarks/me` | Private | Own bookmarks |
| DELETE | `/posts/:postId` | Private | Delete own post |
| GET | `/feed/home` | Private | Official home feed |
| POST | `/feed/home/refresh` | Private | Refresh feed cache |
| GET | `/feed/sphere` | Private | Official Sphere feed |
| GET | `/feed/sphere/category/:category` | Private | Official category feed |
| GET | `/feed/ranking/:postId` | Private | Ranking/debug info |

Circles, messages, notifications, search, payments, moderation, and mobile:

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/circles` | Public | List circles |
| GET | `/circles/view/:identifier` | Public optional auth | View circle |
| GET | `/circles/me/memberships` | Private | Own circle memberships |
| POST | `/circles` | Private | Create circle |
| POST | `/circles/invites/:code/redeem` | Private | Redeem invite |
| GET | `/circles/:circleId/members` | Private | Circle members |
| GET | `/circles/:circleId/channels` | Private | Circle channels |
| GET | `/circles/:circleId/roles` | Private | Circle roles |
| POST | `/circles/:circleId/roles` | Private | Create role |
| POST | `/circles/:circleId/roles/assign` | Private | Assign/remove role |
| GET | `/circles/:circleId/invites` | Private | Circle invites |
| POST | `/circles/:circleId/invites` | Private | Create invite |
| POST | `/circles/:circleId/join` | Private | Join circle |
| POST | `/circles/:circleId/leave` | Private | Leave circle |
| POST | `/circles/:circleId/channels` | Private | Create channel |
| POST | `/circles/:circleId/channels/:channelId/pin` | Private | Pin/unpin channel |
| POST | `/circles/:circleId/posts/:postId/pin` | Private | Pin/unpin post |
| GET | `/messages/channels/:circleId/:channelId` | Private | Channel messages |
| POST | `/messages/channels/:circleId/:channelId` | Private | Send channel message |
| GET | `/messages/reads` | Private | Read states |
| POST | `/messages/reads` | Private | Update read state |
| GET | `/messages/dm/conversations` | Private | DM conversations |
| GET | `/messages/dm/conversations/search` | Private | Search DM conversations |
| POST | `/messages/dm/conversations/:userId` | Private | Get/create DM conversation |
| GET | `/messages/dm/conversations/:conversationId/messages` | Private | DM messages |
| POST | `/messages/dm/conversations/:conversationId/messages` | Private | Send DM |
| GET | `/notifications` | Private | Notification list |
| GET | `/notifications/unread-count` | Private | Unread count |
| PATCH | `/notifications/read-all` | Private | Mark all read |
| PATCH | `/notifications/:notificationId/read` | Private | Mark one read |
| GET | `/notifications/preferences` | Private | Notification preferences |
| PUT | `/notifications/preferences` | Private | Update preferences |
| GET | `/notifications/preferences/defaults` | Private | Defaults |
| POST | `/notifications/preferences/reset` | Private | Reset preferences |
| POST | `/notifications/preferences/enable-all` | Private | Enable all |
| POST | `/notifications/preferences/disable-all` | Private | Disable all |
| GET | `/notifications/preferences/summary` | Private | Preference summary |
| POST | `/notifications/preferences/test` | Private | Test notification |
| GET | `/search` | Public | Unified search |
| GET | `/trending/hashtags` | Public | Trending hashtags |
| GET | `/trending/topics` | Public | Trending topics |
| GET | `/trending/categories` | Public | Trending categories |
| GET | `/trending/stats` | Public | Trending stats |
| GET | `/trending/category/:category` | Private | Category trending |
| GET | `/trending/hashtag/:tag` | Private | Hashtag details |
| GET | `/trending/topic/:topic{/:type}` | Private | Topic details |
| GET | `/trending/region/:region` | Private | Regional trending |
| GET | `/trending/search` | Private | Trending search |
| POST | `/payments/webhook` | Public Paystack signature | Paystack webhook |
| POST | `/payments/initialize` | Private | Initialize payment |
| GET | `/payments/verify/:reference` | Private | Verify payment |
| GET | `/payments/history` | Private | Payment history |
| GET | `/moderation/report-reasons` | Public | Report reason list |
| POST | `/moderation/reports` | Private | Create report |
| GET | `/moderation/reports` | Admin/moderator | List reports |
| POST | `/moderation/reports/:reportId/actions` | Admin/moderator | Take moderation action |
| GET | `/moderation/audit-logs` | Admin/moderator | Audit logs |
| GET | `/mobile/update-check` | Public | Mobile update check |
| GET | `/mobile/update-download/:assetId` | Public | Proxy update asset download |

Media routes are documented in detail in [Media & Universal Assets](#media--universal-assets).

---

### Health

#### GET `/health`
Check public API status.

Access: `Public`

Behavior:
- `Accept: application/json` returns JSON.
- Browser requests with `Accept: text/html` return an animated "Wemsty is running" page.
- This endpoint does not expose MongoDB/Redis/Kafka internals.

Example JSON response:

```json
{
  "success": true,
  "message": "Wemsty Backend is running",
  "data": {
    "version": "4.0",
    "environment": "production",
    "uptime": 12345,
    "timestamp": "2026-05-17T00:00:00.000Z"
  }
}
```

#### GET `/health/deep`
Check deeper infrastructure status.

Access: `Public` unless `HEALTHCHECK_TOKEN` is configured. When configured, send:

```http
x-healthcheck-token: <HEALTHCHECK_TOKEN>
```

Deep health may return `200` for healthy/degraded states or `503` when MongoDB is unavailable.

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
| GET | `/auth/sessions` | Private | List active device sessions |
| DELETE | `/auth/sessions/:sessionId` | Private | Revoke a specific session |
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
  "resetToken": "verified_token_from_step_2",
  "newPassword": "new_password_at_least_8_chars"
}
```

Direct OTP reset also works on the same reset endpoint:

```json
{
  "email": "user@example.com",
  "otp": "123456",
  "newPassword": "new_password_at_least_8_chars"
}
```

#### Detailed OTP Reset Flow (Steps)

**Step 1: Request OTP**
`POST /auth/password-reset/request`
Payload: `{"email": "user@example.com"}`
Response: `{"status": "success", "message": "Verification code sent..."}`

**Step 2: Verify OTP**
`POST /auth/password-reset/verify-otp`
Payload: `{"email": "user@example.com", "otp": "123456"}`
Response:
```json
{
  "status": "success",
  "data": {
    "resetToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "30 minutes"
  }
}
```

**Step 3: Complete Reset**
`POST /auth/password-reset/reset`
Payload option A: `{"resetToken": "<token_from_step_2>", "newPassword": "newpassword123"}`
Payload option B: `{"email": "user@example.com", "otp": "123456", "newPassword": "newpassword123"}`
Response: `{"status": "success", "message": "Password reset successful!"}`

Session management:

```http
GET /api/auth/sessions
Authorization: Bearer <accessToken>
```

The session list never returns raw refresh tokens or token hashes.

```http
DELETE /api/auth/sessions/:sessionId
Authorization: Bearer <accessToken>
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
| PATCH | `/users/feed-preferences` | Private | Update onboarding and muted topics for the feed algorithm |
| POST | `/users/:userId/profile-click` | Private | Track profile visit/click affinity |
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
    "country": "NG",
    "website": "https://johndoe.com",
    "phoneNumber": "+2348000000000"
  }
}
```

Common mistake:
- Sending `"displayName"` at root level will not update the profile.
- Use `"profile.displayName"` via nested `profile` object.

Feed preferences payload:

```http
PATCH /api/users/feed-preferences
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "onboardingTopics": ["tech", "football", "afrobeats"],
  "mutedTopics": ["politics"]
}
```

Behavior:
- `onboardingTopics` power the cold-start feed before a user has enough engagement history.
- `mutedTopics` are removed from personalized feed candidates.
- Topics are normalized to lowercase and deduplicated.

Profile media note:
- `profile.avatar` is currently a string URL field.
- Use [Media & Universal Assets](#media--universal-assets) to upload/register avatar, cover photo, banner, raw file, or text assets.
- `profile.avatar` can store the returned asset URL.
- Cover photo/banner can be stored as a media asset with `usage: "cover_photo"` or `usage: "profile_banner"`.
- `coverImage` is not currently part of the `User` schema, so keep cover/banner state in the media asset registry until the user schema is extended.

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
| GET | `/posts/likes/me` | Private | Current user's liked posts, newest liked first |
| GET | `/posts/:postId` | Public (Optional Auth) | Get a single post |
| GET | `/posts/:postId/thread` | Public (Optional Auth) | Thread view (post + replies) |
| GET | `/posts/:postId/reposts` | Public (Optional Auth) | Users who reposted/quoted a post |
| GET | `/posts/:postId/quotes` | Public (Optional Auth) | Quote reposts of a post |
| POST | `/posts/:postId/view` | Public (Optional Auth) | Track a meaningful post view |
| GET | `/posts/user/:username` | Public (Optional Auth) | User post feed |
| GET | `/posts/user/:username/media` | Public (Optional Auth) | User media posts |
| GET | `/posts/user/:username/reposts` | Public (Optional Auth) | User reposts and quote reposts |
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

Official feed endpoints:

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/feed/home` | Private | Home/following feed |
| POST | `/feed/home/refresh` | Private | Refresh feed cache |
| GET | `/feed/sphere` | Private | Authenticated Sphere feed |
| GET | `/feed/sphere/category/:category` | Private | Authenticated category feed |
| GET | `/feed/ranking/:postId` | Private | Debug ranking info |

Compatibility note:
- `/posts/feed/home` and `/posts/feed/sphere` still work but return deprecation headers.
- Prefer `/feed/*` for all new frontend code.

Common query params:
- `page`, `limit`
- `category` where applicable
- `sort` for `/posts/search`: `relevance`, `recent`, `popular`
- `type` for `/posts/user/:username`: `posts`, `replies`, `all`, `media`, `reposts`

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
- My liked posts: `GET /posts/likes/me`
- Repost/quote create: `POST /posts/repost`
- Explicit unrepost: `DELETE /posts/repost/:postId`
- Who reposted: `GET /posts/:postId/reposts`
- Quote posts: `GET /posts/:postId/quotes`
- User media tab: `GET /posts/user/:username/media` or `/posts/user/:username?type=media`
- User repost tab: `GET /posts/user/:username/reposts` or `/posts/user/:username?type=reposts`
- Algorithm signal tracking: `POST /posts/:postId/engagement`

Post view tracking:

```http
POST /api/posts/:postId/view
Authorization: Bearer <accessToken optional>
```

Behavior:
- Counts at most one view per viewer identity per post per short time window.
- Logged-in author views are ignored.
- Guests are grouped by `x-device-id`, `x-client-id`, or IP fallback.
- Response includes `viewsCount` and `counted`.

Feed algorithm signal tracking:

```http
POST /api/posts/:postId/engagement
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Example body:

```json
{
  "action": "dwell",
  "dwellSeconds": 12,
  "source": "sphere_feed"
}
```

Supported `action` values are `impression`, `dwell`, `profile_click`, `link_click`, `hide`, and `not_interested`.

This endpoint writes an engagement event, updates viewer-author affinity, updates topic interest learning, and updates post algorithm counters such as impressions, average dwell time, hide rate, and not-interested rate. Wemsty uses this as a lightweight ML-style personalization layer without requiring a separate ML server yet.

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
- Prefer `/social/relationship/:userId` for profile pages because it returns `following`, `followedBy`, `pending`, `muted`, `blocked`, and `blockedBy` in one call.
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
| GET | `/messages/dm/conversations/search` | Private | Search DM conversations by participant or recent message text |
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
- Use `/messages/dm/conversations/search?q=<term>` for inbox search; do not fetch all conversations and filter locally.
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
| GET | `/feed/analytics?days=7` | Private/Admin, Moderator | Algorithm exposure, source, variant, and topic analytics |
| GET | `/feed/ranking/:postId` | Private | Ranking debug data |

Feed queries commonly use `page` and `limit`.

Sphere feed supports optional algorithm controls:

```http
GET /api/feed/sphere?page=1&limit=20&mode=top&variant=balanced
Authorization: Bearer <accessToken>
```

Supported variants:
- `balanced`: default all-round ranking.
- `fresh`: gives newer posts more room.
- `social`: gives relationship and affinity signals more weight.

If `variant` is omitted, Wemsty assigns a stable variant per user and algorithm version for lightweight A/B testing.

Algorithm analytics response:

```json
{
  "success": true,
  "message": "Algorithm analytics loaded successfully",
  "data": {
    "algorithmVersion": "wemsty-v2",
    "eventsByAction": [],
    "exposuresBySource": [],
    "exposuresByVariant": [],
    "topTopics": []
  }
}
```

The feed system now records ranked feed exposures, updates those exposures from engagement events, learns short-session topic memory in Redis, and includes collaborative/vector-ready candidate sources. The vector source is disabled unless `ENABLE_VECTOR_RECOMMENDATIONS=true`.

#### Frontend Engineer Expectations
- Treat returned `items`, `feed`, and `posts` aliases as equivalent feed arrays.
- For pull-to-refresh/manual refresh UX, call `POST /feed/home/refresh` then refetch first page.
- Respect `mode` and cache flags from UI controls when calling sphere/discovery endpoints.
- Send real user events to `POST /posts/:postId/engagement` for `impression`, `view`, `dwell`, `hide`, `not_interested`, and other supported actions so ranking memory has clean training data.
- Gracefully handle feed throttling (`429`) with retry delay from `retryAfter`.

---

### Mobile Updates

Secure proxy for mobile application updates. Protects the GitHub Personal Access Token by fetching and streaming assets through the backend.

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/mobile/update-check` | Public | Check for latest mobile release |
| GET | `/mobile/update-download/:assetId` | Public | Stream update asset from GitHub |

#### Check Update Example
`GET /api/mobile/update-check`

Response:
```json
{
  "status": "success",
  "data": {
    "version": "1.0.5",
    "notes": "Bug fixes and performance improvements",
    "download_url": "https://api.wemsty.com/api/mobile/update-download/123456",
    "published_at": "2024-05-10T21:00:00Z"
  }
}
```

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

### Media & Universal Assets

Use these endpoints for avatars, cover photos, banners, post files, message files, random raw files, and simple text assets. The main storage endpoint is intentionally universal:

```text
POST https://api.wemsty.com/api/media/assets
```

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| POST | `/media/signature` | Private | Generate signed Cloudinary upload parameters for `image`, `video`, or `raw` uploads |
| POST | `/media/assets` | Private | Register uploaded media or store text in one endpoint |
| POST | `/media/register` | Private | Backward-compatible alias for `/media/assets` |
| GET | `/media/assets` | Private | List authenticated user's assets |
| PATCH | `/media/assets/:publicId` | Private | Update usage, attachment, metadata, tags, or text |
| DELETE | `/media/:publicId` | Private | Delete media from Cloudinary or mark text asset deleted |

Allowed `resourceType` values:

```text
image
video
raw
text
```

Rules:
- `image`, `video`, and `raw` assets should be uploaded to Cloudinary first, then registered with `/media/assets`.
- `text` assets do not need Cloudinary; they are stored directly by `/media/assets`.
- `usage` and `attachedToType` must be lowercase slugs like `cover_photo`, `profile_banner`, `avatar`, `post_attachment`, `profile_note`, or `random_file`.
- Do not store secrets, passwords, OTPs, tokens, or private keys in text assets.

#### Generate Upload Signature

```http
POST /api/media/signature
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Payload:

```json
{
  "usage": "cover_photo",
  "resourceType": "image"
}
```

Response:

```json
{
  "success": true,
  "message": "Upload signature generated",
  "data": {
    "cloudName": "your_cloud_name",
    "apiKey": "your_cloudinary_api_key",
    "timestamp": 1778966225,
    "folder": "wemsty/cover_photo",
    "usage": "cover_photo",
    "resourceType": "image",
    "signature": "cloudinary_signature"
  }
}
```

Frontend upload flow:
1. Call `/media/signature`.
2. Upload the file directly to Cloudinary using the returned fields.
3. Take Cloudinary's `public_id` and `secure_url`.
4. Register it with `/media/assets`.

#### Register Media

```http
POST /api/media/assets
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Cover photo example:

```json
{
  "publicId": "wemsty/cover_photo/abc123",
  "url": "https://res.cloudinary.com/wemsty/image/upload/v1/wemsty/cover_photo/abc123.jpg",
  "resourceType": "image",
  "usage": "cover_photo",
  "attachedToType": "profile_cover",
  "attachedToId": "USER_ID",
  "metadata": {
    "crop": "wide",
    "source": "profile-settings"
  },
  "tags": ["cover", "profile"]
}
```

Raw/random file example:

```json
{
  "publicId": "wemsty/random/file123",
  "url": "https://res.cloudinary.com/wemsty/raw/upload/v1/wemsty/random/file123.pdf",
  "resourceType": "raw",
  "usage": "random_file",
  "metadata": {
    "label": "User uploaded PDF"
  }
}
```

#### Store Text With The Same Endpoint

The backend auto-generates `publicId` for text assets when omitted.

```http
POST /api/media/assets
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Payload:

```json
{
  "resourceType": "text",
  "usage": "profile_note",
  "text": "Anything the app needs to store as text.",
  "metadata": {
    "screen": "profile-settings",
    "localDraftId": "draft-001"
  },
  "tags": ["profile", "note"]
}
```

Nested text also works:

```json
{
  "usage": "profile_note",
  "content": {
    "text": "Nested text also works."
  }
}
```

Success response:

```json
{
  "success": true,
  "message": "Media asset registered",
  "data": {
    "asset": {
      "_id": "asset_id",
      "publicId": "wemsty/text/USER_ID/1778966225000-uuid",
      "resourceType": "text",
      "usage": "profile_note",
      "text": "Anything the app needs to store as text.",
      "status": "uploaded",
      "metadata": {
        "screen": "profile-settings"
      },
      "tags": ["profile", "note"]
    }
  }
}
```

#### List Assets

```http
GET /api/media/assets?usage=cover_photo&page=1&limit=20
Authorization: Bearer <accessToken>
```

Query params:
- `usage`: optional asset usage filter
- `status`: optional status filter, for example `uploaded`, `attached`, `deleted`, `cleanup_failed`
- `page`: default `1`
- `limit`: default `20`, max `100`

#### Update Asset

```http
PATCH /api/media/assets/:publicId
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Payload:

```json
{
  "usage": "profile_banner",
  "attachedToType": "profile_banner",
  "attachedToId": "USER_ID",
  "metadata": {
    "crop": "center"
  },
  "tags": ["banner"]
}
```

Text update:

```json
{
  "text": "Updated text value"
}
```

#### Delete Asset

```http
DELETE /api/media/:publicId
Authorization: Bearer <accessToken>
```

Behavior:
- File assets are deleted from Cloudinary using their `resourceType`.
- Text assets are marked deleted without calling Cloudinary.
- Only the asset owner can delete their own asset.

#### Frontend Engineer Expectations

- Use `/media/assets` as the single universal storage endpoint.
- Use `usage` to explain what the asset is for.
- Store only Cloudinary `secure_url` as `url`.
- Keep `publicId`; it is needed for updates/deletes.
- Use the returned asset object to update local UI state.
- Use real post/message APIs for social content; text assets are for flexible app metadata, notes, labels, drafts, and simple stored text.

---

### Queue Dashboard

Bull Board is mounted at:

```text
https://api.wemsty.com/api/queues
```

Access: `Private operations token`

This dashboard is not authenticated with normal user JWT. It requires the deployment env var:

```env
QUEUE_DASHBOARD_TOKEN=<strong-random-token>
```

Then request with either:

```http
x-queue-dashboard-token: <QUEUE_DASHBOARD_TOKEN>
```

or:

```http
Authorization: Bearer <QUEUE_DASHBOARD_TOKEN>
```

If the token is missing from environment, the API returns:

```json
{
  "success": false,
  "message": "Queue dashboard is not configured",
  "code": "SERVICE_UNAVAILABLE",
  "errors": []
}
```

If the request token is wrong/missing, the API returns:

```json
{
  "success": false,
  "message": "Queue dashboard access denied",
  "code": "FORBIDDEN",
  "errors": []
}
```

Queues shown:
- email
- notifications
- search indexing
- feed
- payment
- moderation
- media
- maintenance
- dead letter

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
| GET | `/moderation/report-reasons` | Public | List report reasons for UI |
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

### Full Request/Response Matrix

This is the quick frontend integration matrix. `Frontend sends` means headers, params, query, or JSON body the app must provide. `Backend returns` means the shape or data the UI should consume. All private endpoints require:

```http
Authorization: Bearer <accessToken>
```

| Area | Endpoint | Frontend sends | Backend returns |
|---|---|---|---|
| Health | `GET /health` | No auth. Optional `Accept: application/json` or browser HTML accept header. | Public health status JSON, or animated HTML health page for browser requests. |
| Health | `GET /health/deep` | `x-healthcheck-token` when `HEALTHCHECK_TOKEN` is configured. | Deep service status for MongoDB/Redis/queues without exposing secrets. |
| Auth | `POST /auth/signup` | JSON `email`, `username`, `password`. | User object, `accessToken`, `refreshToken`, cookies when enabled. |
| Auth | `POST /auth/login` | JSON `email`, `password`. | User object, `accessToken`, `refreshToken`, session metadata. |
| Auth | `POST /auth/google` | JSON `idToken`. | Same auth payload as login. |
| Auth | `POST /auth/refresh` | Refresh token in body or cookie. | New access token and rotated refresh token/session data. |
| Auth | `GET /auth/me` | Bearer token. | Current authenticated user. |
| Auth | `POST /auth/logout` | Bearer token. | Success message; current refresh session revoked. |
| Auth | `POST /auth/logout-all` | Bearer token. | Success message; all refresh sessions invalidated. |
| Auth | `GET /auth/sessions` | Bearer token. | Active session metadata only; never raw refresh token/hash. |
| Auth | `DELETE /auth/sessions/:sessionId` | Bearer token and `sessionId` path param. | Success message and revoked session state. |
| Auth | `POST /auth/change-password` | JSON `currentPassword`, `newPassword`. | Success message; may require clients to refresh/relogin. |
| Auth | `POST /auth/password-reset/request` | JSON `email`. | Generic success message and OTP email send attempt. |
| Auth | `POST /auth/password-reset/verify-otp` | JSON `email`, `otp`. | Reset token and expiry if OTP is valid. |
| Auth | `POST /auth/password-reset/reset` | Option A: `resetToken`, `newPassword`. Option B: `email`, `otp`, `newPassword`. | Success message; password changed. |
| Auth | `POST /auth/password-reset/resend-otp` | JSON `email`. | Generic success message and resend cooldown behavior. |
| Auth | `POST /auth/password-reset/feedback` | Feedback JSON from reset UI. | Success message; non-blocking feedback saved. |
| Auth | `POST /auth/verify-email` | JSON `token`. | Email verification success and updated user state. |
| Auth | `POST /auth/resend-verification` | Bearer token. | Success message and verification email send attempt. |
| Users | `GET /users/handle/:username` | Username path param, optional auth. | Public profile, counters, viewer-aware fields when authed. |
| Users | `GET /users/profile` | Bearer token. | Full editable current-user profile. |
| Users | `PATCH /users/profile` | JSON with root fields and nested `profile` object. | Updated user/profile object. |
| Users | `PATCH /users/feed-preferences` | JSON `onboardingTopics`, `mutedTopics`. | Saved algorithm preferences. |
| Users | `POST /users/:userId/profile-click` | `userId` path param, optional `source`. | Tracked profile click signal. |
| Users | `DELETE /users/account` | JSON confirmation/password where required. | Account deletion/deactivation success. |
| Users/Admin | `GET /users` | Admin/mod token, optional `page`, `limit`, `search`, `status`, `role`. | Paginated users list. |
| Users/Admin | `PATCH /users/:id/role` | Admin token, JSON `role`. | Updated user role. |
| Users/Admin | `PATCH /users/:id/status` | Admin/mod token, JSON `status`, optional reason. | Updated user status. |
| Posts | `GET /posts/trending` | Optional auth, optional `page`, `limit`, `timeframe`, `category`. | Paginated trending post cards with viewer flags when authed. |
| Posts | `GET /posts/categories` | No auth. | Category list. |
| Posts | `GET /posts/sphere` | Optional auth, optional `page`, `limit`, `mode`. | Compatibility Sphere feed; prefer `/feed/sphere`. |
| Posts | `GET /posts/category/:categorySlug` | Category path param, optional auth/query. | Category metadata and paginated posts. |
| Posts | `GET /posts/search` | Query `q`, optional `page`, `limit`, `category`. | Paginated searched posts. |
| Posts | `GET /posts/likes/me` | Bearer token, optional `page`, `limit`. | Posts liked by current user, newest liked first. |
| Posts | `GET /posts/bookmarks/me` | Bearer token, optional `page`, `limit`, `collection`. | Current user's saved/bookmarked posts. |
| Posts | `GET /posts/user/:username` | Username path param, optional auth/query. | Profile post timeline. |
| Posts | `GET /posts/user/:username/media` | Username path param, optional `page`, `limit`. | Profile media-only posts. |
| Posts | `GET /posts/user/:username/reposts` | Username path param, optional `page`, `limit`. | Profile repost and quote timeline. |
| Posts | `GET /posts/:postId` | Post id, optional auth. | Single post with viewer state when authed. |
| Posts | `GET /posts/:postId/thread` | Post id, optional auth. | Parent post plus replies/thread data. |
| Posts | `GET /posts/:postId/reposts` | Post id, optional `page`, `limit`. | Users/repost records for repost-count modal. |
| Posts | `GET /posts/:postId/quotes` | Post id, optional `page`, `limit`. | Quote repost posts. |
| Posts | `POST /posts/:postId/view` | Post id, optional auth and device/session header for guests. | `{ postId, viewsCount, counted }`. |
| Posts | `POST /posts` | JSON `text` and/or `media`, optional `category`, `visibility`, `sphereEligible`. | Created post object and counters. |
| Posts | `POST /posts/repost` | JSON `postId`, optional quote `text`. | Repost/quote state and counters. |
| Posts | `DELETE /posts/repost/:postId` | Original post id. | Repost removed state and updated counter. |
| Posts | `POST /posts/reply` | JSON `postId`, `text`. | Created reply/comment. |
| Posts | `PATCH /posts/reply/:replyId` | Reply id and JSON `text`. | Updated reply/comment. |
| Posts | `DELETE /posts/reply/:replyId` | Reply id. | Delete success and updated parent state where available. |
| Posts | `POST /posts/reply/:replyId/like` | Reply id. | Idempotent reply liked state and count. |
| Posts | `DELETE /posts/reply/:replyId/like` | Reply id. | Idempotent reply unliked state and count. |
| Posts | `POST /posts/:postId/like` | Post id. | Idempotent `{ liked: true, likesCount }`. |
| Posts | `DELETE /posts/:postId/like` | Post id. | Idempotent `{ liked: false, likesCount }`. |
| Posts | `GET /posts/:postId/likes` | Post id, optional `page`, `limit`. | Paginated users who liked the post. |
| Posts | `POST /posts/:postId/bookmark` | Post id, optional collection metadata. | Idempotent `{ bookmarked: true }` and saved-post metadata. |
| Posts | `DELETE /posts/:postId/bookmark` | Post id. | Idempotent `{ bookmarked: false }`. |
| Posts | `POST /posts/:postId/engagement` | JSON `action`; for dwell include `dwellSeconds`. | Algorithm signal recorded and post algorithm counters/rates. |
| Posts | `POST /posts/:postId/link-click` | Optional JSON `url`. | Link click signal recorded. |
| Feed | `GET /feed/home` | Bearer token, optional `page`, `limit`, `useCache`. | Following feed in `data.items`, `data.feed`, and `data.posts`. |
| Feed | `POST /feed/home/refresh` | Bearer token. | Feed cache invalidated success. |
| Feed | `GET /feed/sphere` | Bearer token, optional `page`, `limit`, `mode`, `useCache`, `variant`. | Official Sphere/For You feed in `data.items`, plus `algorithm` and `pagination`. |
| Feed | `GET /feed/sphere/category/:category` | Category path param, optional query. | Category discovery feed. |
| Feed/Admin | `GET /feed/analytics?days=7` | Admin/mod token. | Algorithm analytics by action/source/variant/topic. |
| Feed | `GET /feed/ranking/:postId` | Post id, optional `variant`. | Debug score breakdown for one post. |
| Social | `POST /social/follow/:userId` | User id path param. | Follow status `ACCEPTED` or `PENDING`, follow id. |
| Social | `DELETE /social/follow/:userId` | User id path param. | Unfollow success. |
| Social | `GET /social/follow/status/:userId` | User id path param. | Follow status and `isFollowing`. |
| Social | `GET /social/relationship/:userId` | User id path param. | `following`, `followedBy`, `pending`, `muted`, `blocked`, `blockedBy`. |
| Social | `GET /social/followers/:userId` | User id, optional pagination. | Paginated followers. |
| Social | `GET /social/following/:userId` | User id, optional pagination. | Paginated following list. |
| Social | `GET /social/follow-requests` | Optional pagination. | Pending follow requests. |
| Social | `POST /social/follow-requests/:requestId/accept` | Request id. | Request accepted success. |
| Social | `POST /social/follow-requests/:requestId/reject` | Request id. | Request rejected success. |
| Social | `GET /social/mutual/:userId` | User id. | Mutual followers. |
| Social | `GET /social/suggestions` | Optional `limit`. | Follow suggestions. |
| Social | `POST /social/block/:userId` | User id. | Block success. |
| Social | `DELETE /social/block/:userId` | User id. | Unblock success. |
| Social | `GET /social/blocked` | Optional pagination. | Blocked users list. |
| Social | `POST /social/mute/:userId` | User id. | Mute success. |
| Social | `DELETE /social/mute/:userId` | User id. | Unmute success. |
| Social | `GET /social/muted` | Optional pagination. | Muted users list. |
| Messages | `GET /messages/dm/conversations` | Bearer token. | DM conversation list. |
| Messages | `GET /messages/dm/conversations/search?q=` | Query `q`, optional pagination. | Search results by participant/message text. |
| Messages | `POST /messages/dm/conversations/:userId` | User id. | Existing or created DM conversation. |
| Messages | `GET /messages/dm/conversations/:conversationId/messages` | Conversation id, optional pagination. | Paginated DM messages. |
| Messages | `POST /messages/dm/conversations/:conversationId/messages` | JSON `bodyText`. | Created DM message. |
| Messages | `GET /messages/channels/:circleId/:channelId` | Circle/channel ids, optional pagination. | Channel messages. |
| Messages | `POST /messages/channels/:circleId/:channelId` | JSON `bodyText`, optional `replyToMessageId`. | Created channel message. |
| Messages | `GET /messages/reads` | Bearer token. | Read states. |
| Messages | `POST /messages/reads` | JSON `scopeType`, `scopeId`, optional `lastReadMessageId`. | Updated read state. |
| Notifications | `GET /notifications` | Optional pagination. | Notifications list and unread count. |
| Notifications | `GET /notifications/unread-count` | Bearer token. | Unread count. |
| Notifications | `PATCH /notifications/read-all` | Bearer token. | All notifications marked read. |
| Notifications | `PATCH /notifications/:notificationId/read` | Notification id. | One notification marked read. |
| Notification Preferences | `GET /notifications/preferences` | Bearer token. | Full notification preference matrix. |
| Notification Preferences | `PUT /notifications/preferences` | JSON nested preference booleans. | Updated preferences. |
| Notification Preferences | `GET /notifications/preferences/defaults` | Bearer token. | Default preference matrix. |
| Notification Preferences | `POST /notifications/preferences/reset` | Bearer token. | Preferences reset to defaults. |
| Notification Preferences | `POST /notifications/preferences/enable-all` | Bearer token. | All preferences enabled. |
| Notification Preferences | `POST /notifications/preferences/disable-all` | Bearer token. | All preferences disabled. |
| Notification Preferences | `GET /notifications/preferences/summary` | Bearer token. | Compact enabled/disabled summary. |
| Notification Preferences | `POST /notifications/preferences/test` | Optional query `type`. | Test notification result. |
| Search | `GET /search?q=` | Query `q`, optional `type`, `limit`. | Grouped search results for users/posts/circles/categories. |
| Trending | `GET /trending/hashtags` | Optional filters. | Trending hashtags. |
| Trending | `GET /trending/topics` | Optional filters. | Trending topics. |
| Trending | `GET /trending/categories` | No auth. | Trend categories. |
| Trending | `GET /trending/stats` | No auth. | Trend counters/stats. |
| Trending | `GET /trending/category/:category` | Category path param. | Category trends. |
| Trending | `GET /trending/hashtag/:tag` | Hashtag path param. | Hashtag detail. |
| Trending | `GET /trending/topic/:topic/:type?` | Topic path param. | Topic detail. |
| Trending | `GET /trending/region/:region` | Region path param. | Regional trends. |
| Trending | `GET /trending/search?q=` | Query `q`. | Trend search results. |
| Media | `POST /media/signature` | JSON `usage`, `resourceType`. | Cloudinary signed upload payload. |
| Media | `POST /media/assets` | Media registration JSON or text asset JSON. | Stored media/text asset record. |
| Media | `POST /media/register` | Same as `/media/assets`. | Stored media/text asset record. |
| Media | `GET /media/assets` | Optional `usage`, `status`, pagination. | User-owned assets. |
| Media | `PATCH /media/assets/:publicId` | Public id and update JSON. | Updated asset. |
| Media | `DELETE /media/:publicId` | Public id. | Asset deleted/marked deleted. |
| Payments | `POST /payments/initialize` | JSON `amount`, optional plan/metadata. | Paystack initialization/authorization data. |
| Payments | `GET /payments/verify/:reference` | Payment reference. | Verified transaction state. |
| Payments | `GET /payments/history` | Bearer token. | Payment history. |
| Payments | `POST /payments/webhook` | Paystack only, signed raw payload. | Fast `200` after verified event is stored/queued. |
| Moderation | `GET /moderation/report-reasons` | No auth. | Report reason list. |
| Moderation | `POST /moderation/reports` | JSON `targetType`, `targetId`, `reasonCode`, optional details. | Created report. |
| Moderation | `GET /moderation/reports` | Admin/mod token and filters. | Moderation report queue. |
| Moderation | `POST /moderation/reports/:reportId/actions` | Report id and action JSON. | Applied moderation action. |
| Moderation | `GET /moderation/audit-logs` | Admin/mod filters. | Audit log timeline. |
| Mobile | `GET /mobile/update-check` | No auth. | Latest mobile release/update metadata. |
| Mobile | `GET /mobile/update-download/:assetId` | Asset id. | Proxied update file stream. |

### Sphere Page Contract

Use this endpoint for the main Sphere page:

```http
GET /api/feed/sphere?page=1&limit=20&mode=top
Authorization: Bearer <accessToken>
```

The backend sends posts in three equivalent arrays for frontend convenience:

```json
{
  "success": true,
  "data": {
    "items": [],
    "feed": [],
    "posts": [],
    "algorithm": {
      "version": "wemsty-v2",
      "variant": "balanced"
    },
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 2,
      "pages": 1,
      "hasMore": false
    }
  }
}
```

Each array item is a ranked feed item:

```json
{
  "post": {
    "id": "post_id",
    "author": {
      "_id": "author_id",
      "username": "cyril_kennedy",
      "profile": {
        "displayName": "Cyril Kennedy",
        "avatar": "https://..."
      }
    },
    "content": {
      "text": "Post text",
      "media": [],
      "hashtags": []
    },
    "postType": "original",
    "visibility": "public",
    "engagement": {
      "likes": 0,
      "comments": 0,
      "reposts": 0,
      "views": 0
    },
    "likesCount": 0,
    "commentsCount": 0,
    "repostsCount": 0,
    "createdAt": "2026-05-19T00:00:00.000Z"
  },
  "viewerState": {
    "liked": false,
    "reposted": false,
    "bookmarked": false
  },
  "rank": {
    "score": 0.5,
    "reason": "recommended",
    "source": "small_creator"
  },
  "socialProof": null
}
```

Frontend should read:

```js
const feedItems = response.data.data.items;
const firstPost = feedItems[0].post;
const viewerFlags = feedItems[0].viewerState;
```

For algorithm quality, frontend should send these events:

```http
POST /api/posts/:postId/engagement
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{ "action": "impression" }
```

```json
{ "action": "dwell", "dwellSeconds": 8 }
```

```json
{ "action": "hide" }
```

```json
{ "action": "not_interested" }
```

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
| `POST /auth/password-reset/reset` | JSON option A: `resetToken`, `newPassword`; option B: `email`, `otp`, `newPassword`. | Force new login flow after success. |
| `POST /auth/password-reset/feedback` | JSON feedback payload from UI form. | Fire-and-forget UX; do not block auth flow on this endpoint. |
| `POST /auth/password-reset/resend-otp` | JSON: `email`. | Restart OTP timer and keep user in same step. |
| `POST /auth/verify-email` | JSON: `token` from verification link. | Mark user as verified in state and remove verification banner. |
| `GET /auth/me` | Bearer token. | Use as source of truth for session restoration on app boot. |
| `POST /auth/logout` | Bearer token. | Clear local tokens/user cache and disconnect realtime socket. |
| `POST /auth/logout-all` | Bearer token. | Clear local tokens and prompt re-login on all client tabs/devices. |
| `GET /auth/sessions` | Bearer token. | Render active sessions without expecting token or token hash fields. |
| `DELETE /auth/sessions/:sessionId` | Bearer token + session id. | Remove revoked session from session management UI. |
| `POST /auth/change-password` | Bearer token + JSON: `currentPassword`, `newPassword`. | Show success and optionally require token refresh/re-auth for sensitive screens. |
| `POST /auth/resend-verification` | Bearer token. | Show cooldown UI and "email sent" status. |

### Users Contract

| Endpoint | Frontend must send | Frontend must do after response |
|---|---|---|
| `GET /users/handle/:username` | Optional bearer token. | Render public profile header and counters from server response. |
| `GET /users/profile` | Bearer token. | Hydrate editable profile form from full user object. |
| `PATCH /users/profile` | Bearer token + JSON; profile fields must be nested under `profile`. | Replace local user state with returned user object. |
| `PATCH /users/feed-preferences` | Bearer token + JSON `onboardingTopics` and/or `mutedTopics`. | Save topic onboarding choices and topic mutes used by the personalized feed. |
| `POST /users/:userId/profile-click` | Bearer token + optional `source`. | Send when a post/profile surface causes the viewer to open a creator profile. |
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
| `GET /posts/likes/me` | Bearer token + optional `page`, `limit`. | Render profile Likes tab from returned posts; do not locally filter all posts. |
| `GET /posts/:postId` | Optional bearer token. | Use as canonical post detail payload (includes viewer booleans when authed). |
| `GET /posts/:postId/thread` | Optional bearer token. | Build thread view from `post` + `replies`; do not compute counts client-side. |
| `GET /posts/:postId/reposts` | Optional bearer token + optional `page`, `limit`. | Render repost user list/count modal from returned `reposts`. |
| `GET /posts/:postId/quotes` | Optional bearer token + optional `page`, `limit`. | Render quote repost timeline from returned quote posts. |
| `POST /posts/:postId/view` | Optional bearer token; guests may send `x-device-id`. | Use for impression/view tracking; read `viewsCount` and `counted`. |
| `GET /posts/user/:username` | Optional bearer token + optional `page`, `limit`, `includeReplies`, `includeReposts`. | Default profile "Thoughts" tab should keep `includeReposts=false` unless a repost tab exists. |
| `GET /posts/user/:username/media` | Optional bearer token + optional `page`, `limit`. | Render profile Media tab with server-side pagination. |
| `GET /posts/user/:username/reposts` | Optional bearer token + optional `page`, `limit`. | Render profile Reposts tab with server-side pagination. |
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
| `GET /social/relationship/:userId` | Bearer token. | Hydrate profile action buttons from `following`, `followedBy`, `pending`, `muted`, `blocked`, `blockedBy`. |
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
| `GET /messages/dm/conversations/search` | Bearer token + required `q`, optional `page`, `limit`. | Render paginated DM search results from server. |
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
| `POST /posts/:postId/engagement` | Bearer token + JSON `action`; include `dwellSeconds` for dwell events. | Send viewport and negative feedback signals so Wemsty can learn interests and suppress unwanted content. |
| `POST /posts/:postId/link-click` | Bearer token + optional JSON `url`. | Send before opening external links so link-click interest can be learned. |

`GET /feed/sphere` uses the Phase 1 Wemsty For You pipeline:
- viewer's own eligible public original/quote posts
- followed-author candidates
- topic-interest candidates
- trending/velocity candidates
- small-creator discovery candidates
- exploration candidates
- social-proof candidates from posts engaged by people the viewer follows
- onboarding-topic fallback for new users
- muted-topic filtering
- score ranking and diversity caps

Phase 2 additions:
- creator reputation is included in author health
- `variant=balanced|fresh|social` can be passed to test feed weight variants
- feed cache keys include algorithm version and variant
- `GET /feed/ranking/:postId?variant=social` returns a detailed score breakdown
- `npm run algorithm:train` exports lightweight training recommendations from `EngagementLog`

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

### Media & Universal Assets Contract

| Endpoint | Frontend must send | Frontend must do after response |
|---|---|---|
| `POST /media/signature` | Bearer token + JSON: `usage`, `resourceType` (`image`, `video`, or `raw`). | Upload file directly to Cloudinary with returned signing data. |
| `POST /media/assets` | Bearer token + either media registration fields or text fields. | Store returned `asset`, especially `publicId`, `url`, `usage`, `resourceType`, and `text` when present. |
| `POST /media/register` | Same as `/media/assets`. | Prefer `/media/assets` for new frontend code. |
| `GET /media/assets` | Bearer token + optional `usage`, `status`, `page`, `limit`. | Render user-owned assets and paginate using response metadata. |
| `PATCH /media/assets/:publicId` | Bearer token + fields to update, such as `usage`, `attachedToType`, `attachedToId`, `metadata`, `tags`, or `text`. | Replace local asset with returned asset. |
| `DELETE /media/:publicId` | Bearer token. | Remove asset from local UI or mark it deleted. |

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
| `GET /moderation/report-reasons` | No auth. | Populate report reason picker; do not hardcode reasons client-side. |
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
  socket = io('https://api.wemsty.com/realtime', {
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

const socket = io('https://api.wemsty.com/realtime', {
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

### Media Asset

```javascript
{
  _id: "ObjectId",
  publicId: "wemsty/cover_photo/abc123",
  url: "https://res.cloudinary.com/...", // omitted for text assets
  resourceType: "image", // image, video, raw, text
  usage: "cover_photo",
  owner: "user_id",
  attachedToType: "profile_cover",
  attachedToId: "user_id",
  status: "attached", // uploaded, attached, deleted, cleanup_failed
  text: null, // string for text assets
  metadata: {
    crop: "wide"
  },
  tags: ["cover", "profile"],
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
- Universal media/text storage is available through `/api/media/assets`.
- Signed Cloudinary upload parameters are available through `/api/media/signature`.
- Use `usage` values like `avatar`, `cover_photo`, `profile_banner`, `post_attachment`, `message_attachment`, `random_file`, or `profile_note`.
- Text assets can be stored directly with `resourceType: "text"` and `text`.

### Sorting
Some list endpoints support sorting. Use endpoint-specific `sort` values where provided.

### CORS
Production CORS is restricted by `ALLOWED_ORIGINS`.

Recommended production value:

```env
ALLOWED_ORIGINS=https://wemsty.com,https://www.wemsty.com,https://api.wemsty.com
```

Development automatically allows common localhost origins.

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

**Last updated:** 2026-05-17

## Environment Variables & Infrastructure

### Email Infrastructure (Brevo SMTP + Nodemailer)
The backend currently sends transactional email through **Brevo SMTP** using Nodemailer.

**Required Env Vars:**
- `SMTP_HOST=smtp-relay.brevo.com`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_USER=<your Brevo SMTP login>`
- `SMTP_PASS=<your Brevo SMTP key>`
- `SMTP_FROM=noreply@mail.wemsty.com`

DNS requirements:
- SPF configured for Brevo
- DKIM configured for Brevo
- DMARC configured for your domain

Smoke test:

```bash
npm run email:smoke -- your@email.com
```

### Mobile Update Security Bridge
Required for private GitHub repositories.

**Required Env Vars:**
- GITHUB_ACCESS_TOKEN: Personal Access Token (repo scope).
- GITHUB_REPO_OWNER: GitHub username (e.g., cyrilkennedy).
- GITHUB_REPO_NAME: Repository name (e.g., wemsty).

