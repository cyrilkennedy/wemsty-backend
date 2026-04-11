const { Server } = require('socket.io');

const CircleMembership = require('../models/CircleMembership.model');
const DMConversation = require('../models/DMConversation.model');
const Notification = require('../models/Notification.model');
const realtimeEvents = require('./realtime-events.service');
const { authenticateSocketToken } = require('./socket-auth.service');
const {
  assertChannelAccess,
  getOrCreateConversation,
  sendChannelMessage,
  sendDMMessage,
  updateReadState
} = require('./messaging.service');

let ioInstance = null;
const emitLegacySocketEvents = process.env.ENABLE_SOCKET_LEGACY_EVENTS === 'true';
const userSocketCounts = new Map();
const userPresence = new Map();
const channelTypingUsers = new Map();
const typingTimeouts = new Map();

function getRealtime() {
  return ioInstance;
}

function getTypingKey(channelId, userId) {
  return `${channelId}:${userId}`;
}

async function emitUnreadNotificationCount(namespace, userId) {
  const unreadCount = await Notification.countDocuments({
    recipient: userId,
    readAt: null
  });

  namespace.to(`user:${userId}`).emit('notifications.unread.updated', {
    unreadCount
  });
}

async function joinPresenceRooms(socket, userId) {
  const memberships = await CircleMembership.find({
    user: userId,
    status: 'active'
  }).select('circle');

  for (const membership of memberships) {
    socket.join(`community:${membership.circle.toString()}:presence`);
  }
}

async function broadcastPresence(namespace, userId, status) {
  const payload = {
    userId,
    status,
    at: new Date().toISOString()
  };

  namespace.to(`user:${userId}`).emit('presence.updated', payload);

  const memberships = await CircleMembership.find({
    user: userId,
    status: 'active'
  }).select('circle');

  for (const membership of memberships) {
    namespace.to(`community:${membership.circle.toString()}:presence`).emit('presence.updated', payload);
  }
}

function emitTypingState(namespace, channelId) {
  const userIds = [...(channelTypingUsers.get(channelId) || [])];
  namespace.to(`channel:${channelId}`).emit('channel.typing.updated', {
    channelId,
    userIds
  });
}

function clearTypingState(namespace, channelId, userId) {
  const typingUsers = channelTypingUsers.get(channelId);
  if (!typingUsers) {
    return;
  }

  typingUsers.delete(userId);
  if (typingUsers.size === 0) {
    channelTypingUsers.delete(channelId);
  }

  const timeoutKey = getTypingKey(channelId, userId);
  const timeout = typingTimeouts.get(timeoutKey);
  if (timeout) {
    clearTimeout(timeout);
    typingTimeouts.delete(timeoutKey);
  }

  emitTypingState(namespace, channelId);
}

function setTypingState(namespace, channelId, userId) {
  const typingUsers = channelTypingUsers.get(channelId) || new Set();
  typingUsers.add(userId);
  channelTypingUsers.set(channelId, typingUsers);

  const timeoutKey = getTypingKey(channelId, userId);
  const existingTimeout = typingTimeouts.get(timeoutKey);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  typingTimeouts.set(timeoutKey, setTimeout(() => {
    clearTypingState(namespace, channelId, userId);
  }, 8000));

  emitTypingState(namespace, channelId);
}

