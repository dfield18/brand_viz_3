import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { titleCase } from "@/lib/utils";
import { fetchBrandRuns, formatJobMeta } from "@/lib/apiPipeline";
import {
  computeMentionShare,
  computeAvgRank,
  computeRank1Rate,
  computeFragmentation,
  computeWinLoss,
  computeMentionRate,
  computeAvgProminence,
} from "@/lib/competition/computeCompetition";
import { computeBrandRank } from "@/lib/visibility/brandMention";
import {
  splitSentences,
  getEntityContextWindow,
  countSignalHits,
} from "@/lib/narrative/textUtils";
import {
  AUTHORITY_SIGNALS,
  TRUST_SIGNALS,
  WEAKNESS_SIGNALS,
} from "@/lib/narrative/signalLexicons";
import { THEME_TAXONOMY } from "@/lib/narrative/themeTaxonomy";
import type { NarrativeExtractionResult } from "@/lib/narrative/extractNarrative";
import { normalizeEntityIds, mergeEntityMetrics } from "@/lib/competition/normalizeEntities";
import type {
  CompetitorRow,
  CompetitorNarrative,
  PromptMatrixRow,
  WinLossCompetitor,
  TopLoss,
  ModelSplitRow,
  CompetitiveTrendPoint,
  CompetitiveSentimentTrendPoint,
  ProminenceShareRow,
  CompetitiveOpportunity,
  CoMentionPair,
} from "@/types/api";

const TOP_COMPETITORS = 10;
const MAX_MATRIX_ROWS = 50;
const MAX_TOP_LOSSES = 10;

type MinimalRun = { id: string; model: string; promptId: string; createdAt: Date; jobId: string; rawResponseText: string; analysisJson: unknown; competitorNarrativesJson: unknown };

