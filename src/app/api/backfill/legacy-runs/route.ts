import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractNarrativeForRun } from "@/lib/narrative/extractNarrative";
import { persistSourcesForRun } from "@/lib/sources/persistSources";

// Backfill latency: narrative extraction is 1-3s per Run, source
// persistence is ~200-500ms. 10 Runs per batch stays under the 60s
// default; caller loops until hasMore=false.
export const maxDuration = 60;

/**
 * POST /api/backfill/legacy-runs
 *
 * One-shot migration endpoint. Finds Runs created by the backfill
 * pipeline before recent commits that added narrative + source
 * persistence, then fills in the missing data. Resumable — each
 * call processes up to `limit` Runs and returns progress so the
 * caller can loop.
 *
 * Auth: Authorization: Bearer $ADMIN_SECRET
 *
 * Body: {
 *   brandSlug?: string;      // scope to one brand (leave out for all)
 *   limit?: number;          // batch size (default 10, max 25)
 *   afterId?: string;        // cursor from previous response; omit on first call
 *   fillNarrative?: boolean; // default true
 *   fillSources?: boolean;   // default true
 * }
 *
 * Response: {
 *   processed: number;           // runs handled in this batch
 *   narrativeFilled: number;
 *   sourcesFilled: number;
 *   nextAfterId: string | null;  // pass to next call; null when done
 *   hasMore: boolean;
 * }
 *
 * Cursor semantics: runs are walked in ascending id order. Each call
 * processes up to `limit` candidates strictly after `afterId`.
 * Runs where persistSources extracts zero URLs (text had no inline
 * citations) are advanced past — without the cursor they'd stay in
 * the `sourceOccurrences: { none: {} }` filter forever and the client
 * would loop.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET not configured; legacy-runs backfill disabled." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    brandSlug?: string;
    limit?: number;
    afterId?: string;
    fillNarrative?: boolean;
    fillSources?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — use defaults
  }

  const limit = Math.min(Math.max(body.limit ?? 10, 1), 25);
  const fillNarrative = body.fillNarrative !== false;
  const fillSources = body.fillSources !== false;

  // Scope: either one brand or all
  const brandFilter = body.brandSlug
    ? await prisma.brand.findUnique({ where: { slug: body.brandSlug }, select: { id: true } })
    : null;
  if (body.brandSlug && !brandFilter) {
    return NextResponse.json({ error: `Brand not found: ${body.brandSlug}` }, { status: 404 });
  }
  const whereBrand = brandFilter ? { brandId: brandFilter.id } : {};

  // Find candidates via cursor-paginated walk. Each call advances past
  // `afterId` and returns the last id processed, so runs where
  // persistSources extracted zero URLs still get advanced past (the
  // OR clause matches them forever without the cursor).
  const candidates = await prisma.run.findMany({
    where: {
      ...whereBrand,
      NOT: { rawResponseText: { startsWith: "[stub:" } },
      OR: [
        ...(fillNarrative ? [{ narrativeJson: { equals: null as unknown as object } }] : []),
        ...(fillSources ? [{ sourceOccurrences: { none: {} } }] : []),
      ],
      ...(body.afterId ? { id: { gt: body.afterId } } : {}),
    },
    select: {
      id: true,
      model: true,
      promptId: true,
      rawResponseText: true,
      analysisJson: true,
      narrativeJson: true,
      brand: { select: { slug: true, name: true, displayName: true } },
      sourceOccurrences: { select: { id: true }, take: 1 },
    },
    orderBy: { id: "asc" },
    take: limit,
  });

  let narrativeFilled = 0;
  let sourcesFilled = 0;

  for (const run of candidates) {
    const brandName = run.brand.displayName || run.brand.name;

    if (fillNarrative && run.narrativeJson == null) {
      try {
        const narrative = await extractNarrativeForRun(
          run.rawResponseText,
          brandName,
          run.brand.slug,
        );
        await prisma.run.update({
          where: { id: run.id },
          data: { narrativeJson: JSON.parse(JSON.stringify(narrative)) },
        });
        narrativeFilled++;
      } catch (err) {
        console.error(`[legacy-runs] narrative failed run=${run.id}:`, err instanceof Error ? err.message : err);
      }
    }

    if (fillSources && run.sourceOccurrences.length === 0) {
      try {
        // No apiCitations available for historical runs — the model's
        // structured annotations weren't captured at original write
        // time. persistSourcesForRun falls back to extracting URLs
        // directly from rawResponseText, which covers any inline
        // citations the model happened to include.
        await persistSourcesForRun({
          runId: run.id,
          model: run.model,
          promptId: run.promptId,
          brandName,
          brandSlug: run.brand.slug,
          responseText: run.rawResponseText,
          analysisJson: run.analysisJson,
        });
        sourcesFilled++;
      } catch (err) {
        console.error(`[legacy-runs] sources failed run=${run.id}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  // Cursor advances to the last processed id; next call picks up
  // strictly after it. hasMore=false when the batch returned fewer
  // than `limit` rows (no more candidates past this cursor).
  const nextAfterId = candidates.length > 0 ? candidates[candidates.length - 1].id : null;
  const hasMore = candidates.length === limit;

  return NextResponse.json({
    processed: candidates.length,
    narrativeFilled,
    sourcesFilled,
    nextAfterId,
    hasMore,
  });
}
