import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { extractNarrativeForRun } from "@/lib/narrative/extractNarrative";

/**
 * POST /api/backfill/narrative?brandSlug=xxx&limit=5&offset=0
 *
 * Re-extracts narrativeJson for runs missing it. Processes in batches
 * to stay within Vercel's function timeout (60s on Hobby plan).
 *
 * - brandSlug: required
 * - limit: batch size (default 5)
 * - offset: skip N runs (default 0)
 * - force: if "true", re-extracts even if narrativeJson exists
 *
 * Call repeatedly with increasing offset to process all runs.
 */
export async function POST(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  if (!brandSlug) {
    return NextResponse.json({ error: "brandSlug is required" }, { status: 400 });
  }

  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "5", 10);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") ?? "0", 10);
  const force = req.nextUrl.searchParams.get("force") === "true";

  const where = {
    brand: { slug: brandSlug },
    rawResponseText: { not: "" },
    ...(force ? {} : { narrativeJson: { equals: Prisma.DbNull } }),
  };

  const totalMissing = await prisma.run.count({ where });

  const runs = await prisma.run.findMany({
    where,
    select: {
      id: true,
      rawResponseText: true,
      brand: { select: { name: true, displayName: true, slug: true, aliases: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: limit,
  });

  let updated = 0;
  const errors: string[] = [];

  const startTime = Date.now();
  const MAX_MS = 50_000; // stop before Vercel's 60s timeout

  for (const run of runs) {
    if (Date.now() - startTime > MAX_MS) {
      errors.push("Stopped early: approaching function timeout");
      break;
    }
    try {
      const brandName = (run.brand as unknown as { displayName?: string | null }).displayName || run.brand.name;
      const aliases = (run.brand as unknown as { aliases?: string[] }).aliases ?? [];
      const narrative = await extractNarrativeForRun(
        run.rawResponseText,
        brandName,
        run.brand.slug,
        aliases,
      );
      await prisma.run.update({
        where: { id: run.id },
        data: { narrativeJson: JSON.parse(JSON.stringify(narrative)) },
      });
      updated++;
    } catch (err) {
      errors.push(`${run.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const remaining = Math.max(0, totalMissing - offset - runs.length);

  return NextResponse.json({
    updated,
    processed: runs.length,
    totalMissing,
    remaining,
    nextOffset: remaining > 0 ? offset + limit : null,
    errors: errors.length > 0 ? errors : undefined,
  });
}
