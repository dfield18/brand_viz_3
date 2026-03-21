/**
 * Brand mention detection and ranking in response text.
 * Pure functions — no database access.
 */

/**
 * Build a regex that matches a term at word boundaries.
 * Handles terms with hyphens/special chars by escaping them and
 * using lookaround for word-boundary-like matching at string edges or
 * adjacent to non-alphanumeric characters.
 */
function wordBoundaryRegex(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match term preceded by start-of-string or non-alphanumeric,
  // and followed by end-of-string or non-alphanumeric.
  return new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`, "i");
}

/**
 * Find the index of a word-boundary match for a term in text (case-insensitive).
 * Returns -1 if not found.
 */
export function wordBoundaryIndex(text: string, term: string): number {
  const match = wordBoundaryRegex(term).exec(text);
  return match ? match.index : -1;
}

/**
 * Check if a brand is mentioned in text using word-boundary matching.
 * Checks the brand name, its slug, and any known aliases/variations.
 * Avoids substring false positives (e.g. "nike" won't match "technikers").
 */
export function isBrandMentioned(
  text: string,
  brandName: string,
  brandSlug: string,
  aliases?: string[],
): boolean {
  if (wordBoundaryRegex(brandName).test(text)) return true;
  if (wordBoundaryRegex(brandSlug).test(text)) return true;
  if (aliases) {
    for (const alias of aliases) {
      if (wordBoundaryRegex(alias).test(text)) return true;
    }
  }
  return false;
}

/**
 * Compute the brand's rank in a response based on order of first appearance.
 * 1 = brand appears before all competitors, 2 = one competitor appears first, etc.
 * Returns null if brand is not mentioned at all.
 */
export function computeBrandRank(
  responseText: string,
  brandName: string,
  brandSlug: string,
  analysisJson: unknown,
  aliases?: string[],
): number | null {
  // Find brand's first position using word-boundary matching
  const namePos = wordBoundaryIndex(responseText, brandName);
  const slugPos = wordBoundaryIndex(responseText, brandSlug);
  const positions = [namePos, slugPos].filter((p) => p >= 0);
  if (aliases) {
    for (const alias of aliases) {
      const aliasPos = wordBoundaryIndex(responseText, alias);
      if (aliasPos >= 0) positions.push(aliasPos);
    }
  }
  if (positions.length === 0) return null; // brand not found
  const brandPos = Math.min(...positions);

  // Extract competitor names from analysisJson
  const competitors: string[] = [];
  if (analysisJson && typeof analysisJson === "object") {
    const a = analysisJson as Record<string, unknown>;
    if (Array.isArray(a.competitors)) {
      for (const c of a.competitors) {
        if (c && typeof c === "object" && "name" in c) {
          competitors.push(String((c as { name: string }).name));
        }
      }
    }
  }

  // Count how many competitors appear before the brand (word-boundary match)
  let rank = 1;
  for (const comp of competitors) {
    const compPos = wordBoundaryIndex(responseText, comp);
    if (compPos >= 0 && compPos < brandPos) {
      rank++;
    }
  }

  return rank;
}
