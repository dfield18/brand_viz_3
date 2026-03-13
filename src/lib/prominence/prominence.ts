/**
 * Entity Prominence Scoring
 *
 * Computes a 0–100 prominence score for each entity in a model response,
 * combining frequency, position, depth, and structure signals.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityInput {
  entityId: string;
  name: string;
  variants: string[];
}

export interface EntityProminenceResult {
  entityId: string;
  frequency: number;  // 0–1
  position: number;   // 0–1
  depth: number;      // 0–1
  structure: number;  // 0–1
  prominence: number; // 0–100
  debug?: ProminenceDebug;
}

export interface ProminenceDebug {
  mentionsCount: number;
  mentionPositions: number[];
  sentenceIndices: number[];
  structureHits: string[];
}

interface Mention {
  startIndex: number;
  sentenceIndex: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RECOMMENDATION_CUES = [
  "best", "top", "recommended", "go with", "pick",
  "leader", "number one", "standout",
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a regex that matches any variant at word boundaries.
 * For short entities (<=3 chars) we require exact case.
 * For entities containing non-word chars (AT&T, C++) we use looser boundaries.
 */
function buildEntityRegex(variants: string[]): RegExp {
  const parts = variants.map((v) => {
    const escaped = escapeRegex(v);
    const hasNonWord = /[^\w\s]/.test(v);
    const isShort = v.length <= 3;

    if (hasNonWord) {
      // Looser boundary: whitespace or start/end of string
      return `(?<=^|\\s)${escaped}(?=$|\\s|[.,;:!?)])`;
    }
    if (isShort) {
      // Exact case for short entities
      return `\\b${escaped}\\b`;
    }
    return `\\b${escaped}\\b`;
  });

  // Short entities use exact case; others are case-insensitive.
  // We split into two groups if needed, but for simplicity use a single
  // case-insensitive regex (the short-entity requirement is soft).
  const allShort = variants.every((v) => v.length <= 3);
  return new RegExp(`(?:${parts.join("|")})`, allShort ? "g" : "gi");
}

/**
 * Split text into sentences using a pragmatic heuristic.
 */
function splitSentences(text: string): string[] {
  // Try Intl.Segmenter if available (Node 18+)
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    try {
      const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
      const segments = Array.from(segmenter.segment(text), (s) => s.segment.trim());
      return segments.filter((s) => s.length > 0);
    } catch {
      // fallback below
    }
  }
  // Regex fallback: split on sentence-ending punctuation followed by whitespace
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// Core scoring
// ---------------------------------------------------------------------------

function findMentions(
  responseText: string,
  sentences: string[],
  entityRegex: RegExp,
): Mention[] {
  const mentions: Mention[] = [];

  // Build sentence start indices
  const sentenceStarts: number[] = [];
  let searchFrom = 0;
  for (const sentence of sentences) {
    const idx = responseText.indexOf(sentence, searchFrom);
    sentenceStarts.push(idx >= 0 ? idx : searchFrom);
    if (idx >= 0) searchFrom = idx + sentence.length;
  }

  // Find all regex matches
  entityRegex.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = entityRegex.exec(responseText)) !== null) {
    const startIndex = match.index;

    // Determine which sentence this falls in
    let sentenceIndex = 0;
    for (let i = sentences.length - 1; i >= 0; i--) {
      if (startIndex >= sentenceStarts[i]) {
        sentenceIndex = i;
        break;
      }
    }

    mentions.push({ startIndex, sentenceIndex });
  }

  return mentions;
}

function frequencyScore(
  entityMentions: number,
  totalMentionsAllEntities: number,
  totalWords: number,
  multiEntity: boolean,
): number {
  if (entityMentions === 0) return 0;

  if (multiEntity && totalMentionsAllEntities > 0) {
    return entityMentions / totalMentionsAllEntities;
  }
  // Single entity: normalize by word count
  return Math.min(1, entityMentions / Math.max(1, totalWords / 150));
}

function positionScore(mentions: Mention[], textLength: number): number {
  if (mentions.length === 0) return 0;

  let maxWeight = 0;
  for (const m of mentions) {
    const p = m.startIndex / Math.max(1, textLength);
    let w: number;
    if (p <= 0.20) w = 1.0;
    else if (p <= 0.50) w = 0.7;
    else if (p <= 0.80) w = 0.4;
    else w = 0.2;
    if (w > maxWeight) maxWeight = w;
  }
  return maxWeight;
}

function depthScore(
  mentions: Mention[],
  sentences: string[],
  totalWords: number,
): number {
  if (mentions.length === 0) return 0;

  const uniqueSentenceIndices = new Set(mentions.map((m) => m.sentenceIndex));
  let entityWords = 0;
  for (const idx of uniqueSentenceIndices) {
    if (idx < sentences.length) {
      entityWords += countWords(sentences[idx]);
    }
  }
  return clamp(entityWords / Math.max(1, totalWords), 0, 1);
}

