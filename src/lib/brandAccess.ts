import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { PRESET_BRAND_SLUGS } from "@/lib/brandViewLimit";
import { isProUser } from "@/lib/brandViewLimitServer";

/** Anonymous free-tier runs get an 8-hex suffix (see
 *  src/app/api/free-run/execute/route.ts → randomSlugSuffix). Slugs matching
 *  this pattern are always publicly viewable. */
const EPHEMERAL_FREE_RUN_PATTERN = /-[0-9a-f]{8}$/;

/** A brand is publicly viewable (no auth) when it's a preset demo brand or
 *  an ephemeral free-tier run. */
export function isPubliclyViewableBrand(brandSlug: string): boolean {
  if (PRESET_BRAND_SLUGS.includes(brandSlug)) return true;
  if (EPHEMERAL_FREE_RUN_PATTERN.test(brandSlug)) return true;
  return false;
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
