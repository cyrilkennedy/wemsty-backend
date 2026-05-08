# Wemsty Backend Project Documentation

Last updated: 2026-05-06

## 1. Project Overview

Wemsty Backend is a Node.js and Express API for a social platform. The project currently implements authentication, user profiles, social relationships, posts, replies, reposts, bookmarks, circle communities, messaging, notifications, feeds, trending/search, moderation, payments, realtime Socket.IO events, Redis-backed helpers, and Kafka event publishing.

The main application entry point is `server.js`. It configures the HTTP API, connects MongoDB, attempts optional Redis and Kafka startup, creates the HTTP server, initializes Socket.IO realtime services, mounts all route modules under `/api`, and starts listening on `PORT` or `3001`.

The API version exposed by the root and health routes is currently `4.0`.

## 2. Technology Stack

Runtime and server:
- Node.js
- Express 5
- HTTP server from Node core
- Socket.IO for realtime communication

Database and persistence:
- MongoDB
- Mongoose ODM

Caching and rate-limit support:
- Redis through the `redis` package
- Redis is fail-open at startup, so the app can run without cache acceleration

Event streaming:
- Kafka through `kafkajs`
- Kafka is fail-open at startup, so the app can run without event streaming

Authentication and security:
- JSON Web Tokens through `jsonwebtoken`
- Password hashing through `bcryptjs`
- Helmet security headers
- CORS
- Cookie parser
- Express rate limiting

External integrations:
- Google OAuth token verification through `google-auth-library`
- Paystack payments
- Algolia search
- Cloudinary configuration
- Supabase configuration
- Nodemailer email delivery

Validation and utilities:
- Custom validation middleware
- Zod is installed, although much of the current route validation uses the local validation middleware
- URL sanitization utilities
- Common async error wrapping

## 3. Runtime Startup Flow

When `npm start` or `node server.js` runs:

1. Environment variables are loaded with `dotenv`.
2. Express app is created.
3. Security, logging, CORS, JSON body parsing, URL-encoded body parsing, cookies, and global rate limiting are applied.
4. MongoDB is connected through `config/mongodb.js`.
5. Redis attempts to connect through `config/redis.js`.
6. Kafka attempts to connect through `config/kafka.js` and creates default topics.
7. An HTTP server is created from the Express app.
8. Realtime services are initialized on the HTTP server.
9. API routes are mounted.
10. Health, root, 404, and error handlers are registered.
11. The server listens on `process.env.PORT || 3001`.

MongoDB is required. Redis and Kafka are optional during boot and currently fail open with warning logs.

## 4. Main Scripts

From `package.json`:

```bash
npm start
npm run dev
npm run dedupe:interactions
npm run dedupe:interactions:dry
npm run clear:interactions
npm run clear:interactions:dry
```

`npm test` is currently a placeholder that exits with an error.

## 5. Directory Layout

```text
server.js                         Application entry point
package.json                      Dependency and script manifest
API_DOCUMENTATION.md              Endpoint-level API documentation
PRODUCTION_CHECKLIST.md           Production readiness checklist
generate-secrets.js               Helper for generating secrets
config/                           External service and app configuration
controllers/                      HTTP request handlers
middlewares/                      Auth, validation, and error middleware
models/                           Mongoose schemas and model methods
routes/                           Express route definitions
services/                         Business logic and infrastructure services
scripts/                          Maintenance scripts
utils/                            Shared utility helpers
```

## 6. Mounted API Modules

All route modules are mounted from `server.js`:

| Mount path | Route file | Responsibility |
|---|---|---|
| `/api/auth` | `routes/auth.routes.js` | Signup, login, Google auth, token refresh, logout, email verification, password reset |
| `/api/social` | `routes/social.routes.js` | Follow, unfollow, follow requests, suggestions, block, mute |
| `/api/users` | `routes/user.routes.js` | Public user lookup, own profile, account deletion, admin user management |
| `/api/posts` | `routes/post.routes.js` | Posts, replies, reposts, likes, bookmarks, post feeds, search, categories |
| `/api/circles` | `routes/circles.routes.js` | Communities, memberships, channels, roles, invites, pinned channels/posts |
| `/api/messages` | `routes/messages.routes.js` | Circle channel messages, DMs, read states |
| `/api/notifications` | `routes/notifications.routes.js` | Notification list, unread count, read state |
| `/api/moderation` | `routes/moderation.routes.js` | Reports, moderation actions, audit logs |
| `/api/search` | `routes/search.routes.js` | Unified search |
| `/api/feed` | `routes/feed.routes.js` | Advanced home/sphere feed service endpoints |
| `/api/trending` | `routes/trending.routes.js` | Hashtag/topic/category/region trending APIs |
| `/api/payments` | `routes/payment.routes.js` | Paystack initialization, verification, webhook, history |
| `/api/notifications/preferences` | `routes/notification-preferences.routes.js` | Notification preference management |

