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

/** Deterministic safety-net check for role-identity labels that slip
 *  through the LLM frame extractor for political figures. Returns
 *  true when the frame is purely a job-title / party label and
 *  contributes no narrative signal. Matched frames are dropped
 *  before the LLM validator runs so the validator doesn't have to
 *  re-learn the same pattern each request. */
const ROLE_IDENTITY_FRAME_PATTERNS: RegExp[] = [
  /^(current|former|incumbent|sitting|senior|junior)?\s*(us|u\.s\.|united states)?\s*(senator|representative|rep\.?|congressman|congresswoman|congressperson|governor|mayor|president|vice president|vp|speaker|chairman|chairwoman|chairperson|secretary|attorney general|justice|judge|officeholder|elected official|public servant|politician|political figure|public figure)s?$/i,
  /^(democratic|democrat|republican|gop|independent|progressive|conservative|libertarian|green|moderate|far[- ]?right|far[- ]?left)\s+(politician|political figure|public figure|elected official|candidate|senator|representative|rep\.?|congressman|congresswoman|congressperson|governor|mayor|lawmaker|officeholder)s?$/i,
  /^(state|federal|national|local)\s+(senator|representative|rep\.?|congressman|congresswoman|congressperson|governor|mayor|lawmaker|officeholder|official|politician)s?$/i,
];

function isRoleIdentityFrame(frame: string): boolean {
  const normalized = frame.trim().replace(/\s+/g, " ");
  return ROLE_IDENTITY_FRAME_PATTERNS.some((re) => re.test(normalized));
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

  // Deterministic pre-filter: drop role-identity labels ("Current
  // Senator", "Democratic Politician", etc.) before the LLM sees
  // them. These slip through the extractor for political figures
  // because every response mentions the subject's role, and the LLM
  // validator sometimes keeps them thinking they're factual —
  // problem is they convey zero narrative signal.
  const preFiltered = frames.filter((f) => !isRoleIdentityFrame(f.frame));
  if (preFiltered.length === 0) return preFiltered;

  const frameNames = preFiltered.map((f) => f.frame);

  const systemPrompt = `You evaluate whether narrative frames associated with a brand represent real, substantive issues or are generic jargon.

A "specific" frame refers to a concrete, identifiable issue, strategy, or topic clearly tied to what the brand actually does or faces. Examples for a civil rights organization: "Combating Antisemitism", "Israel-Palestine Advocacy", "Hate Crime Monitoring". Examples for a politician: "Progressive Advocacy", "Working-Class Champion", "Urban Policy Focus", "Immigration Reform Advocate", "Bipartisan Dealmaker".

A "generic" frame is vague business/advocacy jargon that could apply to almost any organization and doesn't refer to anything specific. Examples: "Community Impact", "Policy Champion", "Innovation Pioneer", "Cultural Shift Driver".

Also treat as generic any frame that is just a role identity, title, or party label for a political figure — these describe WHO someone is, not what story the coverage tells about them. Mark as generic: "Current Senator", "US Senator", "Governor", "Mayor", "Democratic Politician", "Republican Politician", "Political Figure", "Elected Official", "State Senator", etc. Suggest a narrative-focused replacement when possible (the figure's advocacy focus, signature issue, controversy, or policy stance), or null to drop.

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

    // Filter and revise frames, but also re-apply the role-identity
    // guard on any LLM replacement so we don't accidentally let a
    // role label back in via the "replacement" field.
    const output: T[] = [];
    for (const frame of preFiltered) {
      const validation = validationMap.get(frame.frame);
      if (!validation) {
        output.push(frame);
        continue;
      }
      if (validation.specific) {
        output.push(frame);
      } else if (validation.replacement && !isRoleIdentityFrame(validation.replacement)) {
        output.push({ ...frame, frame: validation.replacement });
      }
      // else: generic with no replacement (or replacement is itself a role label) — drop it
    }

    return output;
  } catch (e) {
    clearTimeout(timer);
    console.error("Frame validation failed, returning pre-filtered:", e);
    // On LLM error, still return the deterministic pre-filter output
    // so role-identity frames don't slip through just because the
    // validator API call happened to fail.
    return preFiltered;
  }
}