function formatSocketError(error) {
  if (error?.data?.code && error?.message) {
    return {
      code: error.data.code,
      message: error.message
    };
  }

  if (error?.statusCode) {
    return {
      code: error.statusCode === 403 ? 'FORBIDDEN' : 'BAD_REQUEST',
      message: error.message
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: error?.message || 'Something went wrong'
  };
}

function initializeRealtime(httpServer) {
  if (ioInstance) {
    return ioInstance;
  }

  ioInstance = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true
    }
  });

  const namespace = ioInstance.of('/realtime');

  namespace.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      const user = await authenticateSocketToken(token);
      socket.user = user;
      next();
    } catch (error) {
      next(error);
    }
  });

  realtimeEvents.on('notification.created', async ({ recipient }) => {
    await emitUnreadNotificationCount(namespace, recipient.toString());
  });

  realtimeEvents.on('channel.message.created', ({ channelId, message }) => {
    namespace.to(`channel:${channelId}`).emit('channel.message.created', { message });
  });

  realtimeEvents.on('dm.message.created', ({ conversationId, recipientId, senderId, message }) => {
    namespace.to(`dm:${conversationId}`).emit('dm.message.created', { message });
    namespace.to(`user:${recipientId}`).emit('dm.message.created', { message });
    namespace.to(`user:${senderId}`).emit('dm.message.created', { message });
  });

  realtimeEvents.on('post.created', ({ post }) => {
    // Broadcast to all clients for real-time global feed updates
    namespace.emit('post.created', { post });
  });

  realtimeEvents.on('post.liked', ({ postId, likesCount, userId, liked }) => {
    const payload = {
      postId,
      likesCount,
      userId,
      liked: !!liked,
      isLiked: !!liked
    };

    // Room-targeted updates (if clients joined post room)
    namespace.to(`post:${postId.toString()}`).emit('post.liked.updated', payload);

    // Global updates for clients that did not join post rooms
    namespace.emit('post.liked.updated', payload);

    // Backward-compat event name (opt-in to avoid duplicate handling in clients)
    if (emitLegacySocketEvents) {
      namespace.emit('post:liked', payload);
    }
  });

  realtimeEvents.on('post.reposted', ({ postId, repostsCount, userId, reposted }) => {
    const payload = {
      postId,
      repostsCount,
      userId,
      reposted: !!reposted
    };

    namespace.to(`post:${postId.toString()}`).emit('post.reposted.updated', payload);
    namespace.emit('post.reposted.updated', payload);
    if (emitLegacySocketEvents) {
      namespace.emit('post:reposted', payload);
    }
  });

  namespace.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    socket.join(`user:${userId}`);
    await joinPresenceRooms(socket, userId);

    const currentCount = userSocketCounts.get(userId) || 0;
    userSocketCounts.set(userId, currentCount + 1);

    if (!userPresence.has(userId) || userPresence.get(userId) !== 'online') {
      userPresence.set(userId, 'online');
      await broadcastPresence(namespace, userId, 'online');
    }

    await emitUnreadNotificationCount(namespace, userId);

    socket.on('channel.join', async (payload = {}, ack = () => {}) => {
      try {
        const { channelId, circleId = null } = payload;
        if (!channelId) {
          throw new Error('channelId is required');
        }

        await assertChannelAccess({
          circleId,
          channelId,
          user: socket.user,
          requireMembership: false
        });

        socket.join(`channel:${channelId}`);
        ack({ ok: true, room: `channel:${channelId}` });
      } catch (error) {
        ack({ ok: false, error: formatSocketError(error) });
      }
    });

    socket.on('channel.leave', async (payload = {}, ack = () => {}) => {
      const { channelId } = payload;
      if (channelId) {
        socket.leave(`channel:${channelId}`);
        clearTypingState(namespace, channelId, userId);
      }

      ack({ ok: true, room: channelId ? `channel:${channelId}` : null });
    });

    socket.on('channel.message.create', async (payload = {}, ack = () => {}) => {
      try {
        const { channelId, circleId = null, bodyText, clientMessageId, replyToMessageId = null } = payload;
        const { message } = await sendChannelMessage({
          circleId,
          channelId,
          user: socket.user,
          bodyText,
          replyToMessageId
        });

        ack({
          ok: true,
          message,
          clientMessageId: clientMessageId || null
        });
      } catch (error) {
        ack({ ok: false, error: formatSocketError(error) });
      }
    });

    socket.on('dm.open', async (payload = {}, ack = () => {}) => {
      try {
        let conversation;
        if (payload.conversationId) {
          conversation = await DMConversation.findById(payload.conversationId)
            .populate('members', 'username profile.displayName profile.avatar');

          if (!conversation || !conversation.members.some((member) => member._id.toString() === userId)) {
            throw new Error('Conversation not found');
          }
        } else if (payload.userId) {
          conversation = await getOrCreateConversation({
            userId: socket.user._id,
            otherUserId: payload.userId
          });
        } else {
          throw new Error('conversationId or userId is required');
        }

        socket.join(`dm:${conversation._id.toString()}`);
        ack({
          ok: true,
          room: `dm:${conversation._id.toString()}`,
          conversation
        });
      } catch (error) {
        ack({ ok: false, error: formatSocketError(error) });
      }
    });

    socket.on('dm.message.create', async (payload = {}, ack = () => {}) => {
      try {
        const { conversationId, bodyText, clientMessageId } = payload;
        const { message } = await sendDMMessage({
          conversationId,
          user: socket.user,
          bodyText
        });

        socket.join(`dm:${conversationId}`);
        ack({
          ok: true,
          message,
          clientMessageId: clientMessageId || null
        });
      } catch (error) {
        ack({ ok: false, error: formatSocketError(error) });
      }
    });

    socket.on('channel.typing.start', async (payload = {}, ack = () => {}) => {
      try {
        const { channelId, circleId = null } = payload;
        await assertChannelAccess({
          circleId,
          channelId,
          user: socket.user,
          requireMembership: false
        });

        socket.join(`channel:${channelId}`);
        setTypingState(namespace, channelId, userId);
        ack({ ok: true });
      } catch (error) {
        ack({ ok: false, error: formatSocketError(error) });
      }
    });

    socket.on('channel.typing.stop', (payload = {}, ack = () => {}) => {
      if (payload.channelId) {
        clearTypingState(namespace, payload.channelId, userId);
      }

      ack({ ok: true });
    });

    socket.on('read.update', async (payload = {}, ack = () => {}) => {
      try {
        const { scopeType, scopeId, lastReadMessageId = null } = payload;
        const readState = await updateReadState({
          user: socket.user,
          scopeType,
          scopeId,
          lastReadMessageId
        });

        ack({ ok: true, readState });
      } catch (error) {
        ack({ ok: false, error: formatSocketError(error) });
      }
    });

    socket.on('presence.heartbeat', async (payload = {}, ack = () => {}) => {
      const nextStatus = ['online', 'offline', 'away'].includes(payload.status)
        ? payload.status
        : 'online';

      userPresence.set(userId, nextStatus);
      await broadcastPresence(namespace, userId, nextStatus);
      ack({ ok: true, status: nextStatus });
    });

    socket.on('disconnect', async () => {
      const nextCount = Math.max((userSocketCounts.get(userId) || 1) - 1, 0);
      if (nextCount === 0) {
        userSocketCounts.delete(userId);
        userPresence.set(userId, 'offline');
        await broadcastPresence(namespace, userId, 'offline');
      } else {
        userSocketCounts.set(userId, nextCount);
      }

      for (const [channelId] of socket.rooms) {
        if (channelId.startsWith('channel:')) {
          clearTypingState(namespace, channelId.replace('channel:', ''), userId);
        }
      }
    });
  });

  return ioInstance;
}

module.exports = {
  initializeRealtime,
  getRealtime
};
