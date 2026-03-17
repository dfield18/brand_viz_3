/**
 * Synthesize narrative frames from raw response text when
 * analysisJson frames are missing or empty.
 * Uses GPT-4o-mini to identify the main narratives from response excerpts.
 */

import { openai } from "@/lib/openai";
import type { NarrativeFrame, ModelKey } from "@/types/api";

const SYNTH_MODEL = "gpt-4o-mini";
const SYNTH_TIMEOUT_MS = 12_000;

const MODEL_KEYS: ModelKey[] = ["chatgpt", "gemini", "claude", "perplexity", "google"];

interface RunInput {
  rawResponseText: string;
  model: string;
}

const SYNTH_SYSTEM = `You are a narrative analyst. Given excerpts from multiple AI responses about a brand/organization, identify the 3-8 main narrative frames the AI models use to describe this entity.

A "frame" is the dominant lens, angle, or story that AI tells about this entity. Frames should be:
- Specific to the entity (NOT generic like "Innovation" or "Quality")
- 2-4 words each
- Based on what the responses actually say

For example:
- Civil rights org: "Anti-Hate Advocacy", "Legal Defense Pioneer", "Education & Outreach", "Coalition Leadership"
- Tech company: "AI Platform Leader", "Privacy & Trust", "Developer Ecosystem", "Enterprise Adoption"
- Restaurant chain: "Menu Innovation", "Franchise Growth Engine", "Health & Transparency", "Value Positioning"

For each frame, estimate what percentage of the responses contain this narrative (0-100).

Return ONLY a valid JSON array:
[{"frame": "Frame Name", "percentage": 45}]

Sort by percentage descending. Return 3-8 frames.`;

export async function synthesizeFramesFromResponses(
  runs: RunInput[],
  brandName: string,
  activeModel: string,
): Promise<NarrativeFrame[]> {
  if (runs.length === 0) return [];

  // Sample up to 15 response excerpts (first 400 chars each) to fit in context
  const sampled = runs.slice(0, 15);
  const excerpts = sampled.map((r, i) => {
    const clean = r.rawResponseText
      .replace(/\*\*/g, "")
      .replace(/\*/g, "")
      .replace(/^#+\s+/gm, "")
      .replace(/\n+/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 400);
    return `[${i + 1}] (${r.model}) ${clean}`;
  }).join("\n\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SYNTH_TIMEOUT_MS);

  try {
    const response = await openai.responses.create(
      {
        model: SYNTH_MODEL,
        input: [
          { role: "system", content: SYNTH_SYSTEM },
          { role: "user", content: `Brand/Organization: "${brandName}"\nTotal responses: ${runs.length}\n\nExcerpts:\n${excerpts}` },
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
    const parsed = JSON.parse(raw) as { frame: string; percentage: number }[];

    // Also compute per-model breakdown
    const modelRunCounts: Record<string, number> = {};
    for (const r of runs) {
      modelRunCounts[r.model] = (modelRunCounts[r.model] ?? 0) + 1;
    }

    return parsed
      .filter((f) => f.frame && typeof f.percentage === "number" && f.percentage > 0)
      .slice(0, 8)
      .map((f) => {
        // For synthesized frames, distribute the percentage evenly across active models
        const byModel = {} as Record<ModelKey, number>;
        for (const mk of MODEL_KEYS) {
          byModel[mk] = modelRunCounts[mk]
            ? Math.round(f.percentage * (modelRunCounts[mk] / runs.length))
            : 0;
        }
        return {
          frame: f.frame,
          percentage: Math.round(f.percentage),
          byModel,
        };
      });
  } catch (e) {
    clearTimeout(timer);
    console.error("Frame synthesis failed:", e);
    return [];
  }
}
