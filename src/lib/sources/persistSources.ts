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

  // Ensure Source records exist for all unique domains first
  const uniqueDomains = [...new Set(attributed.map((u) => u.domain))];
  const sourceIdByDomain = new Map<string, string>();
  for (const domain of uniqueDomains) {
    try {
      const source = await prisma.source.upsert({
        where: { domain },
        create: { domain },
        update: {},
      });
      sourceIdByDomain.set(domain, source.id);
    } catch (err) {
      console.error(`[persistSources] Failed to upsert Source for domain "${domain}" (run=${runId}):`, err instanceof Error ? err.message : err);
    }
  }

  // Batch-create all SourceOccurrence records, with retry on failure
  const occurrenceData = attributed
    .filter((url) => sourceIdByDomain.has(url.domain))
    .map((url) => ({
      runId,
      promptId,
      model,
      entityId: url.entityId,
      sourceId: sourceIdByDomain.get(url.domain)!,
      normalizedUrl: url.normalizedUrl,
      originalUrl: url.originalUrl,
      sourceType: url.sourceType,
      positionIndex: url.positionIndex,
    }));

  if (occurrenceData.length === 0) return;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await prisma.sourceOccurrence.createMany({ data: occurrenceData, skipDuplicates: true });
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt === 1) {
        console.warn(`[persistSources] Batch insert failed for run=${runId} (${occurrenceData.length} URLs), retrying: ${msg}`);
        // Brief pause before retry
        await new Promise((r) => setTimeout(r, 200));
      } else {
        console.error(`[persistSources] Batch insert failed on retry for run=${runId} (${occurrenceData.length} URLs): ${msg}`);
        // Fall back to individual inserts so partial data is still saved
        let saved = 0;
        for (const occ of occurrenceData) {
          try {
            await prisma.sourceOccurrence.create({ data: occ });
            saved++;
          } catch {
            // Skip duplicates or other per-row errors silently
          }
        }
        if (saved < occurrenceData.length) {
          console.error(`[persistSources] Only ${saved}/${occurrenceData.length} sources saved for run=${runId}`);
        }
      }
    }
  }
}
