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
 *   brandSlug?: string;  // scope to one brand (leave out for all)
 *   limit?: number;      // batch size (default 10, max 25)
 *   fillNarrative?: boolean; // default true
 *   fillSources?: boolean;   // default true
 * }
 *
 * Response: {
 *   processed: number;           // runs handled in this batch
 *   narrativeFilled: number;
 *   sourcesFilled: number;
 *   remainingCandidates: number; // approximate — runs still needing work
 *   hasMore: boolean;
 * }
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

  // Find candidates — Runs where either narrative is missing OR no
  // SourceOccurrences exist. Skip stub runs (no real content). Order by
  // createdAt asc so older runs get backfilled first; callers looping
  // through see steady forward progress rather than random churn.
  const candidates = await prisma.run.findMany({
    where: {
      ...whereBrand,
      // Not a stub placeholder
      NOT: { rawResponseText: { startsWith: "[stub:" } },
      OR: [
        ...(fillNarrative ? [{ narrativeJson: { equals: null as unknown as object } }] : []),
        ...(fillSources ? [{ sourceOccurrences: { none: {} } }] : []),
      ],
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
    orderBy: { createdAt: "asc" },
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

  // Approximate remaining count — re-runs the candidate query with
  // count(). Cheaper than fetching IDs. `hasMore` drives the caller's
  // loop.
  const remainingCandidates = await prisma.run.count({
    where: {
      ...whereBrand,
      NOT: { rawResponseText: { startsWith: "[stub:" } },
      OR: [
        ...(fillNarrative ? [{ narrativeJson: { equals: null as unknown as object } }] : []),
        ...(fillSources ? [{ sourceOccurrences: { none: {} } }] : []),
      ],
    },
  });

  return NextResponse.json({
    processed: candidates.length,
    narrativeFilled,
    sourcesFilled,
    remainingCandidates,
    hasMore: remainingCandidates > 0,
  });
}
