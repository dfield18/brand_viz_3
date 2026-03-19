import { getOpenAI } from "@/lib/openai";
import type { RunAnalysis } from "@/lib/analysisSchema";

const EXTRACT_MODEL = "gpt-4o-mini";
const EXTRACT_TIMEOUT_MS = 15_000;

function buildSystemPrompt(): string {
  return `You are a structured data extractor for brand visibility analysis.
Given an AI response about a brand or organization, extract the following as JSON:

{
  "brandMentioned": boolean,
  "brandMentionStrength": 0-100 (how prominently the brand is discussed),
  "competitors": [{"name": string, "mentionStrength": 0-100}],  // IMPORTANT: merge subsidiaries/parent companies into one entry using the most recognized name (e.g. "ABC" and "Disney/ABC" → "Disney (ABC)"; "Instagram" and "Meta" → "Meta")
  "topics": [{"name": string, "relevance": 0-100}] (up to 5 most relevant topics),
  "frames": [{"name": string, "strength": 0-100}] (the main narrative frames — see below),
  "sentiment": {"legitimacy": 0-100, "controversy": 0-100},
  "hedgingScore": 0-100 (amount of hedging language like "some say", "arguably", "it depends"),
  "authorityScore": 0-100 (how authoritatively the response treats the brand)
}

FRAMES: Identify the 2-5 main narrative frames the response uses to describe or position this brand/organization. A "frame" is the dominant lens or angle the response takes — what story does the AI tell about this entity?

Frames should be specific to what the response actually says, NOT generic labels. For example:
- For a civil rights org: "Anti-Hate Advocacy", "Legal Defense", "Policy Influence", "Coalition Building"
- For a tech company: "AI Innovation Leader", "Privacy Concerns", "Developer Platform", "Enterprise Reliability"
- For a restaurant: "Menu Quality", "Franchise Growth", "Health Controversies", "Value Pricing"
- For a university: "Research Excellence", "Affordability Crisis", "Campus Culture"

Each frame should be 2-4 words and have a strength score (0-100) reflecting how prominently that frame appears in the response. Only include frames with strength ≥ 20.

Return ONLY valid JSON. No markdown fences, no explanation.`;
}

export async function extractAnalysis(
  rawResponseText: string,
  brandName: string,
  promptText: string,
  _category?: string,
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
          { role: "system", content: buildSystemPrompt() },
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
