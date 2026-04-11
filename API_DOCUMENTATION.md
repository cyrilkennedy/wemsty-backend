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

---

### Search

| Method | Endpoint | Access | Purpose |
|--------|----------|--------|---------|
| GET | `/search` | Public (Optional Auth) | Unified search across posts/users/hashtags |

Query parameters:
- `q` (required)
- `type`: `all`, `posts`, `users`, `hashtags`
- `page`, `limit`

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
| `post:liked` | `{ postId, likesCount, userId, liked, isLiked }` | Backward-compatible like update event |
| `post.liked.updated` | `{ postId, likesCount, userId, liked, isLiked }` | Primary like update event |
| `post:reposted` | `{ postId, repostsCount, userId, reposted }` | Backward-compatible repost update event |
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
