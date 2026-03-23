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
 * Multi-word names composed entirely of common English words.
 * "Future Forward", "National Action", "General American", "Old Navy".
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
  "navy", "express", "frontier", "pioneer", "liberty", "patriot",
]);

/**
 * Single-word brand names that are ordinary English words and frequently
 * collide with unrelated uses. These are ambiguous even though they are
 * 4+ characters. Keep this list short — only add words with known
 * collision risk.
 */
const AMBIGUOUS_SINGLE_WORDS = new Set([
  "apple", "target", "shell", "sprint", "visa", "coach",
  "dove", "falcon", "jaguar", "puma", "swift", "uber",
  "chase", "ally", "indeed", "snap", "square", "slack",
  "notion", "discord", "compass", "harbor", "haven",
  "crown", "summit", "pilot", "spark", "hive", "nest",
  "fire", "rise", "wave", "sage", "pure", "bold",
]);

/**
 * Acronym brands that collide with common abbreviations/phrases.
 * These need extra-strict evidence because the acronym alone is
 * too ambiguous — e.g. "FIRE" = Foundation for Individual Rights
 * and Expression, but also "Financial Independence, Retire Early".
 *
 * For acronym brands, isRunInBrandScope requires either:
 * - the full organization name or a trusted alias in the text
 * - analysisJson.brandMentioned === true
 * - an alias/full-name match in the competitor list
 * - organization-specific context terms in the text
 *
 * AND explicitly rejects runs containing known collision phrases.
 */
interface AcronymCollisionRule {
  /** Context phrases that confirm the run is about the intended entity */
  confirmPhrases: string[];
  /** Context phrases that indicate the run is about a DIFFERENT entity */
  rejectPhrases: string[];
}

const ACRONYM_COLLISION_RULES = new Map<string, AcronymCollisionRule>([
  ["fire", {
    confirmPhrases: [
      "free speech", "first amendment", "academic freedom", "campus speech",
      "individual rights", "foundation for individual rights",
      "civil liberties", "student rights", "faculty rights",
      "speech code", "due process", "censorship",
      "thefire.org", "fire.org",
    ],
    rejectPhrases: [
      "retire early", "financial independence", "4% rule", "safe withdrawal",
      "lean fire", "fat fire", "barista fire", "coast fire",
      "fire movement", "fire number", "fire calculator",
      "early retirement", "retire by", "nest egg",
      "savings rate", "frugality", "frugal", "retirement portfolio",
      "investment portfolio", "index fund", "compound interest",
      "financial freedom", "financially independent", "passive income",
      "side hustle", "emergency fund", "withdrawal rate",
      "budgeting", "discretionary spending", "save 50%", "save 70%",
      "save 75%", "financial planner", "financial planning",
      "lifestyle changes", "spending habits", "income savings",
      "accumulate sufficient assets", "retirement savings",
    ],
  }],
]);

/**
 * Determine whether a brand name is ambiguous — i.e. likely to collide
 * with unrelated entities or common English phrases.
 *
 * Ambiguous patterns:
 * - Very short single words (< 4 chars): "Gap", "Go", "HP"
 * - Known ambiguous single words: "Apple", "Target", "Shell"
 * - Multi-word names where every word is a common English word:
 *   "Future Forward", "Old Navy", "National Action"
 *
 * Non-ambiguous:
 * - Distinctive coined names: "Patagonia", "Salesforce", "Volkswagen"
 * - Acronyms with uncommon letter combos: "ACLU", "NAACP"
 * - Names containing at least one non-common word: "Tesla Motors"
 */
