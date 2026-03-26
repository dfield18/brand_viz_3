/**
 * Leaderboard metrics computation — shared by the competition API route and tests.
 *
 * Uses text-presence detection (wordBoundaryIndex) as the single source of truth
 * for ALL entities (brand and competitors alike). This ensures the leaderboard
 * never mixes different methodologies across rows.
 *
 * Pure functions — no database access.
 */

import { wordBoundaryIndex } from "@/lib/visibility/brandMention";
import {
  computeMentionShare,
  computeAvgRank,
  computeMentionRate,
} from "./computeCompetition";

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
