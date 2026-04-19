import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import {
  FREE_TIER_RUNS_PER_IP_PER_DAY,
  FREE_TIER_RUNS_PER_SESSION_PER_DAY,
} from "@/config/freeTier";

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
  // Fallback: no-op limiter when Upstash env vars aren't set (local dev).
  // checkRateLimit() already skips when UPSTASH_REDIS_REST_URL is absent,
  // but we still need a valid object so the export doesn't throw.
  return {
    limit: async () => ({ success: true, limit: tokens, remaining: tokens, reset: Date.now(), pending: Promise.resolve() }),
  } as unknown as Ratelimit;
}

// Tiers — mutating/expensive routes get tighter limits
export const rateLimiters = {
  /** Expensive: job creation, backfill, site audit — 10 req / minute */
  expensive: createLimiter(10, "1 m"),
  /** Write: prompt CRUD, validate-brand — 30 req / minute */
  write: createLimiter(30, "1 m"),
  /** Read: data-fetching GET routes — 60 req / minute */
  read: createLimiter(60, "1 m"),
  /** Free-tier analysis per anonymous IP — ~10 / day by default. */
  freeRunIp: createLimiter(FREE_TIER_RUNS_PER_IP_PER_DAY, "1 d"),
  /** Free-tier analysis per anonymous session cookie — ~10 / day by default. */
  freeRunSession: createLimiter(FREE_TIER_RUNS_PER_SESSION_PER_DAY, "1 d"),
} as const;

type Tier = keyof typeof rateLimiters;

/** Tiers that protect paid-cost operations (per-anon-IP/session free runs).
 *  If Upstash is unreachable in production, we fail these CLOSED rather
 *  than let abuse burn OpenAI/Gemini spend unchecked. Other tiers still
 *  fail open since they only protect internal QPS, not external $. */
const FAIL_CLOSED_TIERS: ReadonlySet<Tier> = new Set(["freeRunIp", "freeRunSession"]);

/**
 * Check rate limit for the given identifier (usually userId or IP).
 * Returns a 429 NextResponse if over limit, or null if allowed.
 */
export async function checkRateLimit(
  identifier: string,
  tier: Tier = "read",
): Promise<NextResponse | null> {
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    // Prod + missing Upstash + cost-sensitive tier → refuse the request.
    // Staging/dev without Upstash still fails open so local flows work.
    if (process.env.NODE_ENV === "production" && FAIL_CLOSED_TIERS.has(tier)) {
      console.error(
        `[rateLimit] Upstash not configured in production for fail-closed tier "${tier}". Rejecting request.`,
      );
      return NextResponse.json(
        { error: "Service temporarily unavailable. Please try again shortly." },
        { status: 503 },
      );
    }
    return null;
  }

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
    // If Upstash itself throws (network, auth), cost-sensitive tiers fail
    // closed in production so a Redis outage can't open the floodgates.
    // Other tiers fail open since their only risk is internal QPS.
    console.error("[rateLimit] Error:", e);
    if (process.env.NODE_ENV === "production" && FAIL_CLOSED_TIERS.has(tier)) {
      return NextResponse.json(
        { error: "Service temporarily unavailable. Please try again shortly." },
        { status: 503 },
      );
    }
    return null;
  }
}

/**
 * Extract the client IP from proxy-forwarded headers. Vercel sets
 * `x-forwarded-for` (first entry is the client) and `x-real-ip` as a fallback.
 * Returns "unknown" when no header is present so the rate limit key is at
 * least stable per-request even if it bundles traffic from unknown sources.
 */
export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