The health check is exposed at `GET /api/health`.

## 7. Core Feature Areas

### 7.1 Authentication

Authentication is built around the `User` model, JWT access tokens, refresh tokens, token versioning, and password hashing.

Built features:
- Email/password signup
- Email/password login
- Google OAuth login/signup
- Access token generation
- Refresh token generation
- Refresh token persistence on the user document
- Token version invalidation
- Logout current session
- Logout all sessions
- Email verification token support
- Resend verification email route
- Legacy forgot/reset password flow
- OTP-based password reset flow
- Password reset feedback capture
- Password change for authenticated users
- Account lockout fields for repeated failed login attempts

Important token behavior:
- Access tokens include `userId`, `email`, `role`, `tokenVersion`, and `type: "access"`.
- Refresh tokens include `userId`, `tokenVersion`, and `type: "refresh"`.
- Token expiry defaults are controlled by `JWT_ACCESS_EXPIRES` and `JWT_REFRESH_EXPIRES`, with model defaults of `15m` and `7d`.
- Refresh tokens can be invalidated by increasing `tokenVersion`.

Primary files:
- `routes/auth.routes.js`
- `controllers/auth.controller.js`
- `services/auth.service.js`
- `models/User.model.js`
- `models/OTP.model.js`
- `models/PasswordResetFeedback.model.js`
- `middlewares/auth.middleware.js`
- `utils/emailService.js`

### 7.2 Users and Profiles

The user system stores identity, auth providers, role, profile details, security metadata, counters, and refresh token records.

Built features:
- Public profile lookup by username through `/api/users/handle/:username`
- Authenticated user profile fetch
- Authenticated profile update
- Account deletion/deactivation route
- Admin/moderator user listing
- Admin role updates
- Admin/moderator account status updates

Profile fields currently supported on `User.profile`:
- `firstName`
- `lastName`
- `displayName`
- `avatar`
- `bio`
- `location`
- `website`
- `phoneNumber`

The profile avatar is currently stored as a URL string. There is no dedicated profile media upload endpoint wired into the route layer.

Primary files:
- `routes/user.routes.js`
- `controllers/user.controller.js`
- `models/User.model.js`
- `models/UserProfile.model.js`

### 7.3 Posts, Replies, Reposts, Likes, and Bookmarks

Posts are stored in the `Post` model and support original posts, reposts, quote posts, and replies.

Built features:
- Create a post
- Create a repost or quote repost
- Remove a repost
- Create replies/comments
- Edit replies
- Delete replies
- Like/unlike posts
- Like/unlike replies
- Get post likes
- Bookmark/unbookmark posts
- List current user's bookmarks
- Delete own posts
- Public trending posts
- Public categories
- Public Sphere feed
- Category feed
- Post search
- Single post view
- Thread view
- User post feed
- Authenticated home feed under `/api/posts/feed/home`
- Authenticated Sphere feed under `/api/posts/feed/sphere`

Post model concepts:
- `postType`: `original`, `repost`, `quote`, `reply`
- `visibility`: `public`, `followers`, `private`
- `status`: `active`, `edited`, `deleted`, `flagged`, `hidden`, `shadow_hidden`
- `sphereEligible`: whether a post can appear in discovery
- `content.text`: text body, max 500 chars
- `content.media`: image/video/gif attachment metadata
- `content.hashtags`: extracted from text on save
- `engagement`: denormalized likes, comments, reposts, views, score, velocity
- `sphereScore`: discovery ranking score
- `moderation`: flag and review metadata

Interaction behavior is designed to be idempotent in many paths. The code also includes maintenance scripts for deduping and clearing interactions.

