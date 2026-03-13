/**
 * Heuristic narrative extraction from raw LLM response text.
 * Extracts themes, descriptors, claims, and sentiment signals
 * from sentences surrounding brand mentions.
 */

import { THEME_TAXONOMY } from "./themeTaxonomy";
import {
  AUTHORITY_SIGNALS,
  TRUST_SIGNALS,
  WEAKNESS_SIGNALS,
  POSITIVE_DESCRIPTORS,
  NEGATIVE_DESCRIPTORS,
} from "./signalLexicons";
import {
  splitSentences,
  getEntityContextWindow,
  countSignalHits,
  escapeRegex,
} from "./textUtils";
import { openai } from "@/lib/openai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NarrativeExtractionResult {
  sentiment: { label: "POS" | "NEU" | "NEG"; score: number };
  authoritySignals: number;
  trustSignals: number;
  weaknessSignals: number;
  themes: { key: string; label: string; score: number; evidence: string[] }[];
  descriptors: { word: string; polarity: "positive" | "negative" | "neutral"; count: number }[];
  claims: { type: "strength" | "weakness" | "neutral"; text: string }[];
}

// ---------------------------------------------------------------------------
// Stopwords for descriptor filtering
// ---------------------------------------------------------------------------

const DESCRIPTOR_STOPWORDS = new Set([
  "very", "really", "quite", "rather", "somewhat", "also", "just",
  "more", "most", "much", "many", "other", "some", "such", "own",
  "same", "new", "old", "good", "bad", "big", "small", "high", "low",
  "first", "last", "long", "short", "right", "left", "next", "few",
  "only", "well", "even", "still", "both", "each", "all", "any",
  "the", "this", "that", "these", "those", "its", "their", "which",
]);

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------

export async function extractNarrativeForRun(
  responseText: string,
  brandName: string,
  brandSlug: string,
): Promise<NarrativeExtractionResult> {
  const sentences = splitSentences(responseText);
  const contextSentences = getEntityContextWindow(sentences, brandName, brandSlug);
  const contextText = contextSentences.join(" ");

  // If brand isn't mentioned at all, return minimal result
  if (contextSentences.length === 0) {
    return {
      sentiment: { label: "NEU", score: 0 },
      authoritySignals: 0,
      trustSignals: 0,
      weaknessSignals: 0,
      themes: [],
      descriptors: [],
      claims: [],
    };
  }

  // --- Signal counts ---
  const authorityCount = countSignalHits(contextText, AUTHORITY_SIGNALS);
  const trustCount = countSignalHits(contextText, TRUST_SIGNALS);
  const weaknessCount = countSignalHits(contextText, WEAKNESS_SIGNALS);

  // --- Themes ---
  const themes = extractThemes(contextSentences);

  // --- Descriptors ---
  const descriptors = extractDescriptors(contextSentences, brandName, brandSlug);

  // --- Claims (LLM with keyword fallback) ---
  let claims: { type: "strength" | "weakness" | "neutral"; text: string }[];
  try {
    claims = await classifyClaimsWithLLM(contextSentences, brandName, brandSlug);
  } catch {
    claims = extractClaimsKeyword(contextSentences, brandName, brandSlug);
  }

  // --- Sentiment ---
  const positiveCount = authorityCount + trustCount;
  const negativeCount = weaknessCount;
  const totalSignals = Math.max(1, positiveCount + negativeCount);
  const sentimentScore = (positiveCount - negativeCount) / totalSignals;
  const sentimentLabel: "POS" | "NEU" | "NEG" =
    sentimentScore >= 0.25 ? "POS" : sentimentScore <= -0.25 ? "NEG" : "NEU";

  return {
    sentiment: { label: sentimentLabel, score: Math.round(sentimentScore * 100) / 100 },
    authoritySignals: authorityCount,
    trustSignals: trustCount,
    weaknessSignals: weaknessCount,
    themes,
    descriptors,
    claims,
  };
}

