// services/rate-limit.service.js - Advanced rate limiting and anti-spam service

const redisManager = require('../config/redis');
const User = require('../models/User.model');
const { kafkaManager } = require('../config/kafka');

class RateLimitService {
  constructor() {
    // Rate limit configurations (requests per window)
    this.limits = {
      // Authentication
      login: { windowMs: 15 * 60 * 1000, max: 5 }, // 5 attempts per 15 minutes
      register: { windowMs: 60 * 60 * 1000, max: 3 }, // 3 registrations per hour
      password_reset: { windowMs: 60 * 60 * 1000, max: 3 }, // 3 resets per hour
      otp_request: { windowMs: 60 * 1000, max: 5 }, // 5 OTP requests per minute

      // Post operations
      create_post: { windowMs: 60 * 1000, max: 10 }, // 10 posts per minute
      like_post: { windowMs: 60 * 1000, max: 50 }, // 50 likes per minute
      repost_post: { windowMs: 60 * 1000, max: 20 }, // 20 reposts per minute
      comment_post: { windowMs: 60 * 1000, max: 15 }, // 15 comments per minute

      // Messaging
      send_dm: { windowMs: 60 * 1000, max: 20 }, // 20 DMs per minute
      send_message: { windowMs: 60 * 1000, max: 50 }, // 50 messages per minute

      // Community operations
      join_community: { windowMs: 60 * 1000, max: 10 }, // 10 joins per minute
      create_community: { windowMs: 60 * 60 * 1000, max: 3 }, // 3 communities per hour
      invite_user: { windowMs: 60 * 1000, max: 10 }, // 10 invites per minute

      // Search and discovery
      search: { windowMs: 60 * 1000, max: 100 }, // 100 searches per minute
      get_feed: { windowMs: 60 * 1000, max: 200 }, // 200 feed requests per minute

      // General API
      general: { windowMs: 60 * 1000, max: 1000 } // 1000 general requests per minute
    };

    // User-based multipliers
    this.userMultipliers = {
      new_user: 0.5, // New users get 50% of normal limits
      verified_user: 1.5, // Verified users get 50% more
      premium_user: 2.0, // Premium users get 2x limits
      suspended_user: 0.1 // Suspended users get 10% of normal limits
    };

    // IP-based limits (stricter for shared IPs)
    this.ipLimits = {
      windowMs: 60 * 1000,
      max: 500 // 500 requests per minute per IP
    };
  }

  /**
   * Check if request is rate limited
   */
  async checkRateLimit(identifier, action, ip = null) {
    try {
      const limitConfig = this.limits[action] || this.limits.general;
      
      // Check IP-based limit first
      if (ip) {
        const ipResult = await this.checkIPRateLimit(ip, limitConfig);
        if (!ipResult.allowed) {
          return {
            allowed: false,
            reason: 'IP rate limit exceeded',
            ...ipResult
          };
        }
      }

      // Check user-based limit
      const userResult = await this.checkUserRateLimit(identifier, action, limitConfig);
      
      return {
        allowed: userResult.allowed,
        reason: userResult.allowed ? 'OK' : 'User rate limit exceeded',
        ...userResult
      };
    } catch (error) {
      console.error('Rate limit check error:', error.message);
      // Fail open - allow request if rate limiting fails
      return { allowed: true, reason: 'Rate limit service unavailable' };
    }
  }

  /**
   * Check IP-based rate limit
   */
  async checkIPRateLimit(ip, limitConfig) {
    const key = `rate_limit:ip:${ip}`;
    const result = await redisManager.incrementRateLimit(key, limitConfig.windowMs, limitConfig.max);
    
    return {
      allowed: result.count <= limitConfig.max,
      count: result.count,
      remaining: result.remaining,
      resetTime: result.reset,
      windowMs: limitConfig.windowMs
    };
  }

  /**
   * Check user-based rate limit
   */
  async checkUserRateLimit(userId, action, limitConfig) {
    const key = `rate_limit:user:${userId}:${action}`;
    const result = await redisManager.incrementRateLimit(key, limitConfig.windowMs, limitConfig.max);
    
    // Apply user-specific multipliers
    const userMultiplier = await this.getUserMultiplier(userId);
    const adjustedMax = Math.ceil(limitConfig.max * userMultiplier);
    
    return {
      allowed: result.count <= adjustedMax,
      count: result.count,
      remaining: Math.max(0, adjustedMax - result.count),
      resetTime: result.reset,
      windowMs: limitConfig.windowMs,
      multiplier: userMultiplier
    };
  }

