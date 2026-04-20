/**
 * Durable backfill workflow.
 *
 * Replaces the monolithic POST /api/backfill handler that tried to
 * finish every month × prompt × model combination inside one 300 s
 * serverless invocation. Here the orchestrator is a `"use workflow"`
 * function that loops over months sequentially and fans out per-prompt
 * work as `"use step"` functions, each with its own retry budget. The
 * per-step sandbox gives us full Node access for the Prisma / provider
 * calls; the workflow function just coordinates.
 *
 * Client contract (RunPromptsPanel): POST once to /api/backfill →
 * returns a runId, then GET /api/backfill/status?runId=…&brandSlug=…
 * to read progress.  The status endpoint computes progress from the
 * existing Job rows so the polling semantics match the old flow.
 */

import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/hash";
import { getOpenAI } from "@/lib/openai";
import { getGemini } from "@/lib/gemini";
import { getClaude } from "@/lib/claude";
import { getPerplexity } from "@/lib/perplexity";
import { callGoogleAio } from "@/lib/serpapi";
import { extractAnalysis } from "@/lib/extractAnalysis";
import { extractNarrativeForRun } from "@/lib/narrative/extractNarrative";
import { persistProminenceForRun } from "@/lib/prominence/persistProminence";
import { persistSourcesForRun, type ApiCitation } from "@/lib/sources/persistSources";
import { resolveRedirectsBatch } from "@/lib/redirectResolver";

const OPENAI_MODEL = "gpt-4o-mini";
const GEMINI_MODEL = "gemini-2.5-flash-lite";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const PERPLEXITY_MODEL = "sonar";

export interface BackfillPrompt {
  id: string;
  text: string;
  competitor?: string;
}

export interface BackfillMonth {
  w: number;
  jobDateISO: string;
  dateStr: string;
}

export interface BackfillParams {
  brandId: string;
  brandSlug: string;
  brandName: string;
  brandIndustry: string | null;
  brandCategory: string | null;
  model: string;
  jobRange: number;
  prompts: BackfillPrompt[];
  months: BackfillMonth[];
}

interface ModelResult {
  text: string;
  citations: ApiCitation[];
}

// ─── Provider callers ───────────────────────────────────────────────
// Each provider caller is a step so that a transient API failure
// retries at the provider level rather than the whole month. Per-call
// timeouts stay at 25 s — the step framework will retry on throw.

