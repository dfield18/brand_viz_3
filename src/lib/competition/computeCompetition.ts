/**
 * Pure computation functions for competition metrics.
 * No database access — all functions take data in, return results out.
 */

// ---------------------------------------------------------------------------
// Rank assignment
// ---------------------------------------------------------------------------

export interface RankInput {
  entityId: string;
  prominenceScore: number;
}

export interface RankResult {
  entityId: string;
  rankPosition: number;
  normalizedRankScore: number;
  competitorsInResponse: number;
}

/**
 * Assign ranks to entities based on prominence scores.
 * Only entities with prominenceScore > 0 are ranked.
 * Rank 1 = highest prominence.
 */
export function assignRanks(entities: RankInput[]): RankResult[] {
  const mentioned = entities
    .filter((e) => e.prominenceScore > 0)
    .sort((a, b) => b.prominenceScore - a.prominenceScore);

  const K = mentioned.length;
  return mentioned.map((e, i) => {
    const rankPosition = i + 1;
    const normalizedRankScore =
      K <= 1 ? 100 : Math.round(100 * (1 - (rankPosition - 1) / (K - 1)) * 100) / 100;
    return { entityId: e.entityId, rankPosition, normalizedRankScore, competitorsInResponse: K };
  });
}

// ---------------------------------------------------------------------------
// Mention share
// ---------------------------------------------------------------------------

/**
 * Compute mention share as a percentage.
 * share = appearances / totalAppearances * 100
 */
export function computeMentionShare(appearances: number, totalAppearances: number): number {
  if (totalAppearances <= 0) return 0;
  return Math.round((appearances / totalAppearances) * 10000) / 100;
}

// ---------------------------------------------------------------------------
// Rank statistics
// ---------------------------------------------------------------------------

/**
 * Average rank across non-null rank values.
 * Returns null if no valid ranks.
 */
export function computeAvgRank(ranks: (number | null)[]): number | null {
  const valid = ranks.filter((r): r is number => r !== null);
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((s, r) => s + r, 0) / valid.length) * 100) / 100;
}

/**
 * Percentage of appearances where entity ranked #1.
 * Only counts non-null ranks.
 */
export function computeRank1Rate(ranks: (number | null)[]): number {
  const valid = ranks.filter((r): r is number => r !== null);
  if (valid.length === 0) return 0;
  return Math.round((valid.filter((r) => r === 1).length / valid.length) * 100);
}

/**
 * Percentage of ALL queries where entity ranked #1.
 * Includes nulls (not mentioned) in the denominator.
 */
export function computeRank1RateAll(ranks: (number | null)[]): number {
  if (ranks.length === 0) return 0;
  return Math.round((ranks.filter((r) => r === 1).length / ranks.length) * 100);
}

// ---------------------------------------------------------------------------
// Fragmentation (Herfindahl-Hirschman Index)
// ---------------------------------------------------------------------------

/**
 * Compute HHI from mention share percentages (0-100 each).
 * Returns HHI on 0-10000 scale.
 */
export function computeHHI(shares: number[]): number {
  return Math.round(shares.reduce((s, sh) => s + (sh / 100) ** 2, 0) * 10000);
}

/**
 * Compute category fragmentation from mention shares.
 * Returns score (0-100, higher = more fragmented) and raw HHI.
 */
export function computeFragmentation(shares: number[]): { score: number; hhi: number } {
  const hhi = computeHHI(shares);
  const N = shares.length;
  if (N <= 1) return { score: 0, hhi };
  // Normalize: dominance = (HHI - 1/N) / (1 - 1/N)
  const minHHI = 10000 / N;
  const dominance = (hhi - minHHI) / (10000 - minHHI);
  const score = Math.round(100 * (1 - Math.max(0, Math.min(1, dominance))));
  return { score, hhi };
}

// ---------------------------------------------------------------------------
// Share of Voice
// ---------------------------------------------------------------------------

/**
 * Compute share of voice as a rounded percentage.
 * brandMentions / totalMentions * 100, rounded to nearest integer.
 * Returns 0 if totalMentions is 0.
 */
export function computeShareOfVoice(brandMentions: number, totalMentions: number): number {
  if (totalMentions <= 0) return 0;
  return Math.round((brandMentions / totalMentions) * 100);
}

// ---------------------------------------------------------------------------
// Mention rate & prominence
// ---------------------------------------------------------------------------

/**
 * Compute mention rate as a rounded percentage.
 * Returns 0 if total is 0.
 */
export function computeMentionRate(mentions: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((mentions / total) * 100);
}

/**
 * Compute average prominence score, rounded to 2 decimal places.
 * Returns 0 if no values.
 */
export function computeAvgProminence(scores: number[]): number {
  if (scores.length === 0) return 0;
  return Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Win/Loss
// ---------------------------------------------------------------------------

/**
 * Determine win/loss for a single prompt.
 * - "loss" = competitor outranks brand (lower rank number)
 * - "win" = brand outranks competitor
 * - "skip" = not comparable (one or both not mentioned)
 */
export function computeWinLoss(
  brandRank: number | null,
  competitorRank: number | null,
): "win" | "loss" | "skip" {
  if (brandRank === null || competitorRank === null) return "skip";
  if (competitorRank < brandRank) return "loss";
  if (competitorRank > brandRank) return "win";
  return "skip"; // tie
}
