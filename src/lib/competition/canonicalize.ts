/**
 * Deterministic entity name canonicalization.
 *
 * Strips common corporate suffixes, normalizes whitespace/punctuation,
 * and lowercases — so "HP Inc." and "HP" produce the same canonical ID.
 *
 * This runs BEFORE GPT-based alias merging, giving a reliable baseline
 * that doesn't depend on LLM availability or caching.
 */

// Trailing tokens to strip (order matters — longer first to avoid partial matches)
const CORPORATE_SUFFIXES = [
  "incorporated",
  "corporation",
  "technologies",
  "international",
  "enterprises",
  "holdings",
  "company",
  "limited",
  "group",
  "corp.",
  "corp",
  "inc.",
  "inc",
  "ltd.",
  "ltd",
  "llc",
  "llp",
  "plc",
  "s.a.",
  "sa",
  "ag",
  "co.",
  "co",
];

// Leading tokens to strip
const LEADING_TOKENS = ["the"];

/**
 * Produce a deterministic canonical form from a raw entity name.
 *
 * Behavior:
 * - lowercase
 * - collapse whitespace
 * - strip trailing corporate suffixes (Inc., Corp., Group, etc.)
 * - strip leading "the"
 * - trim trailing punctuation
 * - preserve meaningful core words
 *
 * Conservative: only strips well-known suffixes as standalone trailing
 * tokens. Does NOT strip words that could be part of the brand name
 * (e.g., "Group" in "Interpublic Group" stays if it's the only word
 * after stripping — we only strip suffixes that leave a non-empty core).
 */
export function canonicalizeEntityId(name: string): string {
  let s = name.toLowerCase().trim();

  // Normalize whitespace
  s = s.replace(/\s+/g, " ");

  // Strip leading "the "
  for (const lead of LEADING_TOKENS) {
    if (s.startsWith(lead + " ")) {
      s = s.slice(lead.length + 1);
    }
  }

  // Strip trailing corporate suffixes (iteratively — "Acme Corp. Inc." → "Acme")
  let changed = true;
  while (changed) {
    changed = false;
    const trimmed = s.replace(/[.,;:!?]+$/, "").trim();
    for (const suffix of CORPORATE_SUFFIXES) {
      if (trimmed.endsWith(" " + suffix)) {
        const core = trimmed.slice(0, -(suffix.length + 1)).trim();
        if (core.length > 0) {
          s = core;
          changed = true;
          break;
        }
      }
    }
  }

  // Final trim of trailing punctuation
  s = s.replace(/[.,;:!?]+$/, "").trim();

  return s;
}

/**
 * Given a list of raw entity IDs, group those that share the same
 * canonical form. Returns a map from raw ID → canonical ID (the
 * shortest raw ID in each group).
 *
 * This is deterministic and does not call any external APIs.
 */
export function buildDeterministicAliasMap(
  entityIds: string[],
): Map<string, string> {
  // Group by canonical form
  const groups = new Map<string, string[]>();
  for (const id of entityIds) {
    const canonical = canonicalizeEntityId(id);
    const list = groups.get(canonical) ?? [];
    list.push(id);
    groups.set(canonical, list);
  }

  // For each group, pick the shortest raw ID as the canonical
  const map = new Map<string, string>();
  for (const [, members] of groups) {
    const best = members.reduce((a, b) => (a.length <= b.length ? a : b));
    for (const member of members) {
      map.set(member, best);
    }
  }

  return map;
}