export function isBrandNameAmbiguous(brandName: string): boolean {
  const words = brandName.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return true;

  // Single-word names
  if (words.length === 1) {
    const w = words[0];
    if (w.length < 4) return true;
    if (AMBIGUOUS_SINGLE_WORDS.has(w)) return true;
    if (COMMON_WORDS.has(w)) return true;
    // Acronym collision brands
    if (ACRONYM_COLLISION_RULES.has(w)) return true;
    return false;
  }

  // Multi-word: ambiguous if every word is a common word
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

  const textLower = run.rawResponseText.toLowerCase();

  // Acronym collision check: if the brand has specific collision rules,
  // apply stricter evidence requirements that override generic checks.
  const acronymRule = ACRONYM_COLLISION_RULES.get(brand.brandName.toLowerCase());
  if (acronymRule) {
    // Reject if ANY reject phrase is present — this is a strong negative signal
    // that the response is about the colliding entity, not the intended brand.
    const hasReject = acronymRule.rejectPhrases.some((p) => textLower.includes(p));
    if (hasReject) return false;

    // Accept if any confirm phrase is present (domain-specific context)
    const hasConfirm = acronymRule.confirmPhrases.some((p) => textLower.includes(p));
    if (hasConfirm) return true;

    // Accept if a trusted alias (full org name) appears in text
    if (brand.aliases) {
      for (const alias of brand.aliases) {
        if (alias.length >= 10 && textLower.includes(alias.toLowerCase())) return true;
      }
    }

    // For acronym brands, brandMentioned alone is NOT reliable — GPT cannot
    // distinguish between different meanings of the same acronym.
    // Only accept if the competitor list contains a known alias (stronger signal).
    if (run.analysisJson && typeof run.analysisJson === "object") {
      const a = run.analysisJson as ParsedAnalysis;
      if (Array.isArray(a.competitors) && brand.aliases) {
        const aliasLower = new Set(brand.aliases.filter((al) => al.length >= 6).map((al) => al.toLowerCase()));
        for (const comp of a.competitors) {
          if (comp && typeof comp === "object" && "name" in comp) {
            if (aliasLower.has(String(comp.name).toLowerCase())) return true;
          }
        }
      }
    }

    // No confirm phrases, no alias in text/competitors → reject
    // The acronym alone is too ambiguous without contextual support
    return false;
  }

  // Layer 2+3: standard ambiguous brands need supporting evidence
  if (hasAnalysisEvidence(run.analysisJson, brand)) return true;
  if (run.narrativeJson !== undefined && hasNarrativeEvidence(run.narrativeJson, brand)) return true;

  // Fallback: check if brand name appears prominently (not just once in passing)
  // Count distinct mentions — 2+ occurrences suggests the response is actually about this brand
  let count = 0;
  let searchFrom = 0;
  while (count < 2) {
    const pos = wordBoundaryIndex(textLower.slice(searchFrom), brand.brandName.toLowerCase());
    if (pos < 0) break;
    count++;
    searchFrom += pos + brand.brandName.length;
  }
  if (count >= 2) return true;

  return false;
}

/**
 * Filter an array of runs to only those in the brand's content scope.
 * Use for narrative, sentiment, sources — content genuinely about the brand.
 */
export function filterRunsToBrandScope<T extends BrandScopeRun>(
  runs: T[],
  brand: BrandScopeIdentity,
): T[] {
  return runs.filter((run) => isRunInBrandScope(run, brand));
}

// ---------------------------------------------------------------------------
// Query-universe scope (less strict — for competition, movement, export)
// ---------------------------------------------------------------------------

/**
 * Determine whether a run belongs in the brand's dashboard query universe.
 *
 * Less strict than `isRunInBrandScope`:
 * - Runs that do NOT mention the brand phrase at all → KEEP (valid absent-brand
 *   industry answers needed for recall denominators, competitor landscape, etc.)
 * - Runs that DO mention the brand phrase and pass content scope → KEEP
 * - Runs that DO mention the brand phrase but FAIL content scope → EXCLUDE
 *   (ambiguous false positives about a different entity sharing the name)
 *
 * For non-ambiguous brands: all runs pass (no filtering needed).
 */
export function isRunInBrandQueryUniverse(
  run: BrandScopeRun,
  brand: BrandScopeIdentity,
): boolean {
  if (!isBrandNameAmbiguous(brand.brandName)) return true;

  const textMention = isBrandMentioned(
    run.rawResponseText,
    brand.brandName,
    brand.brandSlug,
    brand.aliases,
  );

  // No text mention → valid absent-brand run, keep it
  if (!textMention) return true;

  // Text mention present → must pass the stricter content scope check
  return isRunInBrandScope(run, brand);
}

/**
 * Filter runs to the brand's dashboard query universe.
 * Use for competition, movement, export, prompt opportunities —
 * anywhere absent-brand runs are valid but ambiguous false positives are not.
 */
export function filterRunsToBrandQueryUniverse<T extends BrandScopeRun>(
  runs: T[],
  brand: BrandScopeIdentity,
): T[] {
  return runs.filter((run) => isRunInBrandQueryUniverse(run, brand));
}

/**
 * Build a BrandScopeIdentity from common brand fields.
 * Convenience to avoid repeating the same object literal in every route.
 */
export function buildBrandIdentity(brand: {
  name: string;
  displayName?: string | null;
  slug: string;
  aliases?: string[] | null;
}): BrandScopeIdentity {
  const brandName = brand.displayName || brand.name;
  const aliases = brand.aliases?.length ? brand.aliases : undefined;
  return { brandName, brandSlug: brand.slug, aliases };
}
