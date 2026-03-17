import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchBrandRuns, formatJobMeta } from "@/lib/apiPipeline";
import { isBrandMentioned, computeBrandRank } from "@/lib/visibility/brandMention";
import { titleCase, buildEntityDisplayNames, resolveEntityName } from "@/lib/utils";
import {
  computeAvgRank,
  computeRank1RateAll,
  computeMentionRate,
  computeAvgProminence,
  computeShareOfVoice,
} from "@/lib/competition/computeCompetition";

const CLUSTERS = ["direct", "related", "comparative", "network", "industry"] as const;
const INTENTS = ["high-intent", "informational"] as const;

type VisibilityRun = {
  id: string;
  model: string;
  promptId: string;
  createdAt: Date;
  rawResponseText: string;
  analysisJson: unknown;
  narrativeJson: unknown;
  prompt: { text: string; cluster: string; intent: string };
};

export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }
  const model = req.nextUrl.searchParams.get("model") ?? "";
  const viewRange = parseInt(req.nextUrl.searchParams.get("range") ?? "90", 10) || 90;

  const result = await fetchBrandRuns<VisibilityRun>({
    brandSlug,
    model,
    viewRange,
    runQuery: { include: { prompt: true } },
  });
  if (!result.ok) return result.response;

  const { brand, job, runs: allRuns, isAll, rangeCutoff } = result;
  const brandName = brand.displayName || brand.name;
  const brandAliases = brand.aliases?.length ? brand.aliases : undefined;

  try {
    // Build display name map from original GPT-extracted competitor names
    const entityDisplayNames = buildEntityDisplayNames(allRuns);

    // Filter to industry-cluster responses only
    const runs = allRuns.filter((r) => r.prompt.cluster === "industry");
    const totalRuns = runs.length;
    let totalMentions = 0;

    // Group runs by cluster and intent, compute mentions + rank
    const clusterStats: Record<string, { runs: number; mentions: number; ranks: number[] }> = {};
    for (const c of CLUSTERS) {
      clusterStats[c] = { runs: 0, mentions: 0, ranks: [] };
    }

    const intentStats: Record<string, { runs: number; mentions: number }> = {};
    for (const i of INTENTS) {
      intentStats[i] = { runs: 0, mentions: 0 };
    }

    const ranks: number[] = [];
    const industryRanks: (number | null)[] = [];
    const industryRanksByModel: Record<string, (number | null)[]> = {};
    const topPromptWins: { prompt: string; rank: number; cluster: string }[] = [];
    const seenWinPrompts = new Set<string>();

    for (const run of runs) {
      const mentioned = isBrandMentioned(run.rawResponseText, brand.name, brand.slug, brandAliases);
      if (mentioned) totalMentions++;

      const cluster = run.prompt.cluster;
      if (clusterStats[cluster]) {
        clusterStats[cluster].runs++;
        if (mentioned) clusterStats[cluster].mentions++;
      }

      const rank = computeBrandRank(run.rawResponseText, brand.name, brand.slug, run.analysisJson, brandAliases);
      if (cluster === "industry") {
        industryRanks.push(rank);
        if (!industryRanksByModel[run.model]) industryRanksByModel[run.model] = [];
        industryRanksByModel[run.model].push(rank);
      }
      if (rank !== null) {
        ranks.push(rank);
        if (clusterStats[cluster]) {
          clusterStats[cluster].ranks.push(rank);
        }
        if (rank === 1 && cluster === "industry") {
          const promptText = run.prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`);
          if (!seenWinPrompts.has(promptText)) {
            seenWinPrompts.add(promptText);
            topPromptWins.push({ prompt: promptText, rank, cluster });
          }
        }
      }

      const intent = run.prompt.intent;
      if (intentStats[intent]) {
        intentStats[intent].runs++;
        if (mentioned) intentStats[intent].mentions++;
      }
    }

    // KPI metrics: industry-cluster only
    const avgRankScore = computeAvgRank(industryRanks) ?? 0;
    const firstMentionRate = computeRank1RateAll(industryRanks);

    // Avg prominence from EntityResponseMetric — industry-cluster runs only
    const runIds = runs.map((r) => r.id);
    const industryRunIdSet = new Set(
      runs.filter((r) => r.prompt.cluster === "industry").map((r) => r.id),
    );
    const industryRunIdArr = [...industryRunIdSet];
    let avgProminence = 0;
    const prominenceByRunId: Record<string, number> = {};
    if (runIds.length > 0) {
      const prominenceMetrics = await prisma.entityResponseMetric.findMany({
        where: { runId: { in: runIds }, entityId: brand.slug },
        select: { prominenceScore: true, runId: true },
      });
      for (const m of prominenceMetrics) {
        prominenceByRunId[m.runId] = m.prominenceScore;
      }
      // KPI prominence: industry runs only
      const industryPromMetrics = prominenceMetrics.filter((m) => industryRunIdSet.has(m.runId));
      avgProminence = computeAvgProminence(industryPromMetrics.map((m) => m.prominenceScore));
    }

    // Share of Voice: industry-cluster runs only
    let shareOfVoice = 0;
    if (industryRunIdArr.length > 0) {
      const [brandCount, totalCount] = await Promise.all([
        prisma.entityResponseMetric.count({
          where: { runId: { in: industryRunIdArr }, entityId: brand.slug, prominenceScore: { gt: 0 } },
        }),
        prisma.entityResponseMetric.count({
          where: { runId: { in: industryRunIdArr }, prominenceScore: { gt: 0 } },
        }),
      ]);
      shareOfVoice = computeShareOfVoice(brandCount, totalCount);
    }

    // AI Visibility Ranking + Opportunity Prompts from industry-cluster runs
    const industryRunIds = industryRunIdArr;
    let visibilityRanking: { entityId: string; name: string; score: number; isBrand: boolean }[] = [];
    const opportunityPrompts: { prompt: string; competitorCount: number; competitors: string[] }[] = [];

    if (industryRunIds.length > 0) {
      const industryMetrics = await prisma.entityResponseMetric.findMany({
        where: { runId: { in: industryRunIds }, prominenceScore: { gt: 0 } },
        select: { entityId: true, runId: true },
      });

      // Count distinct runs per entity
      const entityRunSets = new Map<string, Set<string>>();
      for (const m of industryMetrics) {
        if (!entityRunSets.has(m.entityId)) entityRunSets.set(m.entityId, new Set());
        entityRunSets.get(m.entityId)!.add(m.runId);
      }

      const totalIndustryRuns = industryRunIds.length;
      visibilityRanking = Array.from(entityRunSets.entries())
        .map(([entityId, runSet]) => ({
          entityId,
          name: entityId === brand.slug ? brand.name : resolveEntityName(entityId, entityDisplayNames),
          score: Math.round((runSet.size / totalIndustryRuns) * 100),
          isBrand: entityId === brand.slug,
        }))
        .sort((a, b) => b.score - a.score);

      // Opportunity Prompts: industry runs where competitors appear but brand doesn't
      const brandRunSet = entityRunSets.get(brand.slug) ?? new Set<string>();
      const industryRunsWithPrompt = new Map<string, string>();
      for (const run of runs) {
        if (run.prompt.cluster === "industry") {
          industryRunsWithPrompt.set(run.id, run.prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`));
        }
      }
      // Pre-index industry metrics by runId for O(1) lookups
      const industryMetricsByRun = new Map<string, typeof industryMetrics>();
      for (const m of industryMetrics) {
        const list = industryMetricsByRun.get(m.runId) ?? [];
        list.push(m);
        industryMetricsByRun.set(m.runId, list);
      }
      const seenPromptTexts = new Set<string>();
      for (const runId of industryRunIds) {
        if (brandRunSet.has(runId)) continue;
        const runMetrics = industryMetricsByRun.get(runId) ?? [];
        const competitorEntities = runMetrics
          .filter((m) => m.entityId !== brand.slug)
          .map((m) => m.entityId);
        if (competitorEntities.length === 0) continue;
        const promptText = industryRunsWithPrompt.get(runId);
        if (!promptText || seenPromptTexts.has(promptText)) continue;
        seenPromptTexts.add(promptText);
        const competitors = [...new Set(competitorEntities)].map((id) =>
          id === brand.slug ? brand.name : resolveEntityName(id, entityDisplayNames),
        );
        opportunityPrompts.push({ prompt: promptText, competitorCount: competitors.length, competitors });
      }
      opportunityPrompts.sort((a, b) => b.competitorCount - a.competitorCount);
    }

    // Build clusters array + cluster breakdown table
    const modelKeys = ["chatgpt", "gemini", "claude", "perplexity", "google"] as const;
    const clusters = CLUSTERS.map((cluster) => {
      const stats = clusterStats[cluster];
      const mentionRateVal = computeMentionRate(stats.mentions, stats.runs);

      const byModel: Record<string, number> = {};
      for (const mk of modelKeys) {
        byModel[mk] = isAll ? mentionRateVal : (mk === model ? mentionRateVal : 0);
      }

      return { cluster, mentionRate: mentionRateVal, byModel };
    });

    const clusterBreakdown = CLUSTERS.map((cluster) => {
      const stats = clusterStats[cluster];
      return {
        cluster,
        mentionRate: computeMentionRate(stats.mentions, stats.runs),
        avgRank: computeAvgRank(stats.ranks),
        firstMentionPct: stats.runs > 0 ? Math.round((stats.ranks.filter((r) => r === 1).length / stats.runs) * 100) : null,
      };
    });

    // Build model breakdown: stats per LLM across all models for this brand
    const allModelRuns = await prisma.run.findMany({
      where: { brandId: brand.id, createdAt: { gte: rangeCutoff }, job: { status: "done" } },
      include: { prompt: true },
      orderBy: { createdAt: "desc" },
    });
    // Dedupe: latest run per model+prompt
    const seenModelPrompts = new Set<string>();
    const dedupedModelRuns = allModelRuns.filter((r) => {
      const key = `${r.model}|${r.promptId}`;
      if (seenModelPrompts.has(key)) return false;
      seenModelPrompts.add(key);
      return true;
    });
    // Group by model — industry-cluster queries only
    const modelBreakdownStats: Record<string, { mentions: number; total: number; ranks: number[] }> = {};
    for (const mk of modelKeys) {
      modelBreakdownStats[mk] = { mentions: 0, total: 0, ranks: [] };
    }
    for (const run of dedupedModelRuns) {
      if (run.prompt.cluster !== "industry") continue;
      const ms = modelBreakdownStats[run.model];
      if (!ms) continue;
      ms.total++;
      if (isBrandMentioned(run.rawResponseText, brand.name, brand.slug, brandAliases)) ms.mentions++;
      const rk = computeBrandRank(run.rawResponseText, brand.name, brand.slug, run.analysisJson, brandAliases);
      if (rk !== null) ms.ranks.push(rk);
    }
    const modelBreakdown = modelKeys.map((mk) => {
      const ms = modelBreakdownStats[mk];
      const mentionRateVal = ms.total > 0 ? computeMentionRate(ms.mentions, ms.total) : null;
      return {
        model: mk,
        mentionRate: mentionRateVal,
        avgRank: computeAvgRank(ms.ranks),
        firstMentionPct: ms.total > 0 ? Math.round((ms.ranks.filter((r) => r === 1).length / ms.total) * 100) : null,
        totalRuns: ms.total,
      };
    });

    // Build intentSplit array — industry-cluster runs only, split by intent
    const industryIntentStats: Record<string, { runs: number; mentions: number }> = {};
    for (const i of INTENTS) {
      industryIntentStats[i] = { runs: 0, mentions: 0 };
    }
    for (const run of runs) {
      if (run.prompt.cluster !== "industry") continue;
      const intent = run.prompt.intent;
      if (industryIntentStats[intent]) {
        industryIntentStats[intent].runs++;
        if (isBrandMentioned(run.rawResponseText, brand.name, brand.slug, brandAliases)) {
          industryIntentStats[intent].mentions++;
        }
      }
    }
    const intentSplit = INTENTS.map((intent) => {
      const stats = industryIntentStats[intent];
      return {
        intent,
        percentage: computeMentionRate(stats.mentions, stats.runs),
      };
    });

    // Mention rate: industry-cluster queries only
    const industryRuns = runs.filter((r) => r.prompt.cluster === "industry");
    const industryMentions = industryRuns.filter((r) =>
      isBrandMentioned(r.rawResponseText, brand.name, brand.slug, brandAliases),
    ).length;
    const overallMentionRate = computeMentionRate(industryMentions, industryRuns.length);

    // Month-over-month KPI deltas (most recent 30 days vs prior 30 days)
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const thisMonthIndustry = industryRuns.filter((r) => r.createdAt >= oneMonthAgo);
    const priorMonthIndustry = industryRuns.filter(
      (r) => r.createdAt >= twoMonthsAgo && r.createdAt < oneMonthAgo,
    );

    function computeWeekKpis(weekRuns: VisibilityRun[]) {
      const mentions = weekRuns.filter((r) =>
        isBrandMentioned(r.rawResponseText, brand.name, brand.slug, brandAliases),
      ).length;
      const mr = computeMentionRate(mentions, weekRuns.length);
      const wRanks: (number | null)[] = [];
      for (const r of weekRuns) {
        const rk = computeBrandRank(r.rawResponseText, brand.name, brand.slug, r.analysisJson, brandAliases);
        wRanks.push(rk);
      }
      const promScores = weekRuns
        .map((r) => prominenceByRunId[r.id])
        .filter((p): p is number => p !== undefined);
      return {
        mentionRate: mr,
        avgRank: computeAvgRank(wRanks) ?? 0,
        firstMentionRate: computeRank1RateAll(wRanks),
        prominence: computeAvgProminence(promScores),
      };
    }

    const thisMonth = computeWeekKpis(thisMonthIndustry);
    const priorMonth = computeWeekKpis(priorMonthIndustry);

    // SOV deltas
    const thisMonthIds = thisMonthIndustry.map((r) => r.id);
    const priorMonthIds = priorMonthIndustry.map((r) => r.id);
    let thisMonthSov = 0;
    let priorMonthSov = 0;
    if (thisMonthIds.length > 0 || priorMonthIds.length > 0) {
      const allMomIds = [...thisMonthIds, ...priorMonthIds];
      const momMetrics = await prisma.entityResponseMetric.findMany({
        where: { runId: { in: allMomIds }, prominenceScore: { gt: 0 } },
        select: { runId: true, entityId: true },
      });
      const thisMonthIdSet = new Set(thisMonthIds);
      const priorMonthIdSet = new Set(priorMonthIds);
      let tmBrand = 0, tmTotal = 0, pmBrand = 0, pmTotal = 0;
      for (const m of momMetrics) {
        if (thisMonthIdSet.has(m.runId)) {
          tmTotal++;
          if (m.entityId === brand.slug) tmBrand++;
        } else if (priorMonthIdSet.has(m.runId)) {
          pmTotal++;
          if (m.entityId === brand.slug) pmBrand++;
        }
      }
      thisMonthSov = computeShareOfVoice(tmBrand, tmTotal);
      priorMonthSov = computeShareOfVoice(pmBrand, pmTotal);
    }

    const hasPriorMonth = priorMonthIndustry.length > 0;
    const kpiDeltas = hasPriorMonth
      ? {
          mentionRate: Math.round((thisMonth.mentionRate - priorMonth.mentionRate) * 10) / 10,
          shareOfVoice: thisMonthSov - priorMonthSov,
          avgRank: Math.round((thisMonth.avgRank - priorMonth.avgRank) * 100) / 100,
          firstMentionRate: Math.round((thisMonth.firstMentionRate - priorMonth.firstMentionRate) * 10) / 10,
          prominence: Math.round((thisMonth.prominence - priorMonth.prominence) * 100) / 100,
        }
      : null;

    // Worst-performing prompts: industry runs where brand ranks poorly or is absent
    const worstPrompts: { prompt: string; rank: number | null; competitors: string[] }[] = [];
    const seenWorstPrompts = new Set<string>();
    for (const run of industryRuns) {
      const promptText = run.prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`);
      if (seenWorstPrompts.has(promptText)) continue;
      seenWorstPrompts.add(promptText);
      const brandRank = computeBrandRank(run.rawResponseText, brand.name, brand.slug, run.analysisJson, brandAliases);
      // Include if brand is absent (null) or ranks > 1
      if (brandRank !== null && brandRank <= 1) continue;
      worstPrompts.push({ prompt: promptText, rank: brandRank, competitors: [] });
    }
    // Enrich with top 5 competitors from entityResponseMetric
    if (worstPrompts.length > 0) {
      const worstRunMap = new Map<string, string>(); // promptText → runId
      for (const run of industryRuns) {
        const pt = run.prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`);
        if (!worstRunMap.has(pt)) worstRunMap.set(pt, run.id);
      }
      const worstRunIds = [...new Set(worstPrompts.map((w) => worstRunMap.get(w.prompt)).filter(Boolean))] as string[];
      if (worstRunIds.length > 0) {
        const worstMetrics = await prisma.entityResponseMetric.findMany({
          where: { runId: { in: worstRunIds }, prominenceScore: { gt: 0 }, entityId: { not: brand.slug } },
          select: { runId: true, entityId: true, prominenceScore: true },
        });
        // Group by runId, sorted by prominence desc, top 5
        const competitorsByRun = new Map<string, { entityId: string; score: number }[]>();
        for (const m of worstMetrics) {
          if (!competitorsByRun.has(m.runId)) competitorsByRun.set(m.runId, []);
          competitorsByRun.get(m.runId)!.push({ entityId: m.entityId, score: m.prominenceScore });
        }
        for (const wp of worstPrompts) {
          const runId = worstRunMap.get(wp.prompt);
          if (!runId) continue;
          const entries = competitorsByRun.get(runId);
          if (entries) {
            wp.competitors = entries
              .sort((a, b) => b.score - a.score)
              .slice(0, 5)
              .map((e) => resolveEntityName(e.entityId, entityDisplayNames));
          }
        }
      }
    }
    // Sort: absent first (null rank), then by highest rank
    worstPrompts.sort((a, b) => {
      if (a.rank === null && b.rank === null) return 0;
      if (a.rank === null) return -1;
      if (b.rank === null) return 1;
      return b.rank - a.rank;
    });
    const worstPerformingPrompts = worstPrompts.slice(0, 20);

    // Build visibility trend: per-job metrics over time, filtered by view range
    const trendJobWhere = isAll
      ? { brandId: brand.id, status: "done" as const, finishedAt: { gte: rangeCutoff } }
      : { brandId: brand.id, model, status: "done" as const, finishedAt: { gte: rangeCutoff } };
    const allJobs = await prisma.job.findMany({
      where: trendJobWhere,
      orderBy: { finishedAt: "asc" },
    });
    // Aggregate trend by date+model (multiple jobs may share a date when model=all)
    type TrendBucket = { mentions: number; total: number; ranks: (number | null)[]; brandEntityMentions: number; totalEntityMentions: number };
    // key = "date||model" where model is the specific model or "all"
    const trendByDateModel: Record<string, TrendBucket> = {};
    const ensureBucket = (key: string) => {
      if (!trendByDateModel[key]) trendByDateModel[key] = { mentions: 0, total: 0, ranks: [], brandEntityMentions: 0, totalEntityMentions: 0 };
      return trendByDateModel[key];
    };
    // Batch-fetch all runs for trend jobs (avoid N+1)
    const trendJobIds = allJobs.filter((j) => j.finishedAt).map((j) => j.id);
    const allTrendRuns = trendJobIds.length > 0
      ? await prisma.run.findMany({
          where: { jobId: { in: trendJobIds } },
          include: { prompt: true },
        })
      : [];
    const trendRunsByJob = new Map<string, typeof allTrendRuns>();
    for (const run of allTrendRuns) {
      const list = trendRunsByJob.get(run.jobId) ?? [];
      list.push(run);
      trendRunsByJob.set(run.jobId, list);
    }

    // Batch-fetch entity metrics for SOV trend calculation
    const industryTrendRunIds = allTrendRuns
      .filter((r) => r.prompt.cluster === "industry")
      .map((r) => r.id);
    const trendEntityMetrics = industryTrendRunIds.length > 0
      ? await prisma.entityResponseMetric.findMany({
          where: { runId: { in: industryTrendRunIds }, prominenceScore: { gt: 0 } },
          select: { runId: true, entityId: true },
        })
      : [];
    // Per-run: { brandMentioned, totalEntities }
    const sovByRun = new Map<string, { brandMentions: number; totalMentions: number }>();
    for (const em of trendEntityMetrics) {
      const entry = sovByRun.get(em.runId) ?? { brandMentions: 0, totalMentions: 0 };
      entry.totalMentions++;
      if (em.entityId === brand.slug) entry.brandMentions++;
      sovByRun.set(em.runId, entry);
    }

    // Cumulative trend: for each date, use the latest run per model+prompt AS OF that date.
    // This matches the KPI card logic — the most recent trend date will equal the KPI values.
    // 1. Collect all dates and all runs, sorted by date asc then createdAt desc
    const allDates = [...new Set(
      allJobs.filter((j) => j.finishedAt).map((j) => j.finishedAt!.toISOString().slice(0, 10)),
    )].sort();

    // 2. Build a flat list of (date, run) pairs sorted by createdAt desc so newer runs win
    const dateRunPairs: { date: string; run: (typeof allTrendRuns)[number] }[] = [];
    for (const tj of allJobs) {
      if (!tj.finishedAt) continue;
      const date = tj.finishedAt.toISOString().slice(0, 10);
      for (const run of trendRunsByJob.get(tj.id) ?? []) {
        dateRunPairs.push({ date, run });
      }
    }
    dateRunPairs.sort((a, b) => b.run.createdAt.getTime() - a.run.createdAt.getTime());

    // 3. For each date, the "latest as of" set = latest run per model+prompt up to and including that date
    // We build this cumulatively: walk dates in order, updating a running map of model+prompt → run
    const latestByKey = new Map<string, (typeof allTrendRuns)[number]>();
    // Pre-index: for each model+prompt key, all (date, run) pairs sorted by createdAt desc
    const runsByKey = new Map<string, { date: string; run: (typeof allTrendRuns)[number] }[]>();
    for (const pair of dateRunPairs) {
      const key = `${pair.run.model}|${pair.run.promptId}`;
      const list = runsByKey.get(key) ?? [];
      list.push(pair);
      runsByKey.set(key, list);
    }
    // For each key, sort by createdAt asc so we can process in order
    for (const [, list] of runsByKey) {
      list.sort((a, b) => a.run.createdAt.getTime() - b.run.createdAt.getTime());
    }
    // Track pointer per key: which runs have been "seen" up to current date
    const keyPointers = new Map<string, number>();
    for (const key of runsByKey.keys()) keyPointers.set(key, 0);

    const dedupedTrendRuns = new Map<string, (typeof allTrendRuns)[number][]>();
    for (const date of allDates) {
      // Advance pointers: add any runs whose date <= current date
      for (const [key, list] of runsByKey) {
        let ptr = keyPointers.get(key) ?? 0;
        while (ptr < list.length && list[ptr].date <= date) {
          latestByKey.set(key, list[ptr].run);
          ptr++;
        }
        keyPointers.set(key, ptr);
      }
      // Snapshot current latest runs for this date
      dedupedTrendRuns.set(date, [...latestByKey.values()]);
    }

    for (const [date, dateRuns] of dedupedTrendRuns) {
      for (const run of dateRuns) {
        if (run.prompt.cluster !== "industry") continue;
        const mentioned = isBrandMentioned(run.rawResponseText, brand.name, brand.slug, brandAliases);
        const rk = computeBrandRank(run.rawResponseText, brand.name, brand.slug, run.analysisJson, brandAliases);
        const promptText = run.prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`);
        const runSov = sovByRun.get(run.id) ?? { brandMentions: 0, totalMentions: 0 };

        // "all" bucket (aggregate)
        const allBucket = ensureBucket(`${date}||all||all`);
        allBucket.total++;
        if (mentioned) allBucket.mentions++;
        allBucket.ranks.push(rk);
        allBucket.brandEntityMentions += runSov.brandMentions;
        allBucket.totalEntityMentions += runSov.totalMentions;

        // per-model bucket (aggregate)
        const modelBucket = ensureBucket(`${date}||${run.model}||all`);
        modelBucket.total++;
        if (mentioned) modelBucket.mentions++;
        modelBucket.ranks.push(rk);
        modelBucket.brandEntityMentions += runSov.brandMentions;
        modelBucket.totalEntityMentions += runSov.totalMentions;

        // per-prompt "all models" bucket
        const promptAllBucket = ensureBucket(`${date}||all||${promptText}`);
        promptAllBucket.total++;
        if (mentioned) promptAllBucket.mentions++;
        promptAllBucket.ranks.push(rk);
        promptAllBucket.brandEntityMentions += runSov.brandMentions;
        promptAllBucket.totalEntityMentions += runSov.totalMentions;

        // per-prompt per-model bucket
        const promptModelBucket = ensureBucket(`${date}||${run.model}||${promptText}`);
        promptModelBucket.total++;
        if (mentioned) promptModelBucket.mentions++;
        promptModelBucket.ranks.push(rk);
        promptModelBucket.brandEntityMentions += runSov.brandMentions;
        promptModelBucket.totalEntityMentions += runSov.totalMentions;
      }
    }
    const trendPoints = Object.entries(trendByDateModel)
      .filter(([, bucket]) => bucket.total > 0) // skip dates with no industry-cluster data
      .map(([key, bucket]) => {
        const [date, m, ...promptParts] = key.split("||");
        const prompt = promptParts.join("||"); // rejoin in case prompt contains ||
        return {
          date,
          model: m,
          prompt,
          mentionRate: computeMentionRate(bucket.mentions, bucket.total),
          avgPosition: computeAvgRank(bucket.ranks),
          firstMentionPct: bucket.ranks.length > 0 ? computeRank1RateAll(bucket.ranks) : null,
          sovPct: bucket.totalEntityMentions > 0
            ? computeShareOfVoice(bucket.brandEntityMentions, bucket.totalEntityMentions)
            : null,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.model.localeCompare(b.model));

    // Build rank distribution — industry-cluster only (non-null ranks only)
    const nonNullIndustryRanks = industryRanks.filter((r): r is number => r !== null);
    const rankCounts: Record<number, number> = {};
    for (const r of nonNullIndustryRanks) {
      rankCounts[r] = (rankCounts[r] || 0) + 1;
    }
    const rankDistribution = Object.entries(rankCounts)
      .map(([rank, count]) => ({
        rank: Number(rank),
        count,
        percentage: computeMentionRate(count, nonNullIndustryRanks.length),
      }))
      .sort((a, b) => a.rank - b.rank);

    // Industry-only position distribution for brand — "all" + per-model
    const buildPosDist = (ranks: number[], modelLabel: string) => {
      const counts: Record<number, number> = {};
      for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
      return Object.entries(counts)
        .map(([pos, count]) => ({
          position: Number(pos),
          model: modelLabel,
          count,
          percentage: ranks.length > 0 ? Math.round((count / ranks.length) * 100) : 0,
        }))
        .sort((a, b) => a.position - b.position);
    };
    const nonNullIndustryRanksByModel: Record<string, number[]> = {};
    for (const [m, ranks] of Object.entries(industryRanksByModel)) {
      nonNullIndustryRanksByModel[m] = ranks.filter((r): r is number => r !== null);
    }
    const positionDistribution = [
      ...buildPosDist(nonNullIndustryRanks, "all"),
      ...Object.entries(nonNullIndustryRanksByModel).flatMap(([m, ranks]) => buildPosDist(ranks, m)),
    ];

    // Results by Question: per-prompt metrics across all models, industry-only
    // Group all industry runs by prompt text + model
    type PromptBucket = {
      promptText: string;
      model: string;
      total: number;
      mentions: number;
      ranks: number[];
      sentiments: ("Strong" | "Positive" | "Neutral" | "Negative")[];
    };
    const promptBuckets = new Map<string, PromptBucket>();
    // Also fetch SOV per prompt from entityResponseMetric
    const industryRunPromptMap = new Map<string, { runId: string; promptText: string; model: string }[]>();
    for (const run of runs) {
      if (run.prompt.cluster !== "industry") continue;
      const promptText = run.prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`);
      const key = `${promptText}||${run.model}`;
      if (!promptBuckets.has(key)) {
        promptBuckets.set(key, { promptText, model: run.model, total: 0, mentions: 0, ranks: [], sentiments: [] });
      }
      const bucket = promptBuckets.get(key)!;
      bucket.total++;
      const mentioned = isBrandMentioned(run.rawResponseText, brand.name, brand.slug, brandAliases);
      if (mentioned) bucket.mentions++;
      const rk = computeBrandRank(run.rawResponseText, brand.name, brand.slug, run.analysisJson, brandAliases);
      if (rk !== null) bucket.ranks.push(rk);

      // Extract sentiment from narrativeJson
      const nj = run.narrativeJson as { sentiment?: { label?: string; score?: number } } | null;
      if (nj?.sentiment?.label) {
        const label = nj.sentiment.label;
        const score = nj.sentiment.score ?? 0;
        if (label === "POS") {
          bucket.sentiments.push(score >= 0.5 ? "Strong" : "Positive");
        } else if (label === "NEG") {
          bucket.sentiments.push("Negative");
        } else {
          bucket.sentiments.push("Neutral");
        }
      }

      if (!industryRunPromptMap.has(key)) industryRunPromptMap.set(key, []);
      industryRunPromptMap.get(key)!.push({ runId: run.id, promptText, model: run.model });
    }

    // Compute SOV per prompt bucket
    const allIndustryRunIdsForQuestions = runs
      .filter((r) => r.prompt.cluster === "industry")
      .map((r) => r.id);
    const sovByRunId: Record<string, { brandMentions: number; totalMentions: number }> = {};
    if (allIndustryRunIdsForQuestions.length > 0) {
      const qMetrics = await prisma.entityResponseMetric.findMany({
        where: { runId: { in: allIndustryRunIdsForQuestions }, prominenceScore: { gt: 0 } },
        select: { runId: true, entityId: true },
      });
      const byRun = new Map<string, { brand: number; total: number }>();
      for (const m of qMetrics) {
        if (!byRun.has(m.runId)) byRun.set(m.runId, { brand: 0, total: 0 });
        const b = byRun.get(m.runId)!;
        b.total++;
        if (m.entityId === brand.slug) b.brand++;
      }
      for (const [runId, counts] of byRun) {
        sovByRunId[runId] = { brandMentions: counts.brand, totalMentions: counts.total };
      }
    }

    const resultsByQuestion: {
      promptText: string;
      model: string;
      aiVisibility: number;
      shareOfVoice: number;
      firstPosition: number;
      avgPosition: number | null;
      avgSentiment: "Strong" | "Positive" | "Neutral" | "Negative";
    }[] = [];

    for (const [key, bucket] of promptBuckets) {
      const aiVis = computeMentionRate(bucket.mentions, bucket.total);
      const fp = bucket.total > 0 ? Math.round((bucket.ranks.filter((r) => r === 1).length / bucket.total) * 100) : 0;
      const ap = computeAvgRank(bucket.ranks);

      // SOV for this prompt's runs
      const runEntries = industryRunPromptMap.get(key) ?? [];
      let bm = 0, tm = 0;
      for (const re of runEntries) {
        const s = sovByRunId[re.runId];
        if (s) { bm += s.brandMentions; tm += s.totalMentions; }
      }
      const sov = computeShareOfVoice(bm, tm);

      // Average sentiment
      let avgSent: "Strong" | "Positive" | "Neutral" | "Negative" = "Neutral";
      if (bucket.sentiments.length > 0) {
        const sentScores: number[] = bucket.sentiments.map((s) =>
          s === "Strong" ? 2 : s === "Positive" ? 1 : s === "Neutral" ? 0 : -1
        );
        const avg = sentScores.reduce((a, b) => a + b, 0) / sentScores.length;
        if (avg >= 1.5) avgSent = "Strong";
        else if (avg >= 0.5) avgSent = "Positive";
        else if (avg >= -0.5) avgSent = "Neutral";
        else avgSent = "Negative";
      }

      resultsByQuestion.push({
        promptText: bucket.promptText,
        model: bucket.model,
        aiVisibility: aiVis,
        shareOfVoice: sov,
        firstPosition: fp,
        avgPosition: ap,
        avgSentiment: avgSent,
      });
    }
    resultsByQuestion.sort((a, b) => b.aiVisibility - a.aiVisibility || a.promptText.localeCompare(b.promptText));

    // Per-prompt position data for brand position by platform chart
    const promptPositions: { promptText: string; model: string; position: number | null }[] = [];
    for (const run of runs) {
      if (run.prompt.cluster !== "industry") continue;
      const promptText = run.prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`);
      const rank = computeBrandRank(run.rawResponseText, brand.name, brand.slug, run.analysisJson, brandAliases);
      promptPositions.push({ promptText, model: run.model, position: rank });
    }

    return NextResponse.json({
      hasData: true,
      brandIndustry: brand.industry,
      job: formatJobMeta(job!),
      visibility: {
        clusters,
        clusterBreakdown,
        modelBreakdown,
        topPromptWins,
        trend: trendPoints,
        rankDistribution,
        intentSplit,
        overallMentionRate,
        shareOfVoice,
        avgRankScore,
        firstMentionRate,
        prominence: avgProminence,
        visibilityRanking,
        positionDistribution,
        positionDistributionOverTime: (() => {
          const entries: { date: string; model: string; pos1: number; pos2_3: number; pos4_5: number; pos6plus: number }[] = [];
          for (const [key, bucket] of Object.entries(trendByDateModel)) {
            const [date, m, prompt] = key.split("||");
            if (prompt !== "all") continue; // only aggregate buckets
            const validRanks = bucket.ranks.filter((r): r is number => r !== null);
            if (validRanks.length === 0) continue;
            const total = validRanks.length;
            const p1 = validRanks.filter((r) => r === 1).length;
            const p23 = validRanks.filter((r) => r >= 2 && r <= 3).length;
            const p45 = validRanks.filter((r) => r >= 4 && r <= 5).length;
            const p6 = validRanks.filter((r) => r >= 6).length;
            entries.push({
              date,
              model: m,
              pos1: Math.round((p1 / total) * 100),
              pos2_3: Math.round((p23 / total) * 100),
              pos4_5: Math.round((p45 / total) * 100),
              pos6plus: Math.round((p6 / total) * 100),
            });
          }
          return entries.sort((a, b) => a.date.localeCompare(b.date) || a.model.localeCompare(b.model));
        })(),
        opportunityPrompts,
        kpiDeltas,
        worstPerformingPrompts,
        resultsByQuestion,
        promptPositions,
      },
      totals: { totalRuns, totalMentions },
    }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Visibility API error:", message);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