Primary files:
- `routes/post.routes.js`
- `controllers/post.controller.js`
- `services/post.service.js`
- `models/Post.model.js`
- `models/Like.model.js`
- `models/Bookmark.model.js`
- `models/Repost.model.js`
- `models/Comment.model.js`
- `config/post-categories.js`
- `scripts/dedupe-interactions.js`
- `scripts/clear-interactions.js`

### 7.4 Social Graph

The social graph supports relationships and safety controls.

Built features:
- Follow a user
- Unfollow a user
- Check follow status
- Fetch pending follow requests
- Accept follow request
- Reject follow request
- List followers
- List following
- Get mutual followers
- Get follow suggestions
- Block user
- Unblock user
- List blocked users
- Mute user
- Unmute user
- List muted users

The system distinguishes accepted follows and pending follow requests, which allows private-account style flows. Blocks and mutes are used by feed and visibility logic to reduce unwanted exposure.

Primary files:
- `routes/social.routes.js`
- `controllers/social.controller.js`
- `models/Follow.model.js`
- `models/Block.model.js`
- `models/Mute.model.js`

### 7.5 Circles

Circles are community spaces with memberships, channels, roles, invites, and pinned content.

Built features:
- List public circles
- Get a circle by id or slug
- Get current user's memberships
- Create a circle
- Join a circle
- Leave a circle
- Redeem invite code
- List members
- List channels
- Create channels
- List roles
- Create roles
- Assign roles
- List invites
- Create invites
- Pin/unpin a channel
- Pin/unpin a post

Circle permission handling is centralized in `services/circle-permissions.service.js`. Messaging access also checks circle/channel membership and access where needed.

Primary files:
- `routes/circles.routes.js`
- `controllers/circles.controller.js`
- `services/circle-permissions.service.js`
- `models/Circle.model.js`
- `models/CircleMembership.model.js`
- `models/CircleChannel.model.js`
- `models/CircleRole.model.js`
- `models/CircleInvite.model.js`

### 7.6 Messaging

Messaging is split into circle channel messages and direct messages.

Built features:
- List channel messages
- Send channel message
- List read states
- Update read state
- List DM conversations
- Get or create a DM conversation
- List DM messages
- Send DM message
- Mention resolution in message text
- Unread counter updates
- Realtime event emission for new messages

Messaging routes are protected and require an authenticated user. Realtime events mirror important message creation flows.

Primary files:
- `routes/messages.routes.js`
- `controllers/messaging.controller.js`
- `services/messaging.service.js`
- `models/CircleMessage.model.js`
- `models/DMConversation.model.js`
- `models/DMMessage.model.js`
- `models/MessageRead.model.js`

### 7.7 Notifications

Notifications support persistent notification records, unread counts, read state, and user preferences.

Built features:
- List notifications
- Get unread count
- Mark one notification as read
- Mark all notifications as read
- Create notification service helper
- Create mention notifications helper
- Realtime unread count updates when notifications are created
- Notification preferences fetch/update/reset
- Enable all preferences
- Disable all preferences
- Preference summary
- Test notification endpoint

Primary files:
- `routes/notifications.routes.js`
- `routes/notification-preferences.routes.js`
- `controllers/notifications.controller.js`
- `controllers/notification-preferences.controller.js`
- `services/notification.service.js`
- `services/push-notification.service.js`
- `models/Notification.model.js`

### 7.8 Feeds

The project has two feed surfaces:

1. Post controller feed endpoints under `/api/posts/feed/*`.
2. Advanced feed service endpoints under `/api/feed/*`.

Built feed capabilities:
- Home feed based on followed users
- Sphere/discovery feed
- Category-specific Sphere feed
- Cache refresh endpoint
- Ranking debug endpoint
- Candidate generation
- Ranking score calculation
- Redis feed caching
- Block and mute filtering
- Hydrated viewer state for liked/reposted/bookmarked

Advanced ranking factors in `services/feed.service.js`:
- Recency
- Relationship weight
- Engagement
- Community affinity
- Language match
- Safety penalty
- Seen penalty

Redis feed cache keys include home and sphere feed variants with page, limit, and mode.

Primary files:
- `routes/feed.routes.js`
- `controllers/feed.controller.js`
- `services/feed.service.js`
- `models/Post.model.js`
- `config/redis.js`

### 7.9 Trending and Search

Trending supports hashtags, topics, categories, stats, category-specific trends, hashtag details, topic details, regional trends, and hashtag search.

