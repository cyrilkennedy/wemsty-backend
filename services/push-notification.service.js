// services/push-notification.service.js - Push notification service for mobile and web

const User = require('../models/User.model');
const Notification = require('../models/Notification.model');
const { kafkaManager } = require('../config/kafka');

class PushNotificationService {
  constructor() {
    // In-memory store for active connections (for development)
    this.activeConnections = new Map();
    
    // Notification types mapping
    this.notificationTypes = {
      follow: {
        title: 'New Follower',
        body: (actor, recipient) => `${actor?.profile?.displayName || actor?.username} started following you`
      },
      like: {
        title: 'New Like',
        body: (actor, recipient, object) => `${actor?.profile?.displayName || actor?.username} liked your post`
      },
      reply: {
        title: 'New Reply',
        body: (actor, recipient, object) => `${actor?.profile?.displayName || actor?.username} replied to your post`
      },
      repost: {
        title: 'New Repost',
        body: (actor, recipient, object) => `${actor?.profile?.displayName || actor?.username} reposted your post`
      },
      mention: {
        title: 'New Mention',
        body: (actor, recipient, object) => `${actor?.profile?.displayName || actor?.username} mentioned you`
      },
      dm: {
        title: 'New Message',
        body: (actor, recipient, object) => `${actor?.profile?.displayName || actor?.username}: ${object?.bodyText?.substring(0, 50) || 'Sent you a message'}`
      },
      channel_mention: {
        title: 'Channel Mention',
        body: (actor, recipient, object) => `${actor?.profile?.displayName || actor?.username} mentioned you in a channel`
      },
      invite: {
        title: 'New Invite',
        body: (actor, recipient, object) => `${actor?.profile?.displayName || actor?.username} invited you to a community`
      },
      circle_activity: {
        title: 'Community Activity',
        body: (actor, recipient, object) => `New activity in ${object?.circle?.name || 'your community'}`
      }
    };
  }

  /**
   * Register a device for push notifications
   */
  async registerDevice(userId, deviceInfo) {
    const {
      deviceToken,
      deviceType, // 'ios', 'android', 'web'
      deviceName,
      appVersion
    } = deviceInfo;

    try {
      // Store device token in user document
      await User.updateOne(
        { _id: userId },
        {
          $addToSet: {
            pushTokens: {
              token: deviceToken,
              type: deviceType,
              name: deviceName,
              version: appVersion,
              createdAt: new Date()
            }
          }
        }
      );

      console.log(`✅ Device registered for user ${userId}: ${deviceType}`);
      return true;
    } catch (error) {
      console.error('Error registering device:', error.message);
      return false;
    }
  }