async function callOpenAIStep(promptText: string): Promise<ModelResult> {
  "use step";
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

async function callGeminiStep(promptText: string): Promise<ModelResult> {
  "use step";
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

async function callClaudeStep(promptText: string): Promise<ModelResult> {
  "use step";
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

async function callPerplexityStep(promptText: string): Promise<ModelResult> {
  "use step";
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

async function callGoogleStep(promptText: string): Promise<ModelResult> {
  "use step";
  const result = await callGoogleAio(promptText);
  return { text: result.text, citations: [] };
}

// ─── DB steps ───────────────────────────────────────────────────────

async function createJobStep(args: {
  brandId: string;
  model: string;
  jobRange: number;
  jobDateISO: string;
}): Promise<string> {
  "use step";
  const jobDate = new Date(args.jobDateISO);
  const job = await prisma.job.create({
    data: {
      brandId: args.brandId,
      model: args.model,
      range: args.jobRange,
      status: "running",
      createdAt: jobDate,
      startedAt: jobDate,
    },
  });
  return job.id;
}

async function finalizeJobStep(args: {
  jobId: string;
  jobDateISO: string;
  hasError: boolean;
}): Promise<void> {
  "use step";
  const finishedAt = new Date(args.jobDateISO);
  finishedAt.setMinutes(finishedAt.getMinutes() + 5);
  await prisma.job.update({
    where: { id: args.jobId },
    data: {
      status: args.hasError ? "error" : "done",
      finishedAt,
      ...(args.hasError ? { error: "Some prompts failed" } : {}),
    },
  });
}

interface ProcessPromptArgs {
  jobId: string;
  jobDateISO: string;
  brandId: string;
  brandSlug: string;
  brandName: string;
  brandIndustry: string | null;
  brandCategory: string | null;
  model: string;
  prompt: BackfillPrompt;
  monthW: number;
  dateStr: string;
}

/**
 * One prompt × one month. Runs model call, analysis, DB upsert,
 * narrative extract, and source persistence in sequence. The model
 * call is itself a sub-step (via callXStep) so transient API errors
 * retry without redoing the whole prompt.
 */
async function processPromptStep(args: ProcessPromptArgs): Promise<void> {
  "use step";
  const {
    jobId,
    jobDateISO,
    brandId,
    brandSlug,
    brandName,
    brandIndustry,
    brandCategory,
    model,
    prompt,
    monthW,
    dateStr,
  } = args;

  let originalText = prompt.text.replace(/\{brand\}/g, brandName);
  if (prompt.competitor) {
    originalText = originalText.replace(/\{competitor\}/g, prompt.competitor);
  }
  const industryLabel = brandIndustry || `${brandName}'s industry`;
  originalText = originalText.replace(/\{industry\}/g, industryLabel);
  const promptText =
    monthW === 0 ? originalText : `As of ${dateStr}, ${originalText}`;

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
  } else {
    let result: ModelResult;
    if (model === "chatgpt") result = await callOpenAIStep(promptText);
    else if (model === "gemini") result = await callGeminiStep(promptText);
    else if (model === "claude") result = await callClaudeStep(promptText);
    else if (model === "perplexity") result = await callPerplexityStep(promptText);
    else if (model === "google") result = await callGoogleStep(promptText);
    else {
      result = { text: `[stub:${model}] ${brandName} :: ${promptText}`, citations: [] };
    }
    responseText = result.text;
    citations = result.citations;

    analysis = await extractAnalysis(
      responseText,
      brandName,
      promptText,
      brandCategory ?? undefined,
    );
  }

  const requestHash = prompt.competitor
    ? sha256(`${jobId}|${prompt.id}|${prompt.competitor}|v1`)
    : sha256(`${jobId}|${prompt.id}|v1`);

  const jobDate = new Date(jobDateISO);
  const run = await prisma.run.upsert({
    where: { requestHash },
    update: {},
    create: {
      jobId,
      brandId,
      promptId: prompt.id,
      model,
      requestHash,
      promptTextHash,
      rawResponseText: responseText,
      analysisJson: JSON.parse(JSON.stringify(analysis)),
      createdAt: jobDate,
    },
  });

  persistProminenceForRun({
    runId: run.id,
    model,
    promptId: prompt.id,
    brandName,
    brandSlug,
    responseText,
    analysisJson: analysis,
  }).catch(() => {});

  try {
    const narrative = await extractNarrativeForRun(responseText, brandName, brandSlug);
    await prisma.run.update({
      where: { id: run.id },
      data: { narrativeJson: JSON.parse(JSON.stringify(narrative)) },
    });
  } catch (e) {
    console.error(
      `[backfill-workflow] extractNarrativeForRun failed run=${run.id}:`,
      e instanceof Error ? e.message : e,
    );
  }

  const existingSourceCount = await prisma.sourceOccurrence.count({
    where: { runId: run.id },
  });
  if (existingSourceCount === 0) {
    await persistSourcesForRun({
      runId: run.id,
      model,
      promptId: prompt.id,
      brandName,
      brandSlug,
      responseText,
      analysisJson: analysis,
      apiCitations: citations,
    }).catch((err) => {
      console.error(
        `[backfill-workflow] persistSources failed run=${run.id}:`,
        err instanceof Error ? err.message : err,
      );
    });
  }
}

// ─── Workflow orchestrator ──────────────────────────────────────────

/**
 * Runs a full backfill: up to 4 months × N prompts × 1 model.
 * Months run sequentially so progress is visible in the Job table as
 * each finishes; prompts within a month fan out in parallel via
 * Promise.allSettled to keep total wall time close to the serial
 * version of the pipeline.
 */
export async function backfillWorkflow(params: BackfillParams): Promise<{
  completedMonths: number;
  totalMonths: number;
}> {
  "use workflow";

  for (const month of params.months) {
    const jobId = await createJobStep({
      brandId: params.brandId,
      model: params.model,
      jobRange: params.jobRange,
      jobDateISO: month.jobDateISO,
    });

    const settled = await Promise.allSettled(
      params.prompts.map((prompt) =>
        processPromptStep({
          jobId,
          jobDateISO: month.jobDateISO,
          brandId: params.brandId,
          brandSlug: params.brandSlug,
          brandName: params.brandName,
          brandIndustry: params.brandIndustry,
          brandCategory: params.brandCategory,
          model: params.model,
          prompt,
          monthW: month.w,
          dateStr: month.dateStr,
        }),
      ),
    );

    const hasError = settled.some((r) => r.status === "rejected");
    await finalizeJobStep({
      jobId,
      jobDateISO: month.jobDateISO,
      hasError,
    });
  }

  return { completedMonths: params.months.length, totalMonths: params.months.length };
}
