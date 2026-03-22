/**
 * Brand-scope filtering for ambiguous brand names.
 *
 * Low-level `isBrandMentioned` checks word-boundary text matches only.
 * This higher-level helper adds layered evidence requirements so that
 * runs about unrelated entities sharing the same phrase are excluded.
 *
 * Decision layers (in order):
 * 1. Text mention of brand name / slug / alias  (baseline — same as before)
 * 2. Ranked-entity evidence: brand or alias appears in analysisJson.competitors
 *    OR analysisJson.brandMentioned is true
 * 3. Narrative context: narrativeJson themes/claims reference the brand
 *
 * For non-ambiguous brands (distinctive names), the text mention alone
 * is sufficient. For ambiguous brands, we require text mention PLUS at
 * least one supporting signal from the structured data.
 *
 * Pure functions — no database access, no GPT calls.
 */

import { isBrandMentioned, wordBoundaryIndex } from "./brandMention";
import { canonicalizeEntityId } from "../competition/canonicalize";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrandScopeRun {
  rawResponseText: string;
  analysisJson: unknown;
  narrativeJson?: unknown;
}

export interface BrandScopeIdentity {
  brandName: string;
  brandSlug: string;
  aliases?: string[];
}

// ---------------------------------------------------------------------------
// Ambiguity detection
// ---------------------------------------------------------------------------

/**
 * Heuristic: a brand name is considered ambiguous if it is short or
 * composed of common English words that could refer to unrelated entities.
 *
 * Examples of ambiguous names:
 *   "Future Forward", "Target", "Apple", "Old Navy"
 *
 * Examples of non-ambiguous names:
 *   "Patagonia", "ACLU", "Salesforce", "Volkswagen"
 */
const COMMON_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "for",
  "is", "it", "by", "as", "up", "out", "new", "old", "big", "top",
  "all", "one", "two", "red", "blue", "green", "black", "white",
  "best", "good", "great", "first", "last", "next", "open", "free",
  "future", "forward", "action", "global", "digital", "smart", "fast",
  "point", "star", "pro", "plus", "go", "now", "true", "real",
  "target", "general", "national", "american", "united", "standard",
  "universal", "central", "modern", "prime", "core", "focus",
  "north", "south", "east", "west", "sun", "sky", "sea",
]);

export function isBrandNameAmbiguous(brandName: string): boolean {
  const words = brandName.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return true;
  // Single-word names under 4 chars are ambiguous (e.g. "Gap", "Go")
  if (words.length === 1 && words[0].length < 4) return true;
  // If every word in the name is a common English word, it's ambiguous
  return words.every((w) => COMMON_WORDS.has(w));
}

// ---------------------------------------------------------------------------
// Structured evidence checks
// ---------------------------------------------------------------------------

interface ParsedAnalysis {
  brandMentioned?: boolean;
  competitors?: { name: string }[];
}

/**
 * Check if analysisJson provides evidence that this run is about the brand.
 *
 * Evidence sources:
 * - brandMentioned flag set by extraction
 * - brand name/slug/alias appears in competitor list (GPT saw it as relevant)
 */
function hasAnalysisEvidence(
  analysisJson: unknown,
  brand: BrandScopeIdentity,
): boolean {
  if (!analysisJson || typeof analysisJson !== "object") return false;
  const a = analysisJson as ParsedAnalysis;

  // Direct flag from extraction
  if (a.brandMentioned === true) return true;

  // Brand appears in the competitor list (means GPT considered it relevant)
  if (Array.isArray(a.competitors)) {
    const slugs = new Set<string>();
    slugs.add(brand.brandSlug);
    slugs.add(canonicalizeEntityId(brand.brandName));
    if (brand.aliases) {
      for (const alias of brand.aliases) {
        if (alias.length >= 3) {
          slugs.add(alias.toLowerCase());
          slugs.add(canonicalizeEntityId(alias));
        }
      }
    }

    for (const comp of a.competitors) {
      if (!comp || typeof comp !== "object" || !("name" in comp)) continue;
      const compId = String(comp.name).toLowerCase();
      const compCanonical = canonicalizeEntityId(compId);
      if (slugs.has(compId) || slugs.has(compCanonical)) return true;
    }
  }

  return false;
}

/**
 * Check if narrativeJson provides context evidence that the run is
 * about the intended brand (themes or claims reference it).
 */
function hasNarrativeEvidence(
  narrativeJson: unknown,
  brand: BrandScopeIdentity,
): boolean {
  if (!narrativeJson || typeof narrativeJson !== "object") return false;
  const n = narrativeJson as Record<string, unknown>;

  // Check if any claim text mentions the brand
  if (Array.isArray(n.claims)) {
    for (const claim of n.claims) {
      if (claim && typeof claim === "object" && "text" in claim) {
        const text = String((claim as { text: string }).text);
        if (isBrandMentioned(text, brand.brandName, brand.brandSlug, brand.aliases)) {
          return true;
        }
      }
    }
  }

  // Check if context window produced authority/trust signals (positive evidence).
  // Weakness-only signals are NOT sufficient — they could be about an unrelated
  // entity with the same name that has negative reviews.
  const auth = typeof n.authoritySignals === "number" ? n.authoritySignals : 0;
  const trust = typeof n.trustSignals === "number" ? n.trustSignals : 0;
  if (auth + trust > 0) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Determine whether a single run is genuinely about the selected brand.
 *
 * For non-ambiguous brands: text mention is sufficient (backward compatible).
 * For ambiguous brands: text mention + at least one supporting evidence signal.
 */
export function isRunInBrandScope(
  run: BrandScopeRun,
  brand: BrandScopeIdentity,
): boolean {
  // Layer 1: text mention (baseline requirement for all brands)
  const textMention = isBrandMentioned(
    run.rawResponseText,
    brand.brandName,
    brand.brandSlug,
    brand.aliases,
  );
  if (!textMention) return false;

  // Non-ambiguous brands: text mention alone is enough
  if (!isBrandNameAmbiguous(brand.brandName)) return true;

  // Layer 2+3: ambiguous brands need supporting evidence
  if (hasAnalysisEvidence(run.analysisJson, brand)) return true;
  if (run.narrativeJson !== undefined && hasNarrativeEvidence(run.narrativeJson, brand)) return true;

  // Fallback: check if brand name appears prominently (not just once in passing)
  // Count distinct mentions — 2+ occurrences suggests the response is actually about this brand
  const text = run.rawResponseText;
  let count = 0;
  let searchFrom = 0;
  while (count < 2) {
    const pos = wordBoundaryIndex(text.slice(searchFrom), brand.brandName);
    if (pos < 0) break;
    count++;
    searchFrom += pos + brand.brandName.length;
  }
  if (count >= 2) return true;

  return false;
}

/**
 * Filter an array of runs to only those in the brand's scope.
 */
export function filterRunsToBrandScope<T extends BrandScopeRun>(
  runs: T[],
  brand: BrandScopeIdentity,
): T[] {
  return runs.filter((run) => isRunInBrandScope(run, brand));
}
