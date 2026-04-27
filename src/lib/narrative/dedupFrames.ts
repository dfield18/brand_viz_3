/**
 * Collapse near-duplicate narrative frames so the same theme doesn't
 * occupy 4 of the top 8 slots. The LLM extractor returns frames as
 * short noun phrases ("Affordable Housing Champion", "Affordable
 * Housing Advocacy", "Affordable Housing Projects", "Funding for
 * Affordable Housing") that all describe the same recurring narrative.
 * Without dedup, the overview frames list reads like a thesaurus
 * variation of one theme instead of multiple distinct themes.
 *
 * Algorithm: tokenize each frame name to its significant words
 * (lowercase, length > 2, not a common preposition/article). Two
 * frames are considered the same theme when they share ≥2 significant
 * tokens. Frames are processed in count-descending order so the most-
 * popular variant becomes the canonical name; counts are summed
 * across the group.
 */

const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "onto", "upon", "over",
  "under", "about", "across", "after", "around", "before", "between",
  "during", "through", "without", "within", "against", "out", "off",
  "but", "nor", "yet", "than", "though", "while",
]);

export function significantFrameTokens(frameName: string): string[] {
  return frameName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

interface FrameGroup<T> {
  canonical: T;
  canonicalTokens: Set<string>;
  /** Union of every member's tokens — checked against incoming frames so
   *  e.g. "Funding for Affordable Housing" still merges into the group
   *  even if the canonical "Affordable Housing Champion" only shares one
   *  token with it (the group as a whole shares two: "affordable",
   *  "housing"). */
  allTokens: Set<string>;
  count: number;
  members: T[];
}

/**
 * Group frames by token overlap, return one representative per group.
 *
 * @param frames Frames sorted by relevance — typically count descending.
 * @param getTokens Returns the significant tokens for a frame.
 * @param getCount Returns the frame's count for accumulation.
 * @param mergeCounts Combine the canonical's count with a merged-in
 *  member's count. Default sums them; pass `Math.max` if you want the
 *  canonical's count to be the maximum across the group instead.
 * @param minOverlap Number of significant tokens two frames must share
 *  to be considered the same theme. Default 2.
 */
export function dedupFrames<T>(
  frames: T[],
  getTokens: (frame: T) => string[],
  getCount: (frame: T) => number,
  setCount: (frame: T, count: number) => T,
  mergeCounts: (existing: number, incoming: number) => number = (a, b) => a + b,
  minOverlap: number = 2,
): T[] {
  const groups: FrameGroup<T>[] = [];
  // Iterate in count-descending order so the highest-count variant
  // becomes the canonical for its theme.
  const ordered = [...frames].sort((a, b) => getCount(b) - getCount(a));
  for (const f of ordered) {
    const tokens = new Set(getTokens(f));
    if (tokens.size === 0) {
      // No significant tokens — keep as its own group; no theme to
      // collapse against.
      groups.push({
        canonical: f,
        canonicalTokens: tokens,
        allTokens: tokens,
        count: getCount(f),
        members: [f],
      });
      continue;
    }
    let merged = false;
    for (const g of groups) {
      let overlap = 0;
      for (const t of tokens) {
        if (g.allTokens.has(t)) {
          overlap++;
          if (overlap >= minOverlap) break;
        }
      }
      if (overlap >= minOverlap) {
        g.count = mergeCounts(g.count, getCount(f));
        for (const t of tokens) g.allTokens.add(t);
        g.members.push(f);
        merged = true;
        break;
      }
    }
    if (!merged) {
      groups.push({
        canonical: f,
        canonicalTokens: tokens,
        allTokens: tokens,
        count: getCount(f),
        members: [f],
      });
    }
  }
  return groups.map((g) => setCount(g.canonical, g.count));
}

/**
 * Same grouping as `dedupFrames` but returns each group with its
 * member list, so callers that need to aggregate per-model counts (or
 * any other per-original metric) across a theme can find the
 * canonical's siblings.
 */
export function dedupFramesGrouped<T>(
  frames: T[],
  getTokens: (frame: T) => string[],
  getCount: (frame: T) => number,
  minOverlap: number = 2,
): Array<{ canonical: T; members: T[]; count: number }> {
  const groups: FrameGroup<T>[] = [];
  const ordered = [...frames].sort((a, b) => getCount(b) - getCount(a));
  for (const f of ordered) {
    const tokens = new Set(getTokens(f));
    if (tokens.size === 0) {
      groups.push({ canonical: f, canonicalTokens: tokens, allTokens: tokens, count: getCount(f), members: [f] });
      continue;
    }
    let merged = false;
    for (const g of groups) {
      let overlap = 0;
      for (const t of tokens) {
        if (g.allTokens.has(t)) {
          overlap++;
          if (overlap >= minOverlap) break;
        }
      }
      if (overlap >= minOverlap) {
        g.count += getCount(f);
        for (const t of tokens) g.allTokens.add(t);
        g.members.push(f);
        merged = true;
        break;
      }
    }
    if (!merged) {
      groups.push({ canonical: f, canonicalTokens: tokens, allTokens: tokens, count: getCount(f), members: [f] });
    }
  }
  return groups.map((g) => ({ canonical: g.canonical, members: g.members, count: g.count }));
}
