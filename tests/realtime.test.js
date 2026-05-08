const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const { io: createClient } = require('socket.io-client');

const User = require('../models/User.model');
const CircleMembership = require('../models/CircleMembership.model');
const Notification = require('../models/Notification.model');
const redisManager = require('../config/redis');
const { initializeRealtime, getRealtime } = require('../services/realtime.service');

function waitForClientEvent(client, eventName) {
  return new Promise((resolve) => {
    client.once(eventName, resolve);
  });
}

function createClientConnection(port, token = null) {
  return createClient(`http://127.0.0.1:${port}/realtime`, {
    auth: token ? { token } : {},
    reconnection: false,
    timeout: 1000,
    transports: ['websocket']
  });
}

function emitWithAck(client, eventName, payload) {
  return new Promise((resolve) => {
    client.timeout(1000).emit(eventName, payload, (error, response) => {
      if (error) {
        resolve({ ok: false, error: error.message });
        return;
      }

      resolve(response);
    });
  });
}

async function runRealtimeTests() {
  const originalJwtSecret = process.env.JWT_ACCESS_SECRET;
  const originalUserFindById = User.findById;
  const originalMembershipFind = CircleMembership.find;
  const originalNotificationCount = Notification.countDocuments;
  const originalSetUserOnline = redisManager.setUserOnline;
  const originalSetUserOffline = redisManager.setUserOffline;

  let server;
  let port;

  try {
    process.env.JWT_ACCESS_SECRET = 'realtime-test-secret';

    const fakeUser = {
      _id: { toString: () => 'user-realtime-1' },
      accountStatus: 'active',
      isLocked: false,
      tokenVersion: 0,
      changedPasswordAfter: () => false
    };

    User.findById = () => ({
      select: async () => fakeUser
    });
    CircleMembership.find = () => ({
      select: async () => []
    });
    Notification.countDocuments = async () => 0;
    redisManager.setUserOnline = async () => {};
    redisManager.setUserOffline = async () => {};

    server = http.createServer();
    await initializeRealtime(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = server.address().port;

    const rejectedClient = createClientConnection(port);
    const rejectedError = await waitForClientEvent(rejectedClient, 'connect_error');
    assert.match(rejectedError.message, /token/i);
    rejectedClient.close();

    const token = jwt.sign(
      { userId: 'user-realtime-1', tokenVersion: 0, type: 'access' },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    const client = createClientConnection(port, token);
    await waitForClientEvent(client, 'connect');
    assert.equal(client.connected, true);

    const heartbeatAck = await emitWithAck(client, 'presence.heartbeat', { status: 'away' });
    assert.deepEqual(heartbeatAck, { ok: true, status: 'away' });

    const leaveAck = await emitWithAck(client, 'channel.leave', { channelId: 'channel-1' });
    assert.equal(leaveAck.ok, true);

    const invalidJoinAck = await emitWithAck(client, 'channel.join', {});
    assert.equal(invalidJoinAck.ok, false);

    const invalidDmAck = await emitWithAck(client, 'dm.open', {});
    assert.equal(invalidDmAck.ok, false);

    client.close();
  } finally {
    if (getRealtime()) {
      getRealtime().close();
    }

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }

    if (originalJwtSecret === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = originalJwtSecret;
    }

    User.findById = originalUserFindById;
    CircleMembership.find = originalMembershipFind;
    Notification.countDocuments = originalNotificationCount;
    redisManager.setUserOnline = originalSetUserOnline;
    redisManager.setUserOffline = originalSetUserOffline;
  }
}

module.exports = runRealtimeTests;