Search supports a unified `/api/search` route. Algolia support is configured through `services/algolia.service.js` and `config/algolia.js`.

Built features:
- Trending hashtags
- Trending topics
- Trending categories
- Trending stats
- Topics by category
- Hashtag details
- Topic details
- Regional trends
- Trending search
- Unified search across supported entities
- Search rate limiting through `services/rate-limit.service.js`
- Kafka search-index event helper

Primary files:
- `routes/trending.routes.js`
- `routes/search.routes.js`
- `controllers/trending.controller.js`
- `controllers/search.controller.js`
- `models/Hashtag.model.js`
- `models/TrendingTopic.model.js`
- `services/algolia.service.js`
- `config/algolia.js`

### 7.10 Moderation and Audit Logs

Moderation supports user reports, moderator/admin queues, moderation actions, and audit log listing.

Built features:
- Create report
- List reports as admin/moderator
- Take moderation action as admin/moderator
- List audit logs as admin/moderator
- Audit service helper
- Kafka moderation event helper

Primary files:
- `routes/moderation.routes.js`
- `controllers/moderation.controller.js`
- `services/audit.service.js`
- `models/Report.model.js`
- `models/ModerationAction.model.js`
- `models/AuditLog.model.js`

### 7.11 Payments

Payments are implemented around Paystack.

Built features:
- Initialize payment
- Verify payment by reference
- Handle Paystack webhook
- Get transaction history endpoint

The webhook route is public because Paystack calls it directly, but signature verification belongs in the payment controller/service path.

Primary files:
- `routes/payment.routes.js`
- `controllers/payment.controller.js`
- `services/payment.service.js`

### 7.12 Realtime

Realtime is implemented with Socket.IO on the `/realtime` namespace.

Connection rules:
- Client connects to `/realtime`.
- Client sends an access token in `socket.handshake.auth.token` or an Authorization header.
- Socket auth is handled by `services/socket-auth.service.js`.
- Each authenticated socket joins `user:<userId>`.
- Presence rooms are joined for active circle memberships.

Client-to-server events:
- `channel.join`
- `channel.leave`
- `channel.message.create`
- `dm.open`
- `dm.message.create`
- `channel.typing.start`
- `channel.typing.stop`
- `read.update`
- `presence.heartbeat`

Server-to-client events:
- `notifications.unread.updated`
- `channel.message.created`
- `dm.message.created`
- `presence.updated`
- `channel.typing.updated`
- `post.created`
- `post.liked.updated`
- `post.reposted.updated`

Optional legacy events:
- `post:liked`
- `post:reposted`

Legacy post events are emitted only when `ENABLE_SOCKET_LEGACY_EVENTS=true`.

Ack pattern:

```json
{ "ok": true }
```

or:

```json
{
  "ok": false,
  "error": {
    "code": "BAD_REQUEST",
    "message": "Something went wrong"
  }
}
```

Primary files:
- `services/realtime.service.js`
- `services/realtime-events.service.js`
- `services/socket-auth.service.js`
- `services/messaging.service.js`

## 8. Data Model Inventory

Current Mongoose models:

| Model | Purpose |
|---|---|
| `User` | Identity, auth, role, profile, counters, refresh tokens |
| `UserProfile` | Extended profile/privacy-style profile model |
| `OTP` | OTP records for password reset |
| `PasswordResetFeedback` | User feedback after reset flow |
| `Post` | Original posts, reposts, quotes, replies, content, engagement |
| `Like` | User likes on posts/replies |
| `Bookmark` | Saved posts |
| `Repost` | Repost-related model support |
| `Comment` | Comment-related model support |
| `Follow` | Follow relationships and follow requests |
| `Block` | Blocking relationships |
| `Mute` | Muted users |
| `Circle` | Community/circle entity |
| `CircleMembership` | User membership in a circle |
| `CircleChannel` | Channels inside circles |
| `CircleRole` | Circle-specific roles |
| `CircleInvite` | Invite codes and invite state |
| `CircleMessage` | Messages inside circle channels |
| `DMConversation` | Direct message conversation |
| `DMMessage` | Direct message record |
| `MessageRead` | Read state and read receipts |
| `Notification` | Persistent notifications |
| `Hashtag` | Hashtag usage and trending support |
| `TrendingTopic` | Topic trend tracking |
| `Report` | User reports |
| `ModerationAction` | Moderator/admin actions |
| `AuditLog` | Audit log records |

