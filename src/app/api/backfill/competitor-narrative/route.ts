import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { extractCompetitorNarratives } from "@/lib/narrative/extractNarrative";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

/**
 * POST /api/backfill/competitor-narrative?brandSlug=xxx
 * Extracts competitorNarrativesJson from rawResponseText + analysisJson for all runs.
 * Optional: pass brandSlug to limit to one brand, otherwise processes all.
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth();
  if (authError) return authError;
  const rlError = await checkRateLimit(userId, "expensive");
  if (rlError) return rlError;
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");

  const where: Prisma.RunWhereInput = {
    ...(brandSlug ? { brand: { slug: brandSlug } } : {}),
    rawResponseText: { not: "" },
    analysisJson: { not: Prisma.DbNull },
    competitorNarrativesJson: { equals: Prisma.DbNull },
  };

  const runs = await prisma.run.findMany({
    where,
    select: {
      id: true,
      rawResponseText: true,
      analysisJson: true,
    },
    take: 500, // Process in batches to avoid timeout
  });

  let updated = 0;
  for (const run of runs) {
    const analysis = run.analysisJson as { competitors?: { name: string }[] } | null;
    const competitors = analysis?.competitors ?? [];
    if (competitors.length === 0) continue;

    const compNarratives = await extractCompetitorNarratives(
      run.rawResponseText,
      competitors,
    );
    await prisma.run.update({
      where: { id: run.id },
      data: { competitorNarrativesJson: JSON.parse(JSON.stringify(compNarratives)) },
    });
    updated++;
  }

  return NextResponse.json({
    success: true,
    updated,
    total: runs.length,
    remaining: runs.length === 500 ? "Run again — more runs may need processing" : 0,
  });
}
