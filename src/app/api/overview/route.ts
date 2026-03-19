import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VALID_MODELS, VALID_RANGES } from "@/lib/constants";
import { parseAnalysis, aggregateOverview, computeStability } from "@/lib/aggregateAnalysis";
import { isBrandMentioned, computeBrandRank } from "@/lib/visibility/brandMention";
import {
  computeAvgRank,
  computeRank1RateAll,
  computeMentionRate,
  computeShareOfVoice,
} from "@/lib/competition/computeCompetition";
import { fetchBrandRuns } from "@/lib/apiPipeline";
import type { RunAnalysis } from "@/lib/analysisSchema";
import { validateFrames } from "@/lib/validateFrames";
import { synthesizeFramesFromResponses, ensureMinimumFrames } from "@/lib/narrative/synthesizeFrames";
import { getOpenAIDefault } from "@/lib/openai";
import { classifyDomains } from "@/lib/sources/classifyDomain";
import { normalizeEntityIds } from "@/lib/competition/normalizeEntities";

// A run is considered "real" (not stub/dummy) when its response doesn't start
// with the stub prefix used by the backfill and process routes.
function isRealRun(rawResponseText: string): boolean {
  return !rawResponseText.startsWith("[stub:");
}

async function getModelOverviewData(
  brandId: string,
  model: string,
  range: number,
  brandName: string,
  brandSlug: string,
  aliases?: string[],
) {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const allJobs = await prisma.job.findMany({
    where: {
      brandId,
      model,
      status: "done",
      finishedAt: { gte: ninetyDaysAgo },
    },
    orderBy: { finishedAt: "asc" },
    select: { id: true, finishedAt: true },
  });

  if (allJobs.length === 0) return null;

  const latestJob = allJobs[allJobs.length - 1];

  const allRuns = await prisma.run.findMany({
    where: { jobId: { in: allJobs.map((j) => j.id) } },
    select: { jobId: true, model: true, analysisJson: true, rawResponseText: true, prompt: { select: { cluster: true } } },
  });

  // Filter out stub/dummy runs
  const realRuns = allRuns.filter((r) => isRealRun(r.rawResponseText));
  if (realRuns.length === 0) return null;

  const analysesByJob = new Map<string, RunAnalysis[]>();
  const industryAnalysesByJob = new Map<string, RunAnalysis[]>();
  for (const run of realRuns) {
    const parsed = parseAnalysis(run.analysisJson);
    if (parsed) {
      const list = analysesByJob.get(run.jobId) ?? [];
      list.push(parsed);
      analysesByJob.set(run.jobId, list);
      if (run.prompt.cluster === "industry") {
        const indList = industryAnalysesByJob.get(run.jobId) ?? [];
        indList.push(parsed);
        industryAnalysesByJob.set(run.jobId, indList);
      }
    }
  }

  const latestAnalyses = analysesByJob.get(latestJob.id) ?? [];
  if (latestAnalyses.length === 0) return null;

  // Cluster-level stats from latest job runs
  const latestRealRunsFull = realRuns.filter((r) => r.jobId === latestJob.id);
  const clusterStats = new Map<string, { total: number; mentioned: number; strengths: number[] }>();
  for (const run of latestRealRunsFull) {
    const cluster = run.prompt.cluster;
    const parsed = parseAnalysis(run.analysisJson);
    if (!parsed) continue;
    const entry = clusterStats.get(cluster) ?? { total: 0, mentioned: 0, strengths: [] };
    entry.total++;
    if (parsed.brandMentioned) entry.mentioned++;
    entry.strengths.push(parsed.brandMentionStrength);
    clusterStats.set(cluster, entry);
  }

  // Compute avg rank from industry-cluster runs only (matches visibility tab)
  const industryLatestRuns = latestRealRunsFull.filter((r) => r.prompt.cluster === "industry");
  const ranks: (number | null)[] = industryLatestRuns.map((run) =>
    computeBrandRank(run.rawResponseText, brandName, brandSlug, run.analysisJson, aliases),
  );
  const avgRank = computeAvgRank(ranks);

  const rangeCutoff = new Date(Date.now() - range * 24 * 60 * 60 * 1000);
  const eligibleJobs = allJobs.filter(
    (j) => j.finishedAt && analysesByJob.has(j.id),
  );
  const inRange = eligibleJobs.filter((j) => j.finishedAt! >= rangeCutoff);
  // Always include at least the 2 most recent data points so the chart shows a line
  const trendJobs = inRange.length >= 2
    ? inRange
    : eligibleJobs.slice(-2);

  const trendData = trendJobs.map((j) => ({
    date: j.finishedAt!,
    analyses: analysesByJob.get(j.id)!,
  }));

  const industryTrendData = trendJobs
    .filter((j) => industryAnalysesByJob.has(j.id))
    .map((j) => ({
      date: j.finishedAt!,
      analyses: industryAnalysesByJob.get(j.id)!,
    }));

  // Compute industry mention rate using isBrandMentioned (matches visibility tab)
  const industryMentionCount = industryLatestRuns.filter((r) =>
    isBrandMentioned(r.rawResponseText, brandName, brandSlug, aliases),
  ).length;
  const industryMentionRate = industryLatestRuns.length > 0
    ? Math.round((industryMentionCount / industryLatestRuns.length) * 100)
    : 0;

  return {
    latestJob,
    latestAnalyses,
    industryLatestAnalyses: industryAnalysesByJob.get(latestJob.id) ?? [],
    trendData,
    industryTrendData,
    totalRuns: latestRealRunsFull.length,
    analyzedRuns: latestAnalyses.length,
    clusterStats,
    avgRank,
    industryMentionRate,
  };
}

