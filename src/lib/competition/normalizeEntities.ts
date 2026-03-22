import { openai } from "@/lib/openai";
import { buildDeterministicAliasMap } from "./canonicalize";

/**
 * In-memory cache: brand slug → (entityId → canonical entityId).
 * Persists for the lifetime of the server process.
 */
const aliasCache = new Map<string, Map<string, string>>();

/**
 * Given a list of entity IDs (lowercase competitor names), merge
 * obvious name variants deterministically, then use GPT-4o-mini
 * for harder cases.
 *
 * Two-layer approach:
 * 1. Deterministic: strips corporate suffixes (Inc., Corp., Group, etc.)
 *    so "HP" and "HP Inc." always merge without GPT.
 * 2. GPT: handles abbreviations, parent/subsidiary, and non-obvious
 *    aliases that deterministic rules can't catch.
 *
 * If GPT fails, deterministic results still provide useful merging.
 *
 * Returns a mapping from each entityId to its canonical form.
 * Results are cached per brand slug.
 */
export async function normalizeEntityIds(
  entityIds: string[],
  brandSlug: string,
): Promise<Map<string, string>> {
  // Step 1: Always apply deterministic canonicalization first
  const deterministicMap = buildDeterministicAliasMap(entityIds);

  // Check cache — but ensure deterministic merges override stale cache entries
  const cached = aliasCache.get(brandSlug);
  if (cached) {
    const allCached = entityIds.every((id) => cached.has(id));
    if (allCached) {
      // Merge deterministic results into cached results
      const merged = new Map(cached);
      for (const [raw, detCanonical] of deterministicMap) {
        const cachedCanonical = merged.get(raw) ?? raw;
        // If deterministic merge groups two IDs that cache kept separate, use deterministic
        if (detCanonical !== raw && cachedCanonical === raw) {
          merged.set(raw, detCanonical);
        }
      }
      return merged;
    }
  }

  // Too few entities to need GPT
  if (entityIds.length <= 1) {
    const map = new Map<string, string>();
    for (const [k, v] of deterministicMap) map.set(k, v);
    aliasCache.set(brandSlug, map);
    return map;
  }

  // Step 2: Send unique canonical IDs (after deterministic merge) to GPT
  const map = new Map<string, string>();
  for (const [k, v] of deterministicMap) map.set(k, v);

  const uniqueCanonicals = [...new Set(deterministicMap.values())];

  if (uniqueCanonicals.length >= 2) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 1024,
        messages: [
          {
            role: "system",
            content: `You are given a list of company/brand names (lowercased). Some may refer to the same entity (e.g. "volkswagen" and "volkswagen group", or "toyota" and "toyota motor corporation").

Group names that clearly refer to the same company. For each group, pick the shortest common name as the canonical form. Consider full legal names, abbreviations, parent/subsidiary relationships, and "the" prefixes.

Return a JSON object mapping every input name to its canonical form. Names that have no duplicates should map to themselves.

Example input: ["volkswagen", "volkswagen group", "the walt disney company", "disney", "toyota motor corporation", "toyota", "honda"]
Example output: {"volkswagen":"volkswagen","volkswagen group":"volkswagen","the walt disney company":"disney","disney":"disney","toyota motor corporation":"toyota","toyota":"toyota","honda":"honda"}

Return ONLY the JSON object, no other text.`,
          },
          {
            role: "user",
            content: JSON.stringify(uniqueCanonicals),
          },
        ],
      });

      const content = response.choices?.[0]?.message?.content?.trim();
      if (content) {
        const parsed = JSON.parse(content) as Record<string, string>;
        // Apply GPT merges on top of deterministic results
        for (const [raw, detCanonical] of deterministicMap) {
          const gptCanonical = parsed[detCanonical] ?? detCanonical;
          map.set(raw, gptCanonical);
        }
      }
    } catch (err) {
      console.error("[normalizeEntityIds] GPT grouping failed, using deterministic only:", err);
      // Deterministic results already in map — no further action needed
    }
  }

  // Preserve any existing cache entries not in this batch
  const existing = aliasCache.get(brandSlug);
  if (existing) {
    const merged = new Map(existing);
    for (const [k, v] of map) merged.set(k, v);
    aliasCache.set(brandSlug, merged);
  } else {
    aliasCache.set(brandSlug, map);
  }

  return map;
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
