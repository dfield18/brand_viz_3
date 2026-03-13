import { openai } from "@/lib/openai";

/**
 * In-memory cache: brand slug → (entityId → canonical entityId).
 * Persists for the lifetime of the server process.
 */
const aliasCache = new Map<string, Map<string, string>>();

/**
 * Given a list of entity IDs (lowercase competitor names), use GPT-4o-mini
 * to identify groups that represent the same company.
 *
 * Returns a mapping from each entityId to its canonical (shortest/simplest) form.
 * Entity IDs that aren't duplicates map to themselves.
 *
 * Results are cached per brand slug so subsequent calls are free.
 */
export async function normalizeEntityIds(
  entityIds: string[],
  brandSlug: string,
): Promise<Map<string, string>> {
  // Check cache first
  const cached = aliasCache.get(brandSlug);
  if (cached) {
    // Verify all requested IDs are in the cache
    const allCached = entityIds.every((id) => cached.has(id));
    if (allCached) return cached;
  }

  // Too few entities to have duplicates
  if (entityIds.length <= 1) {
    const map = new Map(entityIds.map((id) => [id, id]));
    aliasCache.set(brandSlug, map);
    return map;
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content: `You are given a list of company/brand names (lowercased). Some may refer to the same entity (e.g. "volkswagen" and "volkswagen group", or "toyota" and "toyota motor corporation").

Group names that clearly refer to the same company. For each group, pick the shortest common name as the canonical form.

Return a JSON object mapping every input name to its canonical form. Names that have no duplicates should map to themselves.

Example input: ["volkswagen", "volkswagen group", "toyota", "toyota motor corporation", "honda"]
Example output: {"volkswagen":"volkswagen","volkswagen group":"volkswagen","toyota":"toyota","toyota motor corporation":"toyota","honda":"honda"}

Return ONLY the JSON object, no other text.`,
        },
        {
          role: "user",
          content: JSON.stringify(entityIds),
        },
      ],
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty response");

    const parsed = JSON.parse(content) as Record<string, string>;
    const map = new Map<string, string>();
    for (const id of entityIds) {
      map.set(id, parsed[id] ?? id);
    }

    aliasCache.set(brandSlug, map);
    return map;
  } catch (err) {
    console.error("[normalizeEntityIds] GPT grouping failed, using identity mapping:", err);
    const map = new Map(entityIds.map((id) => [id, id]));
    aliasCache.set(brandSlug, map);
    return map;
  }
}

/**
 * Merge metrics for entities that map to the same canonical ID.
 * Returns a new byEntity map with merged entries.
 */
export function mergeEntityMetrics<T extends { entityId: string }>(
  byEntity: Map<string, T[]>,
  aliasMap: Map<string, string>,
): Map<string, T[]> {
  const merged = new Map<string, T[]>();
  for (const [entityId, metrics] of byEntity) {
    const canonical = aliasMap.get(entityId) ?? entityId;
    const arr = merged.get(canonical) ?? [];
    arr.push(...metrics);
    merged.set(canonical, arr);
  }
  return merged;
}
