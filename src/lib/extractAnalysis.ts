import { getOpenAI } from "@/lib/openai";
import type { RunAnalysis } from "@/lib/analysisSchema";

const EXTRACT_MODEL = "gpt-4o-mini";
const EXTRACT_TIMEOUT_MS = 15_000;

const COMMERCIAL_FRAMES = `"Sustainability Leader", "Innovation Pioneer", "Premium Quality", "Value Proposition", "Market Disruptor", "Ethical Business", "Cultural Icon", "Industry Standard"`;

const ADVOCACY_FRAMES = `"Policy Champion", "Grassroots Movement", "Public Awareness Leader", "Coalition Builder", "Transparency Advocate", "Evidence-Based", "Cultural Shift Driver", "Community Impact"`;

function buildSystemPrompt(category?: string): string {
  const frames = category === "political_advocacy" ? ADVOCACY_FRAMES : COMMERCIAL_FRAMES;
  return `You are a structured data extractor for brand visibility analysis.
Given an AI response about a brand, extract the following as JSON:

{
  "brandMentioned": boolean,
  "brandMentionStrength": 0-100 (how prominently the brand is discussed),
  "competitors": [{"name": string, "mentionStrength": 0-100}],
  "topics": [{"name": string, "relevance": 0-100}] (up to 5 most relevant topics),
  "frames": [{"name": string, "strength": 0-100}] (narrative frames like ${frames}),
  "sentiment": {"legitimacy": 0-100, "controversy": 0-100},
  "hedgingScore": 0-100 (amount of hedging language like "some say", "arguably", "it depends"),
  "authorityScore": 0-100 (how authoritatively the response treats the brand)
}

Return ONLY valid JSON. No markdown fences, no explanation.`;
}

export async function extractAnalysis(
  rawResponseText: string,
  brandName: string,
  promptText: string,
  category?: string,
): Promise<RunAnalysis> {
  const userPrompt = `Brand: "${brandName}"
Original question: "${promptText}"

AI Response to analyze:
${rawResponseText}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);

  try {
    const response = await getOpenAI().responses.create(
      {
        model: EXTRACT_MODEL,
        input: [
          { role: "system", content: buildSystemPrompt(category) },
          { role: "user", content: userPrompt },
        ],
        max_output_tokens: 512,
      },
      { signal: controller.signal },
    );
    clearTimeout(timer);

    const text = response.output_text ?? "";
    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(cleaned) as RunAnalysis;
  } catch (e) {
    clearTimeout(timer);
    console.error("Analysis extraction failed:", e);
    return {
      brandMentioned: rawResponseText.toLowerCase().includes(brandName.toLowerCase()),
      brandMentionStrength: 0,
      competitors: [],
      topics: [],
      frames: [],
      sentiment: { legitimacy: 50, controversy: 50 },
      hedgingScore: 0,
      authorityScore: 0,
    };
  }
}
