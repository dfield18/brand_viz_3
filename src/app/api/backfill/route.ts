import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VALID_MODELS } from "@/lib/constants";
import { getOpenAI } from "@/lib/openai";
import { getGemini } from "@/lib/gemini";
import { getClaude } from "@/lib/claude";
import { getPerplexity } from "@/lib/perplexity";
import { callGoogleAio } from "@/lib/serpapi";
import { extractAnalysis } from "@/lib/extractAnalysis";
import { extractNarrativeForRun } from "@/lib/narrative/extractNarrative";
import { sha256 } from "@/lib/hash";
import { getEnabledPrompts } from "@/lib/promptService";
import { persistProminenceForRun } from "@/lib/prominence/persistProminence";

import { persistSourcesForRun, type ApiCitation } from "@/lib/sources/persistSources";
import { resolveRedirectsBatch } from "@/lib/redirectResolver";
import { findOrCreateBrand } from "@/lib/brand";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

// Explicit, visible ceiling for this handler. The polling-batch sizing
// below (CONCURRENT_POINTS) is chosen so that a single POST stays well
// inside this budget even on a 30-prompt brand across 4 providers.
// Previously implicit via the Vercel project default, which masked
// FUNCTION_INVOCATION_TIMEOUT surprises on large brands.
export const maxDuration = 300;

const OPENAI_MODEL = "gpt-4o-mini";
const GEMINI_MODEL = "gemini-2.5-flash-lite";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const PERPLEXITY_MODEL = "sonar";
const MONTHS_BACK = 3; // 3 months back + current = 4 data points
const TOTAL_POINTS = MONTHS_BACK + 1;
// Each processWeek fans out up to ~N prompts per provider in parallel,
// each with a 25 s per-call timeout plus ~3-5 s for narrative extract
// and Gemini redirect resolution. 2 months per POST caps peak provider
// concurrency at ~2N and per-batch wall time around 60-120 s on large
// brands — safely under maxDuration. The client (RunPromptsPanel)
// already polls until status === "done", so reducing this just adds
// one extra round-trip per model, not extra end-user wait time.
const CONCURRENT_POINTS = 2;

function monthDate(monthsAgo: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  d.setHours(12, 0, 0, 0);
  return d;
}

interface ModelResult {
  text: string;
  citations: ApiCitation[];
}

// Each caller enables its provider's web-search tool (where
// applicable) and extracts structured citations. Without this, Runs
// written by backfill had no URL sources, so Pro brands whose data
// came via Rerun showed an empty Sources tab. Gemini also resolves
// vertexai grounding-redirect URLs via resolveRedirectsBatch so the
// real source domains land instead of being filtered downstream.

async function callOpenAI(promptText: string): Promise<ModelResult> {
  const input = `Answer concisely and factually in 5 bullet points.\n\nQuestion: ${promptText}`;
  const response = await getOpenAI().responses.create({
    model: OPENAI_MODEL,
    tools: [{ type: "web_search" as const }],
    input,
    max_output_tokens: 512,
  });
  let text = "";
  const citations: ApiCitation[] = [];
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
                    title: ann.title ?? "",
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
  if (!text && response.output_text) text = response.output_text;
  return { text: text || JSON.stringify(response), citations };
}

async function callGemini(promptText: string): Promise<ModelResult> {
  const input = `Answer concisely and factually in 5 bullet points. Include source URLs where possible.\n\nQuestion: ${promptText}`;
  const model = getGemini().getGenerativeModel({
    model: GEMINI_MODEL,
    tools: [{ googleSearch: {} } as never],
  });
  const result = await Promise.race([
    model.generateContent(input),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini timeout")), 25_000),
    ),
  ]);
  const text = result.response.text() || JSON.stringify(result.response);
  const citations: ApiCitation[] = [];
  const groundingMeta = (result.response as unknown as Record<string, unknown>)
    .candidates as Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { uri: string; title?: string } }> } }> | undefined;
  let fullText = text;
  if (groundingMeta?.[0]?.groundingMetadata?.groundingChunks) {
    const entries = groundingMeta[0].groundingMetadata.groundingChunks
      .filter((c) => c.web?.uri)
      .map((c) => ({ uri: c.web!.uri, title: c.web?.title ?? "" }));
    if (entries.length > 0) {
      const resolved = await resolveRedirectsBatch(entries);
      const baseOffset = text.length;
      for (let i = 0; i < resolved.length; i++) {
        citations.push({
          url: resolved[i].url,
          title: resolved[i].title,
          startIndex: baseOffset + i,
          endIndex: baseOffset + i,
        });
      }
      if (citations.length > 0) {
        fullText += "\n\nSources:\n" + citations.map((c) => `- ${c.url}`).join("\n");
      }
    }
  }
  return { text: fullText, citations };
}

