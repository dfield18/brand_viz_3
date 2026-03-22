import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import { gemini } from "@/lib/gemini";
import { persistSourcesForRun, type ApiCitation } from "@/lib/sources/persistSources";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

const OPENAI_MODEL = "gpt-4o-mini";
const GEMINI_MODEL = "gemini-2.5-flash-lite";
const BATCH_SIZE = 10;
const TIMEOUT_MS = 30_000;

/** Follow a redirect URL to get the actual destination. */
async function resolveRedirect(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    return res.url || url;
  } catch {
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(5000) });
      const resolved = res.url || url;
      await res.body?.cancel().catch(() => {});
      return resolved;
    } catch {
      return url;
    }
  }
}

async function fetchOpenAICitations(promptText: string): Promise<{ text: string; citations: ApiCitation[] }> {
  const input = `Answer concisely and factually in 5 bullet points. Include source URLs where possible.\n\nQuestion: ${promptText}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const response = await openai.responses.create(
    {
      model: OPENAI_MODEL,
      tools: [{ type: "web_search" as const }],
      input,
      max_output_tokens: 1024,
    },
    { signal: controller.signal },
  );

  clearTimeout(timer);

  const citations: ApiCitation[] = [];
  let text = "";

  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part.type === "output_text") {
            text += part.text;
            if (Array.isArray(part.annotations)) {
              for (const ann of part.annotations) {
                if (ann.type === "url_citation") {
                  citations.push({
                    url: ann.url,
                    title: ann.title,
                    startIndex: ann.start_index,
                    endIndex: ann.end_index,
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  if (!text && response.output_text) {
    text = response.output_text;
  }

  return { text, citations };
}

async function fetchGeminiCitations(promptText: string): Promise<{ text: string; citations: ApiCitation[] }> {
  const input = `Answer concisely and factually in 5 bullet points. Include source URLs where possible.\n\nQuestion: ${promptText}`;

  const model = gemini.getGenerativeModel({
    model: GEMINI_MODEL,
    tools: [{ googleSearch: {} } as never],
  });

  const result = await Promise.race([
    model.generateContent(input),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini timeout")), TIMEOUT_MS),
    ),
  ]);

  const text = result.response.text();
  const citations: ApiCitation[] = [];

  const groundingMeta = (result.response as unknown as Record<string, unknown>)
    .candidates as Array<{
      groundingMetadata?: {
        groundingChunks?: Array<{ web?: { uri: string; title?: string } }>;
      };
    }> | undefined;

  if (groundingMeta?.[0]?.groundingMetadata?.groundingChunks) {
    const chunks = groundingMeta[0].groundingMetadata.groundingChunks;
    const entries = chunks
      .filter((c) => c.web?.uri)
      .map((c) => ({ uri: c.web!.uri, title: c.web?.title ?? "" }));

    if (entries.length > 0) {
      const resolved = await Promise.all(
        entries.map(async (e) => ({
          url: await resolveRedirect(e.uri),
          title: e.title,
        })),
      );

      for (let i = 0; i < resolved.length; i++) {
        citations.push({
          url: resolved[i].url,
          title: resolved[i].title,
          startIndex: text.length + i,
          endIndex: text.length + i,
        });
      }
    }
  }

  // Append sources to text so extractUrls can also find them
  let fullText = text;
  if (citations.length > 0) {
    fullText += "\n\nSources:\n" + citations.map((c) => `- ${c.url}`).join("\n");
  }

  return { text: fullText, citations };
}

/**
 * Re-run prompts to extract web search annotations for existing runs
 * that currently have no SourceOccurrence records.
 *
 * POST /api/backfill/sources
 * Body: { brandSlug: string, model?: "chatgpt" | "gemini" (default: both) }
 *
 * Processes up to BATCH_SIZE runs per call. Client should poll until status === "done".
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth();
  if (authError) return authError;
  const rlError = await checkRateLimit(userId, "expensive");
  if (rlError) return rlError;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const brandSlug = body.brandSlug as string | undefined;
  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }

  const filterModel = body.model as string | undefined;
  const models = filterModel ? [filterModel] : ["chatgpt", "gemini"];

  const brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }
  const brandName = (brand as unknown as { displayName?: string | null }).displayName || brand.name;

  // Find runs for this brand that have NO source occurrences
  const runsWithoutSources = await prisma.run.findMany({
    where: {
      brandId: brand.id,
      model: { in: models },
      sourceOccurrences: { none: {} },
    },
    select: {
      id: true,
      promptId: true,
      model: true,
      rawResponseText: true,
      analysisJson: true,
      prompt: { select: { text: true } },
    },
    take: BATCH_SIZE,
    orderBy: { createdAt: "desc" },
  });

  if (runsWithoutSources.length === 0) {
    const withSources = await prisma.sourceOccurrence.count({
      where: { run: { brandId: brand.id, model: { in: models } } },
    });
    return NextResponse.json({
      status: "done",
      message: `All ${models.join("/")} runs have been processed`,
      totalSourceOccurrences: withSources,
    });
  }

  let processed = 0;
  let citationsFound = 0;

  for (const run of runsWithoutSources) {
    try {
      const promptText = run.prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`);

      let result: { text: string; citations: ApiCitation[] };
      if (run.model === "chatgpt") {
        result = await fetchOpenAICitations(promptText);
      } else if (run.model === "gemini") {
        result = await fetchGeminiCitations(promptText);
      } else {
        processed++;
        continue;
      }

      const useText = result.text || run.rawResponseText;

      await persistSourcesForRun({
        runId: run.id,
        model: run.model,
        promptId: run.promptId,
        brandName,
        brandSlug: brand.slug,
        responseText: useText,
        analysisJson: run.analysisJson,
        apiCitations: result.citations,
      });

      // Update stored response text if the new call produced URLs
      if (result.text && result.text !== run.rawResponseText) {
        await prisma.run.update({
          where: { id: run.id },
          data: { rawResponseText: result.text },
        });
      }

      citationsFound += result.citations.length;
      processed++;
    } catch {
      processed++;
    }
  }

  // Count remaining
  const remaining = await prisma.run.count({
    where: {
      brandId: brand.id,
      model: { in: models },
      sourceOccurrences: { none: {} },
    },
  });

  return NextResponse.json({
    status: remaining > 0 ? "running" : "done",
    processed,
    citationsFound,
    remaining,
  });
}
