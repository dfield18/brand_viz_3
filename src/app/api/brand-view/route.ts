import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { checkAndRecordBrandView } from "@/lib/brandViewLimit";

/**
 * POST /api/brand-view
 * Body: { brandSlug }
 *
 * Records a brand view for the current user and returns whether
 * they're within the free tier daily limit.
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

  const result = await checkAndRecordBrandView(userId, brandSlug);
  return NextResponse.json(result);
}
