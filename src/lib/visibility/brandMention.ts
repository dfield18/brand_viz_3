/**
 * Brand mention detection and ranking in response text.
 * Pure functions — no database access.
 */

/**
 * Generational suffixes that disambiguate a senior from a junior who
 * shares the same first+last name. Word-boundary matching for "Donald
 * Trump" would otherwise succeed inside "Donald Trump Jr." (the trailing
 * space + J is a valid word boundary), causing a response that only
 * mentions Trump Jr. to flag Trump Sr. as mentioned. Same risk for
 * any Sr/Jr/III pair in politics, finance, or family-business contexts.
 *
 * The check is skipped when the term we're matching ALREADY ends with
 * one of these suffixes — a brand "Donald Trump Jr." should still
 * match its own Jr. occurrences.
 */
const GENERATIONAL_SUFFIX_TEST = /\b(?:Jr\.?|Sr\.?|II|III|IV|V)\s*$/i;
const TRAILING_SUFFIX_LOOKAHEAD = "(?!\\s*,?\\s*(?:Jr\\.?|Sr\\.?|II|III|IV)\\b)";

/**
 * Build a regex that matches a term at word boundaries.
 * Handles terms with hyphens/special chars by escaping them and
 * using lookaround for word-boundary-like matching at string edges or
 * adjacent to non-alphanumeric characters. When the term doesn't
 * itself end in a generational suffix, also rejects matches whose
 * trailing context is a Jr/Sr/III suffix.
 */
function wordBoundaryRegex(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const trailingSuffixGuard = GENERATIONAL_SUFFIX_TEST.test(term)
    ? ""
    : TRAILING_SUFFIX_LOOKAHEAD;
  // Match term preceded by start-of-string or non-alphanumeric,
  // and followed by end-of-string or non-alphanumeric, AND not
  // followed by a generational suffix when the term itself isn't one.
  return new RegExp(
    `(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])${trailingSuffixGuard}`,
    "i",
  );
}

/**
 * Strip URLs, markdown link URLs, and citation blocks from text so
 * brand-mention matching doesn't false-positive on URL-encoded
 * fragments (e.g. "+Mike+Johnson+" inside a citation matched the alias
 * "Mike" when the response was actually about Mike Johnson, not Mike
 * Pence). The URL-as-text is fundamentally noise for "is the subject
 * mentioned in the prose" — we want the human-readable answer body
 * only.
 *
 * Removes:
 *   - Markdown links: `[label](url)` → keeps `label`, drops the URL
 *   - Bare URLs: `https://…` and `www.…` runs
 *   - Domain-shaped tokens: `example.com/path` (dotted hostnames with
 *     paths) — strips the path part to avoid `pence-deportation`-style
 *     slug false positives.
 */
function stripUrls(text: string): string {
  return text
    // Markdown link: drop the URL, keep the label
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1")
    // Bare URLs (http/https) — drop everything until whitespace, ),
    // ], or end of string
    .replace(/\bhttps?:\/\/[^\s)\]]+/gi, " ")
    // www.something/… (no scheme) — same treatment
    .replace(/\bwww\.[^\s)\]]+/gi, " ")
    // utm/query-string fragments still inside parens we missed
    .replace(/\?[a-z0-9_=&%+-]+/gi, " ");
}

/**
 * Heuristic extractor for named people the LLM competitor extraction
 * may have missed. computeBrandRank originally counted competitors
 * solely from analysisJson.competitors — for Kamala Harris's run on
 * "most influential Democratic figures in 2026" GPT-4o-mini returned
 * an empty competitors array even though Joe Biden, Chuck Schumer,
 * Nancy Pelosi, and Gavin Newsom were all clearly listed in the
 * answer. The brand defaulted to rank=1 despite being second in the
 * actual prose.
 *
 * Two patterns catch the typical enumerated-list shape AI uses for
 * "list of named people" answers:
 *
 *   1. Markdown bold name: `**Joe Biden**` — common in numbered
 *      Markdown lists (`1. **Joe Biden** - ...`).
 *   2. Line-leading name with separator: `Joe Biden - ...` /
 *      `Joe Biden — ...` / `Joe Biden: ...` — less formatted lists.
 *
 * Returns each match's position; computeBrandRank dedupes by name and
 * combines with the GPT competitor list for ranking.
 */
function extractLikelyPersonNames(text: string): Array<{ name: string; pos: number }> {
  const out: Array<{ name: string; pos: number }> = [];
  // 1. Markdown bold names — the most reliable signal in AI-generated
  //    list answers. Uses a non-greedy 1–3 trailing tokens cap so we
  //    don't run on the whole bolded phrase.
  const boldRe = /\*\*([A-Z][a-zA-Z'\-]+(?: [A-Z][a-zA-Z'\-]+){1,3})\*\*/g;
  for (const m of text.matchAll(boldRe)) {
    if (m.index !== undefined) {
      const nameOffset = m[0].indexOf(m[1]);
      out.push({ name: m[1], pos: m.index + nameOffset });
    }
  }
  // 2. Line-leading capitalized name followed by separator (-, –, :).
  //    Allows optional list marker (1. / - / *) before the name.
  const lineLedRe = /(?:^|\n)\s*(?:\d+\.\s+|[-*]\s+)?([A-Z][a-zA-Z'\-]+(?: [A-Z][a-zA-Z'\-]+){1,3})\s*[-–:]/g;
  for (const m of text.matchAll(lineLedRe)) {
    if (m.index !== undefined) {
      const nameOffset = m[0].indexOf(m[1]);
      out.push({ name: m[1], pos: m.index + nameOffset });
    }
  }
  return out;
}