## 9. Middleware

Authentication middleware:
- `protect`: requires valid authenticated access token
- `optionalAuth`: attaches a user when token is present but allows anonymous access
- `restrictTo`: role-based route authorization
- `requireEmailVerification`: email verification gate
- `verifyOwnership`: ownership helper
- `verifyRefreshToken`: validates refresh tokens for token refresh

Validation middleware:
- `validate(schema)`: route-level validation for selected auth routes

Error middleware:
- `middlewares/error.middleware.js` exists, but `server.js` currently uses a temporary inline error handler and has the global error middleware commented out.

## 10. Infrastructure Integrations

### MongoDB

MongoDB is required. The connection uses:
- `MONGODB_URI`
- `MONGODB_MAX_POOL_SIZE` default `10`
- `MONGODB_MIN_POOL_SIZE` default `2`

Connection options include server selection timeout, socket timeout, and connection pool sizing.

### Redis

Redis is used for:
- JSON cache helpers
- Rate limit counters
- Feed cache helpers
- Presence helpers
- Typing indicator helpers
- Pub/sub helpers

Redis uses:
- `REDIS_URL`, defaulting to `redis://localhost:6379`

Redis is optional at startup. If unavailable, the API still runs but cache and Redis-backed helpers return safe fallbacks.

### Kafka

Kafka is used for event publishing. Default topics:
- `user-events`
- `post-events`
- `community-events`
- `message-events`
- `notification-events`
- `moderation-events`
- `search-index-events`

Kafka uses:
- `KAFKA_BROKERS`
- `KAFKA_CLIENT_ID`
- `KAFKA_PARTITIONS`
- `KAFKA_REPLICATION`

Kafka is optional at startup. If unavailable, the API still runs but events are not streamed.

### Paystack

Paystack is used for payment initialization, verification, and webhook handling.

Expected env:
- `PAYSTACK_SECRET_KEY`

### Google OAuth

Google auth is supported through Google ID tokens.

Expected env likely includes:
- Google client id or OAuth-related values consumed by the auth controller/service.

### Email

Email support is implemented with Nodemailer and local email helpers.

Brevo is the selected production SMTP provider for custom-domain transactional email.

Expected env:
- `SMTP_HOST=smtp-relay.brevo.com`
- `SMTP_PORT=587`
- `SMTP_SECURE=false`
- `SMTP_USER=<your-brevo-smtp-login>`
- `SMTP_PASS=<your-brevo-smtp-key>`
- `SMTP_FROM=noreply@wemsty.com`

Domain setup:
- Verify the domain in Brevo.
- Add Brevo SPF and DKIM records.
- Add a DMARC record for the domain.

### Algolia

Algolia search integration is present.

Expected env:
- `ALGOLIA_APP_ID`
- `ALGOLIA_ADMIN_KEY`

### Cloudinary and Supabase

Configuration files exist for both Cloudinary and Supabase. They are available for media/storage integrations, although profile image upload routes are not currently wired in the route layer.

## 11. API Conventions

Base URL:

```text
http://localhost:3001/api
```

Auth header:

```http
Authorization: Bearer <accessToken>
```

Common success shapes currently vary by module:

```json
{
  "status": "success",
  "message": "Operation completed successfully",
  "data": {}
}
```

and:

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {}
}
```

Common pagination shape:

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

Common status codes:
- `200`: OK
- `201`: Created
- `204`: No content
- `400`: Bad request
- `401`: Unauthorized
- `403`: Forbidden
- `404`: Not found
- `409`: Conflict
- `429`: Rate limited
- `500`: Server error

## 12. Route Summary

### Health

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/health` | Public |
| GET | `/` | Public |