export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  const model = req.nextUrl.searchParams.get("model");
  const rangeParam = req.nextUrl.searchParams.get("range");

  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }
  if (!model || (model !== "all" && !VALID_MODELS.includes(model))) {
    return NextResponse.json(
      { error: `Invalid model. Must be "all" or one of: ${VALID_MODELS.join(", ")}` },
      { status: 400 },
    );
  }
  const range = parseInt(rangeParam ?? "", 10);
  if (!VALID_RANGES.includes(range)) {
    return NextResponse.json(
      { error: `Invalid range. Must be one of: ${VALID_RANGES.join(", ")}` },
      { status: 400 },
    );
  }

  const brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }
  const brandName = (brand as unknown as { displayName?: string | null }).displayName || brand.name;
  const brandAliases = (brand as unknown as { aliases?: string[] }).aliases?.length ? (brand as unknown as { aliases: string[] }).aliases : undefined;

  const modelsToQuery = model === "all" ? VALID_MODELS : [model];

  // Fetch data for each model in parallel
  const modelResults = await Promise.all(
    modelsToQuery.map(async (m) => ({
      model: m,
      data: await getModelOverviewData(brand.id, m, range, brand.name, brand.slug, brandAliases),
    })),
  );

  // Keep only models with real data
  const withData = modelResults.filter((r) => r.data !== null);

  function avgArr(nums: number[]): number {
    return nums.length === 0 ? 0 : nums.reduce((s, n) => s + n, 0) / nums.length;
  }
  function pctOf(count: number, total: number): number {
    return total === 0 ? 0 : Math.round((count / total) * 100);
  }

  if (withData.length === 0) {
    return NextResponse.json({ hasData: false, reason: "no_completed_job" });
  }

  // Merge analyses across all models with real data
  const mergedLatestAnalyses: RunAnalysis[] = [];
  const mergedTrendMap = new Map<string, { date: Date; analyses: RunAnalysis[] }>();
  let totalRuns = 0;
  let totalAnalyzed = 0;
  let latestFinished: Date | null = null;

  for (const { data } of withData) {
    if (!data) continue;

    mergedLatestAnalyses.push(...data.latestAnalyses);
    totalRuns += data.totalRuns;
    totalAnalyzed += data.analyzedRuns;

    const jobFinished = data.latestJob.finishedAt;
    if (jobFinished && (!latestFinished || jobFinished > latestFinished)) {
      latestFinished = jobFinished;
    }

    // Merge trend data — group by date string so overlapping dates get combined
    for (const td of data.trendData) {
      const key = td.date.toISOString().slice(0, 10);
      const existing = mergedTrendMap.get(key);
      if (existing) {
        existing.analyses.push(...td.analyses);
      } else {
        mergedTrendMap.set(key, { date: td.date, analyses: [...td.analyses] });
      }
    }
  }

  // Merge industry-only analyses across models
  const mergedIndustryLatest: RunAnalysis[] = [];
  const mergedIndustryTrendMap = new Map<string, { date: Date; analyses: RunAnalysis[] }>();
  for (const { data } of withData) {
    if (!data) continue;
    mergedIndustryLatest.push(...data.industryLatestAnalyses);
    for (const td of data.industryTrendData) {
      const key = td.date.toISOString().slice(0, 10);
      const existing = mergedIndustryTrendMap.get(key);
      if (existing) {
        existing.analyses.push(...td.analyses);
      } else {
        mergedIndustryTrendMap.set(key, { date: td.date, analyses: [...td.analyses] });
      }
    }
  }

  if (mergedLatestAnalyses.length === 0) {
    return NextResponse.json({
      hasData: false,
      reason: "no_analysis_data",
      hint: "Runs exist but were created before structured extraction. Re-run prompts to generate analysis.",
    });
  }

  const mergedTrendData = Array.from(mergedTrendMap.values()).sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  const overview = aggregateOverview(mergedLatestAnalyses, brandName, mergedTrendData);

  // NOTE: Frame computation deferred until after fetchBrandRuns resolves,
  // so we use the same deduped runs as the narrative tab. See below.

  // Override Visibility Score and Mention Rate KPIs with industry-only data
  if (mergedIndustryLatest.length > 0) {
    const industryVis = Math.round(avgArr(mergedIndustryLatest.map((a) => a.brandMentionStrength)));
    const industryMR = pctOf(
      mergedIndustryLatest.filter((a) => a.brandMentioned).length,
      mergedIndustryLatest.length,
    );

    // Compute industry visibility delta from ~7 days ago
    const sevenDaysAgo = Date.now() - 7 * 86_400_000;
    const prevIndustry = Array.from(mergedIndustryTrendMap.values())
      .filter((td) => td.date.getTime() <= sevenDaysAgo && td.analyses.length > 0)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    const prevVis = prevIndustry.length > 0
      ? Math.round(avgArr(prevIndustry[0].analyses.map((a) => a.brandMentionStrength)))
      : null;

    for (const kpi of overview.kpis) {
      if (kpi.label === "Visibility Score") {
        kpi.value = industryVis;
        kpi.delta = prevVis !== null ? industryVis - prevVis : 0;
      }
      if (kpi.label === "Mention Rate") {
        kpi.value = industryMR;
      }
    }

    // Override trend visibility with industry-only data
    const industryByDate = new Map<string, RunAnalysis[]>();
    for (const [key, val] of mergedIndustryTrendMap) {
      industryByDate.set(key, val.analyses);
    }
    for (const point of overview.trend) {
      const indAnalyses = industryByDate.get(point.date);
      point.visibility = indAnalyses && indAnalyses.length > 0
        ? Math.round(avgArr(indAnalyses.map((a) => a.brandMentionStrength)))
        : 0;
    }
  }

  // Merge cluster stats across models
  const mergedClusters = new Map<string, { total: number; mentioned: number; strengths: number[] }>();
  for (const { data } of withData) {
    if (!data) continue;
    for (const [cluster, stats] of data.clusterStats) {
      const existing = mergedClusters.get(cluster) ?? { total: 0, mentioned: 0, strengths: [] };
      existing.total += stats.total;
      existing.mentioned += stats.mentioned;
      existing.strengths.push(...stats.strengths);
      mergedClusters.set(cluster, existing);
    }
  }

  const clusterOrder = ["direct", "related", "comparative", "network", "industry"];
  const clusterVisibility = clusterOrder
    .filter((c) => mergedClusters.has(c))
    .map((cluster) => {
      const stats = mergedClusters.get(cluster)!;
      return {
        cluster,
        mentionRate: stats.total > 0 ? Math.round((stats.mentioned / stats.total) * 100) : 0,
      };
    });
  overview.clusterVisibility = clusterVisibility;

  // Per-model comparison (visibility uses industry-only data)
  // Initial sentiment uses legitimacy; will be recomputed from narrativeJson in the deduped block below
  const modelComparison = withData.map(({ model: m, data }) => {
    const allAnalyses = data!.latestAnalyses;
    return {
      model: m,
      mentionRate: data!.industryMentionRate,
      controversy: Math.round(avgArr(allAnalyses.map((a) => a.sentiment.controversy))),
      authority: parseFloat(avgArr(allAnalyses.map((a) => a.authorityScore)).toFixed(2)),
      sentiment: 0, // placeholder — recomputed from narrativeJson below
      narrativeStability: computeStability(allAnalyses),
      avgRank: data!.avgRank,
    };
  });
  overview.modelComparison = modelComparison;

  const activeModels = withData.map((r) => r.model);

  // --- Run all supplementary queries in parallel ---
  // (visibility KPIs, sentiment, competitive rank, top source type)

  type OverviewVisRun = {
    id: string;
    model: string;
    promptId: string;
    createdAt: Date;
    rawResponseText: string;
    analysisJson: unknown;
    narrativeJson: unknown;
    prompt: { text: string; cluster: string; intent: string };
  };

  const latestJobIds = withData.map((w) => w.data!.latestJob.id);

  // Single fetchBrandRuns call — reused for KPIs, competitive rank, and sentiment
  const visResultPromise = fetchBrandRuns<OverviewVisRun>({
    brandSlug: brand.slug,
    model: model === "all" ? "all" : model,
    viewRange: range,
    runQuery: { include: { prompt: true } },
  });

  // Await fetchBrandRuns first — we need deduped run IDs for source type query
  const visResult = await visResultPromise.catch((e) => { console.error("Overview KPI error:", e); return null; });

  // Top source type: query ALL runs in range (matching sources tab)
  const sourceOccurrences = visResult && visResult.ok
    ? await prisma.sourceOccurrence.findMany({
        where: {
          run: {
            brandId: brand.id,
            createdAt: { gte: new Date(Date.now() - range * 86_400_000) },
            job: { status: "done" },
            ...(model !== "all" ? { model } : {}),
          },
        },
        select: { source: { select: { domain: true } } },
      }).catch((e) => { console.error("Source type error:", e); return [] as { source: { domain: string } }[]; })
    : [];

  // --- Visibility KPIs + Competitive Rank (from single visResult) ---
  let overallMentionRate = 0;
  let avgRankScore = 0;
  let firstMentionRate = 0;
  let shareOfVoice = 0;
  let kpiDeltas: import("@/types/api").KpiDeltas | null = null;
  let competitiveRank: { rank: number; totalCompetitors: number } | null = null;

  if (visResult && visResult.ok) {
    const { brand: visBrand, runs: visRuns } = visResult;
    const industryRuns = visRuns.filter((r) => r.prompt.cluster === "industry");
    const industryRunIds = industryRuns.map((r) => r.id);

    // Mention rate
    const industryMentions = industryRuns.filter((r) =>
      isBrandMentioned(r.rawResponseText, visBrand.name, visBrand.slug, brandAliases),
    ).length;
    overallMentionRate = computeMentionRate(industryMentions, industryRuns.length);

    // Ranks
    const industryRanks: (number | null)[] = industryRuns.map((r) =>
      computeBrandRank(r.rawResponseText, visBrand.name, visBrand.slug, r.analysisJson, brandAliases),
    );
    avgRankScore = computeAvgRank(industryRanks) ?? 0;
    firstMentionRate = computeRank1RateAll(industryRanks);

    // SoV + competitive rank + KPI deltas — text-based (no EntityResponseMetric)
    type OverviewAnalysis = { brandMentioned?: boolean; competitors?: { name: string }[] };

    function computeTextSov(sovRuns: OverviewVisRun[]): number {
      let bm = 0, total = 0;
      for (const run of sovRuns) {
        const mentioned = isBrandMentioned(run.rawResponseText, visBrand.name, visBrand.slug, brandAliases);
        const analysis = run.analysisJson as OverviewAnalysis | null;
        const compCount = (analysis?.competitors ?? []).length;
        if (mentioned) bm++;
        total += (mentioned ? 1 : 0) + compCount;
      }
      return computeShareOfVoice(bm, total);
    }

    if (industryRunIds.length > 0) {
      shareOfVoice = computeTextSov(industryRuns);

      // Competitive rank: use EntityResponseMetric (same as Competition tab)
      // Only count entities that co-occur with the brand in the same response
      const erm = await prisma.entityResponseMetric.findMany({
        where: { runId: { in: industryRunIds } },
        select: { runId: true, entityId: true },
      });
      // Normalize entity IDs: merge duplicates like "abc" + "disney/abc"
      const rawIds = [...new Set(erm.map((m) => m.entityId))].filter((id) => id !== visBrand.slug);
      const aliasMap = await normalizeEntityIds(rawIds, visBrand.slug);
      aliasMap.set(visBrand.slug, visBrand.slug);

      // Group by entity (using canonical IDs)
      const entityByRun = new Map<string, Set<string>>();
      const entityAppearances = new Map<string, number>();
      for (const m of erm) {
        const canonical = aliasMap.get(m.entityId) ?? m.entityId;
        entityAppearances.set(canonical, (entityAppearances.get(canonical) ?? 0) + 1);
        if (!entityByRun.has(m.runId)) entityByRun.set(m.runId, new Set());
        entityByRun.get(m.runId)!.add(canonical);
      }
      // Find runs where brand appears
      const brandRunIds = new Set<string>();
      for (const [runId, entities] of entityByRun) {
        if (entities.has(visBrand.slug)) brandRunIds.add(runId);
      }
      // Count only entities that co-occur with brand
      const coEntityCounts = new Map<string, number>();
      coEntityCounts.set(visBrand.slug, entityAppearances.get(visBrand.slug) ?? 0);
      for (const [entityId] of entityAppearances) {
        if (entityId === visBrand.slug) continue;
        let coCount = 0;
        for (const m of erm) {
          if (m.entityId === entityId && brandRunIds.has(m.runId)) coCount++;
        }
        if (coCount > 0) coEntityCounts.set(entityId, entityAppearances.get(entityId) ?? 0);
      }
      const sorted = [...coEntityCounts.entries()]
        .map(([entityId, count]) => ({ entityId, count }))
        .sort((a, b) => b.count - a.count);
      const brandIdx = sorted.findIndex((e) => e.entityId === visBrand.slug);
      if (brandIdx >= 0) {
        competitiveRank = { rank: brandIdx + 1, totalCompetitors: sorted.length };
      }

      // KPI deltas (30-day window, matching visibility tab)
      const now = Date.now();
      const oneMonthAgo = new Date(now - 30 * 86_400_000);
      const twoMonthsAgo = new Date(now - 60 * 86_400_000);
      const thisMonthRuns = industryRuns.filter((r) => r.createdAt >= oneMonthAgo);
      const priorMonthRuns = industryRuns.filter(
        (r) => r.createdAt >= twoMonthsAgo && r.createdAt < oneMonthAgo,
      );
      const hasDelta = thisMonthRuns.length > 0 && priorMonthRuns.length > 0;

      if (hasDelta) {
        const tmMentions = thisMonthRuns.filter((r) =>
          isBrandMentioned(r.rawResponseText, visBrand.name, visBrand.slug, brandAliases),
        ).length;
        const pmMentions = priorMonthRuns.filter((r) =>
          isBrandMentioned(r.rawResponseText, visBrand.name, visBrand.slug, brandAliases),
        ).length;
        const tmMR = computeMentionRate(tmMentions, thisMonthRuns.length);
        const pmMR = computeMentionRate(pmMentions, priorMonthRuns.length);

        const tmRanks = thisMonthRuns.map((r) =>
          computeBrandRank(r.rawResponseText, visBrand.name, visBrand.slug, r.analysisJson, brandAliases),
        );
        const pmRanks = priorMonthRuns.map((r) =>
          computeBrandRank(r.rawResponseText, visBrand.name, visBrand.slug, r.analysisJson, brandAliases),
        );

        kpiDeltas = {
          mentionRate: parseFloat((tmMR - pmMR).toFixed(1)),
          shareOfVoice: parseFloat((computeTextSov(thisMonthRuns) - computeTextSov(priorMonthRuns)).toFixed(1)),
          avgRank: parseFloat(((computeAvgRank(tmRanks) ?? 0) - (computeAvgRank(pmRanks) ?? 0)).toFixed(2)),
          firstMentionRate: parseFloat((computeRank1RateAll(tmRanks) - computeRank1RateAll(pmRanks)).toFixed(1)),
        };
      }
    }
  }

  // --- Sentiment split (from deduplicated fetchBrandRuns, matching narrative tab) ---
  let sentimentSplit: { positive: number; neutral: number; negative: number } | null = null;
  if (visResult && visResult.ok) {
    const { runs: visRuns } = visResult;
    let pos = 0, neu = 0, neg = 0;
    for (const r of visRuns) {
      const nj = r.narrativeJson as Record<string, unknown> | null;
      if (!nj) continue;
      const sent = nj.sentiment as { label?: string } | undefined;
      if (!sent?.label) continue;
      if (sent.label === "POS") pos++;
      else if (sent.label === "NEG") neg++;
      else neu++;
    }
    const total = pos + neu + neg;
    if (total > 0) {
      sentimentSplit = {
        positive: Math.round((pos / total) * 100),
        neutral: Math.round((neu / total) * 100),
        negative: Math.round((neg / total) * 100),
      };
    }
  }

  // --- Recompute frames & model comparison from deduped runs (matches narrative tab exactly) ---
  if (visResult && visResult.ok) {
    const { runs: visRuns, isAll } = visResult;

    // Parse all deduped analyses
    const dedupedAnalyses = visRuns
      .map((r) => parseAnalysis(r.analysisJson))
      .filter((a): a is NonNullable<typeof a> => a !== null);

    // Group by model for per-model breakdowns
    const dedupedByModel = new Map<string, RunAnalysis[]>();
    for (const r of visRuns) {
      const parsed = parseAnalysis(r.analysisJson);
      if (!parsed) continue;
      const list = dedupedByModel.get(r.model) ?? [];
      list.push(parsed);
      dedupedByModel.set(r.model, list);
    }

    // Recompute frame list + overall percentages from deduped data (same as aggregateNarrative)
    if (dedupedAnalyses.length > 0) {
      const STRENGTH_THRESHOLD = 20;
      const frameBuckets: Record<string, number> = {};
      for (const a of dedupedAnalyses) {
        for (const f of a.frames) {
          if (f.strength >= STRENGTH_THRESHOLD) {
            frameBuckets[f.name] = (frameBuckets[f.name] ?? 0) + 1;
          }
        }
      }
      const totalResponses = dedupedAnalyses.length;
      overview.topFrames = Object.entries(frameBuckets)
        .map(([frame, count]) => ({
          frame,
          percentage: totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0,
          byModel: { chatgpt: 0, gemini: 0, claude: 0, perplexity: 0, google: 0 },
        }))
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 8);

      // Compute per-model frame percentages (same as narrative tab)
      const modelRunCounts: Record<string, number> = {};
      const modelFrameCounts: Record<string, Record<string, number>> = {};
      for (const r of visRuns) {
        const a = parseAnalysis(r.analysisJson);
        if (!a) continue;
        modelRunCounts[r.model] = (modelRunCounts[r.model] ?? 0) + 1;
        if (!modelFrameCounts[r.model]) modelFrameCounts[r.model] = {};
        for (const f of a.frames) {
          if (f.strength >= STRENGTH_THRESHOLD) {
            modelFrameCounts[r.model][f.name] = (modelFrameCounts[r.model][f.name] ?? 0) + 1;
          }
        }
      }
      for (const frame of overview.topFrames) {
        frame.byModel = {
          chatgpt: modelRunCounts["chatgpt"] ? Math.round(((modelFrameCounts["chatgpt"]?.[frame.frame] ?? 0) / modelRunCounts["chatgpt"]) * 100) : 0,
          gemini: modelRunCounts["gemini"] ? Math.round(((modelFrameCounts["gemini"]?.[frame.frame] ?? 0) / modelRunCounts["gemini"]) * 100) : 0,
          claude: modelRunCounts["claude"] ? Math.round(((modelFrameCounts["claude"]?.[frame.frame] ?? 0) / modelRunCounts["claude"]) * 100) : 0,
          perplexity: modelRunCounts["perplexity"] ? Math.round(((modelFrameCounts["perplexity"]?.[frame.frame] ?? 0) / modelRunCounts["perplexity"]) * 100) : 0,
          google: modelRunCounts["google"] ? Math.round(((modelFrameCounts["google"]?.[frame.frame] ?? 0) / modelRunCounts["google"]) * 100) : 0,
        };
      }

      // Validate frames (same as narrative tab)
      overview.topFrames = await validateFrames(overview.topFrames, brandName);

      // Fallback: synthesize from raw responses if empty
      if (overview.topFrames.length === 0 && visRuns.length > 0) {
        overview.topFrames = await synthesizeFramesFromResponses(
          visRuns.map((r) => ({ rawResponseText: r.rawResponseText, model: r.model })),
          brandName,
          isAll ? "all" : model,
        );
      }

      // Ensure at least 5 frames
      overview.topFrames = await ensureMinimumFrames(
        overview.topFrames,
        brandName,
        visRuns.map((r) => ({ rawResponseText: r.rawResponseText, model: r.model })),
      );
    }

    // Recompute model comparison sentiment/authority/stability from deduped data
    // Group visRuns by model for narrative-based sentiment
    const runsByModel = new Map<string, typeof visRuns>();
    for (const r of visRuns) {
      if (!runsByModel.has(r.model)) runsByModel.set(r.model, []);
      runsByModel.get(r.model)!.push(r);
    }
    for (const mc of overview.modelComparison) {
      const analyses = dedupedByModel.get(mc.model);
      if (!analyses || analyses.length === 0) continue;
      mc.controversy = Math.round(avgArr(analyses.map((a) => a.sentiment.controversy)));
      mc.authority = parseFloat(avgArr(analyses.map((a) => a.authorityScore)).toFixed(2));
      mc.narrativeStability = computeStability(analyses);
      // Sentiment from narrativeJson (matches overall sentimentSplit methodology)
      const modelRuns = runsByModel.get(mc.model) ?? [];
      let pos = 0, total = 0;
      for (const r of modelRuns) {
        const nj = r.narrativeJson as Record<string, unknown> | null;
        if (!nj) continue;
        const sent = nj.sentiment as { label?: string } | undefined;
        if (!sent?.label) continue;
        total++;
        if (sent.label === "POS") pos++;
      }
      mc.sentiment = total > 0 ? Math.round((pos / total) * 100) : 0;
    }
  }

  // --- Top cited source type (matches sources tab exactly: top 25 domains, classifyDomains, aggregate) ---
  let topSourceType: { category: string; count: number; totalSources: number } | null = null;
  if (sourceOccurrences.length > 0) {
    // Group by domain → count citations per domain
    const domainCitationCounts = new Map<string, number>();
    for (const s of sourceOccurrences) {
      domainCitationCounts.set(s.source.domain, (domainCitationCounts.get(s.source.domain) ?? 0) + 1);
    }
    // Keep only top 25 domains by citation count (same as computeTopDomains limit=25)
    const top25Domains = [...domainCitationCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25);
    // Classify domains using same pipeline as sources tab (DB cache → static map → GPT)
    const domainNames = top25Domains.map(([d]) => d);
    const categories = await classifyDomains(domainNames);
    // Aggregate citations by category from top 25 (same as SourceSummaryCards/SourceTypeDonut)
    const catCitations: Record<string, number> = {};
    let totalCitations = 0;
    for (const [domain, count] of top25Domains) {
      const cat = categories[domain] ?? "other";
      catCitations[cat] = (catCitations[cat] ?? 0) + count;
      totalCitations += count;
    }
    const sorted = Object.entries(catCitations).sort((a, b) => b[1] - a[1]);
    const top = sorted.find(([cat]) => cat !== "other") ?? sorted[0];
    if (top) {
      topSourceType = { category: top[0], count: top[1], totalSources: totalCitations };
    }
  }

  // ── Generate AI summary using GPT-4o-mini ──
  const isOrg = ((brand as unknown as { category?: string | null }).category ?? null) === "political_advocacy";
  const industry = (brand as unknown as { industry?: string | null }).industry ?? null;
  let aiSummary: string | null = null;
  try {
    // Pick the single most important story to tell
    const sortedFrames = [...overview.topFrames].sort((a, b) => b.percentage - a.percentage);
    const topFrame = sortedFrames[0]?.frame ?? null;
    const sentLabel = sentimentSplit
      ? sentimentSplit.positive >= 50 ? "mostly positive"
        : sentimentSplit.negative >= 30 ? `${sentimentSplit.negative}% negative`
        : sentimentSplit.neutral >= 50 ? "mostly neutral"
        : "mixed"
      : null;

    const summaryData = {
      brandName,
      industry: industry ?? "this space",
      mentionRate: overallMentionRate,
      sentiment: sentLabel,
      topNarrative: topFrame,
      ...(competitiveRank ? { rank: competitiveRank.rank, totalCompetitors: competitiveRank.totalCompetitors } : {}),
    };
    const oai = getOpenAIDefault();
    const completion = await oai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 100,
      messages: [
        {
          role: "system",
          content: `You write a single-sentence executive insight for a brand visibility dashboard. The sentence explains the most important takeaway about how a ${isOrg ? "organization" : "brand"} appears in AI-generated answers (ChatGPT, Gemini, Claude, Perplexity).

Rules:
- Exactly ONE sentence, max 30 words. Be concise.
- Plain, conversational English for a marketing executive.
- Focus on the ONE most noteworthy finding — don't try to mention every metric.
- Pick the most interesting angle: a visibility gap, a sentiment problem, a strong narrative, or a competitive position.
- Reference at most 1-2 specific numbers. Do NOT list multiple stats.
- ${isOrg ? 'Say "organizations" instead of "competitors" and "organization" instead of "brand."' : ""}
- No markdown, no bullet points, no jargon.`,
        },
        {
          role: "user",
          content: `Data: ${JSON.stringify(summaryData)}`,
        },
      ],
    });
    aiSummary = completion.choices[0]?.message?.content?.trim() ?? null;
  } catch (e) {
    console.error("AI summary generation failed:", e instanceof Error ? e.message : e);
    // Fallback: aiSummary stays null, client can show nothing or a simple fallback
  }

  return NextResponse.json({
    hasData: true,
    aiSummary,
    brandCategory: (brand as unknown as { category?: string | null }).category ?? null,
    brandIndustry: (brand as unknown as { industry?: string | null }).industry ?? null,
    job: {
      id: withData[0].data!.latestJob.id,
      model: model === "all" ? "all" : model,
      range,
      finishedAt: latestFinished?.toISOString() ?? null,
    },
    overview,
    visibilityKpis: {
      overallMentionRate,
      shareOfVoice,
      firstMentionRate,
      avgRankScore,
    },
    kpiDeltas,
    sentimentSplit,
    competitiveRank,
    topSourceType,
    totals: { totalRuns, analyzedRuns: totalAnalyzed },
    ...(model === "all" ? { activeModels } : {}),
  }, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
  });
}
