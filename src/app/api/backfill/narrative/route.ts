import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractNarrativeForRun } from "@/lib/narrative/extractNarrative";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

/**
 * POST /api/backfill/narrative?brandSlug=xxx
 * Re-extracts narrativeJson from rawResponseText for all runs of a brand.
 * Optional: pass brandSlug to limit to one brand, otherwise processes all.
 */
export async function POST(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");

  const where = brandSlug
    ? { brand: { slug: brandSlug }, rawResponseText: { not: "" } }
    : { rawResponseText: { not: "" } };

  const runs = await prisma.run.findMany({
    where,
    select: {
      id: true,
      rawResponseText: true,
      brand: { select: { name: true, displayName: true, slug: true } },
    },
  });

  let updated = 0;
  for (const run of runs) {
    const brandName = (run.brand as unknown as { displayName?: string | null }).displayName || run.brand.name;
    const narrative = await extractNarrativeForRun(
      run.rawResponseText,
      brandName,
      run.brand.slug,
    );
    await prisma.run.update({
      where: { id: run.id },
      data: { narrativeJson: JSON.parse(JSON.stringify(narrative)) },
    });
    updated++;
  }

  return NextResponse.json({
    success: true,
    updated,
    total: runs.length,
  });
}
