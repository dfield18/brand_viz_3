import { getOpenAI } from "@/lib/openai";

const VALIDATE_MODEL = "gpt-4o-mini";
const VALIDATE_TIMEOUT_MS = 10_000;

interface ValidatedCompetitor {
  name: string;
  related: boolean;
}

/**
 * Validates that a list of competitor entities are actually in the same
 * general category/industry as the brand. Filters out unrelated entities
 * that happen to appear in AI responses but aren't real competitors or
 * peers (e.g., Nike appearing in responses about the Anti-Defamation League).
 *
 * Returns only the entityIds that are genuinely related.
 */
export async function validateCompetitors(
  entityIds: string[],
  brandName: string,
): Promise<Set<string>> {
  if (entityIds.length === 0) return new Set();

  const systemPrompt = `You determine whether organizations are in the same general category or industry as a given brand.

Two organizations are "related" if they operate in the same general space — they don't need to directly compete for resources, but should be clearly in the same type of work or industry. For example:
- Anti-Defamation League and NAACP: RELATED (both civil rights / fighting hate organizations)
- Anti-Defamation League and Nike: NOT RELATED (civil rights org vs sportswear company)
- Tesla and Ford: RELATED (both automotive manufacturers)
- Tesla and Greenpeace: NOT RELATED (car maker vs environmental activism)
- Ben & Jerry's and Häagen-Dazs: RELATED (both ice cream brands)
- Ben & Jerry's and Anti-Defamation League: NOT RELATED (ice cream vs civil rights)

For each entity in the list, determine if it is related to the given brand.

Return a JSON array:
[{"name": "entity name", "related": boolean}]

Return ONLY valid JSON. No markdown fences.`;

  const userPrompt = `Brand: "${brandName}"
Entities to check: ${JSON.stringify(entityIds)}`;

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
    const results: ValidatedCompetitor[] = JSON.parse(cleaned);

    // Build a set of related entity IDs
    const validSet = new Set<string>();
    const resultMap = new Map(results.map((r) => [r.name.toLowerCase(), r.related]));

    for (const id of entityIds) {
      // Try exact match first, then lowercase
      const isRelated = resultMap.get(id) ?? resultMap.get(id.toLowerCase());
      if (isRelated !== false) {
        // Keep if related or if GPT didn't return a result for it
        validSet.add(id);
      }
    }

    return validSet;
  } catch (e) {
    clearTimeout(timer);
    console.error("Competitor validation failed, returning all:", e);
    // On error, return all entities unfiltered
    return new Set(entityIds);
  }
}
