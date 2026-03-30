import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchBrandRuns, formatJobMeta } from "@/lib/apiPipeline";
import { buildEntityDisplayNames } from "@/lib/utils";
import { computeBrandRank } from "@/lib/visibility/brandMention";
import { filterRunsToBrandScope, buildBrandIdentity } from "@/lib/visibility/brandScope";
import {
  computeSourceSummary,
  computeTopDomains,
  computeSourceModelSplit,
  detectEmergingSources,
  computeCompetitorCrossCitation,
  computeOfficialSiteCitations,
  computeDomainsNotCitingBrand,
  getRootDomain,
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
  // latest param no longer needed — Sources tab always uses 24h snapshot now

  type MinimalRun = { id: string; model: string; promptId: string; createdAt: Date; analysisJson: unknown; rawResponseText: string };
  const result = await fetchBrandRuns<MinimalRun>({
    brandSlug,
    model,
    viewRange,
    runQuery: { select: { id: true, model: true, promptId: true, createdAt: true, analysisJson: true, rawResponseText: true } },
  });
  if (!result.ok) return result.response;
  const { brand, job, runs: rawRuns, rangeCutoff } = result;

  try {
    // Brand-scope filter: exclude runs about unrelated entities sharing the brand phrase
    const brandIdentity = buildBrandIdentity(brand);
    const scopedRuns = filterRunsToBrandScope(rawRuns, brandIdentity);

    // Default to latest 24h snapshot for all source metrics.
    // Full range (scopedRuns) is only used for time-comparison sections
    // (domainOverTime, emerging sources, categoryOverTime).
    const latestRunDate = scopedRuns.reduce((max, r) => (r.createdAt > max ? r.createdAt : max), new Date(0));
    const latestCutoff = new Date(latestRunDate.getTime() - 24 * 60 * 60 * 1000);
    const latestRuns = scopedRuns.filter((r) => r.createdAt >= latestCutoff);
    const runs = latestRuns.length > 0 ? latestRuns : scopedRuns;
    const runIds = runs.map((r) => r.id);
    const allScopedRunIds = scopedRuns.map((r) => r.id);
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

    // Use deduped runs (latest per prompt) for source metrics — shows current snapshot
    // Full historical data is only used for trend charts (domainOverTime, categoryOverTime)
    const runFilter = { id: { in: runIds } };

    const rawOccurrences = await prisma.sourceOccurrence.findMany({
      where: {
        run: runFilter,
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

    // Group subdomains under their root domain (e.g. front.moveon.org → moveon.org)
    // so the top sources list doesn't show the same site multiple times
    const occurrences: SourceOccurrenceInput[] = rawOccurrences.map((o) => ({
      runId: o.runId,
      promptId: o.promptId,
      model: o.model,
      entityId: o.entityId,
      domain: getRootDomain(o.source.domain),
      normalizedUrl: o.normalizedUrl,
      createdAt: o.createdAt,
    }));

    // Compute text-order ranks for brand (consistent with competition tab)
    const brandAliases = brand.aliases?.length ? brand.aliases : undefined;
    const entityMetrics: EntityMetricInput[] = runs.map((r) => {
      const rank = computeBrandRank(r.rawResponseText, brand.name, brand.slug, r.analysisJson, brandAliases);
      return { runId: r.id, entityId: brand.slug, rankPosition: rank };
    });

    // Compute midpoint
    const midpoint = new Date(
      rangeCutoff.getTime() + (Date.now() - rangeCutoff.getTime()) / 2,
    );

    const modelsIncluded = [...new Set(runs.map((r) => r.model))];
    const summary = computeSourceSummary(occurrences, entityMetrics, brand.slug, totalResponses);
    const rawTopDomains = computeTopDomains(occurrences, entityMetrics, brand.slug, totalResponses);

    // Override firstSeen with the earliest occurrence from scoped runs only
    // (do NOT query all brandId history — that reintroduces ambiguous-brand contamination)
    const topDomainNames = rawTopDomains.map((d) => d.domain);
    if (topDomainNames.length > 0) {
      // Fetch historical runs for the brand, then scope-filter them
      const historicalRuns = await prisma.run.findMany({
        where: {
          brandId: brand.id,
          job: { status: "done" },
          ...(model && model !== "all" ? { model } : {}),
        },
        select: { id: true, rawResponseText: true, analysisJson: true, narrativeJson: true },
      });
      const scopedHistoricalIds = new Set(
        filterRunsToBrandScope(historicalRuns, brandIdentity).map((r) => r.id),
      );

      const datesByDomain = await prisma.sourceOccurrence.groupBy({
        by: ["sourceId"],
        where: {
          source: { domain: { in: topDomainNames } },
          runId: { in: [...scopedHistoricalIds] },
        },
        _min: { createdAt: true },
        _max: { createdAt: true },
      });
      const sourceIds = [...new Set(datesByDomain.map((e) => e.sourceId))];
      const sources = sourceIds.length > 0
        ? await prisma.source.findMany({
            where: { id: { in: sourceIds } },
            select: { id: true, domain: true },
          })
        : [];
      const sourceDomainMap = new Map(sources.map((s) => [s.id, s.domain]));
      const earliestMap = new Map<string, string>();
      const latestMap = new Map<string, string>();
      for (const row of datesByDomain) {
        const domain = sourceDomainMap.get(row.sourceId);
        if (!domain) continue;
        if (row._min.createdAt) {
          const dateStr = row._min.createdAt.toISOString().slice(0, 10);
          const existing = earliestMap.get(domain);
          if (!existing || dateStr < existing) earliestMap.set(domain, dateStr);
        }
        if (row._max.createdAt) {
          const dateStr = row._max.createdAt.toISOString().slice(0, 10);
          const existing = latestMap.get(domain);
          if (!existing || dateStr > existing) latestMap.set(domain, dateStr);
        }
      }
      for (const d of rawTopDomains) {
        const earliest = earliestMap.get(d.domain);
        if (earliest && earliest < d.firstSeen) d.firstSeen = earliest;
        const latest = latestMap.get(d.domain);
        if (latest && latest > d.lastSeen) d.lastSeen = latest;
      }
    }

    const modelSplit = computeSourceModelSplit(occurrences);

    // Full-range occurrences for time-comparison sections (emerging, trends)
    const fullRangeOccurrences = allScopedRunIds.length > runIds.length
      ? await (async () => {
          const raw = await prisma.sourceOccurrence.findMany({
            where: { run: { id: { in: allScopedRunIds } }, ...clusterPromptFilter },
            select: { runId: true, promptId: true, model: true, entityId: true, normalizedUrl: true, createdAt: true, source: { select: { domain: true } } },
          });
          return raw.map((o) => ({
            runId: o.runId, promptId: o.promptId, model: o.model, entityId: o.entityId,
            domain: getRootDomain(o.source.domain), normalizedUrl: o.normalizedUrl, createdAt: o.createdAt,
          })) as typeof occurrences;
        })()
      : occurrences;

    const rawEmerging = detectEmergingSources(fullRangeOccurrences, midpoint);

    // Enrich emerging sources with prompt examples
    const emergingDomains = new Set(rawEmerging.map((e) => e.domain));
    const emergingOccurrences = fullRangeOccurrences.filter((o) => emergingDomains.has(o.domain));
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

    // "Sources Not Citing Brand": finds domains cited in scoped runs that
    // don't mention the brand. Uses full-range scoped runs (not rawRuns) to
    // avoid out-of-scope runs leaking in for ambiguous brands.
    const brandMentionedRunIds = new Set(allScopedRunIds);
    // Reuse fullRangeOccurrences if available (already scoped + normalized),
    // otherwise use the snapshot occurrences
    const uncitedOccurrences = fullRangeOccurrences !== occurrences
      ? fullRangeOccurrences
      : allScopedRunIds.length > runIds.length
        ? await prisma.sourceOccurrence.findMany({
            where: { run: { id: { in: allScopedRunIds } }, ...clusterPromptFilter },
            select: { runId: true, promptId: true, model: true, entityId: true, normalizedUrl: true, createdAt: true, source: { select: { domain: true } } },
          }).then((rows) => rows.map((o) => ({ runId: o.runId, promptId: o.promptId, model: o.model, entityId: o.entityId, domain: getRootDomain(o.source.domain), normalizedUrl: o.normalizedUrl, createdAt: o.createdAt })))
        : occurrences;
    const domainsNotCitingBrand = computeDomainsNotCitingBrand(uncitedOccurrences, brandMentionedRunIds);

    // Classify domains (uses DB cache → static map → GPT fallback)
    // Classify top domains via GPT, then bulk-fetch cached categories for all others
    const allDomains = rawTopDomains.map((d) => d.domain);
    const categories: Record<string, string> = await classifyDomains(allDomains);

    // For categoryOverTime, also load cached categories for remaining domains
    const allOccurrenceDomains = [...new Set(occurrences.map((o) => o.domain))];
    const uncategorized = allOccurrenceDomains.filter((d) => !(d in categories));
    if (uncategorized.length > 0) {
      const cached = await prisma.source.findMany({
        where: { domain: { in: uncategorized }, category: { not: null } },
        select: { domain: true, category: true },
      });
      for (const s of cached) {
        if (s.category) categories[s.domain] = s.category;
      }
    }
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

    // Source category distribution over time (uses full range for trend data)
    // Group occurrences by run date + model → category counts, then compute percentages
    const categoryOverTime = (() => {
      // Build map: `${date}|${model}` → { category → count }
      const buckets = new Map<string, Map<string, number>>();
      for (const o of fullRangeOccurrences) {
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

    // Top domain citation counts over time (for "Top Source Trends" chart)
    // Query ALL historical SourceOccurrences (not just current range) so the
    // trend chart shows the full picture across all completed jobs.
    // Group by job.finishedAt (not run.createdAt) so each analysis batch gets
    // its own date bucket — runs within a single batch share createdAt but
    // different jobs have distinct finishedAt dates.
    const domainOverTime = await (async () => {
      const allHistorical = await prisma.sourceOccurrence.findMany({
        where: {
          run: {
            brandId: brand.id,
            job: { status: "done", finishedAt: { not: null } },
            ...modelFilter,
          },
          ...clusterPromptFilter,
        },
        select: {
          model: true,
          createdAt: true,
          source: { select: { domain: true } },
          run: { select: { job: { select: { finishedAt: true } } } },
        },
      });

      // Determine the top 8 domains by total citation count (across all time)
      // Normalize to root domain (matches top sources list / table)
      const domainTotals = new Map<string, number>();
      for (const o of allHistorical) {
        const d = getRootDomain(o.source.domain);
        domainTotals.set(d, (domainTotals.get(d) ?? 0) + 1);
      }
      const topDomainKeys = [...domainTotals.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([d]) => d);
      const topSet = new Set(topDomainKeys);

      // Build map: `${date}|${model}` → { domain → count }
      const buckets = new Map<string, Map<string, number>>();
      for (const o of allHistorical) {
        const domain = getRootDomain(o.source.domain);
        if (!topSet.has(domain)) continue;
        const jobDate = o.run.job.finishedAt;
        if (!jobDate) continue;
        const date = jobDate.toISOString().slice(0, 10);
        for (const m of ["all", o.model]) {
          const key = `${date}|${m}`;
          let domMap = buckets.get(key);
          if (!domMap) { domMap = new Map(); buckets.set(key, domMap); }
          domMap.set(domain, (domMap.get(domain) ?? 0) + 1);
        }
      }

      const entries: Array<Record<string, string | number>> = [];
      for (const [key, domMap] of buckets) {
        const [date, mdl] = key.split("|");
        const entry: Record<string, string | number> = { date, model: mdl };
        for (const d of topDomainKeys) {
          entry[d] = domMap.get(d) ?? 0;
        }
        entries.push(entry);
      }
      return entries.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    })();

    // Official site citations for brand + competitors
    const officialSites = computeOfficialSiteCitations(occurrences, brand.slug, {
      slug: brand.slug,
      name: brand.name,
      displayName: brand.displayName,
      aliases: brand.aliases?.length ? brand.aliases : undefined,
    });

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

    // Build entity display names for proper casing in client components
    const entityDisplayNames = buildEntityDisplayNames(runs);
    const entityNames: Record<string, string> = {};
    for (const [id, name] of entityDisplayNames) entityNames[id] = name;
    // Ensure the searched brand uses its proper display name (not titleCase of slug)
    const brandDisplayName = (brand as unknown as { displayName?: string | null }).displayName || brand.name;
    entityNames[brand.slug] = brandDisplayName;

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
        // Category breakdown across ALL domains (not just top 25) for the donut chart
        allDomainCategoryBreakdown: (() => {
          const catCounts: Record<string, number> = {};
          let total = 0;
          for (const o of occurrences) {
            const cat = categories[o.domain] ?? "other";
            catCounts[cat] = (catCounts[cat] ?? 0) + 1;
            total++;
          }
          return Object.entries(catCounts)
            .map(([category, count]) => ({ category, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }))
            .sort((a, b) => b.count - a.count);
        })(),
        modelSplit,
        emerging,
        crossCitation,
        domainsNotCitingBrand,
        officialSites,
        sourcePromptMatrix,
        matrixPrompts: matrixPromptList,
        brandAttributedSources,
        categoryOverTime,
        domainOverTime,
      },
      entityNames,
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