### Auth

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/auth/test` | Public |
| POST | `/api/auth/signup` | Public |
| POST | `/api/auth/login` | Public |
| POST | `/api/auth/google` | Public |
| POST | `/api/auth/refresh` | Public with refresh token |
| POST | `/api/auth/forgot-password` | Public |
| POST | `/api/auth/reset-password` | Public |
| POST | `/api/auth/verify-email` | Public |
| POST | `/api/auth/password-reset/request` | Public |
| POST | `/api/auth/password-reset/verify-otp` | Public |
| POST | `/api/auth/password-reset/reset` | Public |
| POST | `/api/auth/password-reset/feedback` | Public |
| POST | `/api/auth/password-reset/resend-otp` | Public |
| GET | `/api/auth/me` | Private |
| POST | `/api/auth/logout` | Private |
| POST | `/api/auth/logout-all` | Private |
| POST | `/api/auth/change-password` | Private |
| POST | `/api/auth/resend-verification` | Private |

### Users

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/users/handle/:username` | Public optional auth |
| GET | `/api/users/profile` | Private |
| PATCH | `/api/users/profile` | Private |
| DELETE | `/api/users/account` | Private |
| GET | `/api/users` | Admin or moderator |
| PATCH | `/api/users/:id/role` | Admin |
| PATCH | `/api/users/:id/status` | Admin or moderator |

### Posts

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/posts/trending` | Public optional auth |
| GET | `/api/posts/categories` | Public |
| GET | `/api/posts/sphere` | Public optional auth |
| GET | `/api/posts/category/:categorySlug` | Public optional auth |
| GET | `/api/posts/search` | Public optional auth |
| GET | `/api/posts/:postId` | Public optional auth |
| GET | `/api/posts/:postId/thread` | Public optional auth |
| GET | `/api/posts/user/:username` | Public optional auth |
| GET | `/api/posts/feed/home` | Private |
| GET | `/api/posts/feed/sphere` | Private |
| POST | `/api/posts` | Private |
| POST | `/api/posts/repost` | Private |
| DELETE | `/api/posts/repost/:postId` | Private |
| POST | `/api/posts/reply` | Private |
| PATCH | `/api/posts/reply/:replyId` | Private |
| DELETE | `/api/posts/reply/:replyId` | Private |
| POST | `/api/posts/reply/:replyId/like` | Private |
| DELETE | `/api/posts/reply/:replyId/like` | Private |
| POST | `/api/posts/:postId/like` | Private |
| DELETE | `/api/posts/:postId/like` | Private |
| GET | `/api/posts/:postId/likes` | Private |
| POST | `/api/posts/:postId/bookmark` | Private |
| DELETE | `/api/posts/:postId/bookmark` | Private |
| GET | `/api/posts/bookmarks/me` | Private |
| DELETE | `/api/posts/:postId` | Private |

### Social

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/social/follow/:userId` | Private |
| DELETE | `/api/social/follow/:userId` | Private |
| GET | `/api/social/follow/status/:userId` | Private |
| GET | `/api/social/follow-requests` | Private |
| POST | `/api/social/follow-requests/:requestId/accept` | Private |
| POST | `/api/social/follow-requests/:requestId/reject` | Private |
| GET | `/api/social/followers/:userId` | Private |
| GET | `/api/social/following/:userId` | Private |
| GET | `/api/social/mutual/:userId` | Private |
| GET | `/api/social/suggestions` | Private |
| POST | `/api/social/block/:userId` | Private |
| DELETE | `/api/social/block/:userId` | Private |
| GET | `/api/social/blocked` | Private |
| POST | `/api/social/mute/:userId` | Private |
| DELETE | `/api/social/mute/:userId` | Private |
| GET | `/api/social/muted` | Private |

### Circles

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/circles` | Public |
| GET | `/api/circles/view/:identifier` | Public optional auth |
| GET | `/api/circles/me/memberships` | Private |
| POST | `/api/circles` | Private |
| POST | `/api/circles/invites/:code/redeem` | Private |
| GET | `/api/circles/:circleId/members` | Private |
| GET | `/api/circles/:circleId/channels` | Private |
| GET | `/api/circles/:circleId/roles` | Private |
| POST | `/api/circles/:circleId/roles` | Private |
| POST | `/api/circles/:circleId/roles/assign` | Private |
| GET | `/api/circles/:circleId/invites` | Private |
| POST | `/api/circles/:circleId/invites` | Private |
| POST | `/api/circles/:circleId/join` | Private |
| POST | `/api/circles/:circleId/leave` | Private |
| POST | `/api/circles/:circleId/channels` | Private |
| POST | `/api/circles/:circleId/channels/:channelId/pin` | Private |
| POST | `/api/circles/:circleId/posts/:postId/pin` | Private |

### Messages

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/messages/channels/:circleId/:channelId` | Private |
| POST | `/api/messages/channels/:circleId/:channelId` | Private |
| GET | `/api/messages/reads` | Private |
| POST | `/api/messages/reads` | Private |
| GET | `/api/messages/dm/conversations` | Private |
| POST | `/api/messages/dm/conversations/:userId` | Private |
| GET | `/api/messages/dm/conversations/:conversationId/messages` | Private |
| POST | `/api/messages/dm/conversations/:conversationId/messages` | Private |

