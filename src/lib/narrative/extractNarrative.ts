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
// LLM-based theme extraction (dynamic, context-aware)
// ---------------------------------------------------------------------------

const THEME_EXTRACT_MODEL = "gpt-4o-mini";
const THEME_EXTRACT_TIMEOUT_MS = 8_000;

/** Threshold for classifying a run's sentiment as POS/NEG vs NEU.
 *
 *  sentimentScore = (positiveDescriptors - negativeDescriptors) / totalDescriptors
 *
 *  Anything inside ±SENTIMENT_THRESHOLD is called Neutral. Previously
 *  ±0.25, which was strict enough that heavily-hedged topics (politicians,
 *  polarizing brands where models deliberately balance pros/cons) landed
 *  as 100% NEU. Dropped to ±0.10 so any ≥10% skew between positive and
 *  negative descriptors tips into POS or NEG — we surface sentiment where
 *  the signal exists, even if it's mild. True balance still reads as NEU. */
const SENTIMENT_THRESHOLD = 0.1;

const THEME_EXTRACT_SYSTEM = `You identify the key narrative themes in text about a specific brand or organization.
Return themes that are specific and relevant to the type of entity being discussed. Avoid generic business jargon — use themes that capture what is actually being said about this specific entity.

Examples by entity type:
- Civil rights org: "Anti-Discrimination Advocacy", "Legal Impact", "Coalition Building", "Policy Influence"
- Tech company: "AI Innovation", "Data Privacy", "Developer Ecosystem", "Platform Reliability"
- Restaurant chain: "Menu Quality", "Franchise Expansion", "Health & Nutrition", "Customer Service"
- Nonprofit: "Fundraising Effectiveness", "Community Programs", "Transparency & Governance"
- University: "Research Excellence", "Student Experience", "Endowment & Funding", "Campus Safety"

Rules:
- Return 3-5 themes that actually appear in the text
- Each theme should be a short, descriptive phrase (2-4 words)
- Use snake_case for the key (e.g., "anti_discrimination")
- Score reflects prominence: 1.0 = dominant theme, 0.3 = minor mention
- Include a brief evidence snippet (1 sentence, max 150 chars)

Return ONLY a valid JSON array:
[{"key": "snake_case", "label": "Human Label", "score": 0.3, "evidence": ["snippet"]}]`;

