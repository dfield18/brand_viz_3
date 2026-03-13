import { prisma } from "@/lib/prisma";
import { extractUrls, normalizeUrl, type ExtractedUrl } from "./parseUrls";
import { attributeEntitiesToUrls, buildEntityList } from "./attributeEntity";

export interface ApiCitation {
  url: string;
  title: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Extract sources from a run's response text and persist to DB.
 * Called after run is saved, same non-blocking pattern as persistProminenceForRun.
 *
 * If `apiCitations` are provided (e.g. OpenAI web search annotations),
 * they are merged with text-extracted URLs so we capture citations even when
 * the model doesn't inline them in the response text.
 */
export async function persistSourcesForRun(args: {
  runId: string;
  model: string;
  promptId: string;
  brandName: string;
  brandSlug: string;
  responseText: string;
  analysisJson: unknown;
  apiCitations?: ApiCitation[];
}): Promise<void> {
  const { runId, model, promptId, brandName, brandSlug, responseText, analysisJson, apiCitations } = args;

  // 1. Extract URLs from response text, filtering out Gemini proxy URLs
  const textUrls = extractUrls(responseText).filter(
    (u) => !u.domain.includes("vertexaisearch.cloud.google.com"),
  );

  // 2. Merge in API-level citations (deduplicate by normalized URL)
  const seenNormalized = new Set(textUrls.map((u) => u.normalizedUrl));
  const mergedUrls: ExtractedUrl[] = [...textUrls];

  if (apiCitations && apiCitations.length > 0) {
    for (const cit of apiCitations) {
      // Skip Gemini proxy URLs that don't resolve to actual sources
      if (cit.url.includes("vertexaisearch.cloud.google.com")) continue;
      const norm = normalizeUrl(cit.url);
      if (!norm) continue;
      if (seenNormalized.has(norm.normalized)) continue;
      seenNormalized.add(norm.normalized);
      mergedUrls.push({
        originalUrl: cit.url,
        normalizedUrl: norm.normalized,
        domain: norm.domain,
        sourceType: "bare_url", // API citation — closest match
        positionIndex: cit.startIndex,
      });
    }
  }

  if (mergedUrls.length === 0) return;

  const entities = buildEntityList(brandName, brandSlug, analysisJson);
  const attributed = attributeEntitiesToUrls({ responseText, urls: mergedUrls, entities });

  for (const url of attributed) {
    try {
      const source = await prisma.source.upsert({
        where: { domain: url.domain },
        create: { domain: url.domain },
        update: {},
      });

      await prisma.sourceOccurrence.create({
        data: {
          runId,
          promptId,
          model,
          entityId: url.entityId,
          sourceId: source.id,
          normalizedUrl: url.normalizedUrl,
          originalUrl: url.originalUrl,
          sourceType: url.sourceType,
          positionIndex: url.positionIndex,
        },
      });
    } catch {
      // Non-blocking — don't fail the pipeline for source persistence errors
    }
  }
}