### Notifications

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/notifications` | Private |
| GET | `/api/notifications/unread-count` | Private |
| PATCH | `/api/notifications/read-all` | Private |
| PATCH | `/api/notifications/:notificationId/read` | Private |

### Notification Preferences

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/notifications/preferences` | Private |
| PUT | `/api/notifications/preferences` | Private |
| GET | `/api/notifications/preferences/defaults` | Private |
| POST | `/api/notifications/preferences/reset` | Private |
| POST | `/api/notifications/preferences/enable-all` | Private |
| POST | `/api/notifications/preferences/disable-all` | Private |
| GET | `/api/notifications/preferences/summary` | Private |
| POST | `/api/notifications/preferences/test` | Private |

### Feed

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/feed/home` | Private |
| POST | `/api/feed/home/refresh` | Private |
| GET | `/api/feed/sphere` | Private |
| GET | `/api/feed/sphere/category/:category` | Private |
| GET | `/api/feed/ranking/:postId` | Private |

### Trending

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/trending/hashtags` | Public |
| GET | `/api/trending/topics` | Public |
| GET | `/api/trending/categories` | Public |
| GET | `/api/trending/stats` | Public |
| GET | `/api/trending/category/:category` | Private |
| GET | `/api/trending/hashtag/:tag` | Private |
| GET | `/api/trending/topic/:topic/:type?` | Private |
| GET | `/api/trending/region/:region` | Private |
| GET | `/api/trending/search` | Private |

### Search

| Method | Endpoint | Access |
|---|---|---|
| GET | `/api/search` | Public |

### Payments

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/payments/webhook` | Public webhook |
| POST | `/api/payments/initialize` | Private |
| GET | `/api/payments/verify/:reference` | Private |
| GET | `/api/payments/history` | Private |

### Moderation

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/moderation/reports` | Private |
| GET | `/api/moderation/reports` | Admin or moderator |
| POST | `/api/moderation/reports/:reportId/actions` | Admin or moderator |
| GET | `/api/moderation/audit-logs` | Admin or moderator |

## 13. Rate Limiting

Global limit:
- 100 requests per 15 minutes per IP, applied in `server.js`.

Auth limits:
- Strict auth limit: 5 requests per 15 minutes.
- General auth limit: 10 requests per 15 minutes.

Post limits:
- Post creation/reply/repost limit: 30 per 15 minutes.
- Interaction limit: 60 per minute.

Social limits:
- Follow actions: 100 per hour.

Feed and trending:
- Use `services/rate-limit.service.js` for selected feed/search/trending operations.

## 14. Security Posture

Implemented:
- Helmet security headers
- JWT authentication
- Refresh token validation
- Role-based access control
- Account status checks in auth flows
- Password hashing with bcrypt
- Login attempt lock fields
- Rate limiting
- CORS with credentials
- URL sanitizer for external profile URLs
- Protected admin/moderator routes

Current production concerns to address:
- `server.js` currently allows all CORS origins.
- `server.js` contains verbose request debug logging.
- `server.js` uses a temporary inline error handler and comments out the global error middleware.
- Some comments/log output appears mojibaked from encoding issues.
- `GET /api/auth/test` is still exposed.
- `npm test` is not implemented.

## 15. Environment Variables

Known or strongly implied variables from code and docs:

Core:
- `NODE_ENV`
- `PORT`
- `MONGODB_URI`
- `MONGODB_MAX_POOL_SIZE`
- `MONGODB_MIN_POOL_SIZE`