export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }

  const model = req.nextUrl.searchParams.get("model") ?? "";
  const viewRange = parseInt(req.nextUrl.searchParams.get("range") ?? "90", 10);
  const cluster = req.nextUrl.searchParams.get("cluster") ?? "";
  const promptId = req.nextUrl.searchParams.get("promptId") ?? "";

  const result = await fetchBrandRuns<MinimalRun & { prompt: { cluster: string } }>({
    brandSlug,
    model,
    viewRange,
    runQuery: { select: { id: true, model: true, promptId: true, createdAt: true, jobId: true, rawResponseText: true, analysisJson: true, competitorNarrativesJson: true, prompt: { select: { cluster: true } } } },
  });
  if (!result.ok) return result.response;

  const { brand, job, runs: allRuns, isAll, rangeCutoff } = result;
  const brandName = brand.displayName || brand.name;
  const brandAliases = brand.aliases?.length ? brand.aliases : undefined;
  const runs = promptId
    ? allRuns.filter((r) => r.promptId === promptId)
    : cluster && cluster !== "all"
      ? allRuns.filter((r) => r.prompt.cluster === cluster)
      : allRuns.filter((r) => r.prompt.cluster === "industry");

  try {
    const runIds = runs.map((r) => r.id);
    const totalResponses = runIds.length;

    if (totalResponses === 0) {
      return NextResponse.json({ hasData: false, reason: "no_runs_in_range" });
    }

    // Bulk query EntityResponseMetric for those runs
    const metrics = await prisma.entityResponseMetric.findMany({
      where: { runId: { in: runIds } },
      select: {
        runId: true,
        entityId: true,
        model: true,
        promptId: true,
        prominenceScore: true,
        rankPosition: true,
      },
    });

    // Group metrics by entityId
    type Metric = (typeof metrics)[number];
    let byEntity = new Map<string, Metric[]>();
    for (const m of metrics) {
      const arr = byEntity.get(m.entityId) ?? [];
      arr.push(m);
      byEntity.set(m.entityId, arr);
    }

    // Normalize entity IDs: merge duplicates like "volkswagen" + "volkswagen group"
    const allEntityIds = [...byEntity.keys()].filter((id) => id !== brand.slug);
    const aliasMap = await normalizeEntityIds(allEntityIds, brand.slug);
    // Ensure brand slug maps to itself
    aliasMap.set(brand.slug, brand.slug);
    byEntity = mergeEntityMetrics(byEntity, aliasMap);

    // Find brand entity metrics
    const brandMetrics = byEntity.get(brand.slug) ?? [];
    const brandRunIds = new Set(brandMetrics.filter((m) => m.prominenceScore > 0).map((m) => m.runId));

    // Auto-discover competitors: top N by co-occurrence with brand
    const cooccurrence: { entityId: string; count: number }[] = [];
    for (const [entityId, entityMetrics] of byEntity) {
      if (entityId === brand.slug) continue;
      const coCount = entityMetrics.filter(
        (m) => m.prominenceScore > 0 && brandRunIds.has(m.runId),
      ).length;
      if (coCount > 0) {
        cooccurrence.push({ entityId, count: coCount });
      }
    }
    cooccurrence.sort((a, b) => b.count - a.count);
    const topCompetitorIds = cooccurrence.slice(0, TOP_COMPETITORS).map((c) => c.entityId);

    // Tracked set = brand + top competitors
    const trackedIds = [brand.slug, ...topCompetitorIds];
    const trackedSet = new Set(trackedIds);

    // Compute per-entity stats
    // Use ALL entity appearances as denominator (same methodology as Visibility tab SOV)
    let totalAppearances = 0;
    for (const [, entityMetrics] of byEntity) {
      totalAppearances += entityMetrics.filter((m) => m.prominenceScore > 0).length;
    }

    const competitors: CompetitorRow[] = trackedIds.map((entityId) => {
      const ms = (byEntity.get(entityId) ?? []).filter((m) => m.prominenceScore > 0);
      const appearances = ms.length;
      const ranks = ms.map((m) => m.rankPosition);
      return {
        entityId,
        name: entityId === brand.slug ? brand.name : titleCase(entityId),
        isBrand: entityId === brand.slug,
        mentionShare: computeMentionShare(appearances, totalAppearances),
        mentionRate: computeMentionRate(appearances, totalResponses),
        avgRank: computeAvgRank(ranks),
        rank1Rate: computeRank1Rate(ranks),
        avgProminence: computeAvgProminence(ms.map((m) => m.prominenceScore)),
        appearances,
      };
    });

    // Override brand's avgRank and rank1Rate with mention-order ranking
    // (same methodology as Visibility tab — based on order of first appearance in text)
    const brandMentionOrderRanks: number[] = [];
    for (const run of runs) {
      const rank = computeBrandRank(run.rawResponseText, brand.name, brand.slug, run.analysisJson, brandAliases);
      if (rank !== null) brandMentionOrderRanks.push(rank);
    }
    const brandComp = competitors.find((c) => c.isBrand);
    if (brandComp && brandMentionOrderRanks.length > 0) {
      brandComp.avgRank = computeAvgRank(brandMentionOrderRanks);
      brandComp.rank1Rate = computeRank1Rate(brandMentionOrderRanks);
    }

    // --- Per-entity sentiment ---
    // Build runId→rawResponseText map and cache split sentences
    const runTextMap = new Map<string, string>();
    for (const run of runs) {
      runTextMap.set(run.id, run.rawResponseText);
    }
    const sentenceCache = new Map<string, string[]>();
    function getSentences(runId: string): string[] {
      let cached = sentenceCache.get(runId);
      if (!cached) {
        const text = runTextMap.get(runId) ?? "";
        cached = splitSentences(text);
        sentenceCache.set(runId, cached);
      }
      return cached;
    }

    function scoreToLabel(score: number): "Strong" | "Positive" | "Neutral" | "Conditional" | "Negative" {
      if (score >= 0.5) return "Strong";
      if (score >= 0.15) return "Positive";
      if (score >= -0.15) return "Neutral";
      if (score >= -0.4) return "Conditional";
      return "Negative";
    }

    for (const comp of competitors) {
      const entityMetrics = (byEntity.get(comp.entityId) ?? []).filter((m) => m.prominenceScore > 0);
      if (entityMetrics.length === 0) continue;

      let totalScore = 0;
      let scoredCount = 0;
      const dist: Record<string, number> = { Strong: 0, Positive: 0, Neutral: 0, Conditional: 0, Negative: 0 };
      for (const m of entityMetrics) {
        const sentences = getSentences(m.runId);
        const context = getEntityContextWindow(sentences, comp.name, comp.entityId);
        if (context.length === 0) continue;
        const contextText = context.join(" ");
        const authority = countSignalHits(contextText, AUTHORITY_SIGNALS);
        const trust = countSignalHits(contextText, TRUST_SIGNALS);
        const weakness = countSignalHits(contextText, WEAKNESS_SIGNALS);
        const pos = authority + trust;
        const neg = weakness;
        const total = Math.max(1, pos + neg);
        const score = (pos - neg) / total;
        totalScore += score;
        scoredCount++;
        dist[scoreToLabel(score)]++;
      }

      if (scoredCount > 0) {
        const avg = totalScore / scoredCount;
        comp.sentimentScore = Math.round(avg * 100) / 100;
        comp.avgSentiment = scoreToLabel(avg);
        comp.sentimentDist = dist;
      }
    }

    // Fragmentation
    const shares = competitors.map((c) => c.mentionShare);
    const fragmentation = computeFragmentation(shares);

    // Rank Distribution: entity → {rank: count}
    const rankDistribution: Record<string, Record<number, number>> = {};
    for (const entityId of trackedIds) {
      const ms = (byEntity.get(entityId) ?? []).filter((m) => m.rankPosition !== null);
      const dist: Record<number, number> = {};
      for (const m of ms) {
        dist[m.rankPosition!] = (dist[m.rankPosition!] || 0) + 1;
      }
      rankDistribution[entityId] = dist;
    }

    // Models included
    const modelsIncluded = [...new Set(runs.map((r) => r.model))];

    // Prompt Matrix: per-prompt entity ranks (cap 50)
    const promptIds = [...new Set(runs.map((r) => r.promptId))];
    const prompts = await prisma.prompt.findMany({
      where: { id: { in: promptIds } },
      select: { id: true, text: true, cluster: true, intent: true },
    });
    const promptMap = new Map(prompts.map((p) => [p.id, p]));

    // Group metrics by runId for matrix
    const metricsByRun = new Map<string, Metric[]>();
    for (const m of metrics) {
      if (!trackedSet.has(m.entityId)) continue;
      const arr = metricsByRun.get(m.runId) ?? [];
      arr.push(m);
      metricsByRun.set(m.runId, arr);
    }

    // Build matrix rows
    const matrixRows: PromptMatrixRow[] = [];
    for (const run of runs) {
      const prompt = promptMap.get(run.promptId);
      if (!prompt) continue;
      const runMetrics = metricsByRun.get(run.id) ?? [];
      const entities: Record<string, { rank: number | null; prominence: number }> = {};
      for (const m of runMetrics) {
        entities[m.entityId] = {
          rank: m.rankPosition,
          prominence: Math.round(m.prominenceScore * 100) / 100,
        };
      }
      matrixRows.push({
        promptId: prompt.id,
        promptText: prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`),
        cluster: prompt.cluster,
        intent: prompt.intent,
        model: run.model,
        entities,
      });
    }
    matrixRows.sort(
      (a, b) => Object.keys(b.entities).length - Object.keys(a.entities).length,
    );
    const promptMatrix = matrixRows.slice(0, MAX_MATRIX_ROWS);

    // Win/Loss
    const brandMetricsByRun = new Map<string, Metric>();
    for (const m of brandMetrics) {
      if (m.prominenceScore > 0) brandMetricsByRun.set(m.runId, m);
    }

    const winLossMap = new Map<string, { wins: number; losses: number }>();
    const allLosses: TopLoss[] = [];

    // Compute win/loss against ALL entities (not just top competitors)
    // so topLosses and byCompetitor are consistent
    for (const [competitorId, entityMetrics] of byEntity) {
      if (competitorId === brand.slug) continue;
      const competitorMetrics = entityMetrics.filter(
        (m) => m.prominenceScore > 0,
      );
      let wins = 0;
      let losses = 0;

      for (const cm of competitorMetrics) {
        const bm = brandMetricsByRun.get(cm.runId);
        if (!bm) continue;

        const wlResult = computeWinLoss(bm.rankPosition, cm.rankPosition);
        if (wlResult === "win") wins++;
        else if (wlResult === "loss") {
          losses++;
          const prompt = promptMap.get(cm.promptId);
          if (prompt) {
            allLosses.push({
              promptText: prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`),
              cluster: prompt.cluster,
              intent: prompt.intent,
              yourRank: bm.rankPosition,
              yourProminence: Math.round(bm.prominenceScore * 100) / 100,
              competitorName: titleCase(competitorId),
              competitorRank: cm.rankPosition,
              competitorProminence: Math.round(cm.prominenceScore * 100) / 100,
            });
          }
        }
      }

      if (wins > 0 || losses > 0) {
        winLossMap.set(competitorId, { wins, losses });
      }
    }

    // Include all entities with head-to-head matchups in byCompetitor
    const byCompetitor: WinLossCompetitor[] = [...winLossMap.entries()]
      .map(([id, wl]) => {
        const total = wl.wins + wl.losses;
        return {
          entityId: id,
          name: titleCase(id),
          wins: wl.wins,
          losses: wl.losses,
          lossRate: total > 0 ? Math.round((wl.losses / total) * 100) : 0,
        };
      })
      .sort((a, b) => b.losses - a.losses);

    allLosses.sort((a, b) => b.competitorProminence - a.competitorProminence);
    const topLosses = allLosses.slice(0, MAX_TOP_LOSSES);

    // Model Split
    const modelSplit: ModelSplitRow[] = modelsIncluded.map((modelId) => {
      const modelRunIds = new Set(runs.filter((r) => r.model === modelId).map((r) => r.id));
      const modelTotalResponses = modelRunIds.size;

      // Use ALL entity appearances per model (same methodology as Visibility tab SOV)
      let modelTotalAppearances = 0;
      for (const [, entityMetrics] of byEntity) {
        modelTotalAppearances += entityMetrics.filter(
          (m) => m.prominenceScore > 0 && modelRunIds.has(m.runId),
        ).length;
      }

      const modelCompetitors: CompetitorRow[] = trackedIds.map((entityId) => {
        const ms = (byEntity.get(entityId) ?? []).filter(
          (m) => m.prominenceScore > 0 && modelRunIds.has(m.runId),
        );
        const appearances = ms.length;
        const ranks = ms.map((m) => m.rankPosition);
        return {
          entityId,
          name: entityId === brand.slug ? brand.name : titleCase(entityId),
          isBrand: entityId === brand.slug,
          mentionShare: computeMentionShare(appearances, modelTotalAppearances),
          mentionRate: computeMentionRate(appearances, modelTotalResponses),
          avgRank: computeAvgRank(ranks),
          rank1Rate: computeRank1Rate(ranks),
          avgProminence: computeAvgProminence(ms.map((m) => m.prominenceScore)),
          appearances,
        };
      });

      return { model: modelId, competitors: modelCompetitors };
    });

    // --- Prominence Share ---
    const totalProminenceSum = trackedIds.reduce((sum, id) => {
      const ms = (byEntity.get(id) ?? []).filter((m) => m.prominenceScore > 0);
      return sum + ms.reduce((s, m) => s + m.prominenceScore, 0);
    }, 0);

    const prominenceShare: ProminenceShareRow[] = trackedIds.map((entityId) => {
      const ms = (byEntity.get(entityId) ?? []).filter((m) => m.prominenceScore > 0);
      const entityPromSum = ms.reduce((s, m) => s + m.prominenceScore, 0);
      const comp = competitors.find((c) => c.entityId === entityId)!;
      return {
        entityId,
        name: comp.name,
        isBrand: comp.isBrand,
        avgProminence: comp.avgProminence,
        prominenceShare: totalProminenceSum > 0
          ? Math.round((entityPromSum / totalProminenceSum) * 10000) / 100
          : 0,
      };
    });

    // --- Competitive Opportunities ---
    const opportunities: CompetitiveOpportunity[] = [];
    for (const row of matrixRows) {
      const brandCell = row.entities[brand.slug];
      const brandAbsent = !brandCell || brandCell.prominence <= 0;
      const brandNotFirst = brandCell && brandCell.rank !== 1;
      if (!brandAbsent && !brandNotFirst) continue;

      let topCompId = "";
      let topCompRank = Infinity;
      for (const [eid, cell] of Object.entries(row.entities)) {
        if (eid === brand.slug) continue;
        if (cell.rank !== null && cell.rank < topCompRank) {
          topCompRank = cell.rank;
          topCompId = eid;
        }
      }
      if (!topCompId || topCompRank === Infinity) continue;

      const compCell = row.entities[topCompId];
      const rawScore = compCell.prominence * (1 / topCompRank) * (brandAbsent ? 1.5 : 1.0);
      opportunities.push({
        promptText: row.promptText,
        cluster: row.cluster,
        intent: row.intent,
        model: row.model,
        brandRank: brandCell?.rank ?? null,
        topCompetitor: titleCase(topCompId),
        topCompetitorRank: topCompRank,
        impactScore: rawScore,
      });
    }
    const maxImpact = Math.max(...opportunities.map((o) => o.impactScore), 1);
    for (const o of opportunities) {
      o.impactScore = Math.round((o.impactScore / maxImpact) * 100);
    }
    opportunities.sort((a, b) => b.impactScore - a.impactScore);
    const competitiveOpportunities = opportunities.slice(0, 20);

    // --- Co-Mention Pairs ---
    const entityRunSets = new Map<string, Set<string>>();
    for (const entityId of trackedIds) {
      const ms = (byEntity.get(entityId) ?? []).filter((m) => m.prominenceScore > 0);
      entityRunSets.set(entityId, new Set(ms.map((m) => m.runId)));
    }

    const coMentions: CoMentionPair[] = [];
    for (let i = 0; i < trackedIds.length; i++) {
      for (let j = i + 1; j < trackedIds.length; j++) {
        const a = trackedIds[i];
        const b = trackedIds[j];
        const setA = entityRunSets.get(a)!;
        const setB = entityRunSets.get(b)!;
        let count = 0;
        for (const runId of setA) {
          if (setB.has(runId)) count++;
        }
        if (count > 0) {
          const minApp = Math.min(setA.size, setB.size);
          coMentions.push({
            entityA: a,
            entityB: b,
            coMentionCount: count,
            coMentionRate: minApp > 0 ? Math.round((count / minApp) * 100) : 0,
          });
        }
      }
    }

    // --- Competitive Trend: query ALL jobs in range (not just deduped runs) ---
    const trendJobWhere = isAll
      ? { brandId: brand.id, status: "done" as const, finishedAt: { gte: rangeCutoff } }
      : { brandId: brand.id, model, status: "done" as const, finishedAt: { gte: rangeCutoff } };
    const allTrendJobs = await prisma.job.findMany({
      where: trendJobWhere,
      orderBy: { finishedAt: "asc" },
      select: { id: true, finishedAt: true },
    });

    // Entities with >5% mention share for trend lines
    const trendEntityIds = competitors
      .filter((c) => c.mentionShare > 5)
      .sort((a, b) => b.mentionShare - a.mentionShare)
      .map((c) => c.entityId);
    const trendEntitySet = new Set(trendEntityIds);

    // Batch-fetch all metrics for trend jobs (avoid N+1)
    type TrendDateBucket = {
      totalResponses: number;
      totalAppearances: number;
      entityAppearances: Record<string, Set<string>>;
      entityRanks: Record<string, number[]>;
    };
    const trendByDate = new Map<string, TrendDateBucket>();

    const trendJobIds = allTrendJobs.filter((j) => j.finishedAt).map((j) => j.id);
    const allTrendMetrics = trendJobIds.length > 0
      ? await prisma.entityResponseMetric.findMany({
          where: {
            run: {
              jobId: { in: trendJobIds },
              prompt: { cluster: "industry" },
            },
          },
          select: { runId: true, entityId: true, prominenceScore: true, rankPosition: true, run: { select: { jobId: true } } },
        })
      : [];

    // Index metrics by jobId
    const trendMetricsByJob = new Map<string, typeof allTrendMetrics>();
    for (const m of allTrendMetrics) {
      const list = trendMetricsByJob.get(m.run.jobId) ?? [];
      list.push(m);
      trendMetricsByJob.set(m.run.jobId, list);
    }

    for (const tj of allTrendJobs) {
      if (!tj.finishedAt) continue;
      const date = tj.finishedAt.toISOString().slice(0, 10);

      const jobMetrics = trendMetricsByJob.get(tj.id) ?? [];

      const jobRunIds = new Set<string>();
      for (const m of jobMetrics) jobRunIds.add(m.runId);

      let bucket = trendByDate.get(date);
      if (!bucket) {
        bucket = { totalResponses: 0, totalAppearances: 0, entityAppearances: {}, entityRanks: {} };
        for (const eid of trendEntityIds) {
          bucket.entityAppearances[eid] = new Set();
          bucket.entityRanks[eid] = [];
        }
        trendByDate.set(date, bucket);
      }

      bucket.totalResponses += jobRunIds.size;
      for (const m of jobMetrics) {
        if (m.prominenceScore <= 0) continue;
        if (trendEntitySet.has(m.entityId)) {
          bucket.totalAppearances++;
          bucket.entityAppearances[m.entityId]?.add(m.runId);
          if (m.rankPosition !== null) {
            bucket.entityRanks[m.entityId]?.push(m.rankPosition);
          }
        }
      }
    }

    const competitiveTrend: CompetitiveTrendPoint[] = [];
    for (const [date, bucket] of [...trendByDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const mentionShare: Record<string, number> = {};
      const mentionRate: Record<string, number> = {};
      const avgPosition: Record<string, number | null> = {};
      const rank1Rate: Record<string, number> = {};
      for (const entityId of trendEntityIds) {
        const entityRuns = bucket.entityAppearances[entityId];
        const entityAppCount = entityRuns?.size ?? 0;
        mentionShare[entityId] = bucket.totalAppearances > 0
          ? Math.round((entityAppCount / bucket.totalAppearances) * 10000) / 100
          : 0;
        mentionRate[entityId] = bucket.totalResponses > 0
          ? Math.round((entityAppCount / bucket.totalResponses) * 10000) / 100
          : 0;
        const ranks = bucket.entityRanks[entityId] ?? [];
        avgPosition[entityId] = ranks.length > 0
          ? Math.round((ranks.reduce((s, r) => s + r, 0) / ranks.length) * 10) / 10
          : null;
        const rank1Count = ranks.filter((r) => r === 1).length;
        rank1Rate[entityId] = ranks.length > 0
          ? Math.round((rank1Count / ranks.length) * 10000) / 100
          : 0;
      }
      competitiveTrend.push({ date, mentionShare, mentionRate, avgPosition, rank1Rate });
    }

    // Ensure the trend spans the full selected range by adding anchor points
    // that repeat the nearest real data so the X-axis covers the entire window
    const rangeStartDate = rangeCutoff.toISOString().slice(0, 10);
    const todayDate = new Date().toISOString().slice(0, 10);
    if (competitiveTrend.length > 0) {
      if (competitiveTrend[0].date > rangeStartDate) {
        competitiveTrend.unshift({ ...competitiveTrend[0], date: rangeStartDate });
      }
      if (competitiveTrend[competitiveTrend.length - 1].date < todayDate) {
        competitiveTrend.push({ ...competitiveTrend[competitiveTrend.length - 1], date: todayDate });
      }
    }

    // --- Sentiment Trend: per-entity sentiment score per date ---
    // Fetch raw text for trend runs
    const trendRunIds = new Set<string>();
    for (const m of allTrendMetrics) {
      if (m.prominenceScore > 0 && trendEntitySet.has(m.entityId)) {
        trendRunIds.add(m.runId);
      }
    }
    const trendRuns = trendRunIds.size > 0
      ? await prisma.run.findMany({
          where: { id: { in: [...trendRunIds] } },
          select: { id: true, rawResponseText: true, jobId: true },
        })
      : [];
    const trendRunTextMap = new Map<string, string>();
    for (const r of trendRuns) trendRunTextMap.set(r.id, r.rawResponseText);

    // Map runId → jobId for date lookup
    const runJobMap = new Map<string, string>();
    for (const r of trendRuns) runJobMap.set(r.id, r.jobId);
    const jobDateMap = new Map<string, string>();
    for (const tj of allTrendJobs) {
      if (tj.finishedAt) jobDateMap.set(tj.id, tj.finishedAt.toISOString().slice(0, 10));
    }

    // Build per-entity, per-date sentiment scores
    type SentimentBucket = { totalScore: number; count: number };
    const sentimentByDateEntity = new Map<string, Map<string, SentimentBucket>>();

    const trendSentenceCache = new Map<string, string[]>();
    function getTrendSentences(runId: string): string[] {
      let cached = trendSentenceCache.get(runId);
      if (!cached) {
        const text = trendRunTextMap.get(runId) ?? "";
        cached = splitSentences(text);
        trendSentenceCache.set(runId, cached);
      }
      return cached;
    }

    for (const m of allTrendMetrics) {
      if (m.prominenceScore <= 0 || !trendEntitySet.has(m.entityId)) continue;
      const jobId = runJobMap.get(m.runId);
      if (!jobId) continue;
      const date = jobDateMap.get(jobId);
      if (!date) continue;
      const text = trendRunTextMap.get(m.runId);
      if (!text) continue;

      const comp = competitors.find((c) => c.entityId === m.entityId);
      if (!comp) continue;

      const sentences = getTrendSentences(m.runId);
      const context = getEntityContextWindow(sentences, comp.name, comp.entityId);
      if (context.length === 0) continue;

      const contextText = context.join(" ");
      const authority = countSignalHits(contextText, AUTHORITY_SIGNALS);
      const trust = countSignalHits(contextText, TRUST_SIGNALS);
      const weakness = countSignalHits(contextText, WEAKNESS_SIGNALS);
      const pos = authority + trust;
      const neg = weakness;
      const total = Math.max(1, pos + neg);
      const score = (pos - neg) / total;

      if (!sentimentByDateEntity.has(date)) sentimentByDateEntity.set(date, new Map());
      const dateMap = sentimentByDateEntity.get(date)!;
      if (!dateMap.has(m.entityId)) dateMap.set(m.entityId, { totalScore: 0, count: 0 });
      const bucket = dateMap.get(m.entityId)!;
      bucket.totalScore += score;
      bucket.count++;
    }

    const sentimentTrend: CompetitiveSentimentTrendPoint[] = [];
    for (const [date] of [...trendByDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const dateMap = sentimentByDateEntity.get(date);
      const sentiment: Record<string, number> = {};
      for (const entityId of trendEntityIds) {
        const bucket = dateMap?.get(entityId);
        if (bucket && bucket.count > 0) {
          const avg = bucket.totalScore / bucket.count;
          sentiment[entityId] = Math.round((avg + 1) * 50);
        }
      }
      // Only include dates where at least one entity has data
      if (Object.keys(sentiment).length > 0) {
        sentimentTrend.push({ date, sentiment });
      }
    }

    // Ensure sentiment trend also spans the full range
    if (sentimentTrend.length > 0) {
      if (sentimentTrend[0].date > rangeStartDate) {
        sentimentTrend.unshift({ ...sentimentTrend[0], date: rangeStartDate });
      }
      if (sentimentTrend[sentimentTrend.length - 1].date < todayDate) {
        sentimentTrend.push({ ...sentimentTrend[sentimentTrend.length - 1], date: todayDate });
      }
    }

    // --- Competitor Narratives: aggregate from stored competitorNarrativesJson ---
    const THEME_LABEL_MAP: Record<string, string> = {};
    for (const t of THEME_TAXONOMY) THEME_LABEL_MAP[t.key] = t.label;

    const compNarrativesByEntity = new Map<string, NarrativeExtractionResult[]>();
    for (const run of runs) {
      const json = run.competitorNarrativesJson as Record<string, NarrativeExtractionResult> | null;
      if (!json) continue;
      for (const [rawEntityId, narrative] of Object.entries(json)) {
        // Normalize the entity ID from stored narratives
        const entityId = aliasMap.get(rawEntityId) ?? rawEntityId;
        if (!trackedSet.has(entityId)) continue;
        if (entityId === brand.slug) continue;
        const arr = compNarrativesByEntity.get(entityId) ?? [];
        arr.push(narrative);
        compNarrativesByEntity.set(entityId, arr);
      }
    }

    const competitorNarratives: CompetitorNarrative[] = [];
    for (const [entityId, narratives] of compNarrativesByEntity) {
      if (narratives.length === 0) continue;
      const comp = competitors.find((c) => c.entityId === entityId);
      if (!comp) continue;

      // Aggregate themes
      const themeCounts: Record<string, number> = {};
      for (const n of narratives) {
        for (const theme of n.themes) {
          themeCounts[theme.key] = (themeCounts[theme.key] || 0) + 1;
        }
      }
      const totalThemeHits = Object.values(themeCounts).reduce((s, v) => s + v, 0);
      const themes = Object.entries(themeCounts)
        .map(([key, count]) => ({
          key,
          label: THEME_LABEL_MAP[key] ?? key,
          count,
          pct: totalThemeHits > 0 ? Math.round((count / totalThemeHits) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Aggregate claims (strengths + weaknesses)
      const strengthMap: Record<string, number> = {};
      const weaknessMap: Record<string, number> = {};
      for (const n of narratives) {
        for (const claim of n.claims) {
          const key = claim.text.toLowerCase();
          if (claim.type === "strength") {
            strengthMap[key] = (strengthMap[key] || 0) + 1;
          } else if (claim.type === "weakness") {
            weaknessMap[key] = (weaknessMap[key] || 0) + 1;
          }
        }
      }
      const strengths = Object.entries(strengthMap)
        .map(([text, count]) => ({ text, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      const weaknesses = Object.entries(weaknessMap)
        .map(([text, count]) => ({ text, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Aggregate descriptors
      const descCounts: Record<string, { polarity: "positive" | "negative" | "neutral"; count: number }> = {};
      for (const n of narratives) {
        for (const desc of n.descriptors) {
          if (!descCounts[desc.word]) {
            descCounts[desc.word] = { polarity: desc.polarity, count: 0 };
          }
          descCounts[desc.word].count += desc.count;
        }
      }
      const descriptors = Object.entries(descCounts)
        .map(([word, { polarity, count }]) => ({ word, polarity, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      competitorNarratives.push({
        entityId,
        name: comp.name,
        themes,
        strengths,
        weaknesses,
        descriptors,
      });
    }

    // Sort by mention share (most visible competitors first)
    competitorNarratives.sort((a, b) => {
      const aComp = competitors.find((c) => c.entityId === a.entityId);
      const bComp = competitors.find((c) => c.entityId === b.entityId);
      return (bComp?.mentionShare ?? 0) - (aComp?.mentionShare ?? 0);
    });

    return NextResponse.json({
      hasData: true,
      job: formatJobMeta(job!),
      competition: {
        scope: {
          totalResponses,
          modelsIncluded,
          entitiesTracked: trackedIds.length,
        },
        competitors,
        fragmentation,
        rankDistribution,
        promptMatrix,
        winLoss: { byCompetitor, topLosses },
        modelSplit,
        competitiveTrend,
        prominenceShare,
        competitiveOpportunities,
        coMentions,
        competitorNarratives,
        sentimentTrend,
      },
      totals: { totalRuns: totalResponses },
    }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : "";
    console.error("Competition API error:", message, "\n", stack);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