// ---------------------------------------------------------------------------
// Competitor narrative extraction (keyword-only, no LLM calls)
// ---------------------------------------------------------------------------

export async function extractCompetitorNarratives(
  responseText: string,
  competitors: { name: string }[],
): Promise<Record<string, NarrativeExtractionResult>> {
  const sentences = splitSentences(responseText);
  const results: Record<string, NarrativeExtractionResult> = {};

  for (const comp of competitors) {
    const entityId = comp.name.toLowerCase();
    const contextSentences = getEntityContextWindow(sentences, comp.name, entityId);

    if (contextSentences.length === 0) {
      results[entityId] = {
        sentiment: { label: "NEU", score: 0 },
        authoritySignals: 0,
        trustSignals: 0,
        weaknessSignals: 0,
        themes: [],
        descriptors: [],
        claims: [],
      };
      continue;
    }

    const contextText = contextSentences.join(" ");
    const authorityCount = countSignalHits(contextText, AUTHORITY_SIGNALS);
    const trustCount = countSignalHits(contextText, TRUST_SIGNALS);
    const weaknessCount = countSignalHits(contextText, WEAKNESS_SIGNALS);

    const themes = extractThemes(contextSentences);
    const descriptors = extractDescriptors(contextSentences, comp.name, entityId);
    const claims = extractClaimsKeyword(contextSentences, comp.name, entityId);

    const positiveCount = authorityCount + trustCount;
    const negativeCount = weaknessCount;
    const totalSignals = Math.max(1, positiveCount + negativeCount);
    const sentimentScore = (positiveCount - negativeCount) / totalSignals;
    const sentimentLabel: "POS" | "NEU" | "NEG" =
      sentimentScore >= 0.25 ? "POS" : sentimentScore <= -0.25 ? "NEG" : "NEU";

    results[entityId] = {
      sentiment: { label: sentimentLabel, score: Math.round(sentimentScore * 100) / 100 },
      authoritySignals: authorityCount,
      trustSignals: trustCount,
      weaknessSignals: weaknessCount,
      themes,
      descriptors,
      claims,
    };
  }

  return results;
}

// ---------------------------------------------------------------------------
// Theme extraction
// ---------------------------------------------------------------------------

