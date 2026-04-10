// config/redis.js - Redis configuration for caching and real-time features

const redis = require('redis');

class RedisManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      this.client = redis.createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              return new Error('Redis connection failed after maximum retries');
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      this.client.on('connect', () => {
        console.log('✅ Redis connected');
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        console.error('❌ Redis error:', err.message);
        this.isConnected = false;
      });

      this.client.on('disconnect', () => {
        console.log('⚠️  Redis disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
      return this.client;
    } catch (error) {
      console.error('Failed to connect to Redis:', error.message);
      throw error;
    }
  }

  async get(key) {
    if (!this.isConnected || !this.client) {
      return null;
    }
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis GET error:', error.message);
      return null;
    }
  }

  async set(key, value, ttlSeconds = null) {
    if (!this.isConnected || !this.client) {
      return false;
    }
    try {
      const serialized = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, serialized);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (error) {
      console.error('Redis SET error:', error.message);
      return false;
    }
  }

  async del(key) {
    if (!this.isConnected || !this.client) {
      return false;
    }
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('Redis DEL error:', error.message);
      return false;
    }
  }

  async incr(key) {
    if (!this.isConnected || !this.client) {
      return null;
    }
    try {
      return await this.client.incr(key);
    } catch (error) {
      console.error('Redis INCR error:', error.message);
      return null;
    }
  }

  async decr(key) {
    if (!this.isConnected || !this.client) {
      return null;
    }
    try {
      return await this.client.decr(key);
    } catch (error) {
      console.error('Redis DECR error:', error.message);
      return null;
    }
  }

  async expire(key, seconds) {
    if (!this.isConnected || !this.client) {
      return false;
    }
    try {
      await this.client.expire(key, seconds);
      return true;
    } catch (error) {
      console.error('Redis EXPIRE error:', error.message);
      return false;
    }
  }

  async exists(key) {
    if (!this.isConnected || !this.client) {
      return false;
    }
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis EXISTS error:', error.message);
      return false;
    }
  }

  async hset(key, field, value) {
    if (!this.isConnected || !this.client) {
      return false;
    }
    try {
      await this.client.hSet(key, field, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Redis HSET error:', error.message);
      return false;
    }
  }

  async hget(key, field) {
    if (!this.isConnected || !this.client) {
      return null;
    }
    try {
      const value = await this.client.hGet(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis HGET error:', error.message);
      return null;
    }
  }

  async hgetall(key) {
    if (!this.isConnected || !this.client) {
      return {};
    }
    try {
      const result = await this.client.hGetAll(key);
      const parsed = {};
      for (const [field, value] of Object.entries(result)) {
        parsed[field] = JSON.parse(value);
      }
      return parsed;
    } catch (error) {
      console.error('Redis HGETALL error:', error.message);
      return {};
    }
  }

  async sadd(key, ...members) {
    if (!this.isConnected || !this.client) {
      return 0;
    }
    try {
      return await this.client.sAdd(key, members);
    } catch (error) {
      console.error('Redis SADD error:', error.message);
      return 0;
    }
  }

  async smembers(key) {
    if (!this.isConnected || !this.client) {
      return [];
    }
    try {
      return await this.client.sMembers(key);
    } catch (error) {
      console.error('Redis SMEMBERS error:', error.message);
      return [];
    }
  }

  async srem(key, ...members) {
    if (!this.isConnected || !this.client) {
      return 0;
    }
    try {
      return await this.client.sRem(key, members);
    } catch (error) {
      console.error('Redis SREM error:', error.message);
      return 0;
    }
  }

  async zadd(key, score, member) {
    if (!this.isConnected || !this.client) {
      return 0;
    }
    try {
      return await this.client.zAdd(key, { score, value: member });
    } catch (error) {
      console.error('Redis ZADD error:', error.message);
      return 0;
    }
  }

  async zrange(key, start, stop) {
    if (!this.isConnected || !this.client) {
      return [];
    }
    try {
      return await this.client.zRange(key, start, stop);
    } catch (error) {
      console.error('Redis ZRANGE error:', error.message);
      return [];
    }
  }

  async zrem(key, ...members) {
    if (!this.isConnected || !this.client) {
      return 0;
    }
    try {
      return await this.client.zRem(key, members);
    } catch (error) {
      console.error('Redis ZREM error:', error.message);
      return 0;
    }
  }

  async publish(channel, message) {
    if (!this.isConnected || !this.client) {
      return 0;
    }
    try {
      return await this.client.publish(channel, JSON.stringify(message));
    } catch (error) {
      console.error('Redis PUBLISH error:', error.message);
      return 0;
    }
  }

  async subscribe(channel, callback) {
    if (!this.isConnected || !this.client) {
      return;
    }
    try {
      const subscriber = this.client.duplicate();
      await subscriber.connect();
      await subscriber.subscribe(channel, (message) => {
        callback(JSON.parse(message));
      });
    } catch (error) {
      console.error('Redis SUBSCRIBE error:', error.message);
    }
  }

  async close() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  // Cache helpers
  async cacheWithExpiry(key, fetchFn, ttlSeconds = 300) {
    // Try to get from cache first
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    const data = await fetchFn();
    
    // Cache the result
    if (data !== null && data !== undefined) {
      await this.set(key, data, ttlSeconds);
    }

    return data;
  }

  // Rate limiting helpers
  async incrementRateLimit(key, windowMs, maxRequests) {
    const count = await this.incr(key);
    if (count === 1) {
      await this.expire(key, Math.floor(windowMs / 1000));
    }
    return {
      count,
      remaining: Math.max(0, maxRequests - count),
      reset: Date.now() + windowMs
    };
  }

  // Feed cache helpers
  async addPostToFeedCache(userId, postId, score) {
    const key = `feed:user:${userId}`;
    await this.zadd(key, score, postId);
    // Keep only last 1000 posts in cache
    await this.client.zRemRangeByRank(key, 0, -1001);
  }

  async getFeedFromCache(userId, limit = 20, offset = 0) {
    const key = `feed:user:${userId}`;
    return await this.zrange(key, offset, offset + limit - 1);
  }

  async invalidateUserFeedCache(userId) {
    await this.del(`feed:user:${userId}`);
  }

  // Online presence helpers
  async setUserOnline(userId, status = 'online') {
    const key = `user:presence:${userId}`;
    await this.set(key, { status, lastSeen: Date.now() }, 300); // 5 min TTL
  }

  async getUserOnline(userId) {
    const key = `user:presence:${userId}`;
    return await this.get(key);
  }

  async setUserOffline(userId) {
    const key = `user:presence:${userId}`;
    await this.set(key, { status: 'offline', lastSeen: Date.now() }, 3600); // 1 hour TTL
  }

  // Typing indicator helpers
  async setTypingIndicator(channelId, userId, ttlSeconds = 5) {
    const key = `typing:channel:${channelId}`;
    await this.sadd(key, userId);
    await this.expire(key, ttlSeconds);
  }

  async clearTypingIndicator(channelId, userId) {
    const key = `typing:channel:${channelId}`;
    await this.srem(key, userId);
  }

  async getTypingUsers(channelId) {
    const key = `typing:channel:${channelId}`;
    return await this.smembers(key);
  }
}

// Singleton instance
const redisManager = new RedisManager();

module.exports = redisManager;