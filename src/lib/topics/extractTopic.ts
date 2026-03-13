/**
 * Prompt-level topic classification using keyword matching against TOPIC_TAXONOMY.
 * Classifies what a prompt is asking about — not what the response contains.
 */

import { TOPIC_TAXONOMY } from "./topicTaxonomy";

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
 *
 * Algorithm:
 * 1. Normalize: lowercase, strip {brand}, collapse whitespace
 * 2. For each topic, count keyword hits
 *    - Multi-word phrases: text.includes(phrase)
 *    - Single words: word boundary regex
 * 3. Pick topic with highest score (taxonomy order as tiebreaker)
 * 4. If no hits, return "other"
 * 5. confidence = min(1, hits / 3)
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
