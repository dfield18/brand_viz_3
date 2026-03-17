/**
 * Prompt-level topic classification.
 *
 * Two strategies:
 *  1. Keyword matching against TOPIC_TAXONOMY (fast, synchronous)
 *  2. GPT-4o-mini dynamic classification (async, used when keywords fail or
 *     when the entity type doesn't fit generic business topics)
 *
 * Classifies what a prompt is asking about — not what the response contains.
 */

import { TOPIC_TAXONOMY } from "./topicTaxonomy";
import { getOpenAIDefault } from "@/lib/openai";

export interface TopicClassification {
  topicKey: string;
  topicLabel: string;
  confidence: number; // 0-1
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Classify a prompt into the best-matching topic from the taxonomy.
 * Fast, synchronous keyword matching.
 */
export function classifyPromptTopic(promptText: string): TopicClassification {
  const text = promptText
    .replace(/\{brand\}/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  let bestKey = "other";
  let bestLabel = "Other";
  let bestScore = 0;

  for (const topic of TOPIC_TAXONOMY) {
    if (topic.key === "other") continue;

    // Check negative keywords
    if (topic.negativeKeywords?.some((nk) => text.includes(nk.toLowerCase()))) {
      continue;
    }

    let hits = 0;
    for (const keyword of topic.keywords) {
      const kw = keyword.toLowerCase();
      if (kw.includes(" ")) {
        if (text.includes(kw)) hits++;
      } else {
        const re = new RegExp(`\\b${escapeRegex(kw)}\\b`);
        if (re.test(text)) hits++;
      }
    }

    if (hits > bestScore) {
      bestScore = hits;
      bestKey = topic.key;
      bestLabel = topic.label;
    }
  }

  const confidence = bestScore === 0 ? 0 : Math.min(1, bestScore / 3);

  return { topicKey: bestKey, topicLabel: bestLabel, confidence };
}

// ---------------------------------------------------------------------------
// GPT-based dynamic classification
// ---------------------------------------------------------------------------

const CLASSIFY_SYSTEM = `You classify prompts/questions into a concise topic category.
Given a prompt (which may reference a specific brand or organization), identify the single best topic it's asking about.

Return ONLY a valid JSON object:
{"key": "snake_case_topic_key", "label": "Human-Readable Label"}

Rules:
- The key should be 2-4 words in snake_case, descriptive of the topic
- The label should be 2-5 words, title case
- Be specific to what the prompt is actually asking (e.g. "legal_advocacy" not just "general")
- If the prompt asks about reputation/perception, use a topic specific to the entity type
- Avoid overly generic topics like "general" or "other" — find the real subject`;

/**
 * Classify a prompt using GPT-4o-mini.
 * Returns a dynamic topic key/label pair specific to what the prompt is about.
 */
async function classifyPromptWithLLM(
  promptText: string,
  brandName?: string,
): Promise<TopicClassification> {
  const openai = getOpenAIDefault();
  const userMsg = brandName
    ? `Brand/Org: ${brandName}\nPrompt: ${promptText}`
    : `Prompt: ${promptText}`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 100,
    messages: [
      { role: "system", content: CLASSIFY_SYSTEM },
      { role: "user", content: userMsg },
    ],
  });

  const raw = res.choices[0]?.message?.content?.trim() ?? "";
  const parsed = JSON.parse(raw);

  if (!parsed.key || !parsed.label) {
    throw new Error("Invalid GPT topic response");
  }

  return {
    topicKey: String(parsed.key).toLowerCase().replace(/[^a-z0-9_]/g, "_"),
    topicLabel: String(parsed.label),
    confidence: 0.8,
  };
}

/**
 * Classify a prompt dynamically:
 *  1. Try keyword matching first
 *  2. If result is "other" or low confidence, use GPT
 */
export async function classifyPromptTopicDynamic(
  promptText: string,
  brandName?: string,
): Promise<TopicClassification> {
  const keywordResult = classifyPromptTopic(promptText);

  // If keyword matching found a good match, use it
  if (keywordResult.topicKey !== "other" && keywordResult.confidence >= 0.33) {
    return keywordResult;
  }

  // Fall back to GPT for dynamic classification
  try {
    return await classifyPromptWithLLM(promptText, brandName);
  } catch {
    return keywordResult;
  }
}
