import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Rate limiter — uses Upstash Redis in production, in-memory fallback for dev
// ---------------------------------------------------------------------------

function createLimiter(tokens: number, window: string) {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(tokens, window as Parameters<typeof Ratelimit.slidingWindow>[1]),
      analytics: true,
    });
  }
  // Fallback: ephemeral in-memory store (resets on redeploy)
  return new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(tokens, window as Parameters<typeof Ratelimit.slidingWindow>[1]),
    ephemeralCache: new Map(),
  });
}

// Tiers — mutating/expensive routes get tighter limits
export const rateLimiters = {
  /** Expensive: job creation, backfill, site audit — 10 req / minute */
  expensive: createLimiter(10, "1 m"),
  /** Write: prompt CRUD, validate-brand — 30 req / minute */
  write: createLimiter(30, "1 m"),
  /** Read: data-fetching GET routes — 60 req / minute */
  read: createLimiter(60, "1 m"),
} as const;

type Tier = keyof typeof rateLimiters;

/**
 * Check rate limit for the given identifier (usually userId or IP).
 * Returns a 429 NextResponse if over limit, or null if allowed.
 */
export async function checkRateLimit(
  identifier: string,
  tier: Tier = "read",
): Promise<NextResponse | null> {
  // Skip rate limiting if Upstash isn't configured (local dev)
  if (!process.env.UPSTASH_REDIS_REST_URL) return null;

  try {
    const result = await rateLimiters[tier].limit(identifier);
    if (!result.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": String(result.remaining),
            "X-RateLimit-Reset": String(result.reset),
            "Retry-After": String(Math.ceil((result.reset - Date.now()) / 1000)),
          },
        },
      );
    }
    return null;
  } catch (e) {
    // If rate limiting itself fails, allow the request (fail open)
    console.error("[rateLimit] Error:", e);
    return null;
  }
}
