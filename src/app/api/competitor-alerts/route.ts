import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildEntityDisplayNames, resolveEntityName } from "@/lib/utils";
import { normalizeEntityIds } from "@/lib/competition/normalizeEntities";
import { computeCompetitorAlerts } from "@/lib/competitorAlerts";
import { buildMovementSnapshots, type MovementRun } from "@/lib/buildMovementSnapshots";
import { requireAuth } from "@/lib/auth";

/**
 * Lightweight endpoint for competitor movement data.
 *
 * Only computes movement alerts — no GPT summaries, no prompt
 * opportunities, no narrative analysis. Returns in <1s instead
 * of 5-15s for the full recommendations pipeline.
 *
 * GET /api/competitor-alerts?brandSlug=...&model=...&range=...
 */
export async function GET(req: NextRequest) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  const model = req.nextUrl.searchParams.get("model") ?? "all";
  const viewRange = parseInt(req.nextUrl.searchParams.get("range") ?? "90", 10) || 90;

  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }

  const brand = await prisma.brand.findUnique({
    where: { slug: brandSlug },
    select: { id: true, name: true, displayName: true, slug: true, aliases: true },
  });
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const brandName = (brand as unknown as { displayName?: string | null }).displayName || brand.name;

  try {
    // Scope: jobs within range + model filter
    const rangeCutoff = new Date(Date.now() - viewRange * 86_400_000);
    const modelFilter = model !== "all" ? { model } : {};
    const jobs = await prisma.job.findMany({
      where: {
        brandId: brand.id,
        status: "done",
        finishedAt: { not: null, gte: rangeCutoff },
        ...modelFilter,
      },
      orderBy: { finishedAt: "asc" },
      select: { id: true, finishedAt: true },
    });

    if (jobs.length === 0) {
      return NextResponse.json({
        hasData: false,
        competitorAlerts: [],
        comparisonPeriodLabel: "prior snapshot",
      });
    }

    // Fetch industry runs
    const jobIds = jobs.filter((j) => j.finishedAt).map((j) => j.id);
    const runs = jobIds.length > 0
      ? await prisma.run.findMany({
          where: { jobId: { in: jobIds }, prompt: { cluster: "industry" } },
          select: {
            id: true, model: true, jobId: true,
            analysisJson: true, rawResponseText: true,
            prompt: { select: { cluster: true } },
          },
        })
      : [];

    // Map jobId → date
    const jobDateMap = new Map<string, string>();
    for (const j of jobs) {
      if (j.finishedAt) jobDateMap.set(j.id, j.finishedAt.toISOString().slice(0, 10));
    }

    // Build MovementRun[]
    const movementRuns: MovementRun[] = runs.map((r) => ({
      id: r.id,
      model: r.model,
      jobDate: jobDateMap.get(r.jobId) ?? "",
      cluster: r.prompt.cluster ?? "industry",
      analysisJson: r.analysisJson,
    }));

    // Collect competitor names for alias normalization
    const allCompNames = new Set<string>();
    for (const r of movementRuns) {
      const analysis = r.analysisJson as { competitors?: { name: string }[] } | null;
      for (const c of (analysis?.competitors ?? [])) {
        allCompNames.add(c.name.toLowerCase());
      }
    }

    // Deterministic + GPT alias normalization (with timeout fallback)
    const brandAliases = brand.aliases?.length ? brand.aliases : undefined;
    let aliasMap: Map<string, string>;
    try {
      aliasMap = allCompNames.size > 0
        ? await Promise.race([
            normalizeEntityIds(
              [...allCompNames].filter((id) => id !== brand.slug),
              brand.slug,
              brandAliases,
            ),
            new Promise<Map<string, string>>((_, reject) =>
              setTimeout(() => reject(new Error("Alias normalization timeout")), 5000),
            ),
          ])
        : new Map<string, string>();
    } catch {
      // If GPT alias normalization fails/times out, deterministic normalization
      // is already applied inside normalizeEntityIds before GPT is called.
      // Fall back to an empty map — buildMovementSnapshots uses canonicalizeEntityId as fallback.
      aliasMap = new Map<string, string>();
    }

    // Build display names
    const entityDisplayNames = buildEntityDisplayNames(runs as { analysisJson: unknown }[]);
    entityDisplayNames.set(brand.slug, brandName);
    for (const [entityId, canonical] of aliasMap) {
      if (entityId !== canonical && !entityDisplayNames.has(canonical)) {
        const aliasName = entityDisplayNames.get(entityId);
        if (aliasName) entityDisplayNames.set(canonical, aliasName);
      }
    }

    // Build snapshots and compute alerts
    const snapshots = buildMovementSnapshots(movementRuns, brand.slug, aliasMap, brandAliases);
    const alertResult = computeCompetitorAlerts(snapshots, brand.slug);

    // Format response
    const competitorAlerts = alertResult.alerts
      .slice(0, 15)
      .map((a) => ({
        entityId: a.entityId,
        displayName: resolveEntityName(a.entityId, entityDisplayNames),
        mentionRateChange: a.mentionRateChange,
        recentMentionRate: a.recentMentionRate,
        previousMentionRate: a.previousMentionRate,
        direction: a.direction,
      }));

    return NextResponse.json({
      hasData: true,
      competitorAlerts,
      comparisonPeriodLabel: alertResult.comparisonPeriodLabel,
    }, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" },
    });
  } catch (e) {
    console.error("[competitor-alerts] Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({
      hasData: false,
      competitorAlerts: [],
      comparisonPeriodLabel: "prior snapshot",
      error: "Failed to compute movement data",
    }, { status: 500 });
  }
}
