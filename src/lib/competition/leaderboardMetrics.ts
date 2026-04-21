/**
 * Leaderboard metrics computation — shared by the competition API route and tests.
 *
 * Uses text-presence detection (wordBoundaryIndex) as the single source of truth
 * for ALL entities (brand and competitors alike). This ensures the leaderboard
 * never mixes different methodologies across rows.
 *
 * Pure functions — no database access.
 */

import { wordBoundaryIndex } from "../visibility/brandMention";
import {
  computeMentionShare,
  computeAvgRank,
  computeMentionRate,
} from "./computeCompetition";

export { computeMentionRate };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeaderboardRun {
  text: string;
  model: string;
}

export interface LeaderboardEntity {
  entityId: string;
  name: string;
  isBrand: boolean;
}

export interface LeaderboardRow {
  entityId: string;
  name: string;
  isBrand: boolean;
  mentionRate: number;
  mentionShare: number;
  avgRank: number | null;
  rank1Rate: number;
  appearances: number;
}

// ---------------------------------------------------------------------------
// Core: compute text-order ranks
// ---------------------------------------------------------------------------

/**
 * For each run, find the text position of each entity and derive a rank array.
 * A non-null rank means the entity was textually present in that response.
 *
 * Returns a Map of entityId → rank array (one entry per run, null = absent).
 */
export function computeTextRanks(
  runs: LeaderboardRun[],
  entities: LeaderboardEntity[],
): Map<string, (number | null)[]> {
  const textRanks = new Map<string, (number | null)[]>();
  for (const e of entities) textRanks.set(e.entityId, []);

  for (const run of runs) {
    const positions: { entityId: string; pos: number }[] = [];
    for (const entity of entities) {
      const pos = wordBoundaryIndex(run.text, entity.name);
      if (pos >= 0) positions.push({ entityId: entity.entityId, pos });
    }
    positions.sort((a, b) => a.pos - b.pos);
    for (const entity of entities) {
      const idx = positions.findIndex((e) => e.entityId === entity.entityId);
      textRanks.get(entity.entityId)!.push(idx >= 0 ? idx + 1 : null);
    }
  }

  return textRanks;
}

// ---------------------------------------------------------------------------
// Derive leaderboard rows from text ranks
// ---------------------------------------------------------------------------

/**
 * Build leaderboard rows from pre-computed text ranks.
 * All entities use the same methodology: text-presence count as numerator,
 * totalResponses as denominator, sum of text mentions as SoV denominator.
 */
export function buildLeaderboardRows(
  textRanks: Map<string, (number | null)[]>,
  entities: LeaderboardEntity[],
  totalResponses: number,
): LeaderboardRow[] {
  // Derive text-mention counts
  const textMentions = new Map<string, number>();
  let totalTextMentions = 0;
  for (const [entityId, ranks] of textRanks) {
    const count = ranks.filter((r) => r !== null).length;
    textMentions.set(entityId, count);
    totalTextMentions += count;
  }

  return entities.map((entity) => {
    const ranks = textRanks.get(entity.entityId) ?? [];
    const mentions = textMentions.get(entity.entityId) ?? 0;
    const rank1Count = ranks.filter((r) => r === 1).length;
    return {
      entityId: entity.entityId,
      name: entity.name,
      isBrand: entity.isBrand,
      mentionRate: computeMentionRate(mentions, totalResponses),
      mentionShare: computeMentionShare(mentions, totalTextMentions),
      avgRank: computeAvgRank(ranks),
      rank1Rate: totalResponses > 0 ? Math.round((rank1Count / totalResponses) * 100) : 0,
      appearances: mentions,
    };
  });
}

// ---------------------------------------------------------------------------
// Per-model rows
// ---------------------------------------------------------------------------

/**
 * Build per-model leaderboard rows from text ranks + run model assignments.
 * Each model's rows use the same methodology as the main leaderboard.
 */
export function buildPerModelRows(
  textRanks: Map<string, (number | null)[]>,
  entities: LeaderboardEntity[],
  runModels: string[],
): { model: string; rows: LeaderboardRow[] }[] {
  const models = [...new Set(runModels)];

  return models.map((modelId) => {
    const modelRunIndices: number[] = [];
    for (let i = 0; i < runModels.length; i++) {
      if (runModels[i] === modelId) modelRunIndices.push(i);
    }
    const modelTotal = modelRunIndices.length;

    const modelTextRanks = new Map<string, (number | null)[]>();
    for (const entity of entities) {
      const allRanks = textRanks.get(entity.entityId) ?? [];
      modelTextRanks.set(entity.entityId, modelRunIndices.map((i) => allRanks[i]));
    }

    return {
      model: modelId,
      rows: buildLeaderboardRows(modelTextRanks, entities, modelTotal),
    };
  });
}

