/**
 * Pure helper for computing competitor movement alerts.
 *
 * Given per-snapshot entity mention data, selects the two most recent
 * snapshot dates and computes mention-rate deltas.
 */

export interface SnapshotData {
  date: string; // "YYYY-MM-DD"
  entityMentions: Record<string, number>; // entityId → distinct industry runs mentioning entity
  totalIndustryRuns: number;
}

export interface CompetitorAlert {
  entityId: string;
  recentMentionRate: number;   // 0-100
  previousMentionRate: number; // 0-100
  mentionRateChange: number;   // percentage-point delta
  direction: "rising" | "falling" | "stable";
}

export interface AlertResult {
  alerts: CompetitorAlert[];
  comparisonPeriodLabel: string;
  recentDate: string | null;
  previousDate: string | null;
}

/**
 * Select the two most recent snapshot dates and compute per-entity
 * mention-rate deltas.
 *
 * - recentDate = latest snapshot
 * - previousDate = immediately preceding snapshot
 * - mentionRate = entityMentions / totalIndustryRuns * 100
 */
export function computeCompetitorAlerts(
  snapshots: SnapshotData[],
  brandEntityId: string,
): AlertResult {
  // Sort by date ascending
  const sorted = [...snapshots]
    .filter((s) => s.totalIndustryRuns > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    return { alerts: [], comparisonPeriodLabel: "prior snapshot", recentDate: null, previousDate: null };
  }

  const recent = sorted[sorted.length - 1];

  if (sorted.length < 2) {
    // Only one snapshot — show current values with no delta
    const alerts: CompetitorAlert[] = [];
    for (const [entityId, mentions] of Object.entries(recent.entityMentions)) {
      if (entityId === brandEntityId) continue;
      const rate = Math.round((mentions / recent.totalIndustryRuns) * 100);
      if (rate > 0) {
        alerts.push({
          entityId,
          recentMentionRate: rate,
          previousMentionRate: 0,
          mentionRateChange: 0,
          direction: "stable",
        });
      }
    }
    return { alerts, comparisonPeriodLabel: "prior snapshot", recentDate: recent.date, previousDate: null };
  }

  const previous = sorted[sorted.length - 2];

  // Compute label from the gap between the two dates
  const recentMs = new Date(recent.date + "T00:00:00").getTime();
  const previousMs = new Date(previous.date + "T00:00:00").getTime();
  const gapDays = Math.round((recentMs - previousMs) / 86_400_000);
  let comparisonPeriodLabel: string;
  if (gapDays <= 10) comparisonPeriodLabel = "prior week";
  else if (gapDays <= 35) comparisonPeriodLabel = "prior month";
  else if (gapDays <= 100) comparisonPeriodLabel = "prior quarter";
  else comparisonPeriodLabel = `prior ${Math.round(gapDays / 30)} months`;

  // Collect all entity IDs across both snapshots (excluding brand)
  const allEntityIds = new Set<string>();
  for (const id of Object.keys(recent.entityMentions)) {
    if (id !== brandEntityId) allEntityIds.add(id);
  }
  for (const id of Object.keys(previous.entityMentions)) {
    if (id !== brandEntityId) allEntityIds.add(id);
  }

  const alerts: CompetitorAlert[] = [];
  for (const entityId of allEntityIds) {
    const recentMentions = recent.entityMentions[entityId] ?? 0;
    const previousMentions = previous.entityMentions[entityId] ?? 0;
    const recentRate = recent.totalIndustryRuns > 0 ? (recentMentions / recent.totalIndustryRuns) * 100 : 0;
    const previousRate = previous.totalIndustryRuns > 0 ? (previousMentions / previous.totalIndustryRuns) * 100 : 0;
    const changePts = recentRate - previousRate;
    const recentPct = Math.round(recentRate);
    const previousPct = Math.round(previousRate);

    if (Math.abs(changePts) > 1 || recentMentions > 0) {
      const direction: "rising" | "falling" | "stable" =
        changePts > 2 ? "rising" : changePts < -2 ? "falling" : "stable";

      alerts.push({
        entityId,
        recentMentionRate: recentPct,
        previousMentionRate: previousPct,
        mentionRateChange: Math.round(changePts * 10) / 10,
        direction,
      });
    }
  }

  // Sort by absolute change descending
  alerts.sort((a, b) => Math.abs(b.mentionRateChange) - Math.abs(a.mentionRateChange));

  return {
    alerts,
    comparisonPeriodLabel,
    recentDate: recent.date,
    previousDate: previous.date,
  };
}
