import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchBrandRuns, formatJobMeta } from "@/lib/apiPipeline";
import {
  computeSourceSummary,
  computeTopDomains,
  computeSourceModelSplit,
  detectEmergingSources,
  computeCompetitorCrossCitation,
  computeOfficialSiteCitations,
  type SourceOccurrenceInput,
  type EntityMetricInput,
} from "@/lib/sources/computeSources";
import { classifyDomains } from "@/lib/sources/classifyDomain";

export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }
  const model = req.nextUrl.searchParams.get("model") ?? "";
  const viewRange = parseInt(req.nextUrl.searchParams.get("range") ?? "90", 10);
  const cluster = req.nextUrl.searchParams.get("cluster") ?? "";

  type MinimalRun = { id: string; model: string; promptId: string; createdAt: Date };
  const result = await fetchBrandRuns<MinimalRun>({
    brandSlug,
    model,
    viewRange,
    runQuery: { select: { id: true, model: true, promptId: true, createdAt: true } },
  });
  if (!result.ok) return result.response;
  const { brand, job, runs, rangeCutoff } = result;

  try {
    const runIds = runs.map((r) => r.id);
    const totalResponses = runIds.length;

    if (totalResponses === 0) {
      return NextResponse.json({ hasData: false, reason: "no_runs_in_range" });
    }

    // Query source occurrences across ALL runs in range (not just deduplicated)
    // so firstSeen/lastSeen reflect the full history, not just the latest batch.
    const modelFilter = model && model !== "all" ? { model } : {};

    // If cluster specified, find matching prompt IDs
    let clusterPromptFilter: { promptId?: { in: string[] } } = {};
    if (cluster && cluster !== "all") {
      const clusterPrompts = await prisma.prompt.findMany({
        where: { brandId: brand.id, cluster },
        select: { id: true },
      });
      clusterPromptFilter = { promptId: { in: clusterPrompts.map((p) => p.id) } };
    }

    const rawOccurrences = await prisma.sourceOccurrence.findMany({
      where: {
        run: {
          brandId: brand.id,
          createdAt: { gte: rangeCutoff },
          job: { status: "done" },
          ...modelFilter,
        },
        ...clusterPromptFilter,
      },
      select: {
        runId: true,
        promptId: true,
        model: true,
        entityId: true,
        normalizedUrl: true,
        createdAt: true,
        source: { select: { domain: true } },
        run: { select: { createdAt: true } },
      },
    });

    if (rawOccurrences.length === 0) {
      return NextResponse.json({
        hasData: false,
        reason: "no_sources",
        hint: "No citations found in responses. Run the backfill script to extract sources from existing runs.",
      });
    }

    // Build runId → run date map (run.createdAt is backdated for backfill jobs)
    const runDateMap = new Map<string, Date>();
    for (const o of rawOccurrences) {
      if (!runDateMap.has(o.runId)) runDateMap.set(o.runId, o.run.createdAt);
    }

    const occurrences: SourceOccurrenceInput[] = rawOccurrences.map((o) => ({
      runId: o.runId,
      promptId: o.promptId,
      model: o.model,
      entityId: o.entityId,
      domain: o.source.domain,
      normalizedUrl: o.normalizedUrl,
      createdAt: o.createdAt,
    }));

    // Bulk query EntityResponseMetric for brand (across all runs in range)
    const rawMetrics = await prisma.entityResponseMetric.findMany({
      where: {
        run: {
          brandId: brand.id,
          createdAt: { gte: rangeCutoff },
          job: { status: "done" },
          ...modelFilter,
        },
        entityId: brand.slug,
        ...clusterPromptFilter,
      },
      select: {
        runId: true,
        entityId: true,
        prominenceScore: true,
        rankPosition: true,
      },
    });
    const entityMetrics: EntityMetricInput[] = rawMetrics.map((m) => ({
      runId: m.runId,
      entityId: m.entityId,
      prominenceScore: m.prominenceScore,
      rankPosition: m.rankPosition,
    }));

    // Compute midpoint
    const midpoint = new Date(
      rangeCutoff.getTime() + (Date.now() - rangeCutoff.getTime()) / 2,
    );

    const modelsIncluded = [...new Set(runs.map((r) => r.model))];
    const summary = computeSourceSummary(occurrences, entityMetrics, brand.slug, totalResponses);
    const rawTopDomains = computeTopDomains(occurrences, entityMetrics, brand.slug, totalResponses);

    // Override firstSeen with the earliest occurrence across ALL time (not just current range)
    const topDomainNames = rawTopDomains.map((d) => d.domain);
    if (topDomainNames.length > 0) {
      const earliestByDomain = await prisma.sourceOccurrence.groupBy({
        by: ["sourceId"],
        where: {
          source: { domain: { in: topDomainNames } },
          run: { brandId: brand.id, job: { status: "done" }, ...modelFilter },
        },
        _min: { createdAt: true },
      });
      // sourceId → domain lookup
      const sourceIds = [...new Set(earliestByDomain.map((e) => e.sourceId))];
      const sources = sourceIds.length > 0
        ? await prisma.source.findMany({
            where: { id: { in: sourceIds } },
            select: { id: true, domain: true },
          })
        : [];
      const sourceDomainMap = new Map(sources.map((s) => [s.id, s.domain]));
      const earliestMap = new Map<string, string>();
      for (const row of earliestByDomain) {
        const domain = sourceDomainMap.get(row.sourceId);
        if (!domain || !row._min.createdAt) continue;
        const dateStr = row._min.createdAt.toISOString().slice(0, 10);
        const existing = earliestMap.get(domain);
        if (!existing || dateStr < existing) earliestMap.set(domain, dateStr);
      }
      for (const d of rawTopDomains) {
        const earliest = earliestMap.get(d.domain);
        if (earliest && earliest < d.firstSeen) d.firstSeen = earliest;
      }
    }

    const modelSplit = computeSourceModelSplit(occurrences);
    const rawEmerging = detectEmergingSources(occurrences, midpoint);

    // Enrich emerging sources with prompt examples
    const emergingDomains = new Set(rawEmerging.map((e) => e.domain));
    const emergingOccurrences = occurrences.filter((o) => emergingDomains.has(o.domain));
    const emergingPromptIds = [...new Set(emergingOccurrences.map((o) => o.promptId))];
    const emergingPrompts = emergingPromptIds.length > 0
      ? await prisma.prompt.findMany({
          where: { id: { in: emergingPromptIds } },
          select: { id: true, text: true },
        })
      : [];
    const emergingPromptTextMap = new Map(emergingPrompts.map((p) => [p.id, p.text]));

    // Group occurrences by domain → unique prompts
    const emergingPromptsByDomain = new Map<string, { promptId: string; promptText: string; model: string; url: string }[]>();
    for (const o of emergingOccurrences) {
      const text = emergingPromptTextMap.get(o.promptId);
      if (!text) continue;
      const arr = emergingPromptsByDomain.get(o.domain) ?? [];
      // Deduplicate by promptId
      if (!arr.some((p) => p.promptId === o.promptId)) {
        arr.push({ promptId: o.promptId, promptText: text, model: o.model, url: o.normalizedUrl });
      }
      emergingPromptsByDomain.set(o.domain, arr);
    }

    const emerging = rawEmerging.map((e) => ({
      ...e,
      prompts: (emergingPromptsByDomain.get(e.domain) ?? []).slice(0, 10),
    }));

    const crossCitation = computeCompetitorCrossCitation(
      occurrences,
      rawTopDomains.slice(0, 15).map((d) => d.domain),
    );

    // Classify domains (uses DB cache → static map → GPT fallback)
    // Classify ALL unique domains from occurrences so categoryOverTime has proper breakdowns
    const allOccurrenceDomains = [...new Set(occurrences.map((o) => o.domain))];
    const categories = await classifyDomains(allOccurrenceDomains);
    const topDomains = rawTopDomains.map((d) => ({
      ...d,
      category: categories[d.domain] ?? "other",
    }));

    // Source-Prompt matrix: top 15 domains × prompts that cited them
    const topDomainSet = new Set(rawTopDomains.slice(0, 15).map((d) => d.domain));
    const matrixPromptIds = [...new Set(occurrences.filter((o) => topDomainSet.has(o.domain)).map((o) => o.promptId))];
    const matrixPrompts = matrixPromptIds.length > 0
      ? await prisma.prompt.findMany({
          where: { id: { in: matrixPromptIds } },
          select: { id: true, text: true },
        })
      : [];
    const matrixPromptTextMap = new Map(matrixPrompts.map((p) => [p.id, p.text]));

    // Build matrix: for each domain, count citations per prompt
    const matrixData = new Map<string, Map<string, number>>();
    for (const o of occurrences) {
      if (!topDomainSet.has(o.domain)) continue;
      const domainMap = matrixData.get(o.domain) ?? new Map<string, number>();
      domainMap.set(o.promptId, (domainMap.get(o.promptId) ?? 0) + 1);
      matrixData.set(o.domain, domainMap);
    }

    // Collect all prompt IDs that appear and build output
    const matrixPromptList = matrixPromptIds
      .filter((id) => matrixPromptTextMap.has(id))
      .map((id) => ({ promptId: id, promptText: matrixPromptTextMap.get(id)! }));

    const sourcePromptMatrix = rawTopDomains.slice(0, 15).map((d) => {
      const domainMap = matrixData.get(d.domain) ?? new Map<string, number>();
      const prompts: Record<string, number> = {};
      for (const [pid, count] of domainMap) {
        prompts[pid] = count;
      }
      return { domain: d.domain, prompts };
    });

    // Source category distribution over time
    // Group occurrences by run date + model → category counts, then compute percentages
    const categoryOverTime = (() => {
      // Build map: `${date}|${model}` → { category → count }
      const buckets = new Map<string, Map<string, number>>();
      for (const o of occurrences) {
        const runDate = runDateMap.get(o.runId);
        const date = (runDate ?? o.createdAt).toISOString().slice(0, 10);
        const cat = categories[o.domain] ?? "other";
        for (const m of ["all", o.model]) {
          const key = `${date}|${m}`;
          let catMap = buckets.get(key);
          if (!catMap) { catMap = new Map(); buckets.set(key, catMap); }
          catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
        }
      }
      // Convert to array with percentages
      const entries: Array<Record<string, string | number>> = [];
      for (const [key, catMap] of buckets) {
        const [date, model] = key.split("|");
        const total = [...catMap.values()].reduce((s, n) => s + n, 0);
        if (total === 0) continue;
        const entry: Record<string, string | number> = { date, model };
        for (const [cat, count] of catMap) {
          entry[cat] = Math.round((count / total) * 1000) / 10;
        }
        entries.push(entry);
      }
      return entries.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    })();

    // Official site citations for brand + competitors
    const officialSites = computeOfficialSiteCitations(occurrences, brand.slug);

    // Brand-attributed sources: sources cited near brand mentions
    const brandOccurrences = occurrences.filter((o) => o.entityId === brand.slug);
    const brandByDomain = new Map<string, { citations: number; urls: Set<string>; models: Set<string> }>();
    for (const o of brandOccurrences) {
      let entry = brandByDomain.get(o.domain);
      if (!entry) {
        entry = { citations: 0, urls: new Set(), models: new Set() };
        brandByDomain.set(o.domain, entry);
      }
      entry.citations++;
      entry.urls.add(o.normalizedUrl);
      entry.models.add(o.model);
    }
    // Total citations per domain (for context)
    const totalByDomain = new Map<string, number>();
    for (const o of occurrences) {
      totalByDomain.set(o.domain, (totalByDomain.get(o.domain) ?? 0) + 1);
    }
    const brandAttributedSources = [...brandByDomain.entries()]
      .map(([domain, entry]) => ({
        domain,
        category: categories[domain] ?? "other",
        citations: entry.citations,
        totalCitations: totalByDomain.get(domain) ?? entry.citations,
        urls: [...entry.urls].slice(0, 5),
        models: [...entry.models],
      }))
      .sort((a, b) => b.citations - a.citations)
      .slice(0, 20);

    return NextResponse.json({
      hasData: true,
      job: formatJobMeta(job!),
      sources: {
        scope: {
          totalResponses,
          modelsIncluded,
          uniqueDomains: summary.uniqueDomains,
          totalCitations: summary.totalCitations,
        },
        summary,
        topDomains,
        modelSplit,
        emerging,
        crossCitation,
        officialSites,
        sourcePromptMatrix,
        matrixPrompts: matrixPromptList,
        brandAttributedSources,
        categoryOverTime,
      },
      totals: { totalRuns: totalResponses },
    }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : "";
    console.error("Sources API error:", message, "\n", stack);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
