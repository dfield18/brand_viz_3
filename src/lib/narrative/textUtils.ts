/**
 * Shared text utilities for narrative extraction.
 * Sentence splitting reused from prominence module pattern.
 */

export function splitSentences(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    try {
      const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
      const segments = Array.from(segmenter.segment(text), (s) => s.segment.trim());
      return segments.filter((s) => s.length > 0);
    } catch {
      // fallback below
    }
  }
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Get deduplicated context window of sentences around entity mentions.
 * For each sentence mentioning the entity, include prev/next sentences (windowSize).
 */
export function getEntityContextWindow(
  sentences: string[],
  brandName: string,
  brandSlug: string,
  windowSize = 1,
): string[] {
  const nameRe = wordBoundaryRegex(brandName);
  const slugRe = wordBoundaryRegex(brandSlug);

  const mentionIndices = new Set<number>();
  for (let i = 0; i < sentences.length; i++) {
    if (nameRe.test(sentences[i]) || slugRe.test(sentences[i])) {
      mentionIndices.add(i);
    }
  }

  const contextIndices = new Set<number>();
  for (const idx of mentionIndices) {
    for (let offset = -windowSize; offset <= windowSize; offset++) {
      const target = idx + offset;
      if (target >= 0 && target < sentences.length) {
        contextIndices.add(target);
      }
    }
  }

  return Array.from(contextIndices)
    .sort((a, b) => a - b)
    .map((i) => sentences[i]);
}

/**
 * Count how many signal keywords appear in the given text.
 */
export function countSignalHits(text: string, signals: string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const signal of signals) {
    // Use indexOf for multi-word signals, check word boundaries for single words
    if (signal.includes(" ") || signal.includes("-") || signal.startsWith("#")) {
      if (lower.includes(signal.toLowerCase())) count++;
    } else {
      const re = new RegExp(`\\b${escapeRegex(signal)}\\b`, "i");
      if (re.test(text)) count++;
    }
  }
  return count;
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordBoundaryRegex(term: string): RegExp {
  const escaped = escapeRegex(term);
  return new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`, "i");
}
