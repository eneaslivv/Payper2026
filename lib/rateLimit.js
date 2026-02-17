// Rate Limiting Utility for Production
// Supports both in-memory (development) and Redis (production)

class InMemoryStore {
  constructor() {
    this.store = new Map();
    this.cleanup();
  }

  async get(key) {
    const data = this.store.get(key);
    if (!data || Date.now() > data.resetTime) {
      return null;
    }
    return data;
  }

  async set(key, value, ttl) {
    this.store.set(key, {
      ...value,
      resetTime: Date.now() + (ttl * 1000)
    });
  }

  cleanup() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, data] of this.store.entries()) {
        if (now > data.resetTime) {
          this.store.delete(key);
        }
      }
    }, 60000); // Cleanup every minute
  }
}

let store;
let redisClient;

// Initialize store based on environment
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    const { Redis } = require('@upstash/redis');
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    store = 'redis';
    console.log('[RATE_LIMIT] Using Redis store');
  } catch (e) {
    console.warn('[RATE_LIMIT] Redis unavailable, falling back to memory');
    store = new InMemoryStore();
  }
} else {
  store = new InMemoryStore();
  console.log('[RATE_LIMIT] Using in-memory store');
}

/**
 * Rate limiting function
 * @param {string} identifier - Unique identifier (IP, user ID, etc.)
 * @param {number} limit - Maximum requests allowed
 * @param {number} window - Time window in seconds
 * @param {string} prefix - Key prefix for namespacing
 */
export async function rateLimit(identifier, limit = 100, window = 60, prefix = 'rl') {
  const key = `${prefix}:${identifier}`;
  
  try {
    let current, resetTime;

    if (store === 'redis') {
      // Redis implementation
      const multi = redisClient.multi();
      multi.incr(key);
      multi.expire(key, window);
      const results = await multi.exec();
      current = results[0];
      resetTime = Date.now() + (window * 1000);
    } else {
      // In-memory implementation
      const existing = await store.get(key);
      if (existing) {
        current = existing.current + 1;
        resetTime = existing.resetTime;
        await store.set(key, { current }, Math.max(0, (resetTime - Date.now()) / 1000));
      } else {
        current = 1;
        resetTime = Date.now() + (window * 1000);
        await store.set(key, { current }, window);
      }
    }

    const isAllowed = current <= limit;
    const remaining = Math.max(0, limit - current);

    // Log rate limit violations for monitoring
    if (!isAllowed) {
      console.warn(`[RATE_LIMIT_EXCEEDED] ${key} - ${current}/${limit} - ${new Date().toISOString()}`);
    }

    return {
      success: isAllowed,
      limit,
      current,
      remaining,
      resetTime
    };
  } catch (error) {
    console.error('[RATE_LIMIT_ERROR]', error);
    // Fail open - allow request if rate limiting fails
    return {
      success: true,
      limit,
      current: 0,
      remaining: limit,
      resetTime: Date.now() + (window * 1000)
    };
  }
}

/**
 * Express middleware for rate limiting
 */
export function rateLimitMiddleware(options = {}) {
  const {
    limit = 100,
    window = 60,
    keyGenerator = (req) => req.ip || req.connection.remoteAddress,
    prefix = 'api',
    skipSuccessful = false,
    skipFailedRequests = false
  } = options;

  return async (req, res, next) => {
    const identifier = keyGenerator(req);
    
    if (!identifier) {
      return next();
    }

    const result = await rateLimit(identifier, limit, window, prefix);

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': limit,
      'X-RateLimit-Remaining': result.remaining,
      'X-RateLimit-Reset': new Date(result.resetTime).toISOString()
    });

    if (!result.success) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil((result.resetTime - Date.now()) / 1000)} seconds`,
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
      });
    }

    next();
  };
}

// Predefined rate limits for different endpoints
export const RATE_LIMITS = {
  // Payment endpoints - stricter limits
  PAYMENT_VERIFICATION: { limit: 10, window: 60 },      // 10/min
  PAYMENT_CONFIG: { limit: 5, window: 300 },            // 5/5min
  
  // Webhook endpoints - higher limits but still protected
  WEBHOOK_MP: { limit: 100, window: 60 },               // 100/min
  WEBHOOK_GENERAL: { limit: 200, window: 60 },          // 200/min
  
  // Order management
  CREATE_ORDER: { limit: 20, window: 60 },              // 20/min
  UPDATE_ORDER: { limit: 30, window: 60 },              // 30/min
  
  // Authentication
  AUTH_LOGIN: { limit: 5, window: 300 },                // 5/5min
  AUTH_REGISTER: { limit: 3, window: 600 },             // 3/10min
  
  // General API
  GENERAL: { limit: 100, window: 60 }                   // 100/min
};

export default rateLimit;