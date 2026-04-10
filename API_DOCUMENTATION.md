# Wemsty Backend API Documentation

## Table of Contents
- [Overview](#overview)
- [Base URL](#base-url)
- [Authentication](#authentication)
- [Response Format](#response-format)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [API Endpoints](#api-endpoints)
  - [Health Check](#health-check)
  - [Authentication](#authentication-endpoints)
  - [Users](#users)
  - [Posts](#posts)
  - [Social](#social)
  - [Circles](#circles)
  - [Messages](#messages)
  - [Notifications](#notifications)
  - [Feed](#feed)
  - [Trending](#trending)
  - [Search](#search)
  - [Payments](#payments)
  - [Moderation](#moderation)
- [Realtime (WebSocket)](#realtime-websocket)
- [Data Models](#data-models)

---

## Overview

Wemsty is a social media platform with features including posts, circles (communities), direct messaging, notifications, and more. This API follows RESTful conventions and uses JWT for authentication.

**Base URL:** `http://localhost:3001/api` (development)

---

## Base URL

All API endpoints are relative to:

```
http://localhost:3001/api
```

---

## Authentication

Most endpoints require authentication via JWT tokens. Include the token in the `Authorization` header:

```
Authorization: Bearer <your_jwt_token>
```

### Token Types
- **Access Token**: Short-lived (15 minutes), used for API requests
- **Refresh Token**: Long-lived (7 days), used to obtain new access tokens

### Getting Tokens
1. Login via `/api/auth/login` or `/api/auth/google`
2. Tokens are returned in the response body AND set as HTTP-only cookies
3. Use the refresh token at `/api/auth/refresh` to get new access tokens

---

## Response Format

All responses follow a consistent JSON format:

### Success Response
```json
{
  "status": "success",
  "message": "Operation completed successfully",
  "data": {
    // Response data here
  }
}
```

### Error Response
```json
{
  "status": "error",
  "message": "Error description",
  "error": "Additional error details (dev mode only)"
}
```

### Paginated Response
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

---

## Error Handling

HTTP status codes indicate the result:

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Successful request |
| 201 | Created | Resource created successfully |
| 204 | No Content | Successful, no content returned |
| 400 | Bad Request | Invalid input or validation error |
| 401 | Unauthorized | Missing or invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource conflict (e.g., duplicate) |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Internal server error |

---

## Rate Limiting

API endpoints have rate limits to prevent abuse:

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Authentication | 5 requests | 15 minutes |
| General Auth | 10 requests | 15 minutes |
| Posts | 30 requests | 15 minutes |
| Interactions | 60 requests | 1 minute |
| Follow Actions | 100 requests | 1 hour |
| Global API | 100 requests | 15 minutes |

When rate limited, you'll receive a `429` response with a `retryAfter` field.

---

## API Endpoints

### Health Check

#### GET `/health`
Check if the API is running.

**Access:** Public

**Response:**
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

#### POST `/auth/signup`
Register a new user with email and password.

**Access:** Public

**Body:**
```json
{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "password123"
}
```

**Validation:**
- `email`: Valid email format, required
- `username`: 3-30 characters, letters/numbers/underscores only
- `password`: Minimum 8 characters

**Response:**
```json
{
  "status": "success",
  "message": "User registered successfully",
  "data": {
    "user": {
      "_id": "user_id",
      "email": "user@example.com",
      "username": "johndoe",
      "profile": { /* user profile */ }
    },
    "tokens": {
      "access": "jwt_access_token",
      "refresh": "jwt_refresh_token"
    }
  }
}
```

---

#### POST `/auth/login`
Login with email and password.

**Access:** Public

**Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Login successful",
  "data": {
    "user": { /* user object */ },
    "tokens": {
      "access": "jwt_access_token",
      "refresh": "jwt_refresh_token"
    }
  }
}
```

---

#### POST `/auth/google`
Authenticate with Google OAuth.

**Access:** Public

**Body:**
```json
{
  "idToken": "google_id_token_from_client"
}
```

**Response:** Same as login

---

#### POST `/auth/refresh`
Refresh access token using refresh token.

**Access:** Public (requires valid refresh token)

**Headers:** 
```
Authorization: Bearer <refresh_token>
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "access": "new_jwt_access_token"
  }
}
```

---

#### GET `/auth/me`
Get current logged-in user information.

**Access:** Private

**Response:**
```json
{
  "status": "success",
  "data": {
    "_id": "user_id",
    "email": "user@example.com",
    "username": "johndoe",
    "profile": { /* full profile */ },
    "role": "user",
    "isVerified": true
  }
}
```

---

#### POST `/auth/logout`
Logout from current device.

**Access:** Private

**Response:**
```json
{
  "status": "success",
  "message": "Logged out successfully"
}
```

---

#### POST `/auth/logout-all`
Logout from all devices.

**Access:** Private

**Response:**
```json
{
  "status": "success",
  "message": "Logged out from all devices"
}
```

---

#### POST `/auth/change-password`
Change password when logged in.

**Access:** Private

**Body:**
```json
{
  "currentPassword": "old_password",
  "newPassword": "new_password"
}
```

---

#### POST `/auth/forgot-password`
Request password reset (legacy flow).

**Access:** Public

**Body:**
```json
{
  "email": "user@example.com"
}
```

---

#### POST `/auth/reset-password`
Reset password with token (legacy flow).

**Access:** Public

**Body:**
```json
{
  "token": "reset_token_from_email",
  "newPassword": "new_password"
}
```

---

#### POST `/auth/password-reset/request`
Step 1: Request password reset with OTP.

**Access:** Public

**Body:**
```json
{
  "email": "user@example.com"
}
```

---

#### POST `/auth/password-reset/verify-otp`
Step 2: Verify OTP code.

**Access:** Public

**Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

---

#### POST `/auth/password-reset/reset`
Step 3: Reset password with verified token.

**Access:** Public

**Body:**
```json
{
  "token": "verified_token",
  "newPassword": "new_password"
}
```

---

#### POST `/auth/password-reset/resend-otp`
Resend OTP if not received or expired.

**Access:** Public

**Body:**
```json
{
  "email": "user@example.com"
}
```

---

#### POST `/auth/verify-email`
Verify email address.

**Access:** Public

**Body:**
```json
{
  "token": "email_verification_token"
}
```

---

#### POST `/auth/resend-verification`
Resend email verification.

**Access:** Private

**Response:**
```json
{
  "status": "success",
  "message": "Verification email sent"
}
```

---

### Users

#### GET `/users/handle/:username`
Get public user profile by username.

**Access:** Public (Optional Auth)

**Response:**
```json
{
  "status": "success",
  "data": {
    "_id": "user_id",
    "username": "johndoe",
    "displayName": "John Doe",
    "bio": "User bio",
    "avatar": "avatar_url",
    "coverImage": "cover_url",
    "followersCount": 100,
    "followingCount": 50,
    "postsCount": 25,
    "isFollowing": false,
    "isBlocked": false
  }
}
```

---

#### GET `/users/profile`
Get current user's full profile.

**Access:** Private

**Response:**
```json
{
  "status": "success",
  "data": {
    "_id": "user_id",
    "email": "user@example.com",
    "username": "johndoe",
    "displayName": "John Doe",
    "bio": "User bio",
    "avatar": "avatar_url",
    "coverImage": "cover_url",
    "location": "City, Country",
    "website": "https://example.com",
    "birthDate": "1990-01-01",
    "isVerified": true,
    "role": "user",
    "settings": { /* user settings */ },
    "followersCount": 100,
    "followingCount": 50,
    "postsCount": 25
  }
}
```

---

#### PATCH `/users/profile`
Update current user's profile.

**Access:** Private

**Body (all fields optional):**
```json
{
  "displayName": "John Doe",
  "bio": "Updated bio",
  "location": "New York, USA",
  "website": "https://johndoe.com",
  "birthDate": "1990-01-01"
}
```

---

#### DELETE `/users/account`
Delete/deactivate user account.

**Access:** Private

**Response:**
```json
{
  "status": "success",
  "message": "Account deleted successfully"
}
```

---

#### GET `/users`
Get all users (admin only).

**Access:** Private/Admin

**Query Parameters:**
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20)
- `search` (string): Search users by username or email
- `role` (string): Filter by role

---

#### PATCH `/users/:id/role`
Update user role (admin only).

**Access:** Private/Admin

**Body:**
```json
{
  "role": "moderator"
}
```

**Valid roles:** `user`, `moderator`, `admin`

---

#### PATCH `/users/:id/status`
Update user account status (admin/moderator).

**Access:** Private/Admin, Moderator

**Body:**
```json
{
  "status": "active"
}
```

**Valid statuses:** `active`, `suspended`, `deactivated`

---

### Posts

#### GET `/posts/trending`
Get trending posts.

**Access:** Public (Optional Auth)

**Query Parameters:**
- `limit` (number): Number of posts (default: 10)

**Response:**
```json
{
  "status": "success",
  "data": [ /* array of post objects */ ]
}
```

---

#### GET `/posts/categories`
List supported post categories.

**Access:** Public

**Response:**
```json
{
  "status": "success",
  "data": {
    "categories": [
      {
        "id": "general",
        "name": "General",
        "slug": "general",
        "description": "General discussions"
      },
      // ... more categories
    ]
  }
}
```

---

#### GET `/posts/sphere`
Get public Sphere feed (discovery/For You).

**Access:** Public (Optional Auth)

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page
- `category` (string): Filter by category

---

#### GET `/posts/category/:categorySlug`
Get posts for a specific category.

**Access:** Public (Optional Auth)

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page

---

#### GET `/posts/search`
Search posts.

**Access:** Public (Optional Auth)

**Query Parameters:**
- `q` (string): Search query (required)
- `page` (number): Page number
- `limit` (number): Items per page
- `category` (string): Filter by category
- `sort` (string): Sort by `relevance`, `recent`, or `popular`

---

#### GET `/posts/:postId`
Get a single post.

**Access:** Public (Optional Auth)

**Response:**
```json
{
  "status": "success",
  "data": {
    "_id": "post_id",
    "author": { /* user object */ },
    "content": "Post content",
    "category": "general",
    "media": [ /* media attachments */ ],
    "likesCount": 42,
    "repliesCount": 10,
    "repostsCount": 5,
    "viewsCount": 100,
    "isLiked": false,
    "isBookmarked": false,
    "isRepost": false,
    "originalPost": null,
    "replyTo": null,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

#### GET `/posts/:postId/thread`
Get post with all replies (thread view).

**Access:** Public (Optional Auth)

**Response:**
```json
{
  "status": "success",
  "data": {
    "post": { /* main post */ },
    "replies": [ /* array of reply posts */ ]
  }
}
```

---

#### GET `/posts/user/:username`
Get user's posts (profile feed).

**Access:** Public (Optional Auth)

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page
- `type` (string): `posts`, `replies`, or `all`

---

#### GET `/posts/feed/home`
Get home feed (posts from following).

**Access:** Private

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page

---

#### GET `/posts/feed/sphere`
Get Sphere/For You feed (discovery).

**Access:** Private

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page

---

#### POST `/posts`
Create a new post.

**Access:** Private

**Body:**
```json
{
  "content": "Post content here",
  "category": "general",
  "media": [
    {
      "type": "image",
      "url": "https://..."
    }
  ],
  "poll": null, // Optional poll object
  "tags": ["tag1", "tag2"] // Optional hashtags
}
```

**Rate Limit:** 30 posts per 15 minutes

---

#### POST `/posts/repost`
Repost or quote repost.

**Access:** Private

**Body:**
```json
{
  "originalPostId": "post_id_to_repost",
  "quoteContent": "Optional quote text" // Optional for quote repost
}
```

---

#### POST `/posts/reply`
Reply to a post (comment).

**Access:** Private

**Body:**
```json
{
  "replyTo": "parent_post_id",
  "content": "Reply content"
}
```

---

#### POST `/posts/:postId/like`
Like or unlike a post.

**Access:** Private

**Response:**
```json
{
  "status": "success",
  "data": {
    "isLiked": true,
    "likesCount": 43
  }
}
```

---

#### GET `/posts/:postId/likes`
Get users who liked a post.

**Access:** Private

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page

---

#### POST `/posts/:postId/bookmark`
Bookmark or unbookmark a post.

**Access:** Private

**Response:**
```json
{
  "status": "success",
  "data": {
    "isBookmarked": true
  }
}
```

---

#### GET `/posts/bookmarks/me`
Get current user's bookmarks.

**Access:** Private

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page

---

#### DELETE `/posts/:postId`
Delete a post.

**Access:** Private (only own posts)

**Response:**
```json
{
  "status": "success",
  "message": "Post deleted successfully"
}
```

---

### Social

#### POST `/social/follow/:userId`
Follow a user.

**Access:** Private

**Response:**
```json
{
  "status": "success",
  "data": {
    "isFollowing": true,
    "followRequestPending": false,
    "followersCount": 101
  }
}
```

---

#### DELETE `/social/follow/:userId`
Unfollow a user.

**Access:** Private

**Response:**
```json
{
  "status": "success",
  "data": {
    "isFollowing": false,
    "followersCount": 100
  }
}
```

---

#### GET `/social/follow/status/:userId`
Check follow status with a user.

**Access:** Private

**Response:**
```json
{
  "status": "success",
  "data": {
    "isFollowing": true,
    "isFollowedBy": false,
    "followRequestPending": false,
    "isBlocked": false,
    "isMuted": false
  }
}
```

---

#### GET `/social/follow-requests`
Get pending follow requests.

**Access:** Private

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "_id": "request_id",
      "fromUser": { /* user object */ },
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

#### POST `/social/follow-requests/:requestId/accept`
Accept a follow request.

**Access:** Private

---

#### POST `/social/follow-requests/:requestId/reject`
Reject a follow request.

**Access:** Private

---

#### GET `/social/followers/:userId`
Get user's followers.

**Access:** Private

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page

---

#### GET `/social/following/:userId`
Get users that a user follows.

**Access:** Private

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page

---

#### GET `/social/mutual/:userId`
Get mutual followers with a user.

**Access:** Private

---

#### GET `/social/suggestions`
Get follow suggestions.

**Access:** Private

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "_id": "user_id",
      "username": "suggested_user",
      "displayName": "Suggested User",
      "avatar": "avatar_url",
      "mutualFollowers": 5,
      "reason": "Followed by people you follow"
    }
  ]
}
```

---

#### POST `/social/block/:userId`
Block a user.

**Access:** Private

**Response:**
```json
{
  "status": "success",
  "data": {
    "isBlocked": true
  }
}
```

---

#### DELETE `/social/block/:userId`
Unblock a user.

**Access:** Private

---

#### GET `/social/blocked`
Get blocked users.

**Access:** Private

---

#### POST `/social/mute/:userId`
Mute a user.

**Access:** Private

---

#### DELETE `/social/mute/:userId`
Unmute a user.

**Access:** Private

---

#### GET `/social/muted`
Get muted users.

**Access:** Private

---

### Circles

#### GET `/circles`
List all circles (public).

**Access:** Public

---

#### GET `/circles/view/:identifier`
Get circle by ID or slug.

**Access:** Public (Optional Auth)

---

#### GET `/circles/me/memberships`
Get circles I'm a member of.

**Access:** Private

---

#### POST `/circles`
Create a new circle.

**Access:** Private

**Body:**
```json
{
  "name": "My Circle",
  "description": "Circle description",
  "slug": "my-circle",
  "isPrivate": false,
  "avatar": "avatar_url"
}
```

---

#### POST `/circles/invites/:code/redeem`
Redeem invite code to join a circle.

**Access:** Private

**Body:**
```json
{
  "code": "invite_code"
}
```

---

#### GET `/circles/:circleId/members`
Get circle members.

**Access:** Private (member only)

---

#### GET `/circles/:circleId/channels`
Get circle channels.

**Access:** Private (member only)

---

#### GET `/circles/:circleId/roles`
List roles in a circle.

**Access:** Private (member only)

---

#### POST `/circles/:circleId/roles`
Create a role in a circle.

**Access:** Private (admin only)

---

#### POST `/circles/:circleId/roles/assign`
Assign a role to a member.

**Access:** Private (admin only)

---

#### GET `/circles/:circleId/invites`
List invites for a circle.

**Access:** Private (admin only)

---

#### POST `/circles/:circleId/invites`
Create invite for a circle.

**Access:** Private (admin only)

---

#### POST `/circles/:circleId/join`
Join a circle.

**Access:** Private

---

#### POST `/circles/:circleId/leave`
Leave a circle.

**Access:** Private (member only)

---

#### POST `/circles/:circleId/channels`
Create a channel in a circle.

**Access:** Private (admin only)

---

#### POST `/circles/:circleId/channels/:channelId/pin`
Pin a channel.

**Access:** Private (admin only)

---

#### POST `/circles/:circleId/posts/:postId/pin`
Pin a post in a circle.

**Access:** Private (admin only)

---

### Messages

#### GET `/messages/channels/:circleId/:channelId`
Get messages from a circle channel.

**Access:** Private (member only)

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page
- `before` (string): Get messages before this timestamp

---

#### POST `/messages/channels/:circleId/:channelId`
Send a message to a circle channel.

**Access:** Private (member only)

**Body:**
```json
{
  "content": "Message content",
  "media": [ /* optional media */ ]
}
```

---

#### GET `/messages/reads`
Get read states for conversations.

**Access:** Private

---

#### POST `/messages/reads`
Update read state for messages.

**Access:** Private

**Body:**
```json
{
  "conversationId": "conversation_id",
  "lastReadMessageId": "message_id"
}
```

---

#### GET `/messages/dm/conversations`
List DM conversations.

**Access:** Private

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page

---

#### POST `/messages/dm/conversations/:userId`
Get or create DM conversation with a user.

**Access:** Private

---

#### GET `/messages/dm/conversations/:conversationId/messages`
Get messages from a DM conversation.

**Access:** Private

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page
- `before` (string): Get messages before this timestamp

---

#### POST `/messages/dm/conversations/:conversationId/messages`
Send a DM message.

**Access:** Private

**Body:**
```json
{
  "content": "Direct message content",
  "media": [ /* optional media */ ]
}
```

---

### Notifications

#### GET `/notifications`
Get user notifications.

**Access:** Private

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page
- `unread` (boolean): Filter by unread only

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "_id": "notification_id",
      "type": "like",
      "message": "John liked your post",
      "actor": { /* user who triggered notification */ },
      "target": { /* target post/comment */ },
      "isRead": false,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": { /* pagination info */ }
}
```

---

#### GET `/notifications/unread-count`
Get count of unread notifications.

**Access:** Private

**Response:**
```json
{
  "status": "success",
  "data": {
    "count": 5
  }
}
```

---

#### PATCH `/notifications/read-all`
Mark all notifications as read.

**Access:** Private

---

#### PATCH `/notifications/:notificationId/read`
Mark a notification as read.

**Access:** Private

---

### Notification Preferences

#### GET `/notifications/preferences`
Get user notification preferences.

**Access:** Private

---

#### PUT `/notifications/preferences`
Update user notification preferences.

**Access:** Private

**Body:**
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

#### GET `/notifications/preferences/defaults`
Get default notification preferences.

**Access:** Private

---

#### POST `/notifications/preferences/reset`
Reset notification preferences to defaults.

**Access:** Private

---

#### POST `/notifications/preferences/enable-all`
Enable all notifications.

**Access:** Private

---

#### POST `/notifications/preferences/disable-all`
Disable all notifications.

**Access:** Private

---

#### GET `/notifications/preferences/summary`
Get notification preferences summary.

**Access:** Private

---

#### POST `/notifications/preferences/test`
Send a test notification.

**Access:** Private

---

### Feed

#### GET `/feed/home`
Get home feed (following-based).

**Access:** Private

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page

---

#### POST `/feed/home/refresh`
Refresh feed cache.

**Access:** Private

---

#### GET `/feed/sphere`
Get Sphere feed (discovery/For You).

**Access:** Private

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page

---

#### GET `/feed/sphere/category/:category`
Get category-specific feed.

**Access:** Private

---

#### GET `/feed/ranking/:postId`
Get feed ranking information for a post (debug).

**Access:** Private

---

### Trending

#### GET `/trending/hashtags`
Get trending hashtags.

**Access:** Public

**Query Parameters:**
- `limit` (number): Number of hashtags (default: 10)

**Response:**
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

#### GET `/trending/topics`
Get trending topics.

**Access:** Public

---

#### GET `/trending/categories`
Get all available categories.

**Access:** Public

---

#### GET `/trending/stats`
Get trending statistics.

**Access:** Public

---

#### GET `/trending/category/:category`
Get trending topics by category.

**Access:** Private

---

#### GET `/trending/hashtag/:tag`
Get hashtag details.

**Access:** Private

---

#### GET `/trending/topic/:topic`
Get topic details.

**Access:** Private

**Optional Query Parameters:**
- `type` (string): Topic type filter

---

#### GET `/trending/region/:region`
Get regional trending topics.

**Access:** Private

---

#### GET `/trending/search`
Search hashtags.

**Access:** Private

**Query Parameters:**
- `q` (string): Search query

---

### Search

#### GET `/search`
Search all content (posts, users, hashtags).

**Access:** Public (Optional Auth)

**Query Parameters:**
- `q` (string): Search query (required)
- `type` (string): `all`, `posts`, `users`, or `hashtags`
- `page` (number): Page number
- `limit` (number): Items per page

**Response:**
```json
{
  "status": "success",
  "data": {
    "posts": [ /* matching posts */ ],
    "users": [ /* matching users */ ],
    "hashtags": [ /* matching hashtags */ ]
  }
}
```

---

### Payments

#### POST `/payments/webhook`
Paystack webhook (signature verified).

**Access:** Public

---

#### POST `/payments/initialize`
Initialize a payment.

**Access:** Private

**Body:**
```json
{
  "amount": 1000, // Amount in kobo (1000 = ₦10.00)
  "plan": "premium_monthly",
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "authorizationUrl": "https://checkout.paystack.com/...",
    "reference": "payment_reference"
  }
}
```

---

#### GET `/payments/verify/:reference`
Verify a payment.

**Access:** Private

---

#### GET `/payments/history`
Get transaction history.

**Access:** Private

---

### Moderation

#### POST `/moderation/reports`
Create a report.

**Access:** Private

**Body:**
```json
{
  "targetType": "post", // post, user, comment
  "targetId": "target_id",
  "reason": "spam",
  "description": "Additional details"
}
```

---

#### GET `/moderation/reports`
List reports (admin/moderator only).

**Access:** Private/Admin, Moderator

**Query Parameters:**
- `page` (number): Page number
- `limit` (number): Items per page
- `status` (string): `pending`, `resolved`, `dismissed`
- `type` (string): Filter by report type

---

#### POST `/moderation/reports/:reportId/actions`
Take moderation action on a report.

**Access:** Private/Admin, Moderator

**Body:**
```json
{
  "action": "dismiss", // dismiss, warn, suspend, ban, delete
  "reason": "No violation found",
  "duration": null // Duration in hours for temporary actions
}
```

---

#### GET `/moderation/audit-logs`
List audit logs (admin/moderator only).

**Access:** Private/Admin, Moderator

---

---

## Realtime (WebSocket)

Wemsty uses Socket.IO for realtime features. Connect to the `/realtime` namespace:

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3001/realtime', {
  auth: {
    token: 'your_jwt_access_token'
  }
});
```

### Events

#### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join:circle` | `{ circleId }` | Join a circle's channel |
| `leave:circle` | `{ circleId }` | Leave a circle's channel |
| `typing:start` | `{ conversationId }` | User started typing |
| `typing:stop` | `{ conversationId }` | User stopped typing |
| `message:read` | `{ messageId }` | Mark message as read |

#### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `new:notification` | `{ notification }` | New notification received |
| `new:message` | `{ message }` | New message in conversation |
| `message:read` | `{ messageId, userId }` | Message read receipt |
| `typing` | `{ userId, conversationId }` | User typing indicator |
| `user:online` | `{ userId }` | User came online |
| `user:offline` | `{ userId }` | User went offline |
| `post:liked` | `{ postId, userId }` | Someone liked a post |
| `post:replied` | `{ postId, reply }` | Someone replied to a post |
| `user:followed` | `{ userId, follower }` | Someone followed you |

---

## Data Models

### User
```javascript
{
  _id: "ObjectId",
  email: "user@example.com",
  username: "johndoe",
  displayName: "John Doe",
  password: "hashed_password",
  profile: {
    bio: "User bio",
    avatar: "avatar_url",
    coverImage: "cover_url",
    location: "City, Country",
    website: "https://example.com",
    birthDate: "1990-01-01"
  },
  role: "user", // user, moderator, admin
  isVerified: true,
  status: "active", // active, suspended, deactivated
  settings: {
    theme: "light",
    language: "en",
    timezone: "UTC"
  },
  followersCount: 100,
  followingCount: 50,
  postsCount: 25,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
}
```

### Post
```javascript
{
  _id: "ObjectId",
  author: "user_id",
  content: "Post content",
  category: "general",
  media: [
    {
      type: "image",
      url: "https://...",
      publicId: "cloudinary_public_id"
    }
  ],
  tags: ["hashtag1", "hashtag2"],
  likesCount: 42,
  repliesCount: 10,
  repostsCount: 5,
  viewsCount: 100,
  isRepost: false,
  originalPost: null, // Reference to original if repost
  replyTo: null, // Reference to parent if reply
  circle: null, // Reference to circle if circle post
  channel: null, // Reference to channel if channel post
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z"
}
```

### Notification
```javascript
{
  _id: "ObjectId",
  user: "user_id",
  type: "like", // like, reply, repost, follow, mention, system
  actor: "user_id", // Who triggered the notification
  target: "post_id", // Target post/comment
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
For file uploads (avatars, cover images, post media), use multipart/form-data requests to the appropriate endpoints. The backend uses Cloudinary for media storage.

### Pagination
All list endpoints support pagination. Use `page` and `limit` query parameters. Default limit is 20 items per page.

### Sorting
Some endpoints support sorting. Check the endpoint documentation for available sort options.

### CORS
CORS is enabled for all origins in development. In production, configure allowed origins in the server configuration.

---

**API Version:** 4.0  
**Last Updated:** 2024

For support or questions, please contact the development team.