import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/hash";
import { getOpenAI } from "@/lib/openai";
import { getGemini } from "@/lib/gemini";
import { getClaude } from "@/lib/claude";
import { getPerplexity } from "@/lib/perplexity";
import { callGoogleAio } from "@/lib/serpapi";
import { extractAnalysis } from "@/lib/extractAnalysis";
import { getEnabledPrompts } from "@/lib/promptService";
import { persistProminenceForRun } from "@/lib/prominence/persistProminence";
import { extractNarrativeForRun, extractCompetitorNarratives } from "@/lib/narrative/extractNarrative";
import { persistSourcesForRun } from "@/lib/sources/persistSources";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

const BATCH_SIZE = 50;
const OPENAI_MODEL = "gpt-4o-mini";
const GEMINI_MODEL = "gemini-2.5-flash-lite";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const PERPLEXITY_MODEL = "sonar";
const OPENAI_TIMEOUT_MS = 30_000;
const GEMINI_TIMEOUT_MS = 30_000;
const CLAUDE_TIMEOUT_MS = 30_000;
const PERPLEXITY_TIMEOUT_MS = 30_000;
const GOOGLE_TIMEOUT_MS = 30_000;
const RETRY_DELAYS = [500, 1500]; // up to 2 retries

function isTransient(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  // Network errors, 5xx, rate limits (429)
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("econnreset")) return true;
  if ("status" in e) {
    const status = (e as { status: number }).status;
    if (status === 429 || status >= 500) return true;
  }
  return false;
}

interface OpenAICitation {
  url: string;
  title: string;
  startIndex: number;
  endIndex: number;
}

interface OpenAIResult {
  text: string;
  citations: OpenAICitation[];
}

async function callOpenAI(promptText: string): Promise<OpenAIResult> {
  const input = `Answer concisely and factually in 5 bullet points. Include source URLs where possible.\n\nQuestion: ${promptText}`;

  let lastError: unknown = new Error("All retry attempts exhausted");

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt - 1]));
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

      const response = await getOpenAI().responses.create(
        {
          model: OPENAI_MODEL,
          tools: [{ type: "web_search" as const }],
          input,
          max_output_tokens: 1024,
        },
        { signal: controller.signal },
      );

      clearTimeout(timer);

      // Extract text + annotations from the response output
      let text = "";
      const citations: OpenAICitation[] = [];

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

      // Fallback to output_text if we didn't extract from output array
      if (!text && response.output_text) {
        text = response.output_text;
      }

      if (text) {
        return { text, citations };
      }

      // Last resort: stringify the response
      return { text: JSON.stringify(response), citations: [] };
    } catch (e) {
      lastError = e;
      if (!isTransient(e)) throw e;
    }
  }

  throw lastError;
}

/** Follow a redirect URL (e.g. Gemini grounding redirect) to get the actual destination. */
async function resolveRedirect(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(3000) });
    return res.url || url;
  } catch {
    // If HEAD fails, try GET with short timeout
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(2000) });
      const resolved = res.url || url;
      await res.body?.cancel().catch(() => {});
      return resolved;
    } catch {
      return url;
    }
  }
}

/** Resolve multiple redirect URLs with a global timeout cap. */
async function resolveRedirectsBatch(
  entries: { uri: string; title: string }[],
): Promise<{ url: string; title: string }[]> {
  return Promise.race([
    Promise.all(
      entries.map(async (entry) => {
        const url = await resolveRedirect(entry.uri);
        return { url, title: entry.title };
      }),
    ),
    // Cap total redirect resolution at 5s — return originals for any unresolved
    new Promise<{ url: string; title: string }[]>((resolve) =>
      setTimeout(
        () => resolve(entries.map((e) => ({ url: e.uri, title: e.title }))),
        5000,
      ),
    ),
  ]);
}

interface GeminiResult {
  text: string;
  citations: OpenAICitation[]; // reuse same shape
}

async function callGemini(promptText: string): Promise<GeminiResult> {
  const input = `Answer concisely and factually in 5 bullet points. Include source URLs where possible.\n\nQuestion: ${promptText}`;

  let lastError: unknown = new Error("All retry attempts exhausted");

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt - 1]));
    }

    try {
      const model = getGemini().getGenerativeModel({
        model: GEMINI_MODEL,
        tools: [{ googleSearch: {} } as never],
      });
      const result = await Promise.race([
        model.generateContent(input),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Gemini timeout")), GEMINI_TIMEOUT_MS),
        ),
      ]);

      // Extract grounding URLs from metadata if available
      const text = result.response.text();
      const citations: OpenAICitation[] = [];
      const groundingMeta = (result.response as unknown as Record<string, unknown>)
        .candidates as Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { uri: string; title?: string } }> } }> | undefined;

      let groundingUrls = "";
      if (groundingMeta?.[0]?.groundingMetadata?.groundingChunks) {
        const chunks = groundingMeta[0].groundingMetadata.groundingChunks;
        const redirectUrls = chunks
          .filter((c) => c.web?.uri)
          .map((c) => ({ uri: c.web!.uri, title: c.web?.title ?? "" }));
        if (redirectUrls.length > 0) {
          // Resolve redirect URLs with global 5s cap
          const resolved = await resolveRedirectsBatch(redirectUrls);

          // Filter out Gemini proxy URLs that don't resolve to actual sources
          const realSources = resolved.filter(
            (u) => !u.url.includes("vertexaisearch.cloud.google.com"),
          );

          if (realSources.length > 0) {
            groundingUrls = "\n\nSources:\n" + realSources.map((u) => `- ${u.url}`).join("\n");

            // Build structured citations
            const baseOffset = text.length;
            for (let i = 0; i < realSources.length; i++) {
              citations.push({
                url: realSources[i].url,
                title: realSources[i].title,
                startIndex: baseOffset + i,
                endIndex: baseOffset + i,
              });
            }
          }
        }
      }

      if (text) return { text: text + groundingUrls, citations };

      return { text: JSON.stringify(result.response), citations: [] };
    } catch (e) {
      lastError = e;
      if (!isTransient(e)) throw e;
    }
  }

  throw lastError;
}

interface ClaudeResult {
  text: string;
  citations: OpenAICitation[];
}

async function callClaude(promptText: string): Promise<ClaudeResult> {
  const input = `Answer concisely and factually in 5 bullet points. Include source URLs where possible.\n\nQuestion: ${promptText}`;

  let lastError: unknown = new Error("All retry attempts exhausted");

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt - 1]));
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CLAUDE_TIMEOUT_MS);

      const response = await getClaude().messages.create(
        {
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
          messages: [{ role: "user", content: input }],
        },
        { signal: controller.signal },
      );

      clearTimeout(timer);

      // Extract text and web search citations from response content blocks
      let text = "";
      const citations: OpenAICitation[] = [];
      const seenUrls = new Set<string>();

      for (const block of response.content) {
        if (block.type === "text") {
          text += ("text" in block ? block.text : "");
          // Extract inline citations from text block citations array
          if ("citations" in block && Array.isArray(block.citations)) {
            for (const cite of block.citations) {
              const c = cite as unknown as Record<string, unknown>;
              if (c.type === "web_search_result_location" && typeof c.url === "string" && !seenUrls.has(c.url)) {
                seenUrls.add(c.url);
                citations.push({
                  url: c.url,
                  title: (c.title as string) ?? "",
                  startIndex: typeof c.start_index === "number" ? c.start_index : 0,
                  endIndex: typeof c.end_index === "number" ? c.end_index : 0,
                });
              }
            }
          }
        }
      }

      // Append sources section if citations were found
      if (citations.length > 0) {
        text += "\n\nSources:\n" + citations.map((c) => `- ${c.url}`).join("\n");
      }

      if (text) {
        return { text, citations };
      }

      return { text: JSON.stringify(response), citations: [] };
    } catch (e) {
      lastError = e;
      if (!isTransient(e)) throw e;
    }
  }

  throw lastError;
}

interface PerplexityResult {
  text: string;
  citations: OpenAICitation[];
}

async function callPerplexity(promptText: string): Promise<PerplexityResult> {
  const input = `Answer concisely and factually in 5 bullet points. Include source URLs where possible.\n\nQuestion: ${promptText}`;

  let lastError: unknown = new Error("All retry attempts exhausted");

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt - 1]));
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PERPLEXITY_TIMEOUT_MS);

      const response = await getPerplexity().chat.completions.create(
        {
          model: PERPLEXITY_MODEL,
          messages: [{ role: "user", content: input }],
          max_tokens: 1024,
        },
        { signal: controller.signal },
      );

      clearTimeout(timer);

      const text = response.choices?.[0]?.message?.content ?? "";
      const citations: OpenAICitation[] = [];

      // Perplexity returns citations in the response object
      const rawCitations = (response as unknown as { citations?: string[] }).citations;
      if (Array.isArray(rawCitations)) {
        const sourcesSection = "\n\nSources:\n" + rawCitations.map((u) => `- ${u}`).join("\n");
        for (let i = 0; i < rawCitations.length; i++) {
          citations.push({
            url: rawCitations[i],
            title: "",
            startIndex: text.length + i,
            endIndex: text.length + i,
          });
        }
        if (text) {
          return { text: text + sourcesSection, citations };
        }
      }

      if (text) {
        return { text, citations };
      }

      return { text: JSON.stringify(response), citations: [] };
    } catch (e) {
      lastError = e;
      if (!isTransient(e)) throw e;
    }
  }

  throw lastError;
}

interface GoogleResult {
  text: string;
  citations: OpenAICitation[];
}

async function callGoogle(promptText: string): Promise<GoogleResult> {
  let lastError: unknown = new Error("All retry attempts exhausted");

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt - 1]));
    }

    try {
      const result = await Promise.race([
        callGoogleAio(promptText),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Google AIO timeout")), GOOGLE_TIMEOUT_MS),
        ),
      ]);

      return {
        text: result.text,
        citations: result.citations.map((c) => ({
          url: c.url,
          title: c.title,
          startIndex: c.startIndex,
          endIndex: c.endIndex,
        })),
      };
    } catch (e) {
      lastError = e;
      if (!isTransient(e)) throw e;
    }
  }

  throw lastError;
}

/**
 * Convert a CUID string to a stable bigint for use with pg_try_advisory_lock.
 * We take the first 15 hex chars of the SHA-256 hash to fit in a signed 64-bit int.
 */
