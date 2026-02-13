/**
 * Rate Limiter for Edge Functions
 * Prevents DDoS and abuse by limiting requests per IP/store
 * Uses in-memory Map (simple, no Redis needed for MVP)
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory rate limit store
// Note: This resets when Edge Function cold-starts, but that's acceptable for MVP
const rateLimitStore = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number;   // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

// Default configs for different endpoints
export const RATE_LIMITS = {
  webhook: {
    windowMs: 60 * 1000,    // 1 minute
    maxRequests: 100        // 100 requests per minute per store
  },
  payment: {
    windowMs: 60 * 1000,    // 1 minute
    maxRequests: 30         // 30 payment attempts per minute
  },
  oauth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5          // 5 OAuth attempts per 15 min
  },
  api: {
    windowMs: 60 * 1000,    // 1 minute
    maxRequests: 60         // 60 API calls per minute
  }
} as const;

/**
 * Check if request is rate limited
 * Returns true if request should be blocked
 */
export function isRateLimited(
  identifier: string,
  config: RateLimitConfig = RATE_LIMITS.api
): { limited: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = `ratelimit:${identifier}`;

  // Get or create entry
  let entry = rateLimitStore.get(key);

  // Reset if window expired
  if (!entry || now >= entry.resetAt) {
    entry = {
      count: 0,
      resetAt: now + config.windowMs
    };
    rateLimitStore.set(key, entry);
  }

  // Increment count
  entry.count++;

  // Check if over limit
  const limited = entry.count > config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - entry.count);

  return {
    limited,
    remaining,
    resetAt: entry.resetAt
  };
}

/**
 * Middleware to check rate limit and return 429 if exceeded
 */
export function rateLimitMiddleware(
  identifier: string,
  config: RateLimitConfig = RATE_LIMITS.api
): Response | null {
  const { limited, remaining, resetAt } = isRateLimited(identifier, config);

  if (limited) {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);

    return new Response(
      JSON.stringify({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
        retryAfter,
        resetAt: new Date(resetAt).toISOString()
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(config.maxRequests),
          'X-RateLimit-Remaining': String(remaining),
          'X-RateLimit-Reset': String(resetAt)
        }
      }
    );
  }

  return null; // Not rate limited
}

/**
 * Get client identifier from request
 * Uses IP address + optional store_id for better granularity
 */
export function getClientIdentifier(
  req: Request,
  storeId?: string
): string {
  // Get IP from headers (Cloudflare/Deno Deploy provide this)
  const ip = req.headers.get('cf-connecting-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]
    || req.headers.get('x-real-ip')
    || 'unknown';

  // Combine IP + storeId for per-store rate limiting
  return storeId ? `${ip}:${storeId}` : ip;
}

/**
 * Cleanup expired entries (call periodically)
 * Prevents memory leak from abandoned entries
 */
export function cleanupExpiredEntries(): number {
  const now = Date.now();
  let removed = 0;

  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetAt + 60000) { // Keep for 1 min after reset for safety
      rateLimitStore.delete(key);
      removed++;
    }
  }

  if (removed > 0) {
    console.log(`[RateLimiter] Cleaned up ${removed} expired entries`);
  }

  return removed;
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

/**
 * Example usage in Edge Function:
 *
 * import { rateLimitMiddleware, getClientIdentifier, RATE_LIMITS } from '../_shared/rate-limiter.ts';
 *
 * serve(async (req) => {
 *   const identifier = getClientIdentifier(req, storeId);
 *   const rateLimitResponse = rateLimitMiddleware(identifier, RATE_LIMITS.webhook);
 *
 *   if (rateLimitResponse) {
 *     return rateLimitResponse; // 429 Too Many Requests
 *   }
 *
 *   // Continue with normal processing
 * });
 */