// ---------------------------------------------------------------------------
// Rank distribution from text ranks
// ---------------------------------------------------------------------------

/**
 * Build per-entity rank distribution from text-rank arrays.
 * Uses the same underlying ranks as the leaderboard's avgRank and rank1Rate.
 *
 * Returns: entityId → { rank: count }
 */
export function buildRankDistribution(
  textRanks: Map<string, (number | null)[]>,
): Record<string, Record<number, number>> {
  const result: Record<string, Record<number, number>> = {};
  for (const [entityId, ranks] of textRanks) {
    const dist: Record<number, number> = {};
    for (const r of ranks) {
      if (r !== null) dist[r] = (dist[r] || 0) + 1;
    }
    result[entityId] = dist;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Competitive trend point from text ranks
// ---------------------------------------------------------------------------

export interface TrendPoint {
  mentionRate: Record<string, number>;
  mentionShare: Record<string, number>;
  avgPosition: Record<string, number | null>;
  rank1Rate: Record<string, number>;
}

/**
 * Build a single trend data point from text-rank arrays for one date bucket.
 * All entities use the same methodology — no brand-only overrides.
 *
 * @param textRanks — per-entity rank arrays for runs in this date bucket
 * @param entityIds — entity IDs to include in the output
 * @param totalResponses — total runs in this date bucket (denominator)
 */
export function buildTrendPoint(
  textRanks: Map<string, (number | null)[]>,
  entityIds: string[],
  totalResponses: number,
): TrendPoint {
  // Text-mention counts
  let totalTextMentions = 0;
  const mentionCounts = new Map<string, number>();
  for (const entityId of entityIds) {
    const ranks = textRanks.get(entityId) ?? [];
    const count = ranks.filter((r) => r !== null).length;
    mentionCounts.set(entityId, count);
    totalTextMentions += count;
  }

  const mentionRate: Record<string, number> = {};
  const mentionShare: Record<string, number> = {};
  const avgPosition: Record<string, number | null> = {};
  const rank1Rate: Record<string, number> = {};

  for (const entityId of entityIds) {
    const ranks = textRanks.get(entityId) ?? [];
    const mentions = mentionCounts.get(entityId) ?? 0;
    const validRanks = ranks.filter((r): r is number => r !== null);

    mentionRate[entityId] = totalResponses > 0
      ? Math.round((mentions / totalResponses) * 10000) / 100
      : 0;
    mentionShare[entityId] = totalTextMentions > 0
      ? Math.round((mentions / totalTextMentions) * 10000) / 100
      : 0;
    avgPosition[entityId] = validRanks.length > 0
      ? Math.round((validRanks.reduce((s, r) => s + r, 0) / validRanks.length) * 10) / 10
      : null;
    const rank1Count = validRanks.filter((r) => r === 1).length;
    rank1Rate[entityId] = totalResponses > 0
      ? Math.round((rank1Count / totalResponses) * 10000) / 100
      : 0;
  }

  return { mentionRate, mentionShare, avgPosition, rank1Rate };
}

// ---------------------------------------------------------------------------
// Latest-snapshot recall (aligns with Overview/Visibility Mention Rate)
// ---------------------------------------------------------------------------

export interface SnapshotRun {
  text: string;
  model: string;
  createdAt: Date;
}

/**
 * Extract the latest-snapshot runs using the same 24h-window logic
 * as Overview and Visibility tabs.
 */
export function getLatestSnapshotRuns<T extends { createdAt: Date }>(runs: T[]): T[] {
  if (runs.length === 0) return [];
  const latestDate = runs.reduce((max, r) => (r.createdAt > max ? r.createdAt : max), new Date(0));
  const cutoff = new Date(latestDate.getTime() - 24 * 60 * 60 * 1000);
  const snapshot = runs.filter((r) => r.createdAt >= cutoff);
  return snapshot.length > 0 ? snapshot : runs;
}

/**
 * Compute latest-snapshot Mention Rate for all entities.
 * Brand uses a custom mention detector (e.g. isRunInBrandScope);
 * competitors use text-presence on the same snapshot pool.
 *
 * Returns a Map of entityId → recall percentage (0-100).
 */
export function computeSnapshotRecall(
  snapshotRuns: LeaderboardRun[],
  entities: LeaderboardEntity[],
  brandMentionCount: number,
  snapshotTotal: number,
): Map<string, number> {
  const textRanks = computeTextRanks(snapshotRuns, entities);
  const result = new Map<string, number>();
  for (const entity of entities) {
    if (entity.isBrand) {
      result.set(entity.entityId, computeMentionRate(brandMentionCount, snapshotTotal));
    } else {
      const ranks = textRanks.get(entity.entityId) ?? [];
      const mentions = ranks.filter((r) => r !== null).length;
      result.set(entity.entityId, computeMentionRate(mentions, snapshotTotal));
    }
  }
  return result;
}
