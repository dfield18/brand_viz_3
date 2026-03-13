/**
 * URL extraction and normalization from AI response text.
 * Pure functions — no database access.
 */

export interface ExtractedUrl {
  originalUrl: string;
  normalizedUrl: string;
  domain: string;
  sourceType: "markdown_link" | "bare_url";
  positionIndex: number; // char offset of URL in response text
}

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "fbclid", "gclid", "mc_cid", "mc_eid", "ref", "source",
]);

const MARKDOWN_LINK_RE = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
const BARE_URL_RE = /https?:\/\/[^\s)>\]"'`]+/g;

/**
 * Normalize a URL: lowercase domain, strip tracking params, remove fragment.
 * Returns null if URL is unparseable.
 */
export function normalizeUrl(rawUrl: string): { normalized: string; domain: string } | null {
  // Strip trailing punctuation that isn't part of the URL
  const cleaned = rawUrl.replace(/[.,;:!?]+$/, "");
  try {
    const url = new URL(cleaned);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;

    // Strip tracking params
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }

    // Remove fragment
    url.hash = "";

    return {
      normalized: url.toString(),
      domain: url.hostname.toLowerCase(),
    };
  } catch {
    return null;
  }
}

/**
 * Extract all URLs from response text (markdown links + bare URLs).
 * Deduplicates by normalizedUrl, keeping the first occurrence.
 */
export function extractUrls(responseText: string): ExtractedUrl[] {
  const results: ExtractedUrl[] = [];
  const seen = new Set<string>();

  // Track char ranges covered by markdown links to avoid double-extraction
  const coveredRanges: [number, number][] = [];

  // Pass 1: Markdown links [text](url)
  MARKDOWN_LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKDOWN_LINK_RE.exec(responseText)) !== null) {
    const rawUrl = match[2];
    const norm = normalizeUrl(rawUrl);
    if (!norm) continue;

    if (!seen.has(norm.normalized)) {
      seen.add(norm.normalized);
      results.push({
        originalUrl: rawUrl,
        normalizedUrl: norm.normalized,
        domain: norm.domain,
        sourceType: "markdown_link",
        positionIndex: match.index,
      });
    }

    // Track the full markdown link range [start of '[', end of ')']
    coveredRanges.push([match.index, match.index + match[0].length]);
  }

  // Pass 2: Bare URLs — skip if inside a markdown link span
  BARE_URL_RE.lastIndex = 0;
  while ((match = BARE_URL_RE.exec(responseText)) !== null) {
    const pos = match.index;
    const inMarkdown = coveredRanges.some(([start, end]) => pos >= start && pos < end);
    if (inMarkdown) continue;

    const rawUrl = match[0];
    const norm = normalizeUrl(rawUrl);
    if (!norm) continue;

    if (!seen.has(norm.normalized)) {
      seen.add(norm.normalized);
      results.push({
        originalUrl: rawUrl,
        normalizedUrl: norm.normalized,
        domain: norm.domain,
        sourceType: "bare_url",
        positionIndex: pos,
      });
    }
  }

  return results.sort((a, b) => a.positionIndex - b.positionIndex);
}
