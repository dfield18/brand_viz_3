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

// Business-unit suffixes that can be stripped when a shorter base entity exists
const BUSINESS_UNIT_SUFFIXES = [
  "interactive entertainment",
  "entertainment",
  "interactive",
  "gaming",
  "games",
  "studios",
  "studio",
  "media",
  "digital",
  "online",
  "network",
  "networks",
  "services",
  "solutions",
  "systems",
  "software",
  "platforms",
  "global",
  "worldwide",
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

/**
 * Higher-level alias grouping that also merges brand-family / business-unit
 * variants when a shorter base entity exists in the set.
 *
 * E.g., if both "sony" and "sony interactive entertainment" are present,
 * the longer form merges into "sony".
 *
 * Also maps focal brand aliases to brandSlug so they're excluded properly.
 */
export function buildEntityAliasGroups(
  entityIds: string[],
  focalBrandSlug?: string,
  focalBrandAliases?: string[],
): Map<string, string> {
  // Step 1: Apply corporate-suffix canonicalization
  const baseMap = buildDeterministicAliasMap(entityIds);

  // Step 2: Map focal brand aliases to brandSlug
  if (focalBrandSlug && focalBrandAliases) {
    for (const alias of focalBrandAliases) {
      const lower = alias.toLowerCase();
      if (baseMap.has(lower)) {
        baseMap.set(lower, focalBrandSlug);
      }
      // Also check canonicalized form
      const canonical = canonicalizeEntityId(alias);
      for (const [raw, mapped] of baseMap) {
        if (canonicalizeEntityId(raw) === canonical && mapped !== focalBrandSlug) {
          baseMap.set(raw, focalBrandSlug);
        }
      }
    }
    // The brand slug itself should map to itself
    if (baseMap.has(focalBrandSlug)) {
      baseMap.set(focalBrandSlug, focalBrandSlug);
    }
  }

  // Step 3: Brand-family / business-unit merging
  // Collect all current canonical values (the bases)
  const canonicalValues = new Set(baseMap.values());

  // For each canonical value, check if stripping business-unit suffixes
  // produces a base that also exists as a canonical value
  const familyMerges = new Map<string, string>();
  for (const canonical of canonicalValues) {
    const stripped = canonical;
    for (const suffix of BUSINESS_UNIT_SUFFIXES) {
      if (stripped.endsWith(" " + suffix)) {
        const core = stripped.slice(0, -(suffix.length + 1)).trim();
        if (core.length > 0 && canonicalValues.has(core)) {
          familyMerges.set(canonical, core);
          break;
        }
      }
    }
  }

  // Apply family merges to the map
  if (familyMerges.size > 0) {
    for (const [raw, mapped] of baseMap) {
      const finalTarget = familyMerges.get(mapped);
      if (finalTarget) {
        baseMap.set(raw, finalTarget);
      }
    }
  }

  return baseMap;
}