function extractThemes(
  contextSentences: string[],
): { key: string; label: string; score: number; evidence: string[] }[] {
  const contextText = contextSentences.join(" ").toLowerCase();

  const results: { key: string; label: string; score: number; evidence: string[] }[] = [];

  for (const theme of THEME_TAXONOMY) {
    // Check negative keywords first
    if (theme.negativeKeywords) {
      const hasNegative = theme.negativeKeywords.some((nk) =>
        contextText.includes(nk.toLowerCase()),
      );
      if (hasNegative) continue;
    }

    let hits = 0;
    const evidence: string[] = [];

    for (const sentence of contextSentences) {
      const lower = sentence.toLowerCase();
      let sentenceHit = false;

      for (const keyword of theme.keywords) {
        if (keyword.includes(" ")) {
          if (lower.includes(keyword)) {
            hits++;
            sentenceHit = true;
          }
        } else {
          const re = new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i");
          if (re.test(sentence)) {
            hits++;
            sentenceHit = true;
          }
        }
      }

      if (sentenceHit && evidence.length < 2) {
        evidence.push(sentence.slice(0, 200));
      }
    }

    const score = Math.min(1, hits / 3);
    if (score >= 0.2) {
      results.push({ key: theme.key, label: theme.label, score, evidence });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

// ---------------------------------------------------------------------------
// Descriptor extraction
// ---------------------------------------------------------------------------

function extractDescriptors(
  contextSentences: string[],
  brandName: string,
  brandSlug: string,
): { word: string; polarity: "positive" | "negative" | "neutral"; count: number }[] {
  const brandPattern = `(?:${escapeRegex(brandName)}|${escapeRegex(brandSlug)})`;

  // Patterns to extract adjectives near brand mentions
  const patterns = [
    // "[Brand] is/are (a/an/the)? <adj>"
    new RegExp(`${brandPattern}\\s+(?:is|are|was|were|seems|remains)\\s+(?:a\\s+|an\\s+|the\\s+)?([a-z][a-z-]+)`, "gi"),
    // "<adj> [Brand]"
    new RegExp(`\\b([a-z][a-z-]+)\\s+${brandPattern}`, "gi"),
    // "[Brand]'s <adj> <noun>"
    new RegExp(`${brandPattern}'s\\s+([a-z][a-z-]+)`, "gi"),
    // "known for being <adj>"
    new RegExp(`${brandPattern}\\s+(?:is|are)\\s+(?:known|recognized|regarded)\\s+(?:for|as)\\s+(?:being\\s+|a\\s+)?([a-z][a-z-]+)`, "gi"),
  ];

  const counts: Record<string, number> = {};

  for (const sentence of contextSentences) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(sentence)) !== null) {
        const word = match[1]?.toLowerCase().trim();
        if (word && word.length >= 3 && !DESCRIPTOR_STOPWORDS.has(word)) {
          counts[word] = (counts[word] || 0) + 1;
        }
      }
    }
  }

  const positiveSet = new Set(POSITIVE_DESCRIPTORS.map((d) => d.toLowerCase()));
  const negativeSet = new Set(NEGATIVE_DESCRIPTORS.map((d) => d.toLowerCase()));

  return Object.entries(counts)
    .map(([word, count]) => {
      const polarity: "positive" | "negative" | "neutral" = positiveSet.has(word)
        ? "positive"
        : negativeSet.has(word)
          ? "negative"
          : "neutral";
      return { word, polarity, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

// ---------------------------------------------------------------------------
// LLM-based claim classification
// ---------------------------------------------------------------------------

const CLAIM_CLASSIFY_MODEL = "gpt-4o-mini";
const CLAIM_CLASSIFY_TIMEOUT_MS = 10_000;

const CLAIM_CLASSIFY_SYSTEM = `You classify sentences about a brand into "strength", "weakness", or "neutral".

A "strength" is a sentence that makes a specific, substantive positive claim about the brand — e.g. quality, trust, innovation, leadership, reliability, superior performance, good reputation, customer satisfaction, market leadership.
A "weakness" is a sentence that makes a specific, substantive negative claim about the brand — e.g. criticism, controversy, limitations, complaints, high price as a downside, poor service, legal issues, safety concerns, competitive disadvantages.
A "neutral" is anything else: factual statements, generic list introductions (e.g. "here are the top brands"), transitional phrases, definitions, or descriptive sentences with no clear positive or negative framing about the brand.

IMPORTANT: Be strict. Only classify as "strength" or "weakness" if the sentence makes a clear, specific claim about the brand's qualities, performance, or reputation. Generic mentions, list headers, or sentences that merely include the brand name without making a substantive claim should be "neutral".

Return a JSON array of objects: [{"index": 0, "type": "strength"}, {"index": 1, "type": "weakness"}, ...]
where "index" corresponds to the sentence position in the input array.
Return ONLY valid JSON. No markdown fences, no explanation.`;

async function classifyClaimsWithLLM(
  contextSentences: string[],
  brandName: string,
  brandSlug: string,
): Promise<{ type: "strength" | "weakness" | "neutral"; text: string }[]> {
  const brandLower = brandName.toLowerCase();
  const slugLower = brandSlug.toLowerCase();

  // Filter to brand-mentioning sentences, skip generic intros, and truncate
  const candidates: { index: number; text: string }[] = [];
  const seen = new Set<string>();
  for (const sentence of contextSentences) {
    const lower = sentence.toLowerCase();
    if (!lower.includes(brandLower) && !lower.includes(slugLower)) continue;
    // Skip generic list intros and short non-substantive sentences
    if (/^(here (are|is)|the following|below (are|is)|these (are|include)|let me|i('d| would))/i.test(sentence.trim())) continue;
    if (sentence.trim().length < 20) continue;
    const trimmed = sentence.length <= 300
      ? sentence.trim()
      : sentence.slice(0, 300).replace(/\s+\S*$/, "").trim() + "…";
    if (seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    candidates.push({ index: candidates.length, text: trimmed });
  }

  if (candidates.length === 0) return [];

  const userPrompt = `Brand: "${brandName}"\n\nSentences:\n${candidates.map((c, i) => `[${i}] ${c.text}`).join("\n")}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLAIM_CLASSIFY_TIMEOUT_MS);

  try {
    const response = await openai.responses.create(
      {
        model: CLAIM_CLASSIFY_MODEL,
        input: [
          { role: "system", content: CLAIM_CLASSIFY_SYSTEM },
          { role: "user", content: userPrompt },
        ],
        max_output_tokens: 512,
      },
      { signal: controller.signal },
    );
    clearTimeout(timer);

    const raw = (response.output_text ?? "")
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const parsed = JSON.parse(raw) as { index: number; type: string }[];

    const validTypes = new Set(["strength", "weakness", "neutral"]);
    const claims: { type: "strength" | "weakness" | "neutral"; text: string }[] = [];
    for (const item of parsed) {
      const candidate = candidates[item.index];
      if (!candidate) continue;
      const type = validTypes.has(item.type) ? (item.type as "strength" | "weakness" | "neutral") : "neutral";
      claims.push({ type, text: candidate.text });
    }

    // Return top 5 per type
    const strengths = claims.filter((c) => c.type === "strength").slice(0, 5);
    const weaknesses = claims.filter((c) => c.type === "weakness").slice(0, 5);
    const neutrals = claims.filter((c) => c.type === "neutral").slice(0, 5);
    return [...strengths, ...weaknesses, ...neutrals];
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Keyword-based claim classification (fallback)
// ---------------------------------------------------------------------------

function extractClaimsKeyword(
  contextSentences: string[],
  brandName: string,
  brandSlug: string,
): { type: "strength" | "weakness" | "neutral"; text: string }[] {
  const brandLower = brandName.toLowerCase();
  const slugLower = brandSlug.toLowerCase();
  const seen = new Set<string>();
  const claims: { type: "strength" | "weakness" | "neutral"; text: string }[] = [];

  for (const sentence of contextSentences) {
    const lower = sentence.toLowerCase();
    const mentionsBrand = lower.includes(brandLower) || lower.includes(slugLower);
    if (!mentionsBrand) continue;

    // Skip generic list intros and short non-substantive sentences
    if (/^(here (are|is)|the following|below (are|is)|these (are|include)|let me|i('d| would))/i.test(sentence.trim())) continue;
    if (sentence.trim().length < 20) continue;

    const hasAuthority = AUTHORITY_SIGNALS.some((s) => lower.includes(s.toLowerCase()));
    const hasTrust = TRUST_SIGNALS.some((s) => lower.includes(s.toLowerCase()));
    const hasWeakness = WEAKNESS_SIGNALS.some((s) => lower.includes(s.toLowerCase()));

    const trimmed = sentence.length <= 300
      ? sentence.trim()
      : sentence.slice(0, 300).replace(/\s+\S*$/, "").trim() + "…";
    if (seen.has(trimmed.toLowerCase())) continue;

    if (hasAuthority || hasTrust) {
      seen.add(trimmed.toLowerCase());
      claims.push({ type: "strength", text: trimmed });
    } else if (hasWeakness) {
      seen.add(trimmed.toLowerCase());
      claims.push({ type: "weakness", text: trimmed });
    } else {
      seen.add(trimmed.toLowerCase());
      claims.push({ type: "neutral", text: trimmed });
    }
  }

  // Return top 5 strengths + top 5 weaknesses (+ neutrals for fallback)
  const strengths = claims.filter((c) => c.type === "strength").slice(0, 5);
  const weaknesses = claims.filter((c) => c.type === "weakness").slice(0, 5);
  const neutrals = claims.filter((c) => c.type === "neutral").slice(0, 5);
  return [...strengths, ...weaknesses, ...neutrals];
}