  /**
   * Unregister a device
   */
  async unregisterDevice(userId, deviceToken) {
    try {
      await User.updateOne(
        { _id: userId },
        {
          $pull: {
            pushTokens: { token: deviceToken }
          }
        }
      );

      console.log(`✅ Device unregistered for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Error unregistering device:', error.message);
      return false;
    }
  }

  /**
   * Send push notification to a user
   */
  async sendToUser(userId, notificationData) {
    try {
      const user = await User.findById(userId).select('pushTokens username profile');
      if (!user || !user.pushTokens || user.pushTokens.length === 0) {
        console.log(`⚠️  No push tokens for user ${userId}`);
        return false;
      }

      // Send to all registered devices
      const results = await Promise.allSettled(
        user.pushTokens.map(token => this.sendToDevice(token, notificationData))
      );

      // Check for failed sends (invalid tokens)
      const failedTokens = [];
      results.forEach((result, index) => {
        if (result.status === 'rejected' || (result.value && result.value.error)) {
          failedTokens.push(user.pushTokens[index].token);
        }
      });

      // Remove invalid tokens
      if (failedTokens.length > 0) {
        await User.updateOne(
          { _id: userId },
          { $pull: { pushTokens: { token: { $in: failedTokens } } } }
        );
      }

      return true;
    } catch (error) {
      console.error('Error sending push to user:', error.message);
      return false;
    }
  }

  /**
   * Send push notification to multiple users
   */
  async sendToUsers(userIds, notificationData) {
    try {
      await Promise.allSettled(
        userIds.map(userId => this.sendToUser(userId, notificationData))
      );
      return true;
    } catch (error) {
      console.error('Error sending push to users:', error.message);
      return false;
    }
  }

  /**
   * Send push notification to a device
   */
  async sendToDevice(deviceToken, notificationData) {
    const { title, body, data = {}, badge = 1 } = notificationData;

    // Check if device is connected via WebSocket (for web)
    if (this.activeConnections.has(deviceToken)) {
      const socket = this.activeConnections.get(deviceToken);
      socket.emit('push-notification', {
        title,
        body,
        data,
        timestamp: new Date().toISOString()
      });
      return { success: true };
    }

    // For mobile devices, use platform-specific push services
    // This is a placeholder - in production, you'd integrate with:
    // - Firebase Cloud Messaging (FCM) for Android
    // - Apple Push Notification Service (APNs) for iOS
    
    console.log(`📱 Push notification to ${deviceToken}:`, { title, body, data });
    
    // Simulate API call to push service
    return { success: true };
  }

  /**
   * Create in-app notification and optionally send push
   */
  async createNotification({
    recipientId,
    actorId,
    type,
    objectType,
    objectId,
    circleId,
    channelId,
    previewText,
    sendPush = true
  }) {
    try {
      // Create in-app notification
      const notification = await Notification.create({
        recipient: recipientId,
        actor: actorId,
        type,
        objectType,
        objectId,
        circle: circleId,
        channel: channelId,
        previewText
      });

      // Send push notification if requested
      if (sendPush) {
        await this.sendNotificationPush(recipientId, type, actorId, objectId, objectType);
      }

      // Emit event for real-time updates
      await kafkaManager.emitNotificationEvent('created', recipientId, {
        notificationId: notification._id,
        type,
        actorId,
        objectId
      });

      return notification;
    } catch (error) {
      console.error('Error creating notification:', error.message);
      return null;
    }
  }

  /**
   * Send push notification for a specific notification type
   */
  async sendNotificationPush(recipientId, notificationType, actorId, objectId, objectType) {
    try {
      const typeConfig = this.notificationTypes[notificationType];
      if (!typeConfig) {
        console.log(`⚠️  Unknown notification type: ${notificationType}`);
        return;
      }

      // Get actor and recipient data
      const [actor, recipient] = await Promise.all([
        User.findById(actorId).select('username profile.displayName profile.avatar').lean(),
        User.findById(recipientId).select('username profile.displayName pushTokens').lean()
      ]);

      if (!recipient || !recipient.pushTokens || recipient.pushTokens.length === 0) {
        return;
      }

      // Get object data if needed
      let objectData = null;
      if (objectType === 'post') {
        const Post = require('../models/Post.model');
        objectData = await Post.findById(objectId).select('content.bodyText').lean();
      }

      // Build notification payload
      const title = typeConfig.title;
      const body = typeConfig.body(actor, recipient, objectData);

      const notificationData = {
        title,
        body,
        data: {
          type: notificationType,
          actorId: actorId?.toString(),
          objectId: objectId?.toString(),
          objectType,
          timestamp: new Date().toISOString()
        }
      };

      await this.sendToUser(recipientId, notificationData);
    } catch (error) {
      console.error('Error sending notification push:', error.message);
    }
  }

  /**
   * Send batch notifications (for community announcements, etc.)
   */
  async sendBatchNotification({
    recipientIds,
    title,
    body,
    data = {},
    sendPush = true
  }) {
    try {
      // Create in-app notifications for all recipients
      const notifications = recipientIds.map(recipientId => ({
        recipient: recipientId,
        type: 'circle_activity',
        previewText: body.substring(0, 280)
      }));

      await Notification.insertMany(notifications);

      // Send push notifications
      if (sendPush) {
        const pushData = { title, body, data };
        await this.sendToUsers(recipientIds, pushData);
      }

      return true;
    } catch (error) {
      console.error('Error sending batch notification:', error.message);
      return false;
    }
  }

  /**
   * Register WebSocket connection for real-time notifications
   */
  registerWebSocketConnection(deviceToken, socket) {
    this.activeConnections.set(deviceToken, socket);
    console.log(`✅ WebSocket registered for device: ${deviceToken}`);
  }

  /**
   * Unregister WebSocket connection
   */
  unregisterWebSocketConnection(deviceToken) {
    this.activeConnections.delete(deviceToken);
    console.log(`✅ WebSocket unregistered for device: ${deviceToken}`);
  }

  /**
   * Send real-time notification via WebSocket
   */
  sendRealtimeNotification(userId, notificationData) {
    // Find all WebSocket connections for this user
    for (const [deviceToken, socket] of this.activeConnections) {
      // Check if this device belongs to the user
      // This would require a mapping of deviceToken to userId
      socket.emit('notification', notificationData);
    }
  }

  /**
   * Get notification preferences for a user
   */
  async getNotificationPreferences(userId) {
    try {
      const user = await User.findById(userId).select('notificationSettings');
      return user?.notificationSettings || this.getDefaultPreferences();
    } catch (error) {
      console.error('Error getting notification preferences:', error.message);
      return this.getDefaultPreferences();
    }
  }

  /**
   * Update notification preferences for a user
   */
  async updateNotificationPreferences(userId, preferences) {
    try {
      await User.updateOne(
        { _id: userId },
        { $set: { notificationSettings: preferences } }
      );
      return true;
    } catch (error) {
      console.error('Error updating notification preferences:', error.message);
      return false;
    }
  }

  /**
   * Get default notification preferences
   */
  getDefaultPreferences() {
    return {
      email: {
        follow: true,
        like: false,
        reply: true,
        repost: false,
        mention: true,
        dm: true,
        channel_mention: true,
        invite: true,
        circle_activity: true
      },
      push: {
        follow: true,
        like: false,
        reply: true,
        repost: false,
        mention: true,
        dm: true,
        channel_mention: true,
        invite: true,
        circle_activity: false
      },
      sms: {
        dm: true // Only DMs via SMS
      }
    };
  }

  /**
   * Clean up invalid push tokens
   */
  async cleanupInvalidTokens() {
    try {
      // Find users with push tokens older than 1 year
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
      
      const result = await User.updateMany(
        {
          pushTokens: { $exists: true, $ne: [] },
          'pushTokens.createdAt': { $lt: oneYearAgo }
        },
        { $set: { pushTokens: [] } }
      );

      console.log(`🧹 Cleaned up ${result.modifiedCount} users with old push tokens`);
      return result.modifiedCount;
    } catch (error) {
      console.error('Error cleaning up invalid tokens:', error.message);
      return 0;
    }
  }

  /**
   * Send scheduled notifications (digest, reminders, etc.)
   */
  async sendScheduledNotifications() {
    try {
      // Get users who haven't been notified recently
      const users = await User.find({
        accountStatus: 'active',
        isEmailVerified: true,
        pushTokens: { $exists: true, $ne: [] }
      }).limit(100);

      // Send digest notifications
      for (const user of users) {
        // Check if user has any new activity since last notification
        const lastNotification = await Notification.findOne({
          recipient: user._id,
          createdAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }).sort({ createdAt: -1 });

        if (lastNotification) {
          await this.sendToUser(user._id, {
            title: 'Wemsty Digest',
            body: 'You have new activity on Wemsty',
            data: { type: 'digest' }
          });
        }
      }

      return true;
    } catch (error) {
      console.error('Error sending scheduled notifications:', error.message);
      return false;
    }
  }
}

module.exports = new PushNotificationService();