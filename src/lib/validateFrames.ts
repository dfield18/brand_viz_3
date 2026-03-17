import { getOpenAI } from "@/lib/openai";

const VALIDATE_MODEL = "gpt-4o-mini";
const VALIDATE_TIMEOUT_MS = 10_000;

interface FrameInput {
  frame: string;
  percentage: number;
}

interface ValidatedFrame {
  frame: string;
  specific: boolean;
  replacement: string | null;
}

/**
 * Validates narrative frames for a brand, filtering out generic jargon
 * and replacing with more specific issue descriptions when possible.
 *
 * Returns the filtered/revised list of frames, preserving original
 * percentage and byModel data.
 */
export async function validateFrames<T extends FrameInput>(
  frames: T[],
  brandName: string,
): Promise<T[]> {
  if (frames.length === 0) return frames;

  const frameNames = frames.map((f) => f.frame);

  const systemPrompt = `You evaluate whether narrative frames associated with a brand represent real, substantive issues or are generic jargon.

A "specific" frame refers to a concrete, identifiable issue, strategy, or topic clearly tied to what the brand actually does or faces. Examples for a civil rights organization: "Combating Antisemitism", "Israel-Palestine Advocacy", "Hate Crime Monitoring".

A "generic" frame is vague business/advocacy jargon that could apply to almost any organization and doesn't refer to anything specific. Examples: "Community Impact", "Policy Champion", "Innovation Pioneer", "Cultural Shift Driver".

For each frame, decide if it is specific or generic for the given brand. If generic, provide a more specific replacement based on what this brand is actually known for, or mark it for removal if you can't determine a specific replacement.

Return JSON array:
[{"frame": "original name", "specific": boolean, "replacement": "more specific name" | null}]

If specific=true, replacement should be null.
If specific=false and you can suggest a better frame, set replacement to that name.
If specific=false and you can't suggest anything, set replacement to null (frame will be removed).

Return ONLY valid JSON. No markdown fences.`;

  const userPrompt = `Brand: "${brandName}"
Frames to validate: ${JSON.stringify(frameNames)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);

  try {
    const response = await getOpenAI().responses.create(
      {
        model: VALIDATE_MODEL,
        input: [
          { role: "system", content: systemPrompt },
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
    const results: ValidatedFrame[] = JSON.parse(cleaned);

    // Build a lookup from original frame name -> validation result
    const validationMap = new Map<string, ValidatedFrame>();
    for (const r of results) {
      validationMap.set(r.frame, r);
    }

    // Filter and revise frames
    const output: T[] = [];
    for (const frame of frames) {
      const validation = validationMap.get(frame.frame);
      if (!validation) {
        // No validation result — keep as-is
        output.push(frame);
        continue;
      }
      if (validation.specific) {
        // Already specific — keep as-is
        output.push(frame);
      } else if (validation.replacement) {
        // Generic but has a better replacement — rename
        output.push({ ...frame, frame: validation.replacement });
      }
      // else: generic with no replacement — drop it
    }

    return output;
  } catch (e) {
    clearTimeout(timer);
    console.error("Frame validation failed, returning unfiltered:", e);
    return frames; // On error, return original frames unmodified
  }
}
