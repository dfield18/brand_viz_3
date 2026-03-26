/**
 * Shared helper for deriving ranked entities from a response.
 *
 * This is the single source of truth for the "Brand 1..5" columns
 * in the CSV export and for competitor movement counting.
 *
 * Entities are:
 * - located in rawResponseText via wordBoundaryIndex
 * - deduplicated (name variations collapsed)
 * - sorted by first text appearance
 * - limited to top N
 */

import { wordBoundaryIndex } from "./brandMention";
import { canonicalizeEntityId } from "../competition/canonicalize";

/**
 * The number of ranked entities shown in the CSV export (Brand 1..5).
 * Used by both the export and movement counting so they always agree.
 */
export const RANKED_ENTITY_LIMIT = 5;

export interface RankedEntity {
  name: string;       // display name (original casing from analysisJson)
  canonicalId: string; // lowercased canonical form
  position: number;    // char offset in response text
}

interface GetRankedEntitiesArgs {
  rawResponseText: string;
  analysisJson: unknown;
  brandName: string;
  brandSlug: string;
  /** If true, include the focal brand in the ranked list (for CSV export).
   *  If false, exclude it (for movement counting). Default: true. */
  includeBrand?: boolean;
  /** Alias map for competitor canonicalization */
  aliasMap?: Map<string, string>;
  /** Max entities to return. Default: 5 */
  limit?: number;
}

interface ParsedAnalysis {
  competitors?: { name: string }[];
}

/**
 * Derive ranked entities from a response using the same logic as the
 * CSV export's Brand 1..5 columns.
 *
 * - Finds each entity's first text position via wordBoundaryIndex
 * - Only includes entities actually present in the response text
 * - Deduplicates name variations (containment check + canonical form)
 * - Sorts by text position (first mentioned = rank #1)
 * - Returns up to `limit` entities
 */
export function getRankedEntitiesForRun(args: GetRankedEntitiesArgs): RankedEntity[] {
  const {
    rawResponseText,
    analysisJson,
    brandName,
    brandSlug,
    includeBrand = true,
    aliasMap,
    limit = 5,
  } = args;

  const analysis = analysisJson as ParsedAnalysis | null;
  const competitors = analysis?.competitors ?? [];

  const entities: RankedEntity[] = [];
  const seenCanonicals = new Set<string>();

  // Optionally add the focal brand
  if (includeBrand) {
    const brandPos = wordBoundaryIndex(rawResponseText, brandName);
    if (brandPos >= 0) {
      entities.push({ name: brandName, canonicalId: brandSlug, position: brandPos });
      seenCanonicals.add(brandSlug);
    }
  }

  // Add competitors from analysisJson
  for (const comp of competitors) {
    const rawId = comp.name.toLowerCase();
    const canonical = aliasMap?.get(rawId) ?? canonicalizeEntityId(rawId);

    // Skip focal brand (even under alternate names)
    if (canonical === brandSlug) continue;

    // Skip if we already have this canonical entity
    if (seenCanonicals.has(canonical)) continue;

    // Skip name variations already in the list (containment check)
    const isDupe = entities.some((e) => {
      const a = e.name.toLowerCase();
      const b = comp.name.toLowerCase();
      return a === b || a.includes(b) || b.includes(a);
    });
    if (isDupe) continue;

    // Must actually appear in the response text
    const pos = wordBoundaryIndex(rawResponseText, comp.name);
    if (pos < 0) continue;

    entities.push({ name: comp.name, canonicalId: canonical, position: pos });
    seenCanonicals.add(canonical);
  }

  // Sort by text position (first mentioned = rank #1)
  entities.sort((a, b) => a.position - b.position);

  return entities.slice(0, limit);
}

/**
 * Convenience: get just the display names (for CSV Brand 1..5 columns).
 */
export function getTopBrandsForRun(args: GetRankedEntitiesArgs): string[] {
  return getRankedEntitiesForRun(args).map((e) => e.name);
}

// ---------------------------------------------------------------------------
// Run-level Share of Voice counts
// ---------------------------------------------------------------------------

export interface RunSovCounts {
  brandMentions: number;   // 0 or 1
  totalMentions: number;   // ranked entity count (text-verified, deduped)
}

/**
 * Compute run-level Share of Voice counts from the same canonical ranked
 * entity list used by the Full Data CSV Brand 1..5 export.
 *
 * This ensures displayed SoV matches what users see in the exported data.
 * Do NOT derive SoV denominator from raw analysisJson.competitors.length;
 * use this helper instead to guarantee consistency.
 *
 * Uses `limit: Infinity` to count ALL text-verified entities, not just top 5.
 */
export function getSovCountsForRun(args: {
  rawResponseText: string;
  analysisJson: unknown;
  brandName: string;
  brandSlug: string;
  aliasMap?: Map<string, string>;
}): RunSovCounts {
  const ranked = getRankedEntitiesForRun({
    ...args,
    includeBrand: true,
    limit: Infinity, // count all text-verified entities, not just top 5
  });
  const brandMentions = ranked.some((e) => e.canonicalId === args.brandSlug) ? 1 : 0;
  return { brandMentions, totalMentions: ranked.length };
}
