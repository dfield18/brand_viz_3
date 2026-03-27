import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchBrandRuns, formatJobMeta } from "@/lib/apiPipeline";
import { isBrandMentioned, computeBrandRank } from "@/lib/visibility/brandMention";
import { isRunInBrandScope, filterRunsToBrandScope, buildBrandIdentity } from "@/lib/visibility/brandScope";
import { getSovCountsForRun } from "@/lib/visibility/rankedEntities";
import { computeTopSourceType } from "@/lib/sources/topSourceType";
import { titleCase, buildEntityDisplayNames, resolveEntityName } from "@/lib/utils";
import {
  computeAvgRank,
  computeRank1RateAll,
  computeMentionRate,
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

  const { brand, job, runs: rawRuns, isAll, rangeCutoff } = result;
  const brandName = brand.displayName || brand.name;
  const brandAliases = brand.aliases?.length ? brand.aliases : undefined;
  const brandIdentity = buildBrandIdentity(brand);

  try {
    // Keep ALL runs for denominator — use isRunInBrandScope as a smarter
    // mention detector instead of pre-filtering. This preserves correct
    // recall denominators (mention_count / total_runs, not mention_count / mention_count).
    const allRuns = rawRuns;

    // Build display name map from original GPT-extracted competitor names
    const entityDisplayNames = buildEntityDisplayNames(allRuns);
    const brandDisplayName = brand.displayName || brand.name;
    entityDisplayNames.set(brand.slug, brandDisplayName);

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
      const mentioned = isRunInBrandScope(run, brandIdentity);
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

    // KPI metrics: latest snapshot only (not full period)
    // Find the most recent createdAt date among industry runs
    const latestDate = runs
      .filter((r) => r.prompt.cluster === "industry")
      .reduce((max, r) => (r.createdAt > max ? r.createdAt : max), new Date(0));
    // Latest snapshot = runs from the same date (within 24h of the latest)
    const latestCutoff = new Date(latestDate.getTime() - 24 * 60 * 60 * 1000);
    const latestIndustryRuns = runs.filter(
      (r) => r.prompt.cluster === "industry" && r.createdAt >= latestCutoff,
    );
    const latestIndustryRanks: (number | null)[] = latestIndustryRuns.map((r) =>
      computeBrandRank(r.rawResponseText, brand.name, brand.slug, r.analysisJson, brandAliases),
    );
    const avgRankScore = computeAvgRank(latestIndustryRanks) ?? 0;
    const firstMentionRate = computeRank1RateAll(latestIndustryRanks);

    // --- Text-based entity counting from analysisJson (no EntityResponseMetric dependency) ---
    type AnalysisCompetitor = { name: string; mentionStrength?: number };
    type ParsedAnalysis = { brandMentioned?: boolean; competitors?: AnalysisCompetitor[] };

    function getRunEntities(run: VisibilityRun): { brandMentioned: boolean; competitors: string[] } {
      const brandMentioned = isRunInBrandScope(run, brandIdentity);
      const analysis = run.analysisJson as ParsedAnalysis | null;
      const competitors = (analysis?.competitors ?? []).map((c) => c.name);
      return { brandMentioned, competitors };
    }

    function slugify(name: string): string {
      return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }

    // Share of Voice: uses canonical ranked entities (same as Full Data CSV Brand 1..5).
    // Denominator = text-verified deduped entity count, NOT raw analysisJson.competitors.length.
    const industryRuns2 = latestIndustryRuns;
    let sovBrandMentions = 0;
    let sovTotalEntityMentions = 0;
    // Also build entity run sets for visibility ranking + opportunity prompts
    const entityRunSets = new Map<string, Set<string>>();
    const runCompetitorMap = new Map<string, string[]>(); // runId → competitor entity IDs
    // Per-run SoV counts for per-question aggregation
    const sovByRunId: Record<string, { brandMentions: number; totalMentions: number }> = {};

    for (const run of industryRuns2) {
      const { brandMentioned, competitors } = getRunEntities(run);
      const competitorIds = competitors.map((c) => slugify(c));
      runCompetitorMap.set(run.id, competitorIds);

      // SoV from canonical ranked entities (matches CSV export entity set)
      const sovCounts = getSovCountsForRun({
        rawResponseText: run.rawResponseText,
        analysisJson: run.analysisJson,
        brandName: brand.name,
        brandSlug: brand.slug,
      });
      sovBrandMentions += sovCounts.brandMentions;
      sovTotalEntityMentions += sovCounts.totalMentions;
      sovByRunId[run.id] = sovCounts;

      if (brandMentioned) {
        if (!entityRunSets.has(brand.slug)) entityRunSets.set(brand.slug, new Set());
        entityRunSets.get(brand.slug)!.add(run.id);
      }
      for (const compId of competitorIds) {
        if (!entityRunSets.has(compId)) entityRunSets.set(compId, new Set());
        entityRunSets.get(compId)!.add(run.id);
      }
    }
    const shareOfVoice = computeShareOfVoice(sovBrandMentions, sovTotalEntityMentions);

    // AI Visibility Ranking from text-based entity counts
    const totalIndustryRunCount = industryRuns2.length;
    let visibilityRanking: { entityId: string; name: string; score: number; isBrand: boolean }[] = [];
    if (totalIndustryRunCount > 0) {
      visibilityRanking = Array.from(entityRunSets.entries())
        .map(([entityId, runSet]) => ({
          entityId,
          name: entityId === brand.slug ? brand.name : resolveEntityName(entityId, entityDisplayNames),
          score: Math.round((runSet.size / totalIndustryRunCount) * 100),
          isBrand: entityId === brand.slug,
        }))
        .sort((a, b) => b.score - a.score);
    }

    // Opportunity Prompts: industry runs where competitors appear but brand doesn't
    const opportunityPrompts: { prompt: string; competitorCount: number; competitors: string[] }[] = [];
    const brandRunSet = entityRunSets.get(brand.slug) ?? new Set<string>();
    const seenPromptTexts = new Set<string>();
    for (const run of industryRuns2) {
      if (brandRunSet.has(run.id)) continue;
      const competitorIds = runCompetitorMap.get(run.id) ?? [];
      if (competitorIds.length === 0) continue;
      const promptText = run.prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`);
      if (seenPromptTexts.has(promptText)) continue;
      seenPromptTexts.add(promptText);
      const competitors = [...new Set(competitorIds)].map((id) =>
        resolveEntityName(id, entityDisplayNames),
      );
      opportunityPrompts.push({ prompt: promptText, competitorCount: competitors.length, competitors });
    }
    opportunityPrompts.sort((a, b) => b.competitorCount - a.competitorCount);

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
    // Keep all runs for denominator — use isRunInBrandScope for mention detection
    const rawModelRuns = await prisma.run.findMany({
      where: { brandId: brand.id, createdAt: { gte: rangeCutoff }, job: { status: "done" } },
      include: { prompt: true },
      orderBy: { createdAt: "desc" },
    });
    const seenModelPrompts = new Set<string>();
    const dedupedModelRuns = rawModelRuns.filter((r) => {
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
      if (isRunInBrandScope(run, brandIdentity)) ms.mentions++;
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
        if (isRunInBrandScope(run, brandIdentity)) {
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

    // Mention rate: latest snapshot industry-cluster only (matches scorecard scope)
    const latestIndustryMentions = latestIndustryRuns.filter((r) =>
      isRunInBrandScope(r, brandIdentity),
    ).length;
    const overallMentionRate = computeMentionRate(latestIndustryMentions, latestIndustryRuns.length);

    // Month-over-month KPI deltas (full period industry runs, not just latest snapshot)
    const allIndustryRuns = runs.filter((r) => r.prompt.cluster === "industry");
    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const twoMonthsAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const thisMonthIndustry = allIndustryRuns.filter((r) => r.createdAt >= oneMonthAgo);
    const priorMonthIndustry = allIndustryRuns.filter(
      (r) => r.createdAt >= twoMonthsAgo && r.createdAt < oneMonthAgo,
    );

    function computeWeekKpis(weekRuns: VisibilityRun[]) {
      const mentions = weekRuns.filter((r) =>
        isRunInBrandScope(r, brandIdentity),
      ).length;
      const mr = computeMentionRate(mentions, weekRuns.length);
      const wRanks: (number | null)[] = [];
      for (const r of weekRuns) {
        const rk = computeBrandRank(r.rawResponseText, brand.name, brand.slug, r.analysisJson, brandAliases);
        wRanks.push(rk);
      }
      return {
        mentionRate: mr,
        avgRank: computeAvgRank(wRanks) ?? 0,
        firstMentionRate: computeRank1RateAll(wRanks),
      };
    }

    const thisMonth = computeWeekKpis(thisMonthIndustry);
    const priorMonth = computeWeekKpis(priorMonthIndustry);

    // SOV deltas — uses canonical ranked entities (same as scorecard SoV)
    function computeTextBasedSov(sovRuns: VisibilityRun[]): number {
      let bm = 0, total = 0;
      for (const run of sovRuns) {
        const counts = getSovCountsForRun({
          rawResponseText: run.rawResponseText,
          analysisJson: run.analysisJson,
          brandName: brand.name,
          brandSlug: brand.slug,
        });
        bm += counts.brandMentions;
        total += counts.totalMentions;
      }
      return computeShareOfVoice(bm, total);
    }
    const thisMonthSov = computeTextBasedSov(thisMonthIndustry);
    const priorMonthSov = computeTextBasedSov(priorMonthIndustry);

    const hasPriorMonth = priorMonthIndustry.length > 0;
    const kpiDeltas = hasPriorMonth
      ? {
          mentionRate: Math.round((thisMonth.mentionRate - priorMonth.mentionRate) * 10) / 10,
          shareOfVoice: thisMonthSov - priorMonthSov,
          avgRank: Math.round((thisMonth.avgRank - priorMonth.avgRank) * 100) / 100,
          firstMentionRate: Math.round((thisMonth.firstMentionRate - priorMonth.firstMentionRate) * 10) / 10,
        }
      : null;

    // Worst-performing prompts: industry runs where brand ranks poorly or is absent
    const worstPrompts: { prompt: string; rank: number | null; competitors: string[] }[] = [];
    const seenWorstPrompts = new Set<string>();
    for (const run of allIndustryRuns) {
      const promptText = run.prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`);
      if (seenWorstPrompts.has(promptText)) continue;
      seenWorstPrompts.add(promptText);
      const brandRank = computeBrandRank(run.rawResponseText, brand.name, brand.slug, run.analysisJson, brandAliases);
      // Include if brand is absent (null) or ranks > 1
      if (brandRank !== null && brandRank <= 1) continue;
      worstPrompts.push({ prompt: promptText, rank: brandRank, competitors: [] });
    }
    // Enrich with top 5 competitors from analysisJson
    if (worstPrompts.length > 0) {
      const worstRunMap = new Map<string, VisibilityRun>(); // promptText → run
      for (const run of allIndustryRuns) {
        const pt = run.prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`);
        if (!worstRunMap.has(pt)) worstRunMap.set(pt, run);
      }
      for (const wp of worstPrompts) {
        const run = worstRunMap.get(wp.prompt);
        if (!run) continue;
        const analysis = run.analysisJson as ParsedAnalysis | null;
        const competitors = (analysis?.competitors ?? [])
          .sort((a, b) => (b.mentionStrength ?? 0) - (a.mentionStrength ?? 0))
          .slice(0, 5)
          .map((c) => c.name);
        wp.competitors = competitors;
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

    // SoV per trend run: uses canonical ranked entities (same as scorecard + CSV export)
    const sovByRun = new Map<string, { brandMentions: number; totalMentions: number }>();
    for (const run of allTrendRuns) {
      if (run.prompt.cluster !== "industry") continue;
      sovByRun.set(run.id, getSovCountsForRun({
        rawResponseText: run.rawResponseText,
        analysisJson: run.analysisJson,
        brandName: brand.name,
        brandSlug: brand.slug,
      }));
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
        const mentioned = isRunInBrandScope(run, brandIdentity);
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

    // Build rank distribution — latest snapshot only (matches scorecard)
    const latestNonNullRanks = latestIndustryRanks.filter((r): r is number => r !== null);
    const rankCounts: Record<number, number> = {};
    for (const r of latestNonNullRanks) {
      rankCounts[r] = (rankCounts[r] || 0) + 1;
    }
    const rankDistribution = Object.entries(rankCounts)
      .map(([rank, count]) => ({
        rank: Number(rank),
        count,
        percentage: computeMentionRate(count, latestNonNullRanks.length),
      }))
      .sort((a, b) => a.rank - b.rank);

    // Position distribution — latest snapshot, "all" + per-model
    const buildPosDist = (posRanks: number[], modelLabel: string) => {
      const counts: Record<number, number> = {};
      for (const r of posRanks) counts[r] = (counts[r] || 0) + 1;
      return Object.entries(counts)
        .map(([pos, count]) => ({
          position: Number(pos),
          model: modelLabel,
          count,
          percentage: posRanks.length > 0 ? Math.round((count / posRanks.length) * 100) : 0,
        }))
        .sort((a, b) => a.position - b.position);
    };
    // Build per-model latest ranks
    const latestRanksByModel: Record<string, (number | null)[]> = {};
    for (const r of latestIndustryRuns) {
      if (!latestRanksByModel[r.model]) latestRanksByModel[r.model] = [];
      latestRanksByModel[r.model].push(
        computeBrandRank(r.rawResponseText, brand.name, brand.slug, r.analysisJson, brandAliases),
      );
    }
    const latestNonNullByModel: Record<string, number[]> = {};
    for (const [m, mRanks] of Object.entries(latestRanksByModel)) {
      latestNonNullByModel[m] = mRanks.filter((r): r is number => r !== null);
    }
    const positionDistribution = [
      ...buildPosDist(latestNonNullRanks, "all"),
      ...Object.entries(latestNonNullByModel).flatMap(([m, mRanks]) => buildPosDist(mRanks, m)),
    ];

    // Results by Question: per-prompt metrics across all models, industry-only
    // Group all industry runs by prompt text + model
    type PromptBucket = {
      promptText: string;
      model: string;
      total: number;
      mentions: number;
      ranks: number[];
      sentPos: number;
      sentNeu: number;
      sentNeg: number;
    };
    const promptBuckets = new Map<string, PromptBucket>();
    // Also fetch SOV per prompt from entityResponseMetric
    const industryRunPromptMap = new Map<string, { runId: string; promptText: string; model: string }[]>();
    for (const run of runs) {
      if (run.prompt.cluster !== "industry") continue;
      const promptText = run.prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`);
      const key = `${promptText}||${run.model}`;
      if (!promptBuckets.has(key)) {
        promptBuckets.set(key, { promptText, model: run.model, total: 0, mentions: 0, ranks: [], sentPos: 0, sentNeu: 0, sentNeg: 0 });
      }
      const bucket = promptBuckets.get(key)!;
      bucket.total++;
      const mentioned = isRunInBrandScope(run, brandIdentity);
      if (mentioned) bucket.mentions++;
      const rk = computeBrandRank(run.rawResponseText, brand.name, brand.slug, run.analysisJson, brandAliases);
      if (rk !== null) bucket.ranks.push(rk);

      // Count POS/NEU/NEG labels (same methodology as overview/narrative sentiment)
      const nj = run.narrativeJson as { sentiment?: { label?: string } } | null;
      if (nj?.sentiment?.label) {
        if (nj.sentiment.label === "POS") bucket.sentPos++;
        else if (nj.sentiment.label === "NEG") bucket.sentNeg++;
        else bucket.sentNeu++;
      }

      if (!industryRunPromptMap.has(key)) industryRunPromptMap.set(key, []);
      industryRunPromptMap.get(key)!.push({ runId: run.id, promptText, model: run.model });
    }

    // Per-question SoV: uses canonical ranked entities (same as scorecard SoV).
    // For runs outside the latest snapshot, compute SoV counts on demand.
    // (sovByRunId from the scorecard loop only covers latest-snapshot runs.)
    for (const run of runs) {
      if (run.prompt.cluster !== "industry") continue;
      if (sovByRunId[run.id]) continue; // already computed in scorecard loop
      sovByRunId[run.id] = getSovCountsForRun({
        rawResponseText: run.rawResponseText,
        analysisJson: run.analysisJson,
        brandName: brand.name,
        brandSlug: brand.slug,
      });
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

      // Classify sentiment using label counting + 60/40/40/50 thresholds
      // (same methodology as overview scorecard and narrative tab)
      let avgSent: "Strong" | "Positive" | "Neutral" | "Negative" = "Neutral";
      const sentTotal = bucket.sentPos + bucket.sentNeu + bucket.sentNeg;
      if (sentTotal > 0) {
        const pctPos = Math.round((bucket.sentPos / sentTotal) * 100);
        const pctNeg = Math.round((bucket.sentNeg / sentTotal) * 100);
        const pctNeu = Math.round((bucket.sentNeu / sentTotal) * 100);
        if (pctPos >= 60) avgSent = "Strong";
        else if (pctPos >= 40) avgSent = "Positive";
        else if (pctNeg >= 40) avgSent = "Negative";
        else if (pctNeu >= 50) avgSent = "Neutral";
        else avgSent = "Neutral"; // mixed — default to Neutral for 4-tier display
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

    // Top cited source type from scoped runs (matches Sources API)
    const scopedSourceRuns = filterRunsToBrandScope(allRuns, brandIdentity);
    const scopedSourceRunIds = scopedSourceRuns.map((r) => r.id);
    const topSourceType = await computeTopSourceType(scopedSourceRunIds).catch(() => null);

    return NextResponse.json({
      hasData: true,
      brandIndustry: brand.industry,
      job: formatJobMeta(job!),
      topSourceType,
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
        visibilityRanking,
        positionDistribution,
        positionDistributionOverTime: (() => {
          const entries: { date: string; model: string; pos1: number; pos2_3: number; pos4_5: number; pos6plus: number }[] = [];
          for (const [key, bucket] of Object.entries(trendByDateModel)) {
            const [date, m, prompt] = key.split("||");
            if (prompt !== "all") continue; // only aggregate buckets
            if (bucket.ranks.length === 0) continue;
            // Use ALL runs (including nulls) as denominator so Rank #1 %
            // matches the Top Result Rate KPI (which uses computeRank1RateAll)
            const total = bucket.ranks.length;
            const p1 = bucket.ranks.filter((r) => r === 1).length;
            const p23 = bucket.ranks.filter((r) => r !== null && r >= 2 && r <= 3).length;
            const p45 = bucket.ranks.filter((r) => r !== null && r >= 4 && r <= 5).length;
            const p6 = bucket.ranks.filter((r) => r !== null && r >= 6).length;
            const rPos1 = Math.round((p1 / total) * 100);
            const rPos23 = Math.round((p23 / total) * 100);
            const rPos45 = Math.round((p45 / total) * 100);
            // Use remainder for last band to guarantee sum = 100%
            // This now absorbs both rank 6+ and not-mentioned runs
            const rPos6 = 100 - rPos1 - rPos23 - rPos45;
            entries.push({
              date,
              model: m,
              pos1: rPos1,
              pos2_3: rPos23,
              pos4_5: rPos45,
              pos6plus: Math.max(0, rPos6),
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
