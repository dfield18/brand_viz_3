import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FREE_TIER_CONFIG } from "@/config/freeTier";
import { findOrCreateBrand } from "@/lib/brand";
import { getOpenAI } from "@/lib/openai";
import { getGemini } from "@/lib/gemini";
import { extractAnalysis } from "@/lib/extractAnalysis";
import { extractNarrativeForRun } from "@/lib/narrative/extractNarrative";
import { persistSourcesForRun, type ApiCitation } from "@/lib/sources/persistSources";
import { persistProminenceForRun } from "@/lib/prominence/persistProminence";
import { sha256 } from "@/lib/hash";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import {
  classifyBrandCategory,
  classifyBrandIndustry,
  generateBrandAliases,
  generateIndustryPrompts,
} from "@/lib/generateFeaturePrompts";

// 5 prompts × 2 models = 10 parallel response calls plus 10 analysis
// extractions. In practice this completes in ~15–30s. Give it headroom.
export const maxDuration = 60;

/** Attach the anonymous session cookie to any response. 30-day lifetime so
 *  the per-session daily cap survives short breaks between runs. */
function setSessionCookie(res: NextResponse, sessionId: string) {
  res.cookies.set({
    name: FREE_TIER_CONFIG.sessionCookie,
    value: sessionId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

interface ModelResult {
  text: string;
  citations: ApiCitation[];
}

/** After a cached brand's pipeline completes, reconcile any duplicate
 *  Jobs that a concurrent request wrote to the same (model, day)
 *  bucket: keep the most-recently-finished Job per bucket, delete the
 *  rest along with their Runs, EntityResponseMetrics, and
 *  SourceOccurrences. No-op if any Job for this brand still has
 *  finishedAt=null — a peer pipeline is still writing, and deleting
 *  its half-written rows would break foreign keys. The still-running
 *  writer will run this same function at its own completion. */
async function dedupeBrandJobs(brandId: string): Promise<void> {
  try {
    const inFlight = await prisma.job.count({
      where: { brandId, finishedAt: null },
    });
    if (inFlight > 0) return;

    const jobs = await prisma.job.findMany({
      where: { brandId, finishedAt: { not: null } },
      select: { id: true, model: true, finishedAt: true },
      orderBy: { finishedAt: "desc" },
    });

    const seen = new Set<string>();
    const dropJobIds: string[] = [];
    for (const j of jobs) {
      if (!j.finishedAt) continue;
      const bucket = `${j.model}|${j.finishedAt.toISOString().slice(0, 10)}`;
      if (seen.has(bucket)) {
        dropJobIds.push(j.id);
      } else {
        seen.add(bucket);
      }
    }
    if (dropJobIds.length === 0) return;

    const runRows = await prisma.run.findMany({
      where: { jobId: { in: dropJobIds } },
      select: { id: true },
    });
    const runIds = runRows.map((r) => r.id);

    // No onDelete cascade on these relations — delete children first.
    await prisma.$transaction([
      prisma.entityResponseMetric.deleteMany({ where: { runId: { in: runIds } } }),
      prisma.sourceOccurrence.deleteMany({ where: { runId: { in: runIds } } }),
      prisma.run.deleteMany({ where: { id: { in: runIds } } }),
      prisma.job.deleteMany({ where: { id: { in: dropJobIds } } }),
    ]);
    console.log(`[free-run/execute] dedupeBrandJobs dropped ${dropJobIds.length} duplicate Job(s) for brand=${brandId}`);
  } catch (err) {
    // Dedup is best-effort — a failure here leaves extra rows but
    // doesn't break the user-facing report. Log and move on.
    console.error(`[free-run/execute] dedupeBrandJobs failed for brand=${brandId}:`, err);
  }
}

/** Resolve a Gemini grounding-redirect URL to its real destination so the
 *  source shows up as the actual cited domain instead of a vertexai proxy. */
async function resolveRedirect(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(3000) });
    return res.url || url;
  } catch {
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

/** Resolve all redirect URLs with a global 5s cap — unresolved entries fall
 *  back to their original (vertexai proxy) URLs, which persistSourcesForRun
 *  then filters out. Caps latency per Gemini call. */
async function resolveRedirectsBatch(
  entries: { uri: string; title: string }[],
): Promise<{ url: string; title: string }[]> {
  return Promise.race([
    Promise.all(
      entries.map(async (entry) => ({ url: await resolveRedirect(entry.uri), title: entry.title })),
    ),
    new Promise<{ url: string; title: string }[]>((resolve) =>
      setTimeout(() => resolve(entries.map((e) => ({ url: e.uri, title: e.title }))), 5000),
    ),
  ]);
}

/**
 * ChatGPT call — mirrors the primary job pipeline citation extraction so
 * the free-tier Sources tab has actual data. web_search tool produces
 * url_citation annotations; we surface them both as structured citations
 * and as a human-readable "Sources:" block appended to the text (so
 * downstream text URL extraction picks them up too).
 */
async function callChatGPT(promptText: string): Promise<ModelResult> {
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const input = `Today is ${today}. Answer concisely and factually in 5 bullet points using the most recent information available.\n\nQuestion: ${promptText}`;

  const response = await getOpenAI().responses.create({
    model: "gpt-4o-mini",
    tools: [{ type: "web_search" as const }],
    input,
    max_output_tokens: 1024,
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
  return { text, citations };
}

/**
 * Gemini call — grounding chunks come back as vertexai proxy redirects.
 * Resolve them to real domains (capped at 5s total) so the Sources tab
 * shows the actual cited sites, and append a "Sources:" block to the
 * response text so extractUrls can pick them up.
 */
async function callGemini(promptText: string): Promise<ModelResult> {
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const input = `Today is ${today}. Answer concisely and factually in 5 bullet points using the most recent information available. Include source URLs where possible.\n\nQuestion: ${promptText}`;

  const model = getGemini().getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    tools: [{ googleSearch: {} } as never],
  });
  const result = await model.generateContent(input);
  const text = result.response.text();

  const citations: ApiCitation[] = [];
  const groundingMeta = (result.response as unknown as Record<string, unknown>)
    .candidates as Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { uri: string; title?: string } }> } }> | undefined;

  let groundingBlock = "";
  if (groundingMeta?.[0]?.groundingMetadata?.groundingChunks) {
    const chunks = groundingMeta[0].groundingMetadata.groundingChunks
      .filter((c) => c.web?.uri)
      .map((c) => ({ uri: c.web!.uri, title: c.web?.title ?? "" }));
    if (chunks.length > 0) {
      const resolved = await resolveRedirectsBatch(chunks);
      const realSources = resolved.filter(
        (u) => !u.url.includes("vertexaisearch.cloud.google.com"),
      );
      if (realSources.length > 0) {
        groundingBlock = "\n\nSources:\n" + realSources.map((u) => `- ${u.url}`).join("\n");
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

  return { text: text + groundingBlock, citations };
}

/**
 * Historical-point ChatGPT call — no web_search tool. Feeds the model a
 * fixed "As of <month/year>" date and asks it to answer from training
 * knowledge, which is ~3× faster than a search-tool round-trip. The
 * trend chart needs directional mention-rate data, not fresh citations,
 * so we skip source extraction entirely for these runs.
 */
async function callChatGPTForDate(promptText: string, asOf: Date): Promise<ModelResult> {
  const dateLabel = asOf.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const input = `As of ${dateLabel}, answer concisely and factually in 5 bullet points based on what you know. Do not search the web.\n\nQuestion: ${promptText}`;

  const response = await getOpenAI().responses.create({
    model: "gpt-4o-mini",
    input,
    max_output_tokens: 1024,
  });

  let text = "";
  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part.type === "output_text") text += part.text;
        }
      }
    }
  }
  if (!text && response.output_text) text = response.output_text;
  return { text, citations: [] };
}

