import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

  // Compute avg rank from latest runs
  const ranks: (number | null)[] = latestRealRunsFull.map((run) =>
    computeBrandRank(run.rawResponseText, brandName, brandSlug, run.analysisJson, aliases),
  );
  const validRanks = ranks.filter((r): r is number => r !== null);
  const avgRank = validRanks.length > 0
    ? Math.round((validRanks.reduce((s, r) => s + r, 0) / validRanks.length) * 100) / 100
    : null;

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

  // Validate frames: filter out generic jargon, replace with specific issues
  overview.topFrames = await validateFrames(overview.topFrames, brandName);

  // Fallback: if frames are empty, synthesize from raw responses using GPT
  if (overview.topFrames.length === 0) {
    const latestJobIds = withData.map((w) => w.data!.latestJob.id);
    const fallbackRuns = await prisma.run.findMany({
      where: { jobId: { in: latestJobIds } },
      select: { rawResponseText: true, model: true },
      take: 20,
    });
    const filtered = fallbackRuns.filter((r) => !r.rawResponseText.startsWith("[stub:"));
    if (filtered.length > 0) {
      overview.topFrames = await synthesizeFramesFromResponses(filtered, brandName, "all");
    }
  }

  // Ensure at least 5 frames — pad with GPT-generated frames if needed
  {
    const latestJobIdsForPad = withData.map((w) => w.data!.latestJob.id);
    const padRuns = await prisma.run.findMany({
      where: { jobId: { in: latestJobIdsForPad } },
      select: { rawResponseText: true, model: true },
      take: 20,
    });
    const padFiltered = padRuns.filter((r) => !r.rawResponseText.startsWith("[stub:"));
    overview.topFrames = await ensureMinimumFrames(
      overview.topFrames,
      brandName,
      padFiltered.length > 0 ? padFiltered : undefined,
    );
  }

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

  // Compute per-model frame percentages using frequency (same as narrative tab)
  {
    const STRENGTH_THRESHOLD = 20;
    const modelPcts: Record<string, Record<string, number>> = {};
    for (const { model: m, data } of withData) {
      if (!data) continue;
      const totalRuns = data.latestAnalyses.length;
      const frameCounts: Record<string, number> = {};
      for (const a of data.latestAnalyses) {
        for (const f of a.frames) {
          if (f.strength >= STRENGTH_THRESHOLD) {
            frameCounts[f.name] = (frameCounts[f.name] ?? 0) + 1;
          }
        }
      }
      modelPcts[m] = {};
      for (const [name, count] of Object.entries(frameCounts)) {
        modelPcts[m][name] = totalRuns > 0 ? Math.round((count / totalRuns) * 100) : 0;
      }
    }
    for (const frame of overview.topFrames) {
      frame.byModel = {
        chatgpt: modelPcts["chatgpt"]?.[frame.frame] ?? 0,
        gemini: modelPcts["gemini"]?.[frame.frame] ?? 0,
        claude: modelPcts["claude"]?.[frame.frame] ?? 0,
        perplexity: modelPcts["perplexity"]?.[frame.frame] ?? 0,
        google: modelPcts["google"]?.[frame.frame] ?? 0,
      };
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
      const avg = stats.strengths.length > 0
        ? stats.strengths.reduce((s, n) => s + n, 0) / stats.strengths.length
        : 0;
      return {
        cluster,
        mentionRate: stats.total > 0 ? Math.round((stats.mentioned / stats.total) * 100) : 0,
        prominenceScore: Math.round(avg),
      };
    });
  overview.clusterVisibility = clusterVisibility;

  // Per-model comparison (visibility uses industry-only data)
  const modelComparison = withData.map(({ model: m, data }) => {
    const allAnalyses = data!.latestAnalyses;
    const indAnalyses = data!.industryLatestAnalyses;
    return {
      model: m,
      visibility: indAnalyses.length > 0
        ? Math.round(avgArr(indAnalyses.map((a) => a.brandMentionStrength)))
        : 0,
      mentionRate: indAnalyses.length > 0
        ? Math.round((indAnalyses.filter((a) => a.brandMentioned).length / indAnalyses.length) * 100)
        : 0,
      controversy: Math.round(avgArr(allAnalyses.map((a) => a.sentiment.controversy))),
      authority: parseFloat(avgArr(allAnalyses.map((a) => a.authorityScore)).toFixed(2)),
      sentiment: Math.round(avgArr(allAnalyses.map((a) => a.sentiment.legitimacy))),
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
    prompt: { text: string; cluster: string; intent: string };
  };

  const latestJobIds = withData.map((w) => w.data!.latestJob.id);

  // Single fetchBrandRuns call — reused for both KPIs and competitive rank
  const visResultPromise = fetchBrandRuns<OverviewVisRun>({
    brandSlug: brand.slug,
    model: model === "all" ? "all" : model,
    viewRange: range,
    runQuery: { include: { prompt: true } },
  });

  // Sentiment split query
  const sentimentPromise = prisma.run.findMany({
    where: { jobId: { in: latestJobIds }, narrativeJson: { not: Prisma.DbNull } },
    select: { narrativeJson: true },
  });

  // Top source type: get run IDs + source categories in one query
  const sourcePromise = prisma.sourceOccurrence.findMany({
    where: { run: { jobId: { in: latestJobIds } } },
    select: { source: { select: { category: true } } },
  });

  // Await all in parallel
  const [visResult, narrativeRuns, sourceCats] = await Promise.all([
    visResultPromise.catch((e) => { console.error("Overview KPI error:", e); return null; }),
    sentimentPromise.catch((e) => { console.error("Sentiment error:", e); return [] as { narrativeJson: unknown }[]; }),
    sourcePromise.catch((e) => { console.error("Source type error:", e); return [] as { source: { category: string | null } }[]; }),
  ]);

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

    // SoV + competitive rank + KPI deltas — all entity metric queries in one parallel batch
    if (industryRunIds.length > 0) {
      const now = Date.now();
      const oneWeekAgo = new Date(now - 7 * 86_400_000);
      const twoWeeksAgo = new Date(now - 14 * 86_400_000);
      const thisWeekRuns = industryRuns.filter((r) => r.createdAt >= oneWeekAgo);
      const priorWeekRuns = industryRuns.filter(
        (r) => r.createdAt >= twoWeeksAgo && r.createdAt < oneWeekAgo,
      );
      const twRunIds = thisWeekRuns.map((r) => r.id);
      const pwRunIds = priorWeekRuns.map((r) => r.id);
      const hasDelta = thisWeekRuns.length > 0 && priorWeekRuns.length > 0;

      // Build all entity metric queries and run in one Promise.all
      const metricQueries: Promise<unknown>[] = [
        // [0] brand SoV count
        prisma.entityResponseMetric.count({
          where: { runId: { in: industryRunIds }, entityId: visBrand.slug, prominenceScore: { gt: 0 } },
        }),
        // [1] total SoV count
        prisma.entityResponseMetric.count({
          where: { runId: { in: industryRunIds }, prominenceScore: { gt: 0 } },
        }),
        // [2] competitive rank groupBy
        prisma.entityResponseMetric.groupBy({
          by: ["entityId"],
          where: { runId: { in: industryRunIds }, prominenceScore: { gt: 0 } },
          _count: { entityId: true },
        }),
      ];

      // Delta queries only if we have both weeks
      if (hasDelta) {
        metricQueries.push(
          // [3] tw brand count
          prisma.entityResponseMetric.count({
            where: { runId: { in: twRunIds }, entityId: visBrand.slug, prominenceScore: { gt: 0 } },
          }),
          // [4] tw total count
          prisma.entityResponseMetric.count({
            where: { runId: { in: twRunIds }, prominenceScore: { gt: 0 } },
          }),
          // [5] pw brand count
          prisma.entityResponseMetric.count({
            where: { runId: { in: pwRunIds }, entityId: visBrand.slug, prominenceScore: { gt: 0 } },
          }),
          // [6] pw total count
          prisma.entityResponseMetric.count({
            where: { runId: { in: pwRunIds }, prominenceScore: { gt: 0 } },
          }),
        );
      }

      const results = await Promise.all(metricQueries);

      const brandCount = results[0] as number;
      const totalCount = results[1] as number;
      shareOfVoice = computeShareOfVoice(brandCount, totalCount);

      // Competitive rank
      const entityCounts = results[2] as { entityId: string; _count: { entityId: number } }[];
      const sorted = entityCounts
        .map((e) => ({ entityId: e.entityId, count: e._count.entityId }))
        .sort((a, b) => b.count - a.count);
      const brandIdx = sorted.findIndex((e) => e.entityId === brand.slug);
      if (brandIdx >= 0) {
        competitiveRank = { rank: brandIdx + 1, totalCompetitors: sorted.length };
      }

      // KPI deltas
      if (hasDelta) {
        const twBrandC = results[3] as number;
        const twTotalC = results[4] as number;
        const pwBrandC = results[5] as number;
        const pwTotalC = results[6] as number;

        const twMentions = thisWeekRuns.filter((r) =>
          isBrandMentioned(r.rawResponseText, visBrand.name, visBrand.slug, brandAliases),
        ).length;
        const pwMentions = priorWeekRuns.filter((r) =>
          isBrandMentioned(r.rawResponseText, visBrand.name, visBrand.slug, brandAliases),
        ).length;
        const twMR = computeMentionRate(twMentions, thisWeekRuns.length);
        const pwMR = computeMentionRate(pwMentions, priorWeekRuns.length);

        const twRanks = thisWeekRuns.map((r) =>
          computeBrandRank(r.rawResponseText, visBrand.name, visBrand.slug, r.analysisJson, brandAliases),
        );
        const pwRanks = priorWeekRuns.map((r) =>
          computeBrandRank(r.rawResponseText, visBrand.name, visBrand.slug, r.analysisJson, brandAliases),
        );

        kpiDeltas = {
          mentionRate: parseFloat((twMR - pwMR).toFixed(1)),
          shareOfVoice: parseFloat((computeShareOfVoice(twBrandC, twTotalC) - computeShareOfVoice(pwBrandC, pwTotalC)).toFixed(1)),
          avgRank: parseFloat(((computeAvgRank(twRanks) ?? 0) - (computeAvgRank(pwRanks) ?? 0)).toFixed(2)),
          firstMentionRate: parseFloat((computeRank1RateAll(twRanks) - computeRank1RateAll(pwRanks)).toFixed(1)),
          prominence: 0,
        };
      }
    }
  }

  // --- Sentiment split ---
  let sentimentSplit: { positive: number; neutral: number; negative: number } | null = null;
  if (narrativeRuns.length > 0) {
    let pos = 0, neu = 0, neg = 0;
    for (const r of narrativeRuns) {
      const nj = r.narrativeJson as Record<string, unknown> | null;
      if (!nj) continue;
      const sent = nj.sentiment as { label?: string } | undefined;
      if (sent?.label === "POS") pos++;
      else if (sent?.label === "NEG") neg++;
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

  // --- Top cited source type ---
  let topSourceType: { category: string; count: number; totalSources: number } | null = null;
  if (sourceCats.length > 0) {
    const catCounts: Record<string, number> = {};
    for (const s of sourceCats) {
      const cat = s.source.category ?? "other";
      catCounts[cat] = (catCounts[cat] ?? 0) + 1;
    }
    const sorted = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((s, [, c]) => s + c, 0);
    const top = sorted.find(([cat]) => cat !== "other") ?? sorted[0];
    if (top) {
      topSourceType = { category: top[0], count: top[1], totalSources: total };
    }
  }

  return NextResponse.json({
    hasData: true,
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
