import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildEntityDisplayNames, resolveEntityName } from "@/lib/utils";
import { fetchBrandRuns, formatJobMeta } from "@/lib/apiPipeline";
import { requireBrandAccess, brandCacheControl } from "@/lib/brandAccess";
import { parseAnalysis } from "@/lib/aggregateAnalysis";
import {
  computeFragmentation,
  computeWinLoss,
  computeMentionRate,
  computeAvgRank,
  computeRank1RateAll,
} from "@/lib/competition/computeCompetition";
import { computeTextRanks, buildLeaderboardRows, buildPerModelRows, buildRankDistribution, type LeaderboardEntity } from "@/lib/competition/leaderboardMetrics";
import { computeBrandRank, wordBoundaryIndex } from "@/lib/visibility/brandMention";
import { isRunInBrandScope, filterRunsToBrandQueryUniverse, buildBrandIdentity } from "@/lib/visibility/brandScope";
import { getSovCountsForRun, getRankedEntitiesForRun } from "@/lib/visibility/rankedEntities";
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
import { isSourceOrJunkClaim } from "@/lib/narrative/textUtils";
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

type MinimalRun = { id: string; model: string; promptId: string; createdAt: Date; jobId: string; rawResponseText: string; analysisJson: unknown; narrativeJson: unknown; competitorNarrativesJson: unknown };

