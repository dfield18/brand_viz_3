/**
 * Entity attribution for extracted URLs.
 * Uses a ±300 character window around the URL position to find nearby entity mentions.
 * Pure function — no database access.
 */

import type { ExtractedUrl } from "./parseUrls";

export interface EntityInput {
  entityId: string;
  name: string;
  variants: string[];
}

export interface AttributedUrl extends ExtractedUrl {
  entityId: string | null;
}

/**
 * For each URL, search ±300 chars for entity mentions.
 * 1 entity match → attribute; 0 or 2+ → null (ambiguous).
 */
export function attributeEntitiesToUrls(input: {
  responseText: string;
  urls: ExtractedUrl[];
  entities: EntityInput[];
}): AttributedUrl[] {
  const { responseText, urls, entities } = input;
  const textLower = responseText.toLowerCase();

  return urls.map((url) => {
    const windowStart = Math.max(0, url.positionIndex - 300);
    const windowEnd = Math.min(textLower.length, url.positionIndex + 300);
    const window = textLower.slice(windowStart, windowEnd);

    const matchedEntities: string[] = [];
    for (const entity of entities) {
      const found = entity.variants.some((v) => window.includes(v.toLowerCase()));
      if (found) {
        matchedEntities.push(entity.entityId);
      }
    }

    return {
      ...url,
      entityId: matchedEntities.length === 1 ? matchedEntities[0] : null,
    };
  });
}

/**
 * Build entity list from brand + analysisJson competitors.
 * Same pattern as src/lib/prominence/persistProminence.ts:22-49.
 */
export function buildEntityList(
  brandName: string,
  brandSlug: string,
  analysisJson: unknown,
): EntityInput[] {
  const entities: EntityInput[] = [
    {
      entityId: brandSlug,
      name: brandName,
      variants: [brandName, brandName.toLowerCase(), brandName.toUpperCase()],
    },
  ];

  if (analysisJson && typeof analysisJson === "object") {
    const analysis = analysisJson as Record<string, unknown>;
    if (Array.isArray(analysis.competitors)) {
      for (const comp of analysis.competitors) {
        if (comp && typeof comp === "object" && "name" in comp) {
          const name = String((comp as { name: string }).name);
          const id = name.toLowerCase();
          if (id !== brandSlug && id !== brandName.toLowerCase()) {
            entities.push({
              entityId: id,
              name,
              variants: [name, name.toLowerCase()],
            });
          }
        }
      }
    }
  }

  return entities;
}