async function callGeminiForDate(promptText: string, asOf: Date): Promise<ModelResult> {
  const dateLabel = asOf.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const input = `As of ${dateLabel}, answer concisely and factually in 5 bullet points based on what you know. Do not search the web.\n\nQuestion: ${promptText}`;

  const model = getGemini().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
  const result = await model.generateContent(input);
  return { text: result.response.text(), citations: [] };
}

async function runOnModel(model: string, promptText: string): Promise<ModelResult> {
  if (model === "chatgpt") return callChatGPT(promptText);
  if (model === "gemini") return callGemini(promptText);
  throw new Error(`Unsupported free-tier model: ${model}`);
}

async function runOnModelForDate(model: string, promptText: string, asOf: Date): Promise<ModelResult> {
  if (model === "chatgpt") return callChatGPTForDate(promptText, asOf);
  if (model === "gemini") return callGeminiForDate(promptText, asOf);
  throw new Error(`Unsupported free-tier model: ${model}`);
}

/**
 * POST /api/free-run/execute
 *
 * Body: { brandName }
 *
 * End-to-end free-tier run — classify + generate prompts + execute + persist,
 * all in one request. Returns `{ brandSlug }` so the caller can redirect to
 * `/entity/<slug>/overview`.
 *
 * Parallelization notes (every Promise.all here is intentional):
 *   - Phase 1: category + industry classification fire alongside
 *     findOrCreateBrand, since the slug is derivable from brandName alone.
 *   - Phase 2: prompt generation runs alongside the Brand.update that
 *     stamps displayName/industry onto the new row.
 *   - Phase 3: one Job per model in parallel; each runs its 5 prompts in
 *     parallel; per-prompt the LLM call is followed by parallel
 *     analysis + narrative extraction; then SourceOccurrence persist runs
 *     after the run is saved.
 */
