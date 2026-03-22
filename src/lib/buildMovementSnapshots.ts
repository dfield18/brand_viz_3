/**
 * Build per-date movement snapshots from analysisJson.competitors
 * (the ranked competitor list), NOT from EntityResponseMetric.
 *
 * This ensures Movement matches the CSV/export semantics where
 * entities are counted based on the ranked competitor extraction,
 * not arbitrary prose mentions.
 */

import type { SnapshotData } from "./competitorAlerts";

export interface MovementRun {
  id: string;
  model: string;
  jobDate: string; // "YYYY-MM-DD" from job.finishedAt
  cluster: string;
  analysisJson: unknown;
}

interface AnalysisCompetitor {
  name: string;
  mentionStrength?: number;
}

interface ParsedAnalysis {
  competitors?: AnalysisCompetitor[];
}

/**
 * Build SnapshotData[] from scoped industry runs using
 * analysisJson.competitors as the entity source.
 *
 * @param runs - all runs in scope (already filtered by model/range)
 * @param brandSlug - the searched brand's slug (excluded from competitor counts)
 * @param aliasMap - entity ID normalization map (canonical forms)
 */
export function buildMovementSnapshots(
  runs: MovementRun[],
  brandSlug: string,
  aliasMap: Map<string, string>,
): SnapshotData[] {
  // Filter to industry-cluster only
  const industryRuns = runs.filter((r) => r.cluster === "industry");

  // Group by job date
  const byDate = new Map<string, MovementRun[]>();
  for (const run of industryRuns) {
    const list = byDate.get(run.jobDate) ?? [];
    list.push(run);
    byDate.set(run.jobDate, list);
  }

  const snapshots: SnapshotData[] = [];

  for (const [date, dateRuns] of byDate) {
    const totalIndustryRuns = dateRuns.length;
    // Count how many runs mention each entity in analysisJson.competitors
    const entityRunCounts: Record<string, number> = {};

    for (const run of dateRuns) {
      const analysis = run.analysisJson as ParsedAnalysis | null;
      const competitors = analysis?.competitors ?? [];
      // Track which entities this run mentions (dedupe within one run)
      const seenInRun = new Set<string>();
      for (const comp of competitors) {
        const rawId = comp.name.toLowerCase();
        const canonical = aliasMap.get(rawId) ?? rawId;
        if (canonical === brandSlug) continue;
        if (seenInRun.has(canonical)) continue;
        seenInRun.add(canonical);
        entityRunCounts[canonical] = (entityRunCounts[canonical] ?? 0) + 1;
      }
    }

    snapshots.push({ date, entityMentions: entityRunCounts, totalIndustryRuns });
  }

  return snapshots;
}
