import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { titleCase, buildEntityDisplayNames, resolveEntityName } from "@/lib/utils";
import { fetchBrandRuns, formatJobMeta } from "@/lib/apiPipeline";
import { parseAnalysis } from "@/lib/aggregateAnalysis";
import {
  computeFragmentation,
  computeWinLoss,
  computeMentionRate,
} from "@/lib/competition/computeCompetition";
import { computeTextRanks, buildLeaderboardRows, buildPerModelRows, buildRankDistribution, buildTrendPoint, type LeaderboardEntity, type LeaderboardRun } from "@/lib/competition/leaderboardMetrics";
import { wordBoundaryIndex } from "@/lib/visibility/brandMention";
import { isRunInBrandScope, filterRunsToBrandQueryUniverse, buildBrandIdentity } from "@/lib/visibility/brandScope";
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

import type { NarrativeExtractionResult } from "@/lib/narrative/extractNarrative";
import { normalizeEntityIds, mergeEntityMetrics } from "@/lib/competition/normalizeEntities";
import { validateCompetitors } from "@/lib/validateCompetitors";
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

  const { brand, job, runs: rawRuns, isAll, rangeCutoff } = result;
  const brandName = brand.displayName || brand.name;
  const brandIdentity = buildBrandIdentity(brand);
  // Filter to query universe first (removes ambiguous false positives),
  // then apply cluster/prompt selection
  const queryUniverseRuns = filterRunsToBrandQueryUniverse(rawRuns, brandIdentity);
  const runs = promptId
    ? queryUniverseRuns.filter((r) => r.promptId === promptId)
    : cluster && cluster !== "all"
      ? queryUniverseRuns.filter((r) => r.prompt.cluster === cluster)
      : queryUniverseRuns.filter((r) => r.prompt.cluster === "industry");

  try {
    // Build display name map from original GPT-extracted competitor names
    const entityDisplayNames = buildEntityDisplayNames(runs);
    // Ensure the searched brand uses its proper display name
    entityDisplayNames.set(brand.slug, brandName);

    const runIds = runs.map((r) => r.id);
    const totalResponses = runIds.length;

    if (totalResponses === 0) {
      return NextResponse.json({ hasData: false, reason: "no_runs_in_range" });
    }

    // Bulk query EntityResponseMetric for entity detection
    const rawMetrics = await prisma.entityResponseMetric.findMany({
      where: { runId: { in: runIds } },
      select: {
        runId: true,
        entityId: true,
        model: true,
        promptId: true,
        rankPosition: true,
      },
    });

    // Recompute rankPosition using text-order (first mentioned = #1) for consistency
    // Build a map of runId → text-order ranks for all entities in that run
    const runTextRanks = new Map<string, Map<string, number>>();
    for (const run of runs) {
      const entitiesInRun = rawMetrics.filter((m: { runId: string }) => m.runId === run.id);
      if (entitiesInRun.length === 0) continue;
      const positions: { entityId: string; pos: number }[] = [];
      for (const m of entitiesInRun) {
        const name = m.entityId === brand.slug ? brand.name : resolveEntityName(m.entityId, entityDisplayNames);
        const pos = wordBoundaryIndex(run.rawResponseText, name);
        if (pos >= 0) positions.push({ entityId: m.entityId, pos });
      }
      positions.sort((a, b) => a.pos - b.pos);
      const rankMap = new Map<string, number>();
      positions.forEach((p, i) => rankMap.set(p.entityId, i + 1));
      runTextRanks.set(run.id, rankMap);
    }

    // Replace prominence-based rankPosition with text-order rank
    const metrics = rawMetrics.map((m) => ({
      ...m,
      rankPosition: runTextRanks.get(m.runId)?.get(m.entityId) ?? null,
    }));

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

    // Propagate display names to canonical IDs after normalization
    for (const [entityId, canonical] of aliasMap) {
      if (entityId !== canonical && !entityDisplayNames.has(canonical)) {
        const aliasName = entityDisplayNames.get(entityId);
        if (aliasName) entityDisplayNames.set(canonical, aliasName);
      }
    }

    // Find brand entity metrics
    const brandMetrics = byEntity.get(brand.slug) ?? [];
    const brandRunIds = new Set(brandMetrics.map((m) => m.runId));

    // Auto-discover competitors: top N by total appearances (not just co-occurrence with brand)
    // This ensures competitors are shown even when the brand has low mention rate
    const cooccurrence: { entityId: string; count: number }[] = [];
    for (const [entityId, entityMetrics] of byEntity) {
      if (entityId === brand.slug) continue;
      cooccurrence.push({ entityId, count: entityMetrics.length });
    }
    cooccurrence.sort((a, b) => b.count - a.count);
    // Take extra candidates so we still have enough after filtering unrelated ones
    const candidateIds = cooccurrence.slice(0, TOP_COMPETITORS * 2).map((c) => c.entityId);

    // Validate that candidates are in the same industry/category as the brand
    const relatedSet = await validateCompetitors(
      candidateIds.map((id) => resolveEntityName(id, entityDisplayNames)),
      brandName,
    );
    const relatedLower = new Set([...relatedSet].map((n) => n.toLowerCase()));
    const topCompetitorIds = candidateIds
      .filter((id) => relatedLower.has(id.toLowerCase()) || relatedSet.has(resolveEntityName(id, entityDisplayNames)))
      .slice(0, TOP_COMPETITORS);

    // Tracked set = brand + top competitors
    const trackedIds = [brand.slug, ...topCompetitorIds];
    const trackedSet = new Set(trackedIds);

    // Build leaderboard entities list for the shared helper
    const leaderboardEntities: LeaderboardEntity[] = trackedIds.map((entityId) => ({
      entityId,
      name: entityId === brand.slug ? brandName : resolveEntityName(entityId, entityDisplayNames),
      isBrand: entityId === brand.slug,
    }));

    // Compute text-order ranks across full range for SoV, avgRank, rank1Rate, win/loss.
    const leaderboardRuns = runs.map((r) => ({ text: r.rawResponseText, model: r.model }));
    const textRanksByEntity = computeTextRanks(leaderboardRuns, leaderboardEntities);
    const competitors: CompetitorRow[] = buildLeaderboardRows(
      textRanksByEntity, leaderboardEntities, totalResponses,
    );

    // --- Brand Recall (mentionRate): latest-snapshot, matching Overview/Visibility ---
    // Uses the same 24h-window snapshot and isRunInBrandScope for the brand.
    // Competitors use text-presence on the same latest-snapshot runs.
    // This ensures the "Brand Recall" column matches across all tabs.
    const latestRunDate = runs.reduce((max, r) => (r.createdAt > max ? r.createdAt : max), new Date(0));
    const latestCutoff = new Date(latestRunDate.getTime() - 24 * 60 * 60 * 1000);
    const latestSnapshotRuns = runs.filter((r) => r.createdAt >= latestCutoff);
    const snapshotRuns = latestSnapshotRuns.length > 0 ? latestSnapshotRuns : runs;
    const snapshotTotal = snapshotRuns.length;

    // Brand recall: isRunInBrandScope (same as Overview/Visibility)
    const brandSnapshotMentions = snapshotRuns.filter((r) => isRunInBrandScope(r, brandIdentity)).length;

    // Competitor recall: text-presence on latest-snapshot runs
    const snapshotLeaderboardRuns: LeaderboardRun[] = snapshotRuns.map((r) => ({ text: r.rawResponseText, model: r.model }));
    const snapshotTextRanks = computeTextRanks(snapshotLeaderboardRuns, leaderboardEntities);

    // Override mentionRate on all rows with latest-snapshot recall
    for (const comp of competitors) {
      if (comp.isBrand) {
        comp.mentionRate = computeMentionRate(brandSnapshotMentions, snapshotTotal);
      } else {
        const ranks = snapshotTextRanks.get(comp.entityId) ?? [];
        const mentions = ranks.filter((r) => r !== null).length;
        comp.mentionRate = computeMentionRate(mentions, snapshotTotal);
      }
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
      const entityMetrics = byEntity.get(comp.entityId) ?? [];
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

    // Rank Distribution: derived from text-rank arrays (same basis as leaderboard)
    const rankDistribution = buildRankDistribution(textRanksByEntity);

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
      const entities: Record<string, { rank: number | null }> = {};
      for (const m of runMetrics) {
        entities[m.entityId] = {
          rank: m.rankPosition,
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
      brandMetricsByRun.set(m.runId, m);
    }

    const winLossMap = new Map<string, { wins: number; losses: number }>();
    const allLosses: TopLoss[] = [];

    // Compute win/loss against ALL entities (not just top competitors)
    // so topLosses and byCompetitor are consistent
    for (const [competitorId, entityMetrics] of byEntity) {
      if (competitorId === brand.slug) continue;
      const competitorMetrics = entityMetrics;
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
              competitorName: resolveEntityName(competitorId, entityDisplayNames),
              competitorRank: cm.rankPosition,
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
          name: resolveEntityName(id, entityDisplayNames),
          wins: wl.wins,
          losses: wl.losses,
          lossRate: total > 0 ? Math.round((wl.losses / total) * 100) : 0,
        };
      })
      .sort((a, b) => b.losses - a.losses);

    allLosses.sort((a, b) => (a.competitorRank ?? Infinity) - (b.competitorRank ?? Infinity));
    const topLosses = allLosses.slice(0, MAX_TOP_LOSSES);

    // Model Split — full-range text-rank for SoV/avgRank/rank1Rate,
    // latest-snapshot recall for mentionRate (same as main leaderboard)
    const runModels = runs.map((r) => r.model);
    const perModelResults = buildPerModelRows(textRanksByEntity, leaderboardEntities, runModels);

    // Override per-model mentionRate with latest-snapshot recall
    const snapshotRunModels = snapshotRuns.map((r) => r.model);
    const snapshotPerModel = buildPerModelRows(snapshotTextRanks, leaderboardEntities, snapshotRunModels);
    const snapshotRecallByModel = new Map<string, Map<string, number>>();
    for (const { model: m, rows } of snapshotPerModel) {
      const modelMap = new Map<string, number>();
      const modelSnapshotRuns = snapshotRuns.filter((r) => r.model === m);
      const modelSnapshotTotal = modelSnapshotRuns.length;
      for (const row of rows) {
        if (row.isBrand) {
          const brandModelMentions = modelSnapshotRuns.filter((r) => isRunInBrandScope(r, brandIdentity)).length;
          modelMap.set(row.entityId, computeMentionRate(brandModelMentions, modelSnapshotTotal));
        } else {
          modelMap.set(row.entityId, row.mentionRate);
        }
      }
      snapshotRecallByModel.set(m, modelMap);
    }

    const modelSplit: ModelSplitRow[] = perModelResults.map(({ model: m, rows }) => ({
      model: m,
      competitors: rows.map((row) => ({
        ...row,
        mentionRate: snapshotRecallByModel.get(m)?.get(row.entityId) ?? row.mentionRate,
      })),
    }));

    // --- Prominence Share (now uses mentionShare) ---
    const prominenceShare: ProminenceShareRow[] = trackedIds.map((entityId) => {
      const comp = competitors.find((c) => c.entityId === entityId)!;
      return {
        entityId,
        name: comp.name,
        isBrand: comp.isBrand,
        mentionShare: comp.mentionShare,
      };
    });

    // --- Competitive Opportunities ---
    const opportunities: CompetitiveOpportunity[] = [];
    for (const row of matrixRows) {
      const brandCell = row.entities[brand.slug];
      const brandAbsent = !brandCell;
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
      const rawScore = (1 / topCompRank) * (brandAbsent ? 1.5 : 1.0);
      opportunities.push({
        promptText: row.promptText,
        cluster: row.cluster,
        intent: row.intent,
        model: row.model,
        brandRank: brandCell?.rank ?? null,
        topCompetitor: resolveEntityName(topCompId, entityDisplayNames),
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
      const ms = byEntity.get(entityId) ?? [];
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

    // --- Competitive Trend: uses same text-rank methodology as leaderboard ---
    // All entities (brand + competitors) computed identically per date bucket.
    const trendJobWhere = isAll
      ? { brandId: brand.id, status: "done" as const, finishedAt: { gte: rangeCutoff } }
      : { brandId: brand.id, model, status: "done" as const, finishedAt: { gte: rangeCutoff } };
    const allTrendJobs = await prisma.job.findMany({
      where: trendJobWhere,
      orderBy: { finishedAt: "asc" },
      select: { id: true, finishedAt: true },
    });

    // All tracked entities get trend lines
    const trendEntityIds = competitors
      .sort((a, b) => b.mentionShare - a.mentionShare)
      .map((c) => c.entityId);
    const trendEntitySet = new Set(trendEntityIds);

    // Fetch industry trend runs with response text for text-rank computation
    const trendJobIds = allTrendJobs.filter((j) => j.finishedAt).map((j) => j.id);
    const rawTrendRuns = trendJobIds.length > 0
      ? await prisma.run.findMany({
          where: { jobId: { in: trendJobIds }, prompt: { cluster: "industry" } },
          select: { id: true, jobId: true, rawResponseText: true, analysisJson: true, model: true },
        })
      : [];

    // Scope-filter trend runs (removes ambiguous false positives)
    const scopedTrendRuns = filterRunsToBrandQueryUniverse(rawTrendRuns, brandIdentity);

    // Group scoped trend runs by date
    const trendRunsByDate = new Map<string, typeof scopedTrendRuns>();
    for (const r of scopedTrendRuns) {
      const tj = allTrendJobs.find((j) => j.id === r.jobId);
      if (!tj?.finishedAt) continue;
      const date = tj.finishedAt.toISOString().slice(0, 10);
      if (!trendRunsByDate.has(date)) trendRunsByDate.set(date, []);
      trendRunsByDate.get(date)!.push(r);
    }

    // Build trend points: competitors use text-presence, brand uses isRunInBrandScope
    // (matches Overview/Visibility brand-recall definition per date bucket)
    const competitiveTrend: CompetitiveTrendPoint[] = [];
    for (const [date, dateRuns] of [...trendRunsByDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const trendLeaderboardRuns: LeaderboardRun[] = dateRuns.map((r) => ({ text: r.rawResponseText, model: r.model }));
      const dateTextRanks = computeTextRanks(trendLeaderboardRuns, leaderboardEntities);
      const point = buildTrendPoint(dateTextRanks, trendEntityIds, dateRuns.length);
      // Override brand mentionRate with isRunInBrandScope (same as Overview/Visibility)
      const brandDateMentions = dateRuns.filter((r) => isRunInBrandScope(r, brandIdentity)).length;
      point.mentionRate[brand.slug] = dateRuns.length > 0
        ? Math.round((brandDateMentions / dateRuns.length) * 10000) / 100
        : 0;
      competitiveTrend.push({ date, ...point });
    }

    // Ensure the trend spans the full selected range by adding anchor points
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

    // Fetch entity metrics for sentiment trend (needs entity-run mapping for context windows)
    const allTrendMetrics = trendJobIds.length > 0
      ? await prisma.entityResponseMetric.findMany({
          where: {
            run: {
              jobId: { in: trendJobIds },
              prompt: { cluster: "industry" },
            },
          },
          select: { runId: true, entityId: true, rankPosition: true, run: { select: { jobId: true } } },
        })
      : [];
    const scopedTrendRunIds = new Set(scopedTrendRuns.map((r) => r.id));
    const scopedTrendMetrics = allTrendMetrics.filter((m: { runId: string }) => scopedTrendRunIds.has(m.runId));

    // --- Sentiment Trend: per-entity sentiment score per date ---
    // Uses entity-metric presence to find context windows for signal scoring
    const sentimentTrendRunIds = new Set<string>();
    for (const m of scopedTrendMetrics) {
      if (trendEntitySet.has(m.entityId)) {
        sentimentTrendRunIds.add(m.runId);
      }
    }
    const scopedSentimentRuns = sentimentTrendRunIds.size > 0
      ? await prisma.run.findMany({
          where: { id: { in: [...sentimentTrendRunIds] } },
          select: { id: true, rawResponseText: true, jobId: true },
        })
      : [];
    const trendRunTextMap = new Map<string, string>();
    for (const r of scopedSentimentRuns) trendRunTextMap.set(r.id, r.rawResponseText);

    // Map runId → jobId for date lookup (scoped runs only)
    const runJobMap = new Map<string, string>();
    for (const r of scopedSentimentRuns) runJobMap.set(r.id, r.jobId);
    const jobDateMap = new Map<string, string>();
    for (const tj of allTrendJobs) {
      if (tj.finishedAt) jobDateMap.set(tj.id, tj.finishedAt.toISOString().slice(0, 10));
    }

    // Build per-entity, per-date sentiment scores
    type SentimentBucket = { posCount: number; count: number };
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

    for (const m of scopedTrendMetrics) {
      if (!trendEntitySet.has(m.entityId)) continue;
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
      // Count as "positive" if signal score maps to Strong or Positive (>= 0.15)
      const isPositive = score >= 0.15;

      if (!sentimentByDateEntity.has(date)) sentimentByDateEntity.set(date, new Map());
      const dateMap = sentimentByDateEntity.get(date)!;
      if (!dateMap.has(m.entityId)) dateMap.set(m.entityId, { posCount: 0, count: 0 });
      const bucket = dateMap.get(m.entityId)!;
      bucket.count++;
      if (isPositive) bucket.posCount++;
    }

    const sentimentTrend: CompetitiveSentimentTrendPoint[] = [];
    for (const [date] of [...trendRunsByDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const dateMap = sentimentByDateEntity.get(date);
      const sentiment: Record<string, number> = {};
      for (const entityId of trendEntityIds) {
        const bucket = dateMap?.get(entityId);
        if (bucket && bucket.count > 0) {
          sentiment[entityId] = Math.round((bucket.posCount / bucket.count) * 100);
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

    // --- Competitor Narratives: use dynamic frames from analysisJson (same as overview/narrative tabs) ---
    const STRENGTH_THRESHOLD = 20;

    // Build runId → parsed frames map
    const runAnalysisMap = new Map<string, { name: string; strength: number }[]>();
    for (const run of runs) {
      const parsed = parseAnalysis(run.analysisJson);
      if (parsed && parsed.frames.length > 0) {
        runAnalysisMap.set(run.id, parsed.frames);
      }
    }

    // Build entityId → set of runIds where entity appears
    const entityRunIds = new Map<string, Set<string>>();
    for (const m of metrics) {
      const entityId = aliasMap.get(m.entityId) ?? m.entityId;
      if (!trackedSet.has(entityId) || entityId === brand.slug) continue;
      const set = entityRunIds.get(entityId) ?? new Set<string>();
      set.add(m.runId);
      entityRunIds.set(entityId, set);
    }

    // Also aggregate claims/descriptors from competitorNarrativesJson (kept for strengths/weaknesses)
    const compNarrativesByEntity = new Map<string, NarrativeExtractionResult[]>();
    for (const run of runs) {
      const json = run.competitorNarrativesJson as Record<string, NarrativeExtractionResult> | null;
      if (!json) continue;
      for (const [rawEntityId, narrative] of Object.entries(json)) {
        const entityId = aliasMap.get(rawEntityId) ?? rawEntityId;
        if (!trackedSet.has(entityId) || entityId === brand.slug) continue;
        const arr = compNarrativesByEntity.get(entityId) ?? [];
        arr.push(narrative);
        compNarrativesByEntity.set(entityId, arr);
      }
    }

    const competitorNarratives: CompetitorNarrative[] = [];
    for (const entityId of trackedIds) {
      if (entityId === brand.slug) continue;
      const comp = competitors.find((c) => c.entityId === entityId);
      if (!comp) continue;

      // Dynamic frames: count frame frequencies across runs where this entity appears
      const eRunIds = entityRunIds.get(entityId);
      const frameCounts: Record<string, number> = {};
      let entityRunCount = 0;
      if (eRunIds) {
        for (const runId of eRunIds) {
          const frames = runAnalysisMap.get(runId);
          if (!frames) continue;
          entityRunCount++;
          for (const f of frames) {
            if (f.strength >= STRENGTH_THRESHOLD) {
              frameCounts[f.name] = (frameCounts[f.name] ?? 0) + 1;
            }
          }
        }
      }
      const themes = Object.entries(frameCounts)
        .map(([name, count]) => ({
          key: name,
          label: name,
          count,
          pct: entityRunCount > 0 ? Math.round((count / entityRunCount) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Strengths, weaknesses, descriptors from competitorNarrativesJson
      const narratives = compNarrativesByEntity.get(entityId) ?? [];
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

      // Collect sample run IDs where this competitor appears (for click-through)
      const eRunIdSet = entityRunIds.get(entityId);
      const sampleRunIds = eRunIdSet ? [...eRunIdSet].slice(0, 5) : [];

      competitorNarratives.push({
        entityId,
        name: comp.name,
        themes,
        strengths,
        weaknesses,
        descriptors,
        sampleRunIds,
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
