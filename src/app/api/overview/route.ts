import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VALID_MODELS, VALID_RANGES } from "@/lib/constants";
import { parseAnalysis, computeStability } from "@/lib/aggregateAnalysis";
import { computeBrandRank } from "@/lib/visibility/brandMention";
import {
  computeAvgRank,
  computeRank1RateAll,
  computeMentionRate,
  computeShareOfVoice,
} from "@/lib/competition/computeCompetition";
import { fetchBrandRuns } from "@/lib/apiPipeline";
import { requireBrandAccess, brandCacheControl } from "@/lib/brandAccess";
import { isRunInBrandScope, filterRunsToBrandScope, buildBrandIdentity } from "@/lib/visibility/brandScope";
import { getSovCountsForRun } from "@/lib/visibility/rankedEntities";
import type { RunAnalysis } from "@/lib/analysisSchema";
import { validateFrames } from "@/lib/validateFrames";
import { synthesizeFramesFromResponses, ensureMinimumFrames } from "@/lib/narrative/synthesizeFrames";
import { getOpenAIDefault } from "@/lib/openai";
import { normalizeEntityIds } from "@/lib/competition/normalizeEntities";
import { computeTopSourceType } from "@/lib/sources/topSourceType";

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

  // Filter out stub/dummy runs — keep all for denominator
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
  // Use isRunInBrandScope for mention detection (not parsed.brandMentioned)
  // so ambiguous brands get the same scope-aware counting as visibilityKpis.
  const scopedIdentity = { brandName, brandSlug, aliases };
  const latestRealRunsFull = realRuns.filter((r) => r.jobId === latestJob.id);
  const clusterStats = new Map<string, { total: number; mentioned: number; strengths: number[] }>();
  for (const run of latestRealRunsFull) {
    const cluster = run.prompt.cluster;
    const parsed = parseAnalysis(run.analysisJson);
    if (!parsed) continue;
    const mentioned = isRunInBrandScope(run, scopedIdentity);
    const entry = clusterStats.get(cluster) ?? { total: 0, mentioned: 0, strengths: [] };
    entry.total++;
    if (mentioned) entry.mentioned++;
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

  // Compute industry mention rate using isRunInBrandScope (matches visibility tab)
  const industryMentionCount = industryLatestRuns.filter((r) =>
    isRunInBrandScope(r, scopedIdentity),
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

// Server-side response cache: avoids re-running GPT calls when data hasn't changed
const overviewCache = new Map<string, { response: unknown; runCount: number; ts: number }>();
const OVERVIEW_CACHE_TTL_MS = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  const model = req.nextUrl.searchParams.get("model");
  const rangeParam = req.nextUrl.searchParams.get("range");

  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }
  const access = await requireBrandAccess(brandSlug);
  if (access) return access;
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

  if (withData.length === 0) {
    return NextResponse.json({ hasData: false, reason: "no_completed_job" });
  }

  // Collect totals across models
  let totalRuns = 0;
  let totalAnalyzed = 0;
  let latestFinished: Date | null = null;
  let hasAnalyses = false;

  for (const { data } of withData) {
    if (!data) continue;
    totalRuns += data.totalRuns;
    totalAnalyzed += data.analyzedRuns;
    if (data.latestAnalyses.length > 0) hasAnalyses = true;
    const jobFinished = data.latestJob.finishedAt;
    if (jobFinished && (!latestFinished || jobFinished > latestFinished)) {
      latestFinished = jobFinished;
    }
  }

  if (!hasAnalyses) {
    return NextResponse.json({
      hasData: false,
      reason: "no_analysis_data",
      hint: "Runs exist but were created before structured extraction. Re-run prompts to generate analysis.",
    });
  }

  // Build overview object explicitly instead of using aggregateOverview().
  // This avoids mixing raw-analysis values with later scoped overrides.
  // KPIs, frames, and trend are populated in dedicated blocks below.
  const overview: import("@/types/api").OverviewResponse = {
    kpis: [],        // populated after visibilityKpis + scoped content blocks
    topFrames: [],   // populated from scoped frame computation
    trend: [],       // populated from scoped trend computation
    clusterVisibility: [],
    modelComparison: [],
  };

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

  const clusterOrder = ["brand", "industry"];
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

  // Per-model comparison: mentionRate and avgRank from denominator-aware data,
  // content metrics (controversy, authority, stability, sentiment) recomputed
  // from scoped runs in the frame/model-comparison block below.
  const modelComparison = withData.map(({ model: m, data }) => ({
    model: m,
    mentionRate: data!.industryMentionRate,
    controversy: 0,           // recomputed from scoped analyses below
    authority: 0,             // recomputed from scoped analyses below
    sentiment: 0,             // recomputed from scoped narrativeJson below
    narrativeStability: 80,   // recomputed from scoped analyses below
    avgRank: data!.avgRank,
    topResultRate: 0,         // recomputed from latest snapshot below
    shareOfVoice: 0,          // recomputed from latest snapshot below
  }));
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

  // Single fetchBrandRuns call — reused for KPIs, competitive rank, and sentiment
  const visResultPromise = fetchBrandRuns<OverviewVisRun>({
    brandSlug: brand.slug,
    model: model === "all" ? "all" : model,
    viewRange: range,
    runQuery: { include: { prompt: true } },
  });

  // Await fetchBrandRuns first — we need deduped run IDs for source type query
  const visResult = await visResultPromise.catch((e) => { console.error("Overview KPI error:", e); return null; });

  // Check server-side cache
  const overviewCacheKey = `${brandSlug}|${model}|${range}`;
  const totalRunCount = (visResult && visResult.ok ? visResult.runs.length : 0) + withData.reduce((s, w) => s + (w.data?.totalRuns ?? 0), 0);
  const cachedOverview = overviewCache.get(overviewCacheKey);
  if (cachedOverview && cachedOverview.runCount === totalRunCount && Date.now() - cachedOverview.ts < OVERVIEW_CACHE_TTL_MS) {
    return NextResponse.json(cachedOverview.response, {
      headers: { "Cache-Control": brandCacheControl(brandSlug) },
    });
  }

  // Top source type: computed from scoped run IDs (matching Sources API)
  // Deferred until after visResult is available — see topSourceType block below.

  // --- Visibility KPIs + Competitive Rank (from single visResult) ---
  let overallMentionRate = 0;
  let avgRankScore = 0;
  let firstMentionRate = 0;
  let shareOfVoice = 0;
  let kpiDeltas: import("@/types/api").KpiDeltas | null = null;
  let competitiveRank: { rank: number; totalCompetitors: number } | null = null;
  // allSnapshotRuns: latest 24h pool, all prompt types, brand-scoped — for Narrative, Sentiment, Sources
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allSnapshotRuns: any[] = [];

  if (visResult && visResult.ok) {
    const { brand: visBrand, runs: visRuns } = visResult;
    const visBrandIdentity = buildBrandIdentity(visBrand);
    // Industry runs: use the full deduped set from fetchBrandRuns (latest per model+prompt).
    // No additional 24h filter — the dedup already gives the current state, and this ensures
    // the scorecard matches the latest trend chart data point exactly.
    const industryRuns = visRuns.filter((r) => r.prompt.cluster === "industry");
    const industryRunIds = industryRuns.map((r) => r.id);

    // All-prompt snapshot: all clusters, brand-scoped — for Narrative, Sentiment, Sources.
    // Uses the full deduped set (latest per model+prompt) to stay consistent with the trend chart.
    const scopedRuns = filterRunsToBrandScope(visRuns, visBrandIdentity);
    allSnapshotRuns = scopedRuns;

    // Mention rate — scope-aware detection, full denominator
    const industryMentions = industryRuns.filter((r) =>
      isRunInBrandScope(r, visBrandIdentity),
    ).length;
    overallMentionRate = computeMentionRate(industryMentions, industryRuns.length);

    // Ranks
    const industryRanks: (number | null)[] = industryRuns.map((r) =>
      computeBrandRank(r.rawResponseText, visBrand.name, visBrand.slug, r.analysisJson, brandAliases),
    );
    avgRankScore = computeAvgRank(industryRanks) ?? 0;
    firstMentionRate = computeRank1RateAll(industryRanks);

    // Recompute per-model metrics from the same latest-snapshot pool
    // so the "By AI Platform" table matches the scorecard exactly
    for (const mc of overview.modelComparison) {
      const modelIndustryRuns = industryRuns.filter((r) => r.model === mc.model);
      if (modelIndustryRuns.length === 0) continue;
      const modelMentions = modelIndustryRuns.filter((r) => isRunInBrandScope(r, visBrandIdentity)).length;
      mc.mentionRate = computeMentionRate(modelMentions, modelIndustryRuns.length);
      const modelRanks = modelIndustryRuns.map((r) =>
        computeBrandRank(r.rawResponseText, visBrand.name, visBrand.slug, r.analysisJson, brandAliases),
      );
      mc.avgRank = computeAvgRank(modelRanks);
      mc.topResultRate = computeRank1RateAll(modelRanks);
      // SoV per model: brand entity mentions / total entity mentions
      let modelBm = 0, modelTotal = 0;
      for (const run of modelIndustryRuns) {
        const counts = getSovCountsForRun({
          rawResponseText: run.rawResponseText,
          analysisJson: run.analysisJson,
          brandName: visBrand.name,
          brandSlug: visBrand.slug,
        });
        modelBm += counts.brandMentions;
        modelTotal += counts.totalMentions;
      }
      mc.shareOfVoice = computeShareOfVoice(modelBm, modelTotal);
    }

    // SoV + competitive rank + KPI deltas — text-based (no EntityResponseMetric)
    // SoV uses canonical ranked entities (same as Full Data CSV + Visibility tab)
    function computeTextSov(sovRuns: OverviewVisRun[]): number {
      let bm = 0, total = 0;
      for (const run of sovRuns) {
        const counts = getSovCountsForRun({
          rawResponseText: run.rawResponseText,
          analysisJson: run.analysisJson,
          brandName: visBrand.name,
          brandSlug: visBrand.slug,
        });
        bm += counts.brandMentions;
        total += counts.totalMentions;
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
      const thisMonthRuns = industryRuns.filter((r: { createdAt: Date }) => r.createdAt >= oneMonthAgo);
      const priorMonthRuns = industryRuns.filter(
        (r: { createdAt: Date }) => r.createdAt >= twoMonthsAgo && r.createdAt < oneMonthAgo,
      );
      const hasDelta = thisMonthRuns.length > 0 && priorMonthRuns.length > 0;

      if (hasDelta) {
        const tmMentions = thisMonthRuns.filter((r) =>
          isRunInBrandScope(r, visBrandIdentity),
        ).length;
        const pmMentions = priorMonthRuns.filter((r) =>
          isRunInBrandScope(r, visBrandIdentity),
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

  // --- Sentiment split (latest 24h, all prompt types) ---
  let sentimentSplit: { positive: number; neutral: number; negative: number } | null = null;
  if (allSnapshotRuns.length > 0) {
    let pos = 0, neu = 0, neg = 0;
    for (const r of allSnapshotRuns) {
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

  // --- Recompute frames & model comparison from latest 24h snapshot (matches Mention Rate) ---
  if (visResult && visResult.ok) {
    const { isAll } = visResult;
    // Use the latest 24h all-prompt snapshot for narrative frames
    const frameRuns = allSnapshotRuns.length > 0
      ? allSnapshotRuns
      : filterRunsToBrandScope(visResult.runs, buildBrandIdentity(visResult.brand));

    // Parse analyses from scoped runs
    const dedupedAnalyses = frameRuns
      .map((r) => parseAnalysis(r.analysisJson))
      .filter((a): a is NonNullable<typeof a> => a !== null);

    // Group by model for per-model breakdowns
    const dedupedByModel = new Map<string, RunAnalysis[]>();
    for (const r of frameRuns) {
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
      for (const r of frameRuns) {
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
      if (overview.topFrames.length === 0 && frameRuns.length > 0) {
        overview.topFrames = await synthesizeFramesFromResponses(
          frameRuns.map((r) => ({ rawResponseText: r.rawResponseText, model: r.model })),
          brandName,
          isAll ? "all" : model,
        );
      }

      // Ensure at least 5 frames
      overview.topFrames = await ensureMinimumFrames(
        overview.topFrames,
        brandName,
        frameRuns.map((r) => ({ rawResponseText: r.rawResponseText, model: r.model })),
      );
    }

    // Recompute model comparison sentiment/authority/stability from snapshot data
    const runsByModel = new Map<string, typeof frameRuns>();
    for (const r of frameRuns) {
      if (!runsByModel.has(r.model)) runsByModel.set(r.model, []);
      runsByModel.get(r.model)!.push(r);
    }
    for (const mc of overview.modelComparison) {
      // Controversy, authority, stability need industry-cluster analyses
      const analyses = dedupedByModel.get(mc.model);
      if (analyses && analyses.length > 0) {
        mc.controversy = Math.round(avgArr(analyses.map((a) => a.sentiment.controversy)));
        mc.authority = parseFloat(avgArr(analyses.map((a) => a.authorityScore)).toFixed(2));
        mc.narrativeStability = computeStability(analyses);
      }
      // Sentiment from narrativeJson uses ALL scoped runs (not just industry),
      // so models with no industry-cluster runs still get sentiment computed.
      const modelRuns = runsByModel.get(mc.model) ?? [];
      let pos = 0, neu = 0, neg = 0;
      for (const r of modelRuns) {
        const nj = r.narrativeJson as Record<string, unknown> | null;
        if (!nj) continue;
        const sent = nj.sentiment as { label?: string } | undefined;
        if (!sent?.label) continue;
        if (sent.label === "POS") pos++;
        else if (sent.label === "NEG") neg++;
        else neu++;
      }
      const total = pos + neu + neg;
      mc.sentiment = total > 0 ? Math.round((pos / total) * 100) : 0;
      if (total > 0) {
        mc.sentimentSplit = {
          positive: Math.round((pos / total) * 100),
          neutral: Math.round((neu / total) * 100),
          negative: Math.round((neg / total) * 100),
        };
      }
    }
  }

  // --- Top cited source type (latest 24h, all prompt types) ---
  let topSourceType: { category: string; count: number; totalSources: number } | null = null;
  if (allSnapshotRuns.length > 0) {
    const snapshotRunIds = allSnapshotRuns.map((r: { id: string }) => r.id);
    topSourceType = await computeTopSourceType(snapshotRunIds).catch((e) => {
      console.error("Source type error:", e);
      return null;
    });
  }

  // --- Assemble overview.kpis from the correct scoped/denominator sources ---
  // Visibility KPIs: from denominator-aware logic (all runs + isRunInBrandScope)
  // Content KPIs: from scoped analyses only
  {
    // Content KPIs from scoped analyses
    let scopedControversy = 0;
    let scopedStability = 80;
    let scopedDominantFrame: { frame: string; percentage: number } | null = null;
    if (visResult && visResult.ok) {
      const scopedContentRuns = filterRunsToBrandScope(visResult.runs, buildBrandIdentity(visResult.brand));
      const industryContentRuns = scopedContentRuns.filter((r) => r.prompt.cluster === "industry");
      const contentRuns = industryContentRuns.length > 0 ? industryContentRuns : scopedContentRuns;
      const contentAnalyses = contentRuns
        .map((r) => parseAnalysis(r.analysisJson))
        .filter((a): a is NonNullable<typeof a> => a !== null);
      if (contentAnalyses.length > 0) {
        scopedControversy = Math.round(avgArr(contentAnalyses.map((a) => a.sentiment.controversy)));
        scopedStability = computeStability(contentAnalyses);
      }
      // Dominant frame from already-computed scoped topFrames
      if (overview.topFrames.length > 0) {
        const top = overview.topFrames[0];
        scopedDominantFrame = { frame: top.frame, percentage: top.percentage };
      }
    }

    // Find tied top frames
    const tiedTopFrames = scopedDominantFrame && overview.topFrames.length > 0
      ? overview.topFrames.filter((f) => f.percentage === scopedDominantFrame!.percentage)
      : [];

    overview.kpis = [
      { label: "Visibility Score", value: overallMentionRate, unit: "score", delta: kpiDeltas?.mentionRate ?? 0 },
      { label: "Mention Rate", value: overallMentionRate, unit: "%", delta: kpiDeltas?.mentionRate ?? 0 },
      {
        label: "Dominant Narrative Frame",
        value: scopedDominantFrame?.percentage ?? 0,
        unit: "score",
        delta: 0,
        displayText: tiedTopFrames.length > 1
          ? tiedTopFrames.map((f) => f.frame).join(" & ")
          : scopedDominantFrame?.frame ?? "—",
        barPct: scopedDominantFrame?.percentage ?? 0,
      },
      { label: "Controversy Index", value: scopedControversy, unit: "score", delta: 0 },
      { label: "Narrative Stability", value: scopedStability, unit: "score", delta: 0 },
    ];
  }

  // --- Assemble overview.trend from scoped content data ---
  if (visResult && visResult.ok) {
    const scopedTrendRuns = filterRunsToBrandScope(visResult.runs, buildBrandIdentity(visResult.brand));
    const industryTrendRuns = scopedTrendRuns.filter((r) => r.prompt.cluster === "industry");
    const trendRunPool = industryTrendRuns.length > 0 ? industryTrendRuns : scopedTrendRuns;
    // Group by date (from createdAt)
    const trendByDate = new Map<string, { analyses: RunAnalysis[] }>();
    for (const r of trendRunPool) {
      const date = r.createdAt.toISOString().slice(0, 10);
      const entry = trendByDate.get(date) ?? { analyses: [] };
      const parsed = parseAnalysis(r.analysisJson);
      if (parsed) entry.analyses.push(parsed);
      trendByDate.set(date, entry);
    }
    overview.trend = [...trendByDate.entries()]
      .filter(([, v]) => v.analyses.length > 0)
      .map(([date, { analyses }]) => ({
        date,
        visibility: Math.round(avgArr(analyses.map((a) => a.brandMentionStrength))),
        controversy: Math.round(avgArr(analyses.map((a) => a.sentiment.controversy))),
        authority: Math.round(avgArr(analyses.map((a) => a.authorityScore))),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
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
      ? sentimentSplit.positive >= 60 ? "strongly positive"
        : sentimentSplit.positive >= 40 ? "mostly positive"
        : sentimentSplit.negative >= 40 ? `${sentimentSplit.negative}% negative`
        : sentimentSplit.neutral >= 50 ? "mostly neutral"
        : "mixed"
      : null;

    const summaryData = {
      brandName,
      industry: industry ?? "this space",
      brandRecall: overallMentionRate,
      brandRecallDescription: `When users ask AI broad questions about ${industry ?? "this space"} — without mentioning any brand by name — ${overallMentionRate}% of responses still bring up ${brandName}`,
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
- Mention rate measures how often AI mentions ${brandName} in response to broad industry questions that do NOT name any brand. These are generic questions about ${industry ?? "the space"} — no brand is mentioned in the prompt. Convey this clearly, e.g. "when users ask AI about ${industry ?? "the industry"} without naming any brand" or "in response to generic industry questions where no brand is mentioned."
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

  const overviewResponseBody = {
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
  };

  // Cache the response
  overviewCache.set(overviewCacheKey, { response: overviewResponseBody, runCount: totalRunCount, ts: Date.now() });

  return NextResponse.json(overviewResponseBody, {
    headers: { "Cache-Control": brandCacheControl(brandSlug) },
  });
}
