import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { PRESET_BRAND_SLUGS } from "@/lib/brandViewLimit";
import { isProUser } from "@/lib/brandViewLimitServer";
import { sha256 } from "@/lib/hash";

/** Free-tier runs use a DOUBLE-hyphen marker that the Pro slugifier
 *  (src/components/Header.tsx:120) can never produce, since it
 *  collapses runs of non-alphanumerics to a single dash.
 *
 *  Current shape: `<base>--<8 hex>` where the 8 hex chars are
 *  sha256(base).slice(0, 8). Verifying the hash (rather than accepting
 *  any 8 hex) blocks a Pro user from seeding a forged `foo--abcd1234`
 *  brand via findOrCreateBrand and getting it treated as publicly
 *  viewable.
 *
 *  The prior `<base>--cached` marker is no longer accepted — any
 *  remaining legacy rows require Pro to view. Dropped because it let
 *  a Pro user seed `<anything>--cached` (e.g. `facebook--cached`) and
 *  have it leak to free viewers. */
const EPHEMERAL_SUFFIX_PATTERN = /^(.+)--([0-9a-f]{8})$/;

/** A brand is publicly viewable (no auth) when it's a preset demo brand or
 *  a verifiable free-tier cache slug. */
export function isPubliclyViewableBrand(brandSlug: string): boolean {
  if (PRESET_BRAND_SLUGS.includes(brandSlug)) return true;
  const m = EPHEMERAL_SUFFIX_PATTERN.exec(brandSlug);
  if (!m) return false;
  const [, base, suffix] = m;
  return suffix === sha256(base).slice(0, 8);
}

/** Build a Cache-Control header value for a brand's read-only data API.
 *  Public brands (preset + ephemeral) can be cached at Vercel's edge
 *  shared across all viewers — the response contains no user-scoped
 *  data, and brands like common-cause have dozens of runs whose
 *  aggregation takes 5-15s to compute on a cold request. Pro-only
 *  brands stay `private` so browser caches but the edge doesn't, since
 *  a leaked response across Pro users viewing the same slug would
 *  surface analysis they shouldn't necessarily see.
 *
 *  Usage:
 *    return NextResponse.json(data, {
 *      headers: { "Cache-Control": brandCacheControl(brandSlug) },
 *    });
 */
export function brandCacheControl(brandSlug: string): string {
  return isPubliclyViewableBrand(brandSlug)
    ? "public, s-maxage=60, stale-while-revalidate=300"
    : "private, max-age=60, stale-while-revalidate=300";
}

/**
 * Gate read access to per-brand data APIs (overview, visibility, narrative,
 * competition, sources, topics, recommendations, responses, response-detail,
 * competitor-alerts, brand-info, report).
 *
 * Returns `null` when the request is allowed, or a NextResponse (401/403)
 * that the caller should return immediately.
 *
 * Policy:
 *   - Preset demo brands → public
 *   - Free-tier ephemeral brands (slug ends in `-<8 hex>`) → public
 *   - Anything else → requires an active Pro subscription
 *
 * Without this check, anyone could read any Pro user's brand data by
 * guessing the slug — the read-only data APIs are all public at the
 * middleware layer (see src/proxy.ts).
 */
export async function requireBrandAccess(
  brandSlug: string,
): Promise<NextResponse | null> {
  if (isPubliclyViewableBrand(brandSlug)) return null;

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to view this brand." },
      { status: 401 },
    );
  }
  if (!(await isProUser(userId))) {
    return NextResponse.json(
      { error: "This brand requires a Pro subscription." },
      { status: 403 },
    );
  }
  return null;
}
