import { prisma } from "@/lib/prisma";
import { calculateProminenceScores, type EntityInput } from "./prominence";

/**
 * Calculate and persist prominence scores for a run.
 * Called after a run is saved with its response text.
 *
 * Entities scored: the brand itself + any competitors found in analysisJson.
 */
export async function persistProminenceForRun(args: {
  runId: string;
  model: string;
  promptId: string;
  brandName: string;
  brandSlug: string;
  responseText: string;
  analysisJson: unknown;
}): Promise<void> {
  const { runId, model, promptId, brandName, brandSlug, responseText, analysisJson } = args;

  // Build entity list: brand + competitors from analysis
  const entities: EntityInput[] = [
    {
      entityId: brandSlug,
      name: brandName,
      variants: [brandName, brandName.toLowerCase(), brandName.toUpperCase()],
    },
  ];

  // Extract competitor names from analysisJson if available
  if (analysisJson && typeof analysisJson === "object") {
    const analysis = analysisJson as Record<string, unknown>;
    if (Array.isArray(analysis.competitors)) {
      for (const comp of analysis.competitors) {
        if (comp && typeof comp === "object" && "name" in comp) {
          const name = String((comp as { name: string }).name);
          const id = name.toLowerCase();
          // Avoid duplicates with brand
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

  const results = calculateProminenceScores({ responseText, entities });

  // Compute rank positions based on prominence scores
  const mentioned = results
    .filter((r) => r.prominence > 0)
    .sort((a, b) => b.prominence - a.prominence);
  const K = mentioned.length;

  const rankMap = new Map<string, { rankPosition: number; normalizedRankScore: number; competitorsInResponse: number }>();
  for (let i = 0; i < mentioned.length; i++) {
    const rankPosition = i + 1;
    const normalizedRankScore = K <= 1 ? 100 : Math.round(100 * (1 - (rankPosition - 1) / (K - 1)) * 100) / 100;
    rankMap.set(mentioned[i].entityId, { rankPosition, normalizedRankScore, competitorsInResponse: K });
  }

  // Upsert metrics rows
  for (const result of results) {
    const rankInfo = rankMap.get(result.entityId);
    try {
      await prisma.entityResponseMetric.upsert({
        where: {
          runId_entityId: { runId, entityId: result.entityId },
        },
        update: {
          frequencyScore: result.frequency,
          positionScore: result.position,
          depthScore: result.depth,
          structureScore: result.structure,
          prominenceScore: result.prominence,
          rankPosition: rankInfo?.rankPosition ?? null,
          normalizedRankScore: rankInfo?.normalizedRankScore ?? null,
          competitorsInResponse: rankInfo?.competitorsInResponse ?? null,
        },
        create: {
          runId,
          model,
          promptId,
          entityId: result.entityId,
          frequencyScore: result.frequency,
          positionScore: result.position,
          depthScore: result.depth,
          structureScore: result.structure,
          prominenceScore: result.prominence,
          rankPosition: rankInfo?.rankPosition ?? null,
          normalizedRankScore: rankInfo?.normalizedRankScore ?? null,
          competitorsInResponse: rankInfo?.competitorsInResponse ?? null,
        },
      });
    } catch {
      // Non-critical: don't fail the pipeline if prominence persistence fails
    }
  }
}
