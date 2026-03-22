/**
 * Build per-date movement snapshots for competitor recall tracking.
 *
 * Uses getRankedEntitiesForRun to locate entities in the response
 * text, deduplicate, and canonicalize — but does NOT apply the
 * top-5 limit used by the CSV export. Movement tracks whether a
 * competitor appears at all, not just whether it's in the top 5.
 */

import type { SnapshotData } from "./competitorAlerts";
import { getRankedEntitiesForRun } from "./visibility/rankedEntities";

export interface MovementRun {
  id: string;
  model: string;
  jobDate: string; // "YYYY-MM-DD" from job.finishedAt
  cluster: string;
  analysisJson: unknown;
  rawResponseText: string;
}

/**
 * Build SnapshotData[] from scoped industry runs.
 *
 * @param runs - all runs in scope (already filtered by model/range)
 * @param brandName - the searched brand's display name
 * @param brandSlug - the searched brand's slug (excluded from competitor counts)
 * @param aliasMap - entity ID normalization map (canonical forms)
 */
export function buildMovementSnapshots(
  runs: MovementRun[],
  brandName: string,
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
    const entityRunCounts: Record<string, number> = {};

    for (const run of dateRuns) {
      // Find all verified entities (no top-N limit — movement tracks full recall)
      const ranked = getRankedEntitiesForRun({
        rawResponseText: run.rawResponseText,
        analysisJson: run.analysisJson,
        brandName,
        brandSlug,
        includeBrand: false,
        aliasMap,
        limit: Infinity,
      });

      // Count each canonical competitor once per run
      const seenInRun = new Set<string>();
      for (const entity of ranked) {
        if (seenInRun.has(entity.canonicalId)) continue;
        seenInRun.add(entity.canonicalId);
        entityRunCounts[entity.canonicalId] = (entityRunCounts[entity.canonicalId] ?? 0) + 1;
      }
    }

    snapshots.push({ date, entityMentions: entityRunCounts, totalIndustryRuns });
  }

  return snapshots;
}
