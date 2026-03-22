/**
 * Build per-date movement snapshots using the same ranked-entity
 * semantics as the CSV export (Brand 1..5 columns).
 *
 * Uses getRankedEntitiesForRun to locate entities in the response
 * text, deduplicate, and rank by text order — matching the export.
 */

import type { SnapshotData } from "./competitorAlerts";
import { getRankedEntitiesForRun, RANKED_ENTITY_LIMIT } from "./visibility/rankedEntities";

export interface MovementRun {
  id: string;
  model: string;
  jobDate: string; // "YYYY-MM-DD" from job.finishedAt
  cluster: string;
  analysisJson: unknown;
  rawResponseText: string;
}

/**
 * Build SnapshotData[] from scoped industry runs using the same
 * ranked-entity logic as the CSV export.
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
      // Use the same ranked-entity logic as the CSV export
      const ranked = getRankedEntitiesForRun({
        rawResponseText: run.rawResponseText,
        analysisJson: run.analysisJson,
        brandName,
        brandSlug,
        includeBrand: false, // exclude focal brand from competitor counts
        aliasMap,
        // Use same cutoff as CSV export (Brand 1..5) so movement reconciles
        limit: RANKED_ENTITY_LIMIT,
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
