import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { canAccessBrand, PRESET_BRAND_SLUGS } from "@/lib/brandViewLimit";

/**
 * POST /api/brand-view
 * Body: { brandSlug }
 *
 * Checks if the current user can access this brand.
 * Free tier: preset brands only. Paid tier: any brand.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { brandSlug } = body;
  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }

  const result = canAccessBrand(brandSlug, userId);
  return NextResponse.json({ ...result, presetBrands: PRESET_BRAND_SLUGS });
}