export async function POST(req: NextRequest) {
  if (!FREE_TIER_CONFIG.enabled) {
    return NextResponse.json({ error: "Free tier is disabled." }, { status: 503 });
  }

  // IP + session daily limits. IP blocks raw abuse; the session cookie
  // catches users sharing a NAT'd IP from the same browser. Both are
  // enforced so clearing cookies alone doesn't defeat the limit.
  const ip = getClientIp(req);
  const ipLimit = await checkRateLimit(`free-run:${ip}`, "freeRunIp");
  if (ipLimit) return ipLimit;

  const existingSession = req.cookies.get(FREE_TIER_CONFIG.sessionCookie)?.value;
  const sessionId = existingSession || crypto.randomUUID();
  const sessionLimit = await checkRateLimit(`free-run:${sessionId}`, "freeRunSession");
  if (sessionLimit) {
    // Stamp the cookie even on 429 so a cookie-clearing retry still counts
    // against the same session key rather than minting a fresh one.
    if (!existingSession) setSessionCookie(sessionLimit, sessionId);
    return sessionLimit;
  }

  let body: { brandName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const brandName = body.brandName?.trim();
  if (!brandName) {
    return NextResponse.json({ error: "brandName is required" }, { status: 400 });
  }
  if (brandName.length > 100) {
    return NextResponse.json({ error: "brandName is too long" }, { status: 400 });
  }
  if (!/\p{L}|\p{N}/u.test(brandName)) {
    return NextResponse.json({ error: "Enter a brand or organization name." }, { status: 400 });
  }
  const baseSlug = slugify(brandName);
  if (!baseSlug) {
    return NextResponse.json({ error: "Couldn't derive a URL slug from the brand name." }, { status: 400 });
  }

  // Deterministic cache slug — every search for "Nike" maps to
  // `nike--cached`, so a fresh Job in the TTL window can short-circuit
  // the whole pipeline. Pro slugifier can never produce `--` from user
  // input, so there's no collision risk with paid brands.
  const slug = `${baseSlug}--cached`;

  // Cache lookup: if this brand already has a Job that finished within
  // the configured TTL, skip the pipeline entirely and redirect the
  // caller to the existing overview. Saves ~$0.08 and ~30-45s per hit.
  if (FREE_TIER_CONFIG.cacheTtlHours > 0) {
    const freshAfter = new Date(Date.now() - FREE_TIER_CONFIG.cacheTtlHours * 60 * 60 * 1000);
    const cachedBrand = await prisma.brand.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        jobs: {
          where: { status: "done", finishedAt: { gte: freshAfter } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (cachedBrand && cachedBrand.jobs.length > 0) {
      const res = NextResponse.json({ hasData: true, brandSlug: cachedBrand.slug, cached: true });
      if (!existingSession) setSessionCookie(res, sessionId);
      return res;
    }
  }

  try {
    // Phase 1: classify brand + prepare the brand row IN PARALLEL.
    // Category, industry, and aliases are all independent GPT-4o-mini
    // calls. `findOrCreateBrand` runs alongside those classifications
    // and handles P2002 race conditions if two concurrent requests for
    // the same brand name reach this point at once. Aliases matter
    // here — without them, a response that says just "Harris" or
    // "Kamala" never matches "Kamala Harris" in the mention-detection
    // step and the whole report reads 0%.
    const [category, industry, aliases, brand] = await Promise.all([
      classifyBrandCategory(brandName),
      classifyBrandIndustry(brandName),
      generateBrandAliases(brandName),
      findOrCreateBrand(slug),
    ]);

    // Phase 2: generate the 5 prompts (depends on category + industry) while
    // we stamp displayName/industry/aliases onto the newly-created brand row.
    const [generatedPrompts] = await Promise.all([
      generateIndustryPrompts(brandName, industry, category),
      prisma.brand.update({
        where: { id: brand.id },
        data: { displayName: brandName, industry, aliases },
      }),
    ]);

    const promptTexts = generatedPrompts
      .slice(0, FREE_TIER_CONFIG.promptCount)
      .map((p) => p.text.trim())
      .filter((t) => t.length > 0);

    if (promptTexts.length === 0) {
      const errorRes = NextResponse.json(
        {
          error:
            "Couldn't generate questions for this brand. Try a more specific name or check spelling.",
        },
        { status: 502 },
      );
      if (!existingSession) setSessionCookie(errorRes, sessionId);
      return errorRes;
    }

    // Save the prompts (one row per question) so they're tied to this brand.
    const createdPrompts = await Promise.all(
      promptTexts.map((text) =>
        prisma.prompt.create({
          data: {
            text,
            cluster: "industry",
            intent: "informational",
            brandId: brand.id,
            source: "generated",
            enabled: true,
          },
        }),
      ),
    );

    // 3. Build the list of time points the run will cover. Today's point
    //    uses the full set of prompts with live web search; each historical
    //    point uses a smaller subset (no web_search tool) so the trend
    //    chart renders without tripling the LLM bill or wall-clock time.
    const historicalPrompts = createdPrompts.slice(0, FREE_TIER_CONFIG.historicalPromptCount);
    interface TimePoint {
      monthsAgo: number;
      finishedAt: Date;
      prompts: typeof createdPrompts;
      useSearch: boolean;
    }
    const now = new Date();
    const timePoints: TimePoint[] = [
      { monthsAgo: 0, finishedAt: now, prompts: createdPrompts, useSearch: true },
    ];
    for (let m = 1; m <= FREE_TIER_CONFIG.historicalMonths; m++) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - m);
      timePoints.push({
        monthsAgo: m,
        finishedAt: d,
        prompts: historicalPrompts,
        useSearch: false,
      });
    }

    // 4. Fan out: for each (time point, model) pair create a Job and run its
    //    prompts in parallel. Every time-point × model × prompt combo fires
    //    concurrently — historical runs are fast (no web_search) so the
    //    wall-clock cost is dominated by today's live calls.
    //
    //    Per-prompt failures are swallowed so one bad prompt doesn't kill
    //    the rest, but we count landings. A job that produced zero runs is
    //    marked "error" (not "done") so the overview tab doesn't silently
    //    show empty data for it.
    const perJobCounts = await Promise.all(
      timePoints.flatMap((tp) =>
        FREE_TIER_CONFIG.models.map(async (model) => {
          const job = await prisma.job.create({
            data: {
              brandId: brand.id,
              model,
              range: 90,
              status: "running",
              // Backdate so the trend chart buckets this Job at the right
              // date. Both startedAt and finishedAt point at the time
              // point so downstream date filters behave consistently.
              startedAt: tp.finishedAt,
            },
          });

          const results = await Promise.allSettled(
            tp.prompts.map(async (prompt) => {
              const { text: rawResponseText, citations } = tp.useSearch
                ? await runOnModel(model, prompt.text)
                : await runOnModelForDate(model, prompt.text, tp.finishedAt);

              // Run analysis + narrative extraction in parallel — both read
              // the full response and are independent. Narrative supplies
              // sentiment/themes that the overview tab reads from
              // narrativeJson.sentiment.label.
              const [analysisJson, narrativeJson] = await Promise.all([
                extractAnalysis(rawResponseText, brandName, prompt.text),
                extractNarrativeForRun(rawResponseText, brandName, brand.slug),
              ]);

              const run = await prisma.run.create({
                data: {
                  jobId: job.id,
                  brandId: brand.id,
                  promptId: prompt.id,
                  model,
                  requestHash: sha256(`free|${brand.id}|${job.id}|${prompt.id}|${model}|${tp.monthsAgo}`),
                  promptTextHash: sha256(`${model}|${prompt.text}`),
                  rawResponseText,
                  analysisJson: JSON.parse(JSON.stringify(analysisJson)),
                  narrativeJson: JSON.parse(JSON.stringify(narrativeJson)),
                },
              });

              // Write EntityResponseMetric rows for the brand + every
              // competitor mentioned in the response. Without this, the
              // Competition API has nothing to aggregate and the
              // Competitive Landscape only ever lists the brand itself.
              // Awaited (not fire-and-forget) so the rows exist before
              // the response returns — Vercel serverless doesn't keep
              // running after the response sends.
              await persistProminenceForRun({
                runId: run.id,
                model,
                promptId: prompt.id,
                brandName,
                brandSlug: brand.slug,
                responseText: rawResponseText,
                analysisJson,
              }).catch((err) => {
                console.error(`[free-run/execute] persistProminence failed for run=${run.id}:`, err);
              });

              // Only today's runs get source persistence. Historical runs
              // don't use web_search, so citations are empty and any inline
              // URLs would just be training-data guesses — not worth
              // populating SourceOccurrence with.
              if (tp.useSearch) {
                await persistSourcesForRun({
                  runId: run.id,
                  model,
                  promptId: prompt.id,
                  brandName,
                  brandSlug: brand.slug,
                  responseText: rawResponseText,
                  analysisJson,
                  apiCitations: citations,
                }).catch((err) => {
                  console.error(`[free-run/execute] persistSources failed for run=${run.id}:`, err);
                });
              }
            }),
          );

          const succeeded = results.filter((r) => r.status === "fulfilled").length;
          const firstError = results.find((r) => r.status === "rejected") as
            | PromiseRejectedResult
            | undefined;
          if (firstError) {
            console.error(
              `[free-run/execute] ${model} (m-${tp.monthsAgo}): ${results.length - succeeded}/${results.length} prompts failed. First error:`,
              firstError.reason,
            );
          }

          await prisma.job.update({
            where: { id: job.id },
            data: {
              status: succeeded === 0 ? "error" : "done",
              error: succeeded === 0 ? String(firstError?.reason ?? "all prompts failed").slice(0, 500) : null,
              finishedAt: tp.finishedAt,
            },
          });

          return { jobId: job.id, model, monthsAgo: tp.monthsAgo, finishedAt: tp.finishedAt, succeeded, total: results.length };
        }),
      ),
    );

    // Concurrent-run dedup: if another request hit this same cached
    // brand at the same time, both pipelines wrote Jobs to the same
    // (model, day-bucket) slot. Keep only the most-recent Job per
    // bucket and delete the losers plus their Runs/metrics/sources.
    // Skipped when any Job for this brand is still in-flight
    // (finishedAt=null), since deleting a half-written Job would
    // break the concurrent writer. The still-running writer runs
    // this same dedup at its own completion.
    await dedupeBrandJobs(brand.id);

    // If every model failed every prompt at every time point, surface a 502
    // instead of redirecting to an empty overview page. Today's point is
    // what matters most — if historical failures happen but today landed,
    // we still ship the report.
    const totalSucceeded = perJobCounts.reduce((s, j) => s + j.succeeded, 0);
    if (totalSucceeded === 0) {
      const errorRes = NextResponse.json(
        {
          error:
            "Analysis ran but no model returned a usable response. Please try again in a moment.",
        },
        { status: 502 },
      );
      if (!existingSession) setSessionCookie(errorRes, sessionId);
      return errorRes;
    }

    const res = NextResponse.json({
      hasData: true,
      brandSlug: brand.slug,
    });
    if (!existingSession) setSessionCookie(res, sessionId);
    return res;
  } catch (err) {
    console.error("[api/free-run/execute] Error:", err);
    const errorRes = NextResponse.json(
      { error: "Something went wrong running your analysis. Please try again." },
      { status: 500 },
    );
    if (!existingSession) setSessionCookie(errorRes, sessionId);
    return errorRes;
  }
}