async function callClaude(promptText: string): Promise<ModelResult> {
  const input = `Answer concisely and factually in 5 bullet points.\n\nQuestion: ${promptText}`;
  const response = await Promise.race([
    getClaude().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [{ role: "user", content: input }],
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Claude timeout")), 25_000),
    ),
  ]);
  let text = "";
  const citations: ApiCitation[] = [];
  for (const block of response.content) {
    if (block.type === "text" && "text" in block) {
      const blockText = block.text as string;
      const baseOffset = text.length;
      text += blockText;
      if ("citations" in block && Array.isArray(block.citations)) {
        for (const cite of block.citations) {
          if (cite && typeof cite === "object" && "url" in cite && typeof cite.url === "string") {
            citations.push({
              url: cite.url,
              title: "title" in cite && typeof cite.title === "string" ? cite.title : "",
              startIndex: baseOffset,
              endIndex: baseOffset + blockText.length,
            });
          }
        }
      }
    }
  }
  return { text: text || JSON.stringify(response), citations };
}

async function callPerplexity(promptText: string): Promise<ModelResult> {
  const input = `Answer concisely and factually in 5 bullet points.\n\nQuestion: ${promptText}`;
  const response = await Promise.race([
    getPerplexity().chat.completions.create({
      model: PERPLEXITY_MODEL,
      messages: [{ role: "user", content: input }],
      max_tokens: 512,
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Perplexity timeout")), 25_000),
    ),
  ]);
  const text = response.choices?.[0]?.message?.content ?? JSON.stringify(response);
  const citations: ApiCitation[] = [];
  const raw = (response as unknown as { citations?: string[] }).citations;
  if (Array.isArray(raw)) {
    const baseOffset = text.length;
    raw.forEach((url, i) => {
      if (typeof url === "string") {
        citations.push({ url, title: "", startIndex: baseOffset + i, endIndex: baseOffset + i });
      }
    });
  }
  return { text, citations };
}

interface WeekTask {
  w: number;
  jobDate: Date;
  dateStr: string;
}

async function processWeek(
  task: WeekTask,
  brand: { id: string; name: string; slug: string; industry: string | null; category: string | null },
  brandName: string,
  model: string,
  jobRange: number,
  prompts: { id: string; text: string; competitor?: string }[],
): Promise<void> {
  const { w, jobDate, dateStr } = task;

  const job = await prisma.job.create({
    data: {
      brandId: brand.id,
      model,
      range: jobRange,
      status: "running",
      createdAt: jobDate,
      startedAt: jobDate,
    },
  });

  try {
    // Use allSettled so one prompt failure doesn't abort the whole week
    const settled = await Promise.allSettled(
      prompts.map(async (prompt) => {
        let originalText = prompt.text.replace(/\{brand\}/g, brandName);
        if (prompt.competitor) {
          originalText = originalText.replace(/\{competitor\}/g, prompt.competitor);
        }
        const industryLabel = brand.industry || `${brandName}'s industry`;
        originalText = originalText.replace(/\{industry\}/g, industryLabel);
        const promptText =
          w === 0 ? originalText : `As of ${dateStr}, ${originalText}`;

        // Check cache: reuse response + analysis if an identical query exists
        const promptTextHash = sha256(`${model}|${promptText}`);
        const cached = await prisma.run.findFirst({
          where: { promptTextHash },
          select: { rawResponseText: true, analysisJson: true },
        });

        let responseText: string;
        let analysis: unknown;
        let citations: ApiCitation[] = [];

        if (cached) {
          responseText = cached.rawResponseText;
          analysis = cached.analysisJson;
          // Cached Runs have no citations to hand back — persistSources
          // already captured them at original write time (or it didn't,
          // and there's nothing to re-extract from text alone without
          // the model's structured annotations).
        } else {
          if (model === "chatgpt") {
            const result = await callOpenAI(promptText);
            responseText = result.text;
            citations = result.citations;
          } else if (model === "gemini") {
            const result = await callGemini(promptText);
            responseText = result.text;
            citations = result.citations;
          } else if (model === "claude") {
            const result = await callClaude(promptText);
            responseText = result.text;
            citations = result.citations;
          } else if (model === "perplexity") {
            const result = await callPerplexity(promptText);
            responseText = result.text;
            citations = result.citations;
          } else if (model === "google") {
            const result = await callGoogleAio(promptText);
            responseText = result.text;
            // callGoogleAio returns a different shape; treat as no
            // structured citations (SerpAPI inline URLs will fall out
            // of text extraction in persistSourcesForRun).
          } else {
            responseText = `[stub:${model}] ${brandName} :: ${promptText}`;
          }

          analysis = await extractAnalysis(
            responseText,
            brandName,
            promptText,
            brand.category ?? undefined,
          );
        }

        return { prompt, promptTextHash, responseText, analysis, citations };
      }),
    );

    let hasError = false;
    for (const result of settled) {
      if (result.status === "rejected") {
        hasError = true;
        continue;
      }
      const { prompt, promptTextHash, responseText, analysis, citations } = result.value;
      const requestHash = prompt.competitor
        ? sha256(`${job.id}|${prompt.id}|${prompt.competitor}|v1`)
        : sha256(`${job.id}|${prompt.id}|v1`);
      try {
        const run = await prisma.run.upsert({
          where: { requestHash },
          update: {},
          create: {
            jobId: job.id,
            brandId: brand.id,
            promptId: prompt.id,
            model,
            requestHash,
            promptTextHash,
            rawResponseText: responseText,
            analysisJson: JSON.parse(JSON.stringify(analysis)),
            createdAt: jobDate,
          },
        });

        // Compute and persist prominence scores (non-blocking)
        persistProminenceForRun({
          runId: run.id,
          model,
          promptId: prompt.id,
          brandName,
          brandSlug: brand.slug,
          responseText,
          analysisJson: analysis,
        }).catch(() => {});

        // Extract narrative (sentiment label + themes) so the narrative
        // sentiment trend chart has week-over-week data points.
        // Previously skipped here "to reduce API load" — but a Pro brand
        // whose data came entirely through Rerun then had
        // narrativeJson=null on every run, leaving "How AI Sentiment Is
        // Changing" empty even though the visibility trend worked.
        // Awaited because Vercel kills background work after the
        // response returns; accepts ~1-3s per run as the cost of the
        // extra GPT-4o-mini call. Errors are swallowed so one failed
        // extraction doesn't lose the Run itself.
        try {
          const narrative = await extractNarrativeForRun(responseText, brandName, brand.slug);
          await prisma.run.update({
            where: { id: run.id },
            data: { narrativeJson: JSON.parse(JSON.stringify(narrative)) },
          });
        } catch (e) {
          console.error(`[backfill] extractNarrativeForRun failed for run=${run.id}:`, e instanceof Error ? e.message : e);
        }

        // SourceOccurrence has no DB-level uniqueness guard today, so avoid
        // re-persisting sources for runs that already have saved citations.
        const existingSourceCount = await prisma.sourceOccurrence.count({
          where: { runId: run.id },
        });
        if (existingSourceCount === 0) {
          // Persist source occurrences — now passing structured
          // citations from the model's web_search / grounding
          // response so URL sources land even when the response text
          // doesn't inline them. Awaited (not fire-and-forget)
          // because Vercel kills background work once the response
          // returns, which was one reason sources were silently
          // missing on Rerun-produced brands.
          await persistSourcesForRun({
            runId: run.id,
            model,
            promptId: prompt.id,
            brandName,
            brandSlug: brand.slug,
            responseText,
            analysisJson: analysis,
            apiCitations: citations,
          }).catch((err) => {
            console.error(`[backfill] persistSources failed for run=${run.id}:`, err instanceof Error ? err.message : err);
          });
        }
      } catch {
        hasError = true;
      }
    }

    const finishedAt = new Date(jobDate);
    finishedAt.setMinutes(finishedAt.getMinutes() + 5);

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: hasError ? "error" : "done",
        finishedAt,
        ...(hasError ? { error: "Some prompts failed" } : {}),
      },
    });
  } catch (e) {
    // Catch-all: mark the job as error so it doesn't stay stuck as "running"
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "error",
        error: e instanceof Error ? e.message : "Unknown error",
      },
    });
  }
}

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

  const { brandSlug, model, range } = body as {
    brandSlug?: string;
    model?: string;
    range?: number;
  };

  if (!brandSlug || !model || !VALID_MODELS.includes(model)) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  const jobRange = range ?? 90;

  const brand = await findOrCreateBrand(brandSlug);
  const brandName = (brand as unknown as { displayName?: string | null }).displayName || brand.name;

  const rawPrompts = await getEnabledPrompts(brand.id);

  // Expand comparative prompts with {competitor} into per-competitor entries
  type BackfillPrompt = { id: string; text: string; competitor?: string };
  const prompts: BackfillPrompt[] = [];

  const comparativeWithCompetitor = rawPrompts.filter(
    (p: { cluster: string; text: string }) => p.cluster === "comparative" && p.text.includes("{competitor}"),
  );

  let competitors: string[] = [];
  if (comparativeWithCompetitor.length > 0) {
    const brandMetrics = await prisma.entityResponseMetric.findMany({
      where: { run: { brandId: brand.id }, entityId: brand.slug },
      select: { runId: true },
    });
    const brandRunIds = brandMetrics.map((m: { runId: string }) => m.runId);
    if (brandRunIds.length > 0) {
      const coEntities = await prisma.entityResponseMetric.groupBy({
        by: ["entityId"],
        where: { runId: { in: brandRunIds }, entityId: { not: brand.slug } },
        _count: { entityId: true },
        orderBy: { _count: { entityId: "desc" } },
        take: 5,
      });
      competitors = coEntities.map((e: { entityId: string }) =>
        e.entityId.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      );
    }
  }

  for (const prompt of rawPrompts) {
    if (prompt.cluster === "comparative" && prompt.text.includes("{competitor}") && competitors.length > 0) {
      for (const comp of competitors) {
        prompts.push({ id: prompt.id, text: prompt.text, competitor: comp });
      }
    } else {
      prompts.push({ id: prompt.id, text: prompt.text });
    }
  }

  // Collect all monthly time points that need processing
  const allWeeks: WeekTask[] = [];
  for (let m = MONTHS_BACK; m >= 0; m--) {
    const jobDate = monthDate(m);
    allWeeks.push({ w: m, jobDate, dateStr: jobDate.toISOString().slice(0, 10) });
  }

  // Single query: find all completed jobs for this brand+model in the backfill range
  const oldestDate = new Date(allWeeks[0].jobDate);
  oldestDate.setHours(0, 0, 0, 0);
  const newestDate = new Date(allWeeks[allWeeks.length - 1].jobDate);
  newestDate.setHours(23, 59, 59, 999);

  const [doneJobs, staleJobs] = await Promise.all([
    prisma.job.findMany({
      where: {
        brandId: brand.id, model, range: jobRange,
        status: "done",
        finishedAt: { gte: oldestDate, lte: newestDate },
      },
      select: { finishedAt: true },
    }),
    prisma.job.findMany({
      where: {
        brandId: brand.id, model, range: jobRange,
        status: { in: ["error", "queued", "running"] },
        createdAt: { gte: oldestDate, lte: newestDate },
      },
      select: { id: true },
    }),
  ]);

  // Build set of dates that already have a completed job
  const doneDates = new Set(doneJobs.map((j: { finishedAt: Date | null }) => j.finishedAt?.toISOString().slice(0, 10)));

  // Bulk cleanup stale jobs in one pass
  if (staleJobs.length > 0) {
    const staleIds = staleJobs.map((j: { id: string }) => j.id);
    const staleRunIds = (await prisma.run.findMany({
      where: { jobId: { in: staleIds } },
      select: { id: true },
    })).map((r: { id: string }) => r.id);
    if (staleRunIds.length > 0) {
      await Promise.all([
        prisma.entityResponseMetric.deleteMany({ where: { runId: { in: staleRunIds } } }),
        prisma.sourceOccurrence.deleteMany({ where: { runId: { in: staleRunIds } } }),
      ]);
    }
    await prisma.run.deleteMany({ where: { jobId: { in: staleIds } } });
    await prisma.job.deleteMany({ where: { id: { in: staleIds } } });
  }

  const pending = allWeeks.filter((t) => !doneDates.has(t.dateStr));

  // All weeks done
  if (pending.length === 0) {
    const latestJob = await prisma.job.findFirst({
      where: { brandId: brand.id, model, range: jobRange, status: "done" },
      orderBy: { finishedAt: "desc" },
      select: { id: true },
    });

    return NextResponse.json({
      status: "done",
      completedWeeks: TOTAL_POINTS,
      totalWeeks: TOTAL_POINTS,
      latestJobId: latestJob?.id ?? null,
    });
  }

  // Process up to CONCURRENT_POINTS weeks in parallel
  const batch = pending.slice(0, CONCURRENT_POINTS);

  await Promise.allSettled(
    batch.map((task) => processWeek(task, brand, brandName, model, jobRange, prompts)),
  );

  const remaining = pending.length - batch.length;
  const completedWeeks = TOTAL_POINTS - remaining;

  // If this batch covered all remaining weeks, return "done" directly
  if (remaining <= 0) {
    const latestJob = await prisma.job.findFirst({
      where: { brandId: brand.id, model, range: jobRange, status: "done" },
      orderBy: { finishedAt: "desc" },
      select: { id: true },
    });
    return NextResponse.json({
      status: "done",
      completedWeeks: TOTAL_POINTS,
      totalWeeks: TOTAL_POINTS,
      latestJobId: latestJob?.id ?? null,
    });
  }

  return NextResponse.json({
    status: "running",
    completedWeeks,
    totalWeeks: TOTAL_POINTS,
    currentWeekDate: batch.map((t) => t.dateStr).join(", "),
  });
}