JWT:
- `JWT_SECRET`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_EMAIL_SECRET`
- `JWT_RESET_SECRET`
- `JWT_ACCESS_EXPIRES`
- `JWT_REFRESH_EXPIRES`

Redis:
- `REDIS_URL`

Kafka:
- `KAFKA_BROKERS`
- `KAFKA_CLIENT_ID`
- `KAFKA_PARTITIONS`
- `KAFKA_REPLICATION`

Realtime:
- `ENABLE_SOCKET_LEGACY_EVENTS`

Search:
- `ALGOLIA_APP_ID`
- `ALGOLIA_ADMIN_KEY`

Payments:
- `PAYSTACK_SECRET_KEY`

Production/security:
- `ALLOWED_ORIGINS`

Email, Google, Cloudinary, and Supabase configs likely require additional variables based on their config files and providers.

## 16. Local Development

Install dependencies:

```bash
npm install
```

Create a `.env` file with at least:

```env
NODE_ENV=development
PORT=3001
MONGODB_URI=<your MongoDB connection string>
JWT_ACCESS_SECRET=<long random secret>
JWT_REFRESH_SECRET=<long random secret>
JWT_EMAIL_SECRET=<long random secret>
JWT_RESET_SECRET=<long random secret>
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<your Brevo SMTP login>
SMTP_PASS=<your Brevo SMTP key>
SMTP_FROM=noreply@wemsty.com
```

Run in development:

```bash
npm run dev
```

Run normally:

```bash
npm start
```

Check health:

```bash
curl http://localhost:3001/api/health
```

## 17. Operational Notes

MongoDB:
- Required for boot.
- Check indexes on high-traffic collections before production launch.
- Use pagination for list endpoints.

Redis:
- Recommended for performance.
- Not required for boot.
- Needed for effective feed caching and Redis-backed helper behavior.

Kafka:
- Recommended for async event workflows.
- Not required for boot.
- If unavailable, API requests can still succeed but event streaming is skipped.

Socket.IO:
- Uses the same HTTP server as Express.
- Requires valid access tokens.
- Clients should reconnect after token refresh.

Payments:
- Webhook must be reachable by Paystack in production.
- Webhook route must verify provider signature.

## 18. Frontend Integration Contract

Frontend clients should:
- Use `/api/auth/signup` or `/api/auth/login` to obtain tokens.
- Attach `Authorization: Bearer <accessToken>` to protected routes.
- Refresh tokens through `/api/auth/refresh` before hard logout.
- Reconnect Socket.IO when tokens change.
- Treat backend counters as source of truth for likes, comments, reposts, bookmarks, followers, and unread notifications.
- Use backend viewer state fields when present instead of calculating local state from lists.
- Respect block/mute/follow status returned by the API.
- Use paginated endpoints for infinite lists.
- Avoid calling `/api/payments/webhook` from the frontend.
- Store uploaded media elsewhere and send URL fields where routes expect URLs, unless a specific upload route is added later.

## 19. Maintenance Scripts

Interaction cleanup:
- `npm run dedupe:interactions:dry`
- `npm run dedupe:interactions`
- `npm run clear:interactions:dry`
- `npm run clear:interactions`

These scripts are intended for interaction data maintenance around likes/reposts/bookmarks or similar records. Use dry-run first before applying.

## 20. Current Documentation Map

Use these docs together:

- `PROJECT_DOCUMENTATION.md`: broad system-level documentation for what has been built.
- `API_DOCUMENTATION.md`: detailed endpoint reference and frontend API contract.
- `PRODUCTION_CHECKLIST.md`: launch and operations checklist.

## 21. Recommended Next Documentation Improvements

High-value additions:
- Add `.env.example` with required variables and safe placeholder values.
- Add OpenAPI/Swagger documentation generated from the route layer.
- Add architecture diagrams for auth, feeds, realtime messaging, and notifications.
- Add test documentation after implementing the test suite.
- Add deployment-specific docs for Render, Heroku, Railway, or the chosen hosting platform.

## 22. Known Gaps and Cleanup Items

These are not failures of the documentation; they are visible project states worth tracking:

- Automated tests are not yet implemented.
- Global production error middleware exists but is commented out in `server.js`.
- CORS is currently open to all origins.
- Verbose request debug logging is active in `server.js`.
- Some source comments and logs have encoding artifacts.
- Profile image upload/storage is not exposed through a dedicated API route.
- Redis and Kafka are optional/fail-open, so production monitoring should distinguish "API is up" from "all infrastructure is healthy".
- The codebase has both `/api/posts/feed/*` and `/api/feed/*`, so frontend teams should choose one feed contract intentionally.