export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }
  const access = await requireBrandAccess(brandSlug);
  if (access) return access;

  const model = req.nextUrl.searchParams.get("model") ?? "";
  const viewRange = parseInt(req.nextUrl.searchParams.get("range") ?? "90", 10);
  const cluster = req.nextUrl.searchParams.get("cluster") ?? "";
  const promptId = req.nextUrl.searchParams.get("promptId") ?? "";

  const result = await fetchBrandRuns<MinimalRun & { prompt: { cluster: string } }>({
    brandSlug,
    model,
    viewRange,
    runQuery: { select: { id: true, model: true, promptId: true, createdAt: true, jobId: true, rawResponseText: true, analysisJson: true, narrativeJson: true, competitorNarrativesJson: true, prompt: { select: { cluster: true } } } },
  });
  if (!result.ok) return result.response;

  const { brand, job, runs: rawRuns, isAll, rangeCutoff } = result;
  const brandName = brand.displayName || brand.name;
  const brandAliases = brand.aliases?.length ? brand.aliases : undefined;
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

    // --- KPI alignment: all four metrics use isRunInBrandScope + computeBrandRank ---
    // ALL entities (brand + competitors) use isRunInBrandScope for presence detection:
    // - Non-ambiguous names: text mention alone is sufficient (identical for all entities)
    // - Ambiguous names: requires evidence (analysisJson.competitors list, 2+ mentions, etc.)
    //   Works for competitors because GPT's competitor extraction provides the evidence signal
    // - Ranking: computeBrandRank (alias-aware text-position relative to analysisJson.competitors)
    // - Run pool: raw latest-24h-snapshot industry runs (same as Overview/Visibility)
    // - SoV denominator: brand/entity mentions + analysisJson.competitors.length per run
    //
    // Win/loss and other competition-specific metrics use query-universe-filtered runs.
    const rawIndustryRuns = rawRuns.filter((r) => r.prompt.cluster === "industry");
    const rawLatestDate = rawIndustryRuns.reduce((max, r) => (r.createdAt > max ? r.createdAt : max), new Date(0));
    const rawLatestCutoff = new Date(rawLatestDate.getTime() - 24 * 60 * 60 * 1000);
    const rawLatestIndustry = rawIndustryRuns.filter((r) => r.createdAt >= rawLatestCutoff);
    const recallSnapshotRuns = rawLatestIndustry.length > 0 ? rawLatestIndustry : rawIndustryRuns;
    const recallSnapshotTotal = recallSnapshotRuns.length;

    // SoV: use getRankedEntitiesForRun to get canonical ranked entities per run.
    // This matches the scorecard/trend/by-AI-platform SoV methodology exactly.
    let sovTotalEntityMentions = 0;
    const sovEntityCounts = new Map<string, number>(); // entityId → mention count
    for (const run of recallSnapshotRuns) {
      const ranked = getRankedEntitiesForRun({
        rawResponseText: run.rawResponseText,
        analysisJson: run.analysisJson,
        brandName: brand.name,
        brandSlug: brand.slug,
        includeBrand: true,
        limit: Infinity,
      });
      sovTotalEntityMentions += ranked.length;
      const seen = new Set<string>();
      for (const entity of ranked) {
        if (seen.has(entity.canonicalId)) continue;
        seen.add(entity.canonicalId);
        sovEntityCounts.set(entity.canonicalId, (sovEntityCounts.get(entity.canonicalId) ?? 0) + 1);
      }
    }

    // Compute mentionRate, mentionShare, rank1Rate, avgRank for every entity
    for (const comp of competitors) {
      const entityIdentity: import("@/lib/visibility/brandScope").BrandScopeIdentity = {
        brandName: comp.name,
        brandSlug: comp.entityId,
      };
      const identity = comp.isBrand ? brandIdentity : entityIdentity;
      const rankName = comp.isBrand ? brand.name : comp.name;
      const rankSlug = comp.isBrand ? brand.slug : comp.entityId;
      const rankAliases = comp.isBrand ? brandAliases : undefined;

      let entityMentions = 0;
      const entityRanks: (number | null)[] = [];
      for (const run of recallSnapshotRuns) {
        const mentioned = isRunInBrandScope(run, identity);
        const rank = computeBrandRank(run.rawResponseText, rankName, rankSlug, run.analysisJson, rankAliases);
        if (mentioned) entityMentions++;
        entityRanks.push(rank);
      }

      comp.mentionRate = computeMentionRate(entityMentions, recallSnapshotTotal);
      // SoV numerator: entity-mention count from ranked entities (matches scorecard methodology)
      const entitySovCount = sovEntityCounts.get(comp.entityId) ?? 0;
      comp.mentionShare = sovTotalEntityMentions > 0
        ? Math.round((entitySovCount / sovTotalEntityMentions) * 10000) / 100
        : 0;
      comp.rank1Rate = computeRank1RateAll(entityRanks);
      comp.avgRank = computeAvgRank(entityRanks);
    }

    // --- Per-entity sentiment (latest 24h snapshot — matches mention rate) ---
    const snapshotRunIdSet = new Set(recallSnapshotRuns.map((r) => r.id));
    // Build runId→rawResponseText map and cache split sentences
    const runTextMap = new Map<string, string>();
    for (const run of recallSnapshotRuns) {
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
      // Filter to latest 24h snapshot so sentiment matches mention rate time window
      const entityMetrics = (byEntity.get(comp.entityId) ?? []).filter((m) => snapshotRunIdSet.has(m.runId));
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

    // Override brand sentiment with narrativeJson labels (latest 24h snapshot)
    const brandComp = competitors.find((c) => c.isBrand);
    if (brandComp) {
      let bPos = 0, bNeu = 0, bNeg = 0;
      for (const run of recallSnapshotRuns) {
        const nj = run.narrativeJson as Record<string, unknown> | null;
        if (!nj) continue;
        const sent = nj.sentiment as { label?: string } | undefined;
        if (!sent?.label) continue;
        if (sent.label === "POS") bPos++;
        else if (sent.label === "NEG") bNeg++;
        else bNeu++;
      }
      const bTotal = bPos + bNeu + bNeg;
      if (bTotal > 0) {
        const pctPos = Math.round((bPos / bTotal) * 100);
        const pctNeg = Math.round((bNeg / bTotal) * 100);
        const pctNeu = Math.round((bNeu / bTotal) * 100);
        // Use same 60/40/40/50 thresholds as Overview/Narrative
        let label: "Strong" | "Positive" | "Neutral" | "Conditional" | "Negative";
        if (pctPos >= 60) label = "Strong";
        else if (pctPos >= 40) label = "Positive";
        else if (pctNeg >= 40) label = "Negative";
        else if (pctNeu >= 50) label = "Neutral";
        else label = "Conditional";
        brandComp.avgSentiment = label;
        brandComp.sentimentScore = Math.round(((bPos - bNeg) / bTotal) * 100) / 100;
        brandComp.sentimentDist = { Strong: 0, Positive: bPos, Neutral: bNeu, Conditional: 0, Negative: bNeg };
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

    // Win/Loss — uses latest 24h snapshot (same as scorecard metrics)
    const snapshotRunIds = new Set(recallSnapshotRuns.map((r) => r.id));
    const brandMetricsByRun = new Map<string, Metric>();
    for (const m of brandMetrics) {
      if (!snapshotRunIds.has(m.runId)) continue;
      brandMetricsByRun.set(m.runId, m);
    }

    const winLossMap = new Map<string, { wins: number; losses: number }>();
    const allLosses: TopLoss[] = [];

    // Compute win/loss against ALL entities (not just top competitors)
    // so topLosses and byCompetitor are consistent
    for (const [competitorId, entityMetrics] of byEntity) {
      if (competitorId === brand.slug) continue;
      const competitorMetrics = entityMetrics.filter((m) => snapshotRunIds.has(m.runId));
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

    // Model Split — per-model KPIs use same unified methodology as main leaderboard
    const runModels = runs.map((r) => r.model);
    const perModelResults = buildPerModelRows(textRanksByEntity, leaderboardEntities, runModels);

    // Override per-model metrics using isBrandMentioned/computeBrandRank for ALL entities
    type PerModelSnapshot = { mentionRate: number; mentionShare: number; rank1Rate: number; avgRank: number | null };
    const modelsInSnapshot = [...new Set(recallSnapshotRuns.map((r) => r.model))];
    const snapshotByModel = new Map<string, Map<string, PerModelSnapshot>>();
    for (const m of modelsInSnapshot) {
      const modelRuns = recallSnapshotRuns.filter((r) => r.model === m);
      const modelTotal = modelRuns.length;
      // SoV denominator: canonical ranked entities (same as CSV export)
      let modelSovTotal = 0;
      for (const run of modelRuns) {
        const counts = getSovCountsForRun({
          rawResponseText: run.rawResponseText,
          analysisJson: run.analysisJson,
          brandName: brand.name,
          brandSlug: brand.slug,
        });
        modelSovTotal += counts.totalMentions;
      }
      const modelMap = new Map<string, PerModelSnapshot>();
      for (const entity of leaderboardEntities) {
        const entityIdentity: import("@/lib/visibility/brandScope").BrandScopeIdentity = {
          brandName: entity.name,
          brandSlug: entity.entityId,
        };
        const identity = entity.isBrand ? brandIdentity : entityIdentity;
        const rankName = entity.isBrand ? brand.name : entity.name;
        const rankSlug = entity.isBrand ? brand.slug : entity.entityId;
        const rankAliases = entity.isBrand ? brandAliases : undefined;

        let entityMentions = 0;
        const entityRanks: (number | null)[] = [];
        for (const run of modelRuns) {
          const mentioned = isRunInBrandScope(run, identity);
          const rank = computeBrandRank(run.rawResponseText, rankName, rankSlug, run.analysisJson, rankAliases);
          if (mentioned) entityMentions++;
          entityRanks.push(rank);
        }
        modelMap.set(entity.entityId, {
          mentionRate: computeMentionRate(entityMentions, modelTotal),
          mentionShare: modelSovTotal > 0 ? Math.round((entityMentions / modelSovTotal) * 10000) / 100 : 0,
          rank1Rate: computeRank1RateAll(entityRanks),
          avgRank: computeAvgRank(entityRanks),
        });
      }
      snapshotByModel.set(m, modelMap);
    }

    const modelSplit: ModelSplitRow[] = perModelResults.map(({ model: m, rows }) => ({
      model: m,
      competitors: rows.map((row) => {
        const snapshot = snapshotByModel.get(m)?.get(row.entityId);
        return snapshot ? { ...row, ...snapshot } : row;
      }),
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

    // --- Co-Mention Pairs (latest 24h snapshot) ---
    const entityRunSets = new Map<string, Set<string>>();
    for (const entityId of trackedIds) {
      const ms = (byEntity.get(entityId) ?? []).filter((m) => snapshotRunIds.has(m.runId));
      entityRunSets.set(entityId, new Set(ms.map((m) => m.runId)));
    }

    // Directional co-mentions: A→B = coCount / appearances(A)
    // Emits two entries per pair so the heatmap can show asymmetric rates
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
          // A→B: "of A's appearances, what % also mention B?"
          coMentions.push({
            entityA: a,
            entityB: b,
            coMentionCount: count,
            coMentionRate: setA.size > 0 ? Math.round((count / setA.size) * 100) : 0,
          });
          // B→A: "of B's appearances, what % also mention A?"
          coMentions.push({
            entityA: b,
            entityB: a,
            coMentionCount: count,
            coMentionRate: setB.size > 0 ? Math.round((count / setB.size) * 100) : 0,
          });
        }
      }
    }

    // --- Competitive Trend: cumulative "latest per model+prompt as of date" ---
    // Matches Visibility trend methodology: each date point uses the latest
    // available run per model+prompt up to that date, not raw runs from that date.
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

    // Fetch industry trend runs with promptId + createdAt for model+prompt deduplication
    const trendJobIds = allTrendJobs.filter((j) => j.finishedAt).map((j) => j.id);
    const rawTrendRuns = trendJobIds.length > 0
      ? await prisma.run.findMany({
          where: { jobId: { in: trendJobIds }, prompt: { cluster: "industry" } },
          select: { id: true, jobId: true, promptId: true, createdAt: true, rawResponseText: true, analysisJson: true, model: true },
        })
      : [];

    // Build cumulative as-of-date deduped snapshots (same as Visibility trend)
    // For each date, keep the latest run per model+prompt seen up to that date.
    const trendDates = [...new Set(
      allTrendJobs.filter((j) => j.finishedAt).map((j) => j.finishedAt!.toISOString().slice(0, 10)),
    )].sort();

    // Index runs by model+prompt key, sorted by createdAt asc
    type TrendRun = (typeof rawTrendRuns)[number];
    const trendRunsByKey = new Map<string, { date: string; run: TrendRun }[]>();
    for (const r of rawTrendRuns) {
      const tj = allTrendJobs.find((j) => j.id === r.jobId);
      if (!tj?.finishedAt) continue;
      const date = tj.finishedAt.toISOString().slice(0, 10);
      const key = `${r.model}|${r.promptId}`;
      const list = trendRunsByKey.get(key) ?? [];
      list.push({ date, run: r });
      trendRunsByKey.set(key, list);
    }
    for (const [, list] of trendRunsByKey) {
      list.sort((a, b) => a.run.createdAt.getTime() - b.run.createdAt.getTime());
    }

    // Walk dates in order, maintaining a running map of latest run per key
    const latestByKey = new Map<string, TrendRun>();
    const keyPointers = new Map<string, number>();
    for (const key of trendRunsByKey.keys()) keyPointers.set(key, 0);

    const dedupedTrendByDate = new Map<string, TrendRun[]>();
    for (const date of trendDates) {
      // Advance pointers: absorb runs whose date <= current date
      for (const [key, list] of trendRunsByKey) {
        let ptr = keyPointers.get(key) ?? 0;
        while (ptr < list.length && list[ptr].date <= date) {
          latestByKey.set(key, list[ptr].run);
          ptr++;
        }
        keyPointers.set(key, ptr);
      }
      dedupedTrendByDate.set(date, [...latestByKey.values()]);
    }

    // Build trend points from deduped as-of-date snapshots.
    // ALL entities use getRankedEntitiesForRun for SoV — same methodology as snapshot leaderboard.
    const competitiveTrend: CompetitiveTrendPoint[] = [];
    for (const [date, dateRuns] of [...dedupedTrendByDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const dateTotal = dateRuns.length;
      // Build per-entity SoV counts from ranked entities (matches snapshot methodology)
      let dateSovTotal = 0;
      const dateSovEntityCounts = new Map<string, number>();
      for (const r of dateRuns) {
        const ranked = getRankedEntitiesForRun({
          rawResponseText: r.rawResponseText,
          analysisJson: r.analysisJson,
          brandName: brand.name,
          brandSlug: brand.slug,
          includeBrand: true,
          limit: Infinity,
        });
        dateSovTotal += ranked.length;
        const seen = new Set<string>();
        for (const entity of ranked) {
          if (seen.has(entity.canonicalId)) continue;
          seen.add(entity.canonicalId);
          dateSovEntityCounts.set(entity.canonicalId, (dateSovEntityCounts.get(entity.canonicalId) ?? 0) + 1);
        }
      }

      const mentionRate: Record<string, number> = {};
      const mentionShare: Record<string, number> = {};
      const avgPosition: Record<string, number | null> = {};
      const rank1Rate: Record<string, number> = {};

      for (const entityId of trendEntityIds) {
        const entity = leaderboardEntities.find((e) => e.entityId === entityId);
        if (!entity) continue;
        const identity: import("@/lib/visibility/brandScope").BrandScopeIdentity = entity.isBrand
          ? brandIdentity
          : { brandName: entity.name, brandSlug: entity.entityId };
        const rankName = entity.isBrand ? brand.name : entity.name;
        const rankSlug = entity.isBrand ? brand.slug : entity.entityId;
        const rankAliases = entity.isBrand ? brandAliases : undefined;

        let entityMentions = 0;
        const entityRanks: (number | null)[] = [];
        for (const run of dateRuns) {
          const mentioned = isRunInBrandScope(run, identity);
          const rank = computeBrandRank(run.rawResponseText, rankName, rankSlug, run.analysisJson, rankAliases);
          if (mentioned) entityMentions++;
          entityRanks.push(rank);
        }
        mentionRate[entityId] = dateTotal > 0
          ? Math.round((entityMentions / dateTotal) * 10000) / 100 : 0;
        // SoV numerator: entity-mention count from ranked entities (matches snapshot)
        const entitySovCount = dateSovEntityCounts.get(entityId) ?? 0;
        mentionShare[entityId] = dateSovTotal > 0
          ? Math.round((entitySovCount / dateSovTotal) * 10000) / 100 : 0;
        rank1Rate[entityId] = computeRank1RateAll(entityRanks);
        avgPosition[entityId] = computeAvgRank(entityRanks);
      }

      competitiveTrend.push({ date, mentionRate, mentionShare, avgPosition, rank1Rate });
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
    const rawTrendRunIds = new Set(rawTrendRuns.map((r) => r.id));
    const scopedTrendMetrics = allTrendMetrics.filter((m: { runId: string }) => rawTrendRunIds.has(m.runId));

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

    // Build per-entity, per-date sentiment scores using cumulative-deduped runs
    // (matches the visibility/competition trend methodology)
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

    // Build a set of entity IDs per run from trend metrics for quick lookup
    const trendMetricsByRun = new Map<string, Set<string>>();
    for (const m of scopedTrendMetrics) {
      if (!trendEntitySet.has(m.entityId)) continue;
      if (!trendMetricsByRun.has(m.runId)) trendMetricsByRun.set(m.runId, new Set());
      trendMetricsByRun.get(m.runId)!.add(m.entityId);
    }

    const sentimentTrend: CompetitiveSentimentTrendPoint[] = [];
    for (const [date, dateRuns] of [...dedupedTrendByDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const sentiment: Record<string, number> = {};

      // Per-entity sentiment from the cumulative-deduped runs for this date
      for (const entityId of trendEntityIds) {
        const comp = competitors.find((c) => c.entityId === entityId);
        if (!comp) continue;

        let posCount = 0;
        let count = 0;
        for (const run of dateRuns) {
          // Only score runs where this entity appears (per EntityResponseMetric)
          const runEntities = trendMetricsByRun.get(run.id);
          if (!runEntities?.has(entityId)) continue;

          const text = trendRunTextMap.get(run.id);
          if (!text) continue;

          const sentences = getTrendSentences(run.id);
          const context = getEntityContextWindow(sentences, comp.name, comp.entityId);
          if (context.length === 0) continue;

          const contextText = context.join(" ");
          const authority = countSignalHits(contextText, AUTHORITY_SIGNALS);
          const trust = countSignalHits(contextText, TRUST_SIGNALS);
          const weakness = countSignalHits(contextText, WEAKNESS_SIGNALS);
          const posSignals = authority + trust;
          const negSignals = weakness;
          const total = Math.max(1, posSignals + negSignals);
          const score = (posSignals - negSignals) / total;
          const isPositive = score >= 0.15;

          count++;
          if (isPositive) posCount++;
        }

        if (count > 0) {
          sentiment[entityId] = Math.round((posCount / count) * 100);
        }
      }

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

    // Build entityId → set of runIds where entity appears (latest 24h snapshot)
    const entityRunIds = new Map<string, Set<string>>();
    for (const m of metrics) {
      if (!snapshotRunIds.has(m.runId)) continue;
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
          if (isSourceOrJunkClaim(claim.text)) continue;
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
      headers: { "Cache-Control": brandCacheControl(brandSlug) },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : "";
    console.error("Competition API error:", message, "\n", stack);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
