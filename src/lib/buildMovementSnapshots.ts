/**
 * Build per-date movement snapshots from analysisJson.competitors
 * (the ranked competitor list), NOT from EntityResponseMetric.
 *
 * This ensures Movement matches the CSV/export semantics where
 * entities are counted based on the ranked competitor extraction,
 * not arbitrary prose mentions.
 */

import type { SnapshotData } from "./competitorAlerts";
import { canonicalizeEntityId } from "./competition/canonicalize";

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
 * @param brandAliases - additional brand aliases to exclude
 */
export function buildMovementSnapshots(
  runs: MovementRun[],
  brandSlug: string,
  aliasMap: Map<string, string>,
  brandAliases?: string[],
): SnapshotData[] {
  // Filter to industry-cluster only
  const industryRuns = runs.filter((r) => r.cluster === "industry");

  // Build a set of all brand-family IDs to exclude
  const brandFamily = new Set<string>([brandSlug]);
  if (brandAliases) {
    for (const alias of brandAliases) {
      brandFamily.add(alias.toLowerCase());
      brandFamily.add(canonicalizeEntityId(alias));
    }
  }

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
    const entityRunCounts: Record<string, number> = {};

    for (const run of dateRuns) {
      const analysis = run.analysisJson as ParsedAnalysis | null;
      const competitors = analysis?.competitors ?? [];
      const seenInRun = new Set<string>();
      for (const comp of competitors) {
        const rawId = comp.name.toLowerCase();
        // Use aliasMap first, fall back to deterministic canonicalization
        const canonical = aliasMap.get(rawId) ?? canonicalizeEntityId(rawId);
        // Exclude the focal brand and its aliases
        if (brandFamily.has(canonical)) continue;
        if (seenInRun.has(canonical)) continue;
        seenInRun.add(canonical);
        entityRunCounts[canonical] = (entityRunCounts[canonical] ?? 0) + 1;
      }
    }

    snapshots.push({ date, entityMentions: entityRunCounts, totalIndustryRuns });
  }

  return snapshots;
}
