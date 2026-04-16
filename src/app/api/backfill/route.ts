import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VALID_MODELS } from "@/lib/constants";
import { getOpenAI } from "@/lib/openai";
import { getGemini } from "@/lib/gemini";
import { getClaude } from "@/lib/claude";
import { getPerplexity } from "@/lib/perplexity";
import { callGoogleAio } from "@/lib/serpapi";
import { extractAnalysis } from "@/lib/extractAnalysis";
import { sha256 } from "@/lib/hash";
import { getEnabledPrompts } from "@/lib/promptService";
import { persistProminenceForRun } from "@/lib/prominence/persistProminence";

import { persistSourcesForRun } from "@/lib/sources/persistSources";
import { findOrCreateBrand } from "@/lib/brand";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

const OPENAI_MODEL = "gpt-4o-mini";
const GEMINI_MODEL = "gemini-2.5-flash-lite";
const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const PERPLEXITY_MODEL = "sonar";
const MONTHS_BACK = 3; // 3 months back + current = 4 data points
const TOTAL_POINTS = MONTHS_BACK + 1;
const CONCURRENT_POINTS = 4; // Process all 4 months in parallel

function monthDate(monthsAgo: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function callOpenAI(promptText: string): Promise<string> {
  const input = `Answer concisely and factually in 5 bullet points.\n\nQuestion: ${promptText}`;
  const response = await getOpenAI().responses.create({
    model: OPENAI_MODEL,
    input,
    max_output_tokens: 512,
  });
  return response.output_text ?? JSON.stringify(response);
}

async function callGemini(promptText: string): Promise<string> {
  const input = `Answer concisely and factually in 5 bullet points.\n\nQuestion: ${promptText}`;
  const model = getGemini().getGenerativeModel({ model: GEMINI_MODEL });
  const result = await Promise.race([
    model.generateContent(input),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Gemini timeout")), 25_000),
    ),
  ]);
  return result.response.text() || JSON.stringify(result.response);
}

async function callClaude(promptText: string): Promise<string> {
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
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => ("text" in block ? block.text : ""))
    .join("\n");
  return text || JSON.stringify(response);
}

async function callPerplexity(promptText: string): Promise<string> {
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
  return response.choices?.[0]?.message?.content ?? JSON.stringify(response);
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

        if (cached) {
          responseText = cached.rawResponseText;
          analysis = cached.analysisJson;
        } else {
          if (model === "chatgpt") {
            responseText = await callOpenAI(promptText);
          } else if (model === "gemini") {
            responseText = await callGemini(promptText);
          } else if (model === "claude") {
            responseText = await callClaude(promptText);
          } else if (model === "perplexity") {
            responseText = await callPerplexity(promptText);
          } else if (model === "google") {
            const result = await callGoogleAio(promptText);
            responseText = result.text;
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

        return { prompt, promptTextHash, responseText, analysis };
      }),
    );

    let hasError = false;
    for (const result of settled) {
      if (result.status === "rejected") {
        hasError = true;
        continue;
      }
      const { prompt, promptTextHash, responseText, analysis } = result.value;
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

        // Skip narrative extraction during backfill to reduce API load —
        // narrative data is extracted during the main Phase 1 analysis for the current week.

        // SourceOccurrence has no DB-level uniqueness guard today, so avoid
        // re-persisting sources for runs that already have saved citations.
        const existingSourceCount = await prisma.sourceOccurrence.count({
          where: { runId: run.id },
        });
        if (existingSourceCount === 0) {
          // Persist source occurrences (non-blocking)
          persistSourcesForRun({
            runId: run.id,
            model,
            promptId: prompt.id,
            brandName,
            brandSlug: brand.slug,
            responseText,
            analysisJson: analysis,
          }).catch(() => {});
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