function jobIdToLockKey(jobId: string): bigint {
  const hex = sha256(`job-lock:${jobId}`).slice(0, 15);
  return BigInt("0x" + hex);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { userId, error: authError } = await requireAuth();
  if (authError) return authError;
  const rlError = await checkRateLimit(userId, "expensive");
  if (rlError) return rlError;
  const { jobId } = await params;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { brand: { select: { id: true, slug: true, name: true, displayName: true, industry: true } } },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const totalPrompts = await prisma.prompt.count({
    where: { brandId: job.brandId, enabled: true },
  });

  // If already done, return progress
  if (job.status === "done") {
    return NextResponse.json({
      jobId,
      status: "done",
      processedThisCall: 0,
      completedPrompts: totalPrompts,
      totalPrompts,
    });
  }

  // If errored, return error
  if (job.status === "error") {
    return NextResponse.json({
      jobId,
      status: "error",
      processedThisCall: 0,
      completedPrompts: await prisma.run.count({ where: { jobId } }),
      totalPrompts,
      error: job.error,
    });
  }

  // Acquire a PostgreSQL advisory lock keyed by jobId.
  // Non-blocking: if another request holds the lock, return immediately.
  const lockKey = jobIdToLockKey(jobId);
  let lockAcquired = false;

  try {
    const lockResult = await prisma.$queryRaw<{ pg_try_advisory_lock: boolean }[]>`SELECT pg_try_advisory_lock(${lockKey})`;
    lockAcquired = lockResult[0]?.pg_try_advisory_lock === true;

    if (!lockAcquired) {
      // Another caller is actively processing — return current progress
      const completedPrompts = await prisma.run.count({ where: { jobId } });
      return NextResponse.json({
        jobId,
        status: "running",
        processedThisCall: 0,
        completedPrompts,
        totalPrompts,
      });
    }

    // Transition queued → running
    if (job.status === "queued") {
      const claimed = await prisma.job.updateMany({
        where: { id: jobId, status: "queued" },
        data: { status: "running", startedAt: new Date() },
      });
      if (claimed.count === 0) {
        // Another caller already transitioned it — refresh status and continue
        const refreshed = await prisma.job.findUnique({ where: { id: jobId } });
        if (refreshed?.status === "done" || refreshed?.status === "error") {
          const completedPrompts = await prisma.run.count({ where: { jobId } });
          return NextResponse.json({
            jobId,
            status: refreshed.status,
            processedThisCall: 0,
            completedPrompts,
            totalPrompts,
            ...(refreshed.status === "error" ? { error: refreshed.error } : {}),
          });
        }
        // It's running — we hold the lock, so continue processing
      }
    }

    // Get enabled prompts for this brand
    const allPrompts = await getEnabledPrompts(job.brandId);

    // Expand comparative prompts containing {competitor} into per-competitor entries
    type ExpandedPrompt = { id: string; text: string; cluster: string; intent: string; competitor?: string };
    const expandedPrompts: ExpandedPrompt[] = [];

    const comparativeWithCompetitor = allPrompts.filter(
      (p) => p.cluster === "comparative" && p.text.includes("{competitor}"),
    );
    const needsExpansion = comparativeWithCompetitor.length > 0;

    let competitors: string[] = [];
    if (needsExpansion) {
      // Discover top competitors from EntityResponseMetric co-occurrence
      const brandMetrics = await prisma.entityResponseMetric.findMany({
        where: { run: { brandId: job.brandId }, entityId: job.brand.slug, prominenceScore: { gt: 0 } },
        select: { runId: true },
      });
      const brandRunIds = brandMetrics.map((m) => m.runId);

      if (brandRunIds.length > 0) {
        const coEntities = await prisma.entityResponseMetric.groupBy({
          by: ["entityId"],
          where: { runId: { in: brandRunIds }, entityId: { not: job.brand.slug }, prominenceScore: { gt: 0 } },
          _count: { entityId: true },
          orderBy: { _count: { entityId: "desc" } },
          take: 5,
        });
        competitors = coEntities.map((e) =>
          e.entityId.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        );
      }
    }

    for (const prompt of allPrompts) {
      if (prompt.cluster === "comparative" && prompt.text.includes("{competitor}") && competitors.length > 0) {
        for (const comp of competitors) {
          expandedPrompts.push({
            id: prompt.id,
            text: prompt.text,
            cluster: prompt.cluster,
            intent: prompt.intent,
            competitor: comp,
          });
        }
      } else {
        expandedPrompts.push({
          id: prompt.id,
          text: prompt.text,
          cluster: prompt.cluster,
          intent: prompt.intent,
        });
      }
    }

    // Find which prompts already have runs for this job
    const completedRuns = await prisma.run.findMany({
      where: { jobId },
      select: { promptId: true, requestHash: true },
    });
    const completedHashSet = new Set(completedRuns.map((r) => r.requestHash));

    // Compute remaining — use requestHash to track expanded comparative prompts
    const remaining = expandedPrompts.filter((p) => {
      const hashKey = p.competitor
        ? sha256(`${jobId}|${p.id}|${p.competitor}|v1`)
        : sha256(`${jobId}|${p.id}|v1`);
      return !completedHashSet.has(hashKey);
    });

    // Recalculate totalPrompts to include expanded comparatives
    const expandedTotal = expandedPrompts.length;

    // Nothing left — mark done and return early
    if (remaining.length === 0) {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "done", finishedAt: new Date() },
      });
      return NextResponse.json({
        jobId,
        status: "done",
        processedThisCall: 0,
        completedPrompts: expandedTotal,
        totalPrompts: expandedTotal,
      });
    }

    const batch = remaining.slice(0, BATCH_SIZE);
    const brandDisplayName = job.brand.displayName || job.brand.name;

    // Phase 1: Generate LLM responses concurrently for the batch
    const rawResponses = await Promise.all(
      batch.map(async (prompt) => {
        let promptText = prompt.text.replace(/\{brand\}/g, brandDisplayName);
        if (prompt.competitor) {
          promptText = promptText.replace(/\{competitor\}/g, prompt.competitor);
        }
        // Replace {industry} with classified industry label, fallback to brand name
        const industryLabel = job.brand.industry || `${brandDisplayName}'s industry`;
        promptText = promptText.replace(/\{industry\}/g, industryLabel);

        // Check cache: reuse response + analysis if an identical query exists
        const promptTextHash = sha256(`${job.model}|${promptText}`);
        const cached = await prisma.run.findFirst({
          where: { promptTextHash },
          select: { rawResponseText: true, analysisJson: true },
        });

        let responseText: string;
        let analysis: unknown = undefined;
        let citations: OpenAICitation[] = [];
        let needsAnalysis = false;

        if (cached) {
          responseText = cached.rawResponseText;
          analysis = cached.analysisJson;
        } else {
          if (job.model === "chatgpt") {
            const result = await callOpenAI(promptText);
            responseText = result.text;
            citations = result.citations;
          } else if (job.model === "gemini") {
            const result = await callGemini(promptText);
            responseText = result.text;
            citations = result.citations;
          } else if (job.model === "claude") {
            const result = await callClaude(promptText);
            responseText = result.text;
            citations = result.citations;
          } else if (job.model === "perplexity") {
            const result = await callPerplexity(promptText);
            responseText = result.text;
            citations = result.citations;
          } else if (job.model === "google") {
            const result = await callGoogle(promptText);
            responseText = result.text;
            citations = result.citations;
          } else {
            responseText = `[stub:${job.model}] ${brandDisplayName} :: ${promptText}`;
          }
          needsAnalysis = true;
        }

        return { prompt, promptText, promptTextHash, responseText, analysis, citations, needsAnalysis };
      }),
    );

    // Phase 2: Run analysis extraction in parallel for all non-cached responses
    const responses = await Promise.all(
      rawResponses.map(async (r) => {
        if (r.needsAnalysis) {
          r.analysis = await extractAnalysis(r.responseText, brandDisplayName, r.promptText);
        }
        return { prompt: r.prompt, promptTextHash: r.promptTextHash, responseText: r.responseText, analysis: r.analysis, citations: r.citations };
      }),
    );

    // Save results to DB
    let processedThisCall = 0;
    for (const { prompt, promptTextHash, responseText, analysis, citations } of responses) {
      const requestHash = prompt.competitor
        ? sha256(`${jobId}|${prompt.id}|${prompt.competitor}|v1`)
        : sha256(`${jobId}|${prompt.id}|v1`);

      try {
        const run = await prisma.run.upsert({
          where: { requestHash },
          update: {},
          create: {
            jobId,
            brandId: job.brandId,
            promptId: prompt.id,
            model: job.model,
            requestHash,
            promptTextHash,
            rawResponseText: responseText,
            analysisJson: JSON.parse(JSON.stringify(analysis)),
          },
        });

        // Non-blocking side effects — fire and forget so the response returns fast
        persistProminenceForRun({
          runId: run.id,
          model: job.model,
          promptId: prompt.id,
          brandName: brandDisplayName,
          brandSlug: job.brand.slug,
          responseText,
          analysisJson: analysis,
        }).catch(() => {});

        extractNarrativeForRun(responseText, brandDisplayName, job.brand.slug)
          .then((narrative) => {
            prisma.run.update({ where: { id: run.id }, data: { narrativeJson: JSON.parse(JSON.stringify(narrative)) } }).catch(() => {});
          })
          .catch(() => {});

        // Extract competitor narratives
        const analysisObj = analysis as { competitors?: { name: string }[] } | null;
        if (analysisObj?.competitors && analysisObj.competitors.length > 0) {
          extractCompetitorNarratives(responseText, analysisObj.competitors)
            .then((compNarratives) => {
              prisma.run.update({
                where: { id: run.id },
                data: { competitorNarrativesJson: JSON.parse(JSON.stringify(compNarratives)) },
              }).catch(() => {});
            })
            .catch(() => {});
        }

        persistSourcesForRun({
          runId: run.id,
          model: job.model,
          promptId: prompt.id,
          brandName: brandDisplayName,
          brandSlug: job.brand.slug,
          responseText,
          analysisJson: analysis,
          apiCitations: citations,
        }).catch(() => {});

        processedThisCall++;
      } catch (e: unknown) {
        // If unique constraint violation, treat as already completed
        if (
          typeof e === "object" &&
          e !== null &&
          "code" in e &&
          (e as { code: string }).code === "P2002"
        ) {
          processedThisCall++;
        } else {
          throw e;
        }
      }
    }

    // Recompute completed count
    const completedPrompts = await prisma.run.count({ where: { jobId } });

    // Check if done
    if (completedPrompts >= expandedTotal) {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "done", finishedAt: new Date() },
      });
    }

    return NextResponse.json({
      jobId,
      status: completedPrompts >= expandedTotal ? "done" : "running",
      processedThisCall,
      completedPrompts,
      totalPrompts: expandedTotal,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    try {
      await prisma.job.update({
        where: { id: jobId },
        data: { status: "error", error: message },
      });
    } catch {
      // DB may be unreachable — still return the error to the client
    }
    console.error("[POST /api/jobs/process] Error:", message);
    return NextResponse.json({ error: "An unexpected error occurred while processing the job." }, { status: 500 });
  } finally {
    // Always release the advisory lock if we acquired it
    if (lockAcquired) {
      await prisma.$queryRaw`SELECT pg_advisory_unlock(${lockKey})`.catch(() => {});
    }
  }
}