  /**
   * Get user-specific rate limit multiplier
   */
  async getUserMultiplier(userId) {
    try {
      // Check cache first
      const cached = await redisManager.get(`user:multiplier:${userId}`);
      if (cached !== null) {
        return cached;
      }

      const user = await User.findById(userId).select('accountStatus createdAt isEmailVerified role');
      if (!user) {
        return this.userMultipliers.new_user;
      }

      let multiplier = 1.0;

      // Apply account status multiplier
      switch (user.accountStatus) {
        case 'suspended':
          multiplier = this.userMultipliers.suspended_user;
          break;
        case 'active':
          // Check if new user (less than 24 hours old)
          const accountAgeHours = (Date.now() - user.createdAt) / (1000 * 60 * 60);
          if (accountAgeHours < 24) {
            multiplier = this.userMultipliers.new_user;
          } else if (user.isEmailVerified) {
            multiplier = this.userMultipliers.verified_user;
          }
          break;
        default:
          multiplier = this.userMultipliers.new_user;
      }

      // Apply role multiplier (if premium role exists)
      if (user.role === 'premium') {
        multiplier *= this.userMultipliers.premium_user;
      }

      // Cache for 1 hour
      await redisManager.set(`user:multiplier:${userId}`, multiplier, 3600);

      return multiplier;
    } catch (error) {
      console.error('Error getting user multiplier:', error.message);
      return 1.0; // Default multiplier
    }
  }

  /**
   * Check for spam patterns
   */
  async checkSpamPatterns(userId, action, content = '') {
    try {
      const checks = [];

      // Check for rapid posting
      if (action === 'create_post') {
        const rapidPostCheck = await this.checkRapidPosting(userId);
        checks.push(rapidPostCheck);
      }

      // Check for duplicate content
      if (content) {
        const duplicateCheck = await this.checkDuplicateContent(userId, content);
        checks.push(duplicateCheck);
      }

      // Check for suspicious links
      const linkCheck = await this.checkSuspiciousLinks(content);
      checks.push(linkCheck);

      // Check for excessive mentions
      const mentionCheck = await this.checkExcessiveMentions(content);
      checks.push(mentionCheck);

      // Aggregate results
      const isSpam = checks.some(check => check.isSpam);
      const spamReasons = checks.filter(check => check.isSpam).map(check => check.reason);

      return {
        isSpam,
        reasons: spamReasons,
        checks
      };
    } catch (error) {
      console.error('Spam check error:', error.message);
      return { isSpam: false, reasons: [], checks: [] };
    }
  }

  /**
   * Check for rapid posting patterns
   */
  async checkRapidPosting(userId) {
    const key = `spam:rapid_post:${userId}`;
    const windowMs = 60 * 1000; // 1 minute window
    const maxPosts = 5;

    const result = await redisManager.incrementRateLimit(key, windowMs, maxPosts);

    return {
      isSpam: result.count > maxPosts,
      reason: 'Rapid posting detected',
      count: result.count,
      threshold: maxPosts
    };
  }

  /**
   * Check for duplicate content
   */
  async checkDuplicateContent(userId, content) {
    const key = `spam:duplicate:${userId}`;
    const contentHash = this.hashContent(content);
    
    // Check if this exact content was posted recently
    const recentContent = await redisManager.get(key);
    
    if (recentContent && recentContent.hash === contentHash) {
      const timeSinceLast = Date.now() - (recentContent.timestamp || 0);
      if (timeSinceLast < 300000) { // 5 minutes
        return {
          isSpam: true,
          reason: 'Duplicate content detected',
          timeSinceLast
        };
      }
    }

    // Store current content
    await redisManager.set(key, {
      hash: contentHash,
      timestamp: Date.now(),
      content: content.substring(0, 200) // Store truncated content
    }, 600); // 10 minutes

    return { isSpam: false };
  }

  /**
   * Check for suspicious links
   */
  async checkSuspiciousLinks(content) {
    if (!content) return { isSpam: false };

    // Count links
    const linkRegex = /https?:\/\/[^\s]+/g;
    const links = content.match(linkRegex) || [];
    
    if (links.length > 3) {
      return {
        isSpam: true,
        reason: 'Excessive links detected',
        linkCount: links.length
      };
    }

    // Check for short URLs (potential spam)
    const shortUrlRegex = /(bit\.ly|tinyurl|t\.co|goo\.gl)\/\w+/i;
    const hasShortUrls = links.some(link => shortUrlRegex.test(link));

    if (hasShortUrls && links.length > 1) {
      return {
        isSpam: true,
        reason: 'Suspicious short URLs detected',
        links
      };
    }

    return { isSpam: false };
  }

  /**
   * Check for excessive mentions
   */
  async checkExcessiveMentions(content) {
    if (!content) return { isSpam: false };

    const mentionRegex = /@\w+/g;
    const mentions = content.match(mentionRegex) || [];
    
    if (mentions.length > 10) {
      return {
        isSpam: true,
        reason: 'Excessive mentions detected',
        mentionCount: mentions.length
      };
    }

    return { isSpam: false };
  }