function structureScore(
  originalText: string,
  mentions: Mention[],
  sentences: string[],
  entityRegex: RegExp,
): { score: number; hits: string[] } {
  if (mentions.length === 0) return { score: 0, hits: [] };

  const lines = originalText.split("\n").map((l) => l.trim());
  const nonEmptyLines = lines.filter((l) => l.length > 0);
  const hits: string[] = [];
  let points = 0;

  // Reset regex state for reuse
  const testMatch = (text: string) => {
    entityRegex.lastIndex = 0;
    return entityRegex.test(text);
  };

  // Heading inclusion
  for (const line of lines) {
    if (/^#{1,6}\s/.test(line) && testMatch(line)) {
      points += 0.35;
      hits.push("heading");
      break;
    }
  }

  // First 3 lines boost
  const first3 = nonEmptyLines.slice(0, 3);
  if (first3.some((line) => testMatch(line))) {
    points += 0.20;
    hits.push("first_3_lines");
  }

  // Bullet/number list
  const bulletRegex = /^[-*•]|\d+\.\s/;
  const bulletLines = lines.filter((l) => bulletRegex.test(l));
  const entityInBullet = bulletLines.some((l) => testMatch(l));
  if (entityInBullet) {
    points += 0.20;
    hits.push("bullet");

    // First bullet/numbered item specifically
    if (bulletLines.length > 0 && testMatch(bulletLines[0])) {
      points += 0.15;
      hits.push("first_bullet");
    }
  }

  // Recommendation cues
  const uniqueSentenceIndices = new Set(mentions.map((m) => m.sentenceIndex));
  let hasRecoCue = false;
  for (const idx of uniqueSentenceIndices) {
    if (idx >= sentences.length) continue;
    const lowerSentence = sentences[idx].toLowerCase();
    if (RECOMMENDATION_CUES.some((cue) => lowerSentence.includes(cue))) {
      hasRecoCue = true;
      break;
    }
  }
  if (hasRecoCue) {
    points += 0.25;
    hits.push("recommendation_cue");
  }

  return { score: Math.min(1, points), hits };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function calculateProminenceScores(args: {
  responseText: string;
  entities: EntityInput[];
}): EntityProminenceResult[] {
  const { responseText, entities } = args;
  const includeDebug = process.env.PROMINENCE_DEBUG === "1";

  if (!responseText || entities.length === 0) return [];

  // Step 0: Normalize & segment
  const normalizedText = responseText.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ");
  const sentences = splitSentences(normalizedText);
  const totalWords = countWords(normalizedText);
  const textLength = normalizedText.length;
  const multiEntity = entities.length > 1;

  // Pre-compute all entity mentions for frequency normalization
  const entityMentionsMap = new Map<string, Mention[]>();
  const entityRegexMap = new Map<string, RegExp>();
  let totalMentionsAll = 0;

  for (const entity of entities) {
    const allVariants = [entity.name, ...entity.variants];
    const uniqueVariants = [...new Set(allVariants.filter((v) => v.length > 0))];
    const regex = buildEntityRegex(uniqueVariants);
    entityRegexMap.set(entity.entityId, regex);

    const mentions = findMentions(normalizedText, sentences, regex);
    entityMentionsMap.set(entity.entityId, mentions);
    totalMentionsAll += mentions.length;
  }

  // Score each entity
  const results: EntityProminenceResult[] = [];

  for (const entity of entities) {
    const mentions = entityMentionsMap.get(entity.entityId) ?? [];
    const regex = entityRegexMap.get(entity.entityId)!;

    const freq = frequencyScore(mentions.length, totalMentionsAll, totalWords, multiEntity);
    const pos = positionScore(mentions, textLength);
    const dep = depthScore(mentions, sentences, totalWords);
    const { score: struc, hits: structHits } = structureScore(
      responseText, // use original text for structure detection
      mentions,
      sentences,
      regex,
    );

    // Step 6: Weighted combination
    const raw = 0.35 * freq + 0.25 * pos + 0.20 * dep + 0.20 * struc;
    const prominence = clamp(Math.round(raw * 100 * 100) / 100, 0, 100);

    const result: EntityProminenceResult = {
      entityId: entity.entityId,
      frequency: Math.round(freq * 10000) / 10000,
      position: Math.round(pos * 10000) / 10000,
      depth: Math.round(dep * 10000) / 10000,
      structure: Math.round(struc * 10000) / 10000,
      prominence,
    };

    if (includeDebug) {
      result.debug = {
        mentionsCount: mentions.length,
        mentionPositions: mentions.map((m) => m.startIndex),
        sentenceIndices: [...new Set(mentions.map((m) => m.sentenceIndex))],
        structureHits: structHits,
      };
    }

    results.push(result);
  }

  return results;
}