async function extractThemesWithLLM(
  contextSentences: string[],
  brandName: string,
): Promise<{ key: string; label: string; score: number; evidence: string[] }[]> {
  const contextText = contextSentences.join(" ").slice(0, 2000);
  if (contextText.length < 30) throw new Error("Too little context for LLM");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), THEME_EXTRACT_TIMEOUT_MS);

  try {
    const response = await openai.responses.create(
      {
        model: THEME_EXTRACT_MODEL,
        input: [
          { role: "system", content: THEME_EXTRACT_SYSTEM },
          { role: "user", content: `Brand/Organization: "${brandName}"\n\nText:\n${contextText}` },
        ],
        max_output_tokens: 500,
      },
      { signal: controller.signal },
    );
    clearTimeout(timer);

    const raw = (response.output_text ?? "")
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    const parsed = JSON.parse(raw) as { key: string; label: string; score: number; evidence: string[] }[];

    return parsed
      .filter((t) => t.key && t.label && typeof t.score === "number")
      .map((t) => ({
        key: t.key.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
        label: t.label,
        score: Math.min(1, Math.max(0, t.score)),
        evidence: Array.isArray(t.evidence) ? t.evidence.slice(0, 2).map((e) => String(e).slice(0, 200)) : [],
      }))
      .filter((t) => t.score >= 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  } catch {
    clearTimeout(timer);
    throw new Error("LLM theme extraction failed");
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NarrativeExtractionResult {
  /** Null when the subject wasn't mentioned in the response — the run
   *  carries no sentiment signal about the subject at all. Consumers
   *  that aggregate sentiment should skip these runs instead of
   *  counting them as NEU (which would bias political-figure
   *  distributions toward "100% neutral," since many industry-scope
   *  prompts produce responses that name other figures and not the
   *  target). */
  sentiment: { label: "POS" | "NEU" | "NEG"; score: number } | null;
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
// LLM-based sentiment classification
// ---------------------------------------------------------------------------

const SENTIMENT_CLASSIFY_SYSTEM = `Classify the net lean of the text toward the named entity.

Respond with valid JSON only, no prose, no code fences:
{"label": "POS" | "NEU" | "NEG", "score": number}

IMPORTANT — default to POS or NEG. Your job is detecting net lean, not avoiding a position. Most real-world descriptions carry at least subtle evaluative content; surface it.

Rules:
- POS: any net-positive evaluative content. Praise, endorsement, achievements, favorable comparisons, OR positives outweighing negatives in a hedged "on balance" framing. Score in [0.1, 1.0].
- NEG: any net-negative evaluative content. Criticism, controversies, failures, unfavorable comparisons, OR negatives outweighing positives in hedged framing. Score in [-1.0, -0.1].
- NEU: use SPARINGLY. Only when text is (a) 100% factual — dates, offices, voting records stated without editorial framing — or (b) positives and negatives are deliberately equal with no net lean. Score = 0.

Examples (entity = "Senator X"):
- "Senator X is a champion of working families" → POS
- "Senator X has faced criticism for missing votes" → NEG
- "Senator X represents Pennsylvania and chairs the HELP Committee" → NEU (pure facts)
- "Senator X, widely respected for bipartisan work, has been criticized on issue Y by party leadership" → POS (one complaint doesn't offset "widely respected for bipartisan work")
- "Senator X, a polarizing figure, has passionate supporters and equally passionate critics" → NEU (explicitly balanced)

Balanced political coverage often still has a net lean — detect it. When uncertain between NEU and POS/NEG, pick the direction.`;

const SENTIMENT_CLASSIFY_TIMEOUT_MS = 6_000;

async function classifyRunSentimentWithLLM(
  contextSentences: string[],
  brandName: string,
): Promise<{ label: "POS" | "NEU" | "NEG"; score: number } | null> {
  if (contextSentences.length === 0) return null;
  const text = contextSentences.join(" ").slice(0, 1500);
  if (text.length < 30) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SENTIMENT_CLASSIFY_TIMEOUT_MS);
  try {
    const response = await openai.responses.create(
      {
        model: THEME_EXTRACT_MODEL,
        input: [
          { role: "system", content: SENTIMENT_CLASSIFY_SYSTEM },
          { role: "user", content: `Entity: "${brandName}"\n\nText:\n${text}` },
        ],
        max_output_tokens: 60,
      },
      { signal: controller.signal },
    );
    clearTimeout(timer);
    const raw = (response.output_text ?? "")
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    if (!raw) return null;

    // Parse the whole response first (system prompt asks for JSON-only).
    // Fall back to a greedy brace-match only if direct parse fails — a
    // prose-wrapped response like "Reasoning: {thought} Answer: {...}"
    // would make the old regex-first path grab everything between the
    // first `{` and last `}`, producing invalid JSON and silently
    // dropping us into the keyword fallback.
    let parsed: { label?: unknown; score?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[^{}]*\}/);
      if (!match) return null;
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        return null;
      }
    }

    if (
      (parsed.label === "POS" || parsed.label === "NEU" || parsed.label === "NEG") &&
      typeof parsed.score === "number" &&
      Number.isFinite(parsed.score)
    ) {
      // NEU must be zero per the system prompt's score contract; coerce
      // a non-compliant nonzero NEU so downstream math stays consistent.
      const clampedScore = parsed.label === "NEU"
        ? 0
        : Math.max(-1, Math.min(1, parsed.score));
      return {
        label: parsed.label,
        score: Math.round(clampedScore * 100) / 100,
      };
    }
    return null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

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

  // Subject isn't mentioned — emit null sentiment so aggregators can
  // skip this run instead of silently counting it as NEU.
  if (contextSentences.length === 0) {
    return {
      sentiment: null,
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

  // --- Themes (dynamic, context-aware) ---
  const themes = await extractThemesDynamic(contextSentences, brandName);

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
  // Primary signal: LLM classification of the brand-context text. The
  // keyword-based approach below was built on commercial-brand lexicon
  // ("leader", "trusted", "expensive", etc.), so for politicians,
  // advocacy orgs, cultural figures, or any brand where AI uses
  // different vocabulary, it returned 0 positive + 0 negative signals
  // → score 0 → NEU. Result: the platform sentiment chart often
  // showed "100% neutral" even when clear sentiment existed.
  const llmSentiment = await classifyRunSentimentWithLLM(contextSentences, brandName);

  // Keyword signals are still computed and persisted because the
  // surrounding pipeline uses authorityCount/trustCount/weaknessCount
  // for the Authority, Trust, and Weakness rate percentages — those
  // aren't sentiment, they're independent narrative dimensions.
  const positiveCount = authorityCount + trustCount;
  const negativeCount = weaknessCount;
  const totalSignals = Math.max(1, positiveCount + negativeCount);
  const keywordScore = (positiveCount - negativeCount) / totalSignals;
  const keywordLabel: "POS" | "NEU" | "NEG" =
    keywordScore >= SENTIMENT_THRESHOLD ? "POS" : keywordScore <= -SENTIMENT_THRESHOLD ? "NEG" : "NEU";

  const sentiment = llmSentiment ?? {
    label: keywordLabel,
    score: Math.round(keywordScore * 100) / 100,
  };

  return {
    sentiment,
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

    const themes = extractThemesKeyword(contextSentences);
    const descriptors = extractDescriptors(contextSentences, comp.name, entityId);
    const claims = extractClaimsKeyword(contextSentences, comp.name, entityId);

    const positiveCount = authorityCount + trustCount;
    const negativeCount = weaknessCount;
    const totalSignals = Math.max(1, positiveCount + negativeCount);
    const sentimentScore = (positiveCount - negativeCount) / totalSignals;
    const sentimentLabel: "POS" | "NEU" | "NEG" =
      sentimentScore >= SENTIMENT_THRESHOLD ? "POS" : sentimentScore <= -SENTIMENT_THRESHOLD ? "NEG" : "NEU";

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
// Theme extraction (dynamic LLM with keyword fallback)
// ---------------------------------------------------------------------------

async function extractThemesDynamic(
  contextSentences: string[],
  brandName: string,
): Promise<{ key: string; label: string; score: number; evidence: string[] }[]> {
  try {
    return await extractThemesWithLLM(contextSentences, brandName);
  } catch {
    // Fallback to keyword matching
    return extractThemesKeyword(contextSentences);
  }
}

function extractThemesKeyword(
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
// Post-classification safety net — catch misclassified strengths
// ---------------------------------------------------------------------------

const NEGATIVE_PHRASES = [
  "stop working with", "called for", "called on", "boycott", "backlash",
  "distanced themselves", "cut ties", "sever ties", "pulled support",
  "faced criticism", "under fire", "accused of", "allegations",
  "sued", "lawsuit", "legal action", "investigation",
  "concerns about", "concerns over", "concerns regarding",
  "controversy", "controversial", "scandals", "scandal",
  "protested", "protest against", "condemned", "denounced",
  "criticized for", "criticism of", "critics say", "critics argue",
  "opposition to", "opposed by", "rejected by",
  "lost trust", "lost credibility", "damaged reputation",
  "problematic", "complicit", "bias", "biased",
];

/** Returns true if text contains phrases indicating criticism, even if phrased indirectly. */
function looksNegative(text: string): boolean {
  const lower = text.toLowerCase();
  return NEGATIVE_PHRASES.some((phrase) => lower.includes(phrase));
}

// ---------------------------------------------------------------------------
// LLM-based claim classification
// ---------------------------------------------------------------------------

const CLAIM_CLASSIFY_MODEL = "gpt-4o-mini";
const CLAIM_CLASSIFY_TIMEOUT_MS = 10_000;

const CLAIM_CLASSIFY_SYSTEM = `You classify sentences about a brand into "strength", "weakness", or "neutral".

A "strength" is a sentence that makes a specific, substantive positive claim about the brand — e.g. quality, trust, innovation, leadership, reliability, superior performance, good reputation, customer satisfaction, market leadership.

A "weakness" is a sentence that makes a specific, substantive negative claim about the brand — e.g. criticism, controversy, limitations, complaints, high price as a downside, poor service, legal issues, safety concerns, competitive disadvantages.

CRITICAL: Indirect criticism is still a weakness. If a sentence describes others criticizing, boycotting, protesting, suing, or calling for action against the brand, that is a "weakness" — even if the sentence is written in a neutral, factual tone. Examples of weaknesses:
- "Some groups have called for people to stop working with [Brand]"
- "Critics have accused [Brand] of bias in its reporting"
- "[Brand] has faced backlash over its stance on..."
- "Several organizations have distanced themselves from [Brand]"
- "Concerns have been raised about [Brand]'s political alignment"
- "[Brand] has been sued for..."

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

    // Post-classification validation: reclassify misclassified strengths
    for (const claim of claims) {
      if (claim.type === "strength" && looksNegative(claim.text)) {
        claim.type = "weakness";
      }
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

    if ((hasAuthority || hasTrust) && !looksNegative(trimmed)) {
      seen.add(trimmed.toLowerCase());
      claims.push({ type: "strength", text: trimmed });
    } else if (hasWeakness || looksNegative(trimmed)) {
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