/**
 * Filter the alias list down to terms safe to test against the
 * stripped text. Drops aliases that are just the brand name's first
 * token — e.g. "Mike" alone for "Mike Pence" — because common first
 * names match any other person who shares the first name and produce
 * false positives in any text that names other people. The full first
 * name is fine when paired with the last (kept via multi-word aliases
 * like "Mike Pence" itself).
 *
 * Keeps last-name-only aliases (e.g. "Pence", "Obama") since family
 * names are typically distinctive enough in political/public-figure
 * contexts. Multi-word aliases ("Vice President Pence") and unique
 * nicknames ("Mikey P", "Pencey") are also kept.
 */
export function filterAliases(aliases: string[] | undefined, brandName: string): string[] {
  if (!aliases || aliases.length === 0) return [];
  const firstToken = brandName.trim().split(/\s+/)[0]?.toLowerCase();
  return aliases.filter((alias) => {
    if (alias.length < 3) return false; // too short — false-positive prone
    if (!firstToken) return true;
    // Drop if the alias is exactly the brand's first name (case-insensitive)
    // and the brand name has more than one token (i.e. there IS a last name).
    const aliasLower = alias.trim().toLowerCase();
    const brandTokens = brandName.trim().split(/\s+/);
    if (brandTokens.length > 1 && aliasLower === firstToken) return false;
    return true;
  });
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
  // URLs in citations match aliases via their query-string `+` and `-`
  // separators (e.g. "+Mike+Johnson+" matched the alias "Mike" for Mike
  // Pence). Strip them before running the boundary check so detection
  // reflects the prose answer, not citation noise.
  const cleaned = stripUrls(text);
  if (wordBoundaryRegex(brandName).test(cleaned)) return true;
  if (wordBoundaryRegex(brandSlug).test(cleaned)) return true;
  for (const alias of filterAliases(aliases, brandName)) {
    if (wordBoundaryRegex(alias).test(cleaned)) return true;
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
  // Strip URLs/citations before any matching — same rationale as
  // isBrandMentioned. Without this a citation like
  // "(news.example.com/?q=Speaker+Mike+Johnson)" matches the alias
  // "Mike" and the brand falsely ranks #1 in a response that doesn't
  // mention them.
  const cleaned = stripUrls(responseText);
  const namePos = wordBoundaryIndex(cleaned, brandName);
  const slugPos = wordBoundaryIndex(cleaned, brandSlug);
  const positions = [namePos, slugPos].filter((p) => p >= 0);
  for (const alias of filterAliases(aliases, brandName)) {
    const aliasPos = wordBoundaryIndex(cleaned, alias);
    if (aliasPos >= 0) positions.push(aliasPos);
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

  // Build a deduped name → earliest-position map across both signals:
  //   1. GPT-extracted competitors (positions found via word-boundary
  //      match in the cleaned text)
  //   2. Heuristic-extracted likely person names from the original
  //      response text (markdown bold / line-leading list patterns).
  //      Run against the un-stripped text since list structure can
  //      live inside markdown (and the heuristic doesn't get tripped
  //      by URLs the same way alias matching does).
  // Dedup is case-insensitive by full name; we keep the earliest
  // position so ties don't double-count.
  const beforeBrandNames = new Map<string, number>(); // lowercase name → pos
  const brandNameLower = brandName.toLowerCase();
  const recordCandidate = (name: string, pos: number) => {
    const key = name.toLowerCase();
    // Skip the brand itself (incl. case-insensitive variants and the
    // hash-suffixed cache form).
    if (key === brandNameLower) return;
    if (brandNameLower.startsWith(key) || key.startsWith(brandNameLower)) return;
    const existing = beforeBrandNames.get(key);
    if (existing === undefined || pos < existing) {
      beforeBrandNames.set(key, pos);
    }
  };
  for (const comp of competitors) {
    const compPos = wordBoundaryIndex(cleaned, comp);
    if (compPos >= 0) recordCandidate(comp, compPos);
  }
  // Run the heuristic on the cleaned text so positions are comparable
  // to brandPos (which was computed against cleaned). URLs stripped
  // by stripUrls don't contain markdown bold names; markdown link
  // labels survive (e.g. [Joe Biden](url) → Joe Biden), which is what
  // we want for name detection.
  for (const { name, pos } of extractLikelyPersonNames(cleaned)) {
    recordCandidate(name, pos);
  }

  let rank = 1;
  for (const pos of beforeBrandNames.values()) {
    if (pos < brandPos) rank++;
  }

  return rank;
}