  /**
   * Hash content for duplicate detection
   */
  hashContent(content) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Apply temporary restrictions
   */
  async applyTemporaryRestriction(userId, reason, durationMinutes = 60) {
    try {
      const key = `restriction:${userId}`;
      const restriction = {
        reason,
        appliedAt: Date.now(),
        expiresAt: Date.now() + (durationMinutes * 60 * 1000)
      };

      await redisManager.set(key, restriction, durationMinutes * 60);

      // Emit event for monitoring
      await kafkaManager.emitModerationEvent('restriction_applied', userId, 'user', 'system', {
        reason,
        durationMinutes,
        restriction
      });

      return restriction;
    } catch (error) {
      console.error('Error applying restriction:', error.message);
      return null;
    }
  }

  /**
   * Check if user has active restrictions
   */
  async checkRestrictions(userId) {
    try {
      const key = `restriction:${userId}`;
      const restriction = await redisManager.get(key);
      
      if (!restriction) {
        return { hasRestriction: false };
      }

      // Check if restriction has expired
      if (Date.now() > restriction.expiresAt) {
        await redisManager.del(key);
        return { hasRestriction: false };
      }

      return {
        hasRestriction: true,
        restriction
      };
    } catch (error) {
      console.error('Error checking restrictions:', error.message);
      return { hasRestriction: false };
    }
  }

  /**
   * Get rate limit status for user
   */
  async getRateLimitStatus(userId, action) {
    try {
      const limitConfig = this.limits[action] || this.limits.general;
      const key = `rate_limit:user:${userId}:${action}`;
      
      const count = await redisManager.get(key);
      const userMultiplier = await this.getUserMultiplier(userId);
      const adjustedMax = Math.ceil(limitConfig.max * userMultiplier);

      return {
        action,
        limit: adjustedMax,
        remaining: Math.max(0, adjustedMax - (count || 0)),
        resetTime: Date.now() + limitConfig.windowMs,
        multiplier: userMultiplier
      };
    } catch (error) {
      console.error('Error getting rate limit status:', error.message);
      return null;
    }
  }

  /**
   * Reset rate limit for user (admin function)
   */
  async resetRateLimit(userId, action = null) {
    try {
      if (action) {
        // Reset specific action
        const key = `rate_limit:user:${userId}:${action}`;
        await redisManager.del(key);
      } else {
        // Reset all actions for user
        const keys = Object.keys(this.limits).map(action => 
          `rate_limit:user:${userId}:${action}`
        );
        
        await Promise.all(keys.map(key => redisManager.del(key)));
      }

      return true;
    } catch (error) {
      console.error('Error resetting rate limit:', error.message);
      return false;
    }
  }

  /**
   * Get abuse report for user
   */
  async getAbuseReport(userId) {
    try {
      const [rateLimitStatus, restrictionStatus, spamHistory] = await Promise.all([
        this.getUserRateLimitHistory(userId),
        this.checkRestrictions(userId),
        this.getSpamHistory(userId)
      ]);

      return {
        userId,
        rateLimitStatus,
        restrictionStatus,
        spamHistory,
        riskLevel: this.calculateRiskLevel(rateLimitStatus, restrictionStatus, spamHistory)
      };
    } catch (error) {
      console.error('Error generating abuse report:', error.message);
      return null;
    }
  }

  /**
   * Get user's rate limit history
   */
  async getUserRateLimitHistory(userId) {
    try {
      const actions = Object.keys(this.limits);
      const history = {};

      for (const action of actions) {
        const key = `rate_limit:user:${userId}:${action}`;
        const count = await redisManager.get(key);
        history[action] = count || 0;
      }

      return history;
    } catch (error) {
      console.error('Error getting rate limit history:', error.message);
      return {};
    }
  }

  /**
   * Get spam history for user
   */
  async getSpamHistory(userId) {
    try {
      const keys = [
        `spam:rapid_post:${userId}`,
        `spam:duplicate:${userId}`
      ];

      const history = {};
      for (const key of keys) {
        const data = await redisManager.get(key);
        if (data) {
          history[key.split(':')[1]] = data;
        }
      }

      return history;
    } catch (error) {
      console.error('Error getting spam history:', error.message);
      return {};
    }
  }

  /**
   * Calculate user risk level
   */
  calculateRiskLevel(rateLimitStatus, restrictionStatus, spamHistory) {
    let riskScore = 0;

    // Check rate limit violations
    Object.values(rateLimitStatus).forEach(count => {
      if (count > 10) riskScore += 2;
      else if (count > 5) riskScore += 1;
    });

    // Check restrictions
    if (restrictionStatus.hasRestriction) {
      riskScore += 5;
    }

    // Check spam history
    if (Object.keys(spamHistory).length > 0) {
      riskScore += 3;
    }

    // Determine risk level
    if (riskScore >= 8) return 'high';
    if (riskScore >= 4) return 'medium';
    if (riskScore >= 1) return 'low';
    return 'minimal';
  }

  /**
   * Cleanup expired rate limit data
   */
  async cleanup() {
    try {
      // This would typically be run as a scheduled job
      // Redis TTL handles most cleanup automatically
      console.log('Rate limit cleanup completed');
      return true;
    } catch (error) {
      console.error('Error during cleanup:', error.message);
      return false;
    }
  }
}

module.exports = new RateLimitService();