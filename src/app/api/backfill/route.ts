import { NextRequest, NextResponse } from "next/server";
import { start } from "workflow/api";
import { prisma } from "@/lib/prisma";
import { VALID_MODELS } from "@/lib/constants";
import { getEnabledPrompts } from "@/lib/promptService";
import { findOrCreateBrand, isValidBrandSlug } from "@/lib/brand";
import { requireAuth } from "@/lib/auth";
import { requireBrandAccess } from "@/lib/brandAccess";
import { checkRateLimit } from "@/lib/rateLimit";
import { backfillWorkflow, type BackfillMonth, type BackfillPrompt } from "@/workflows/backfill";

const MONTHS_BACK = 3;
const TOTAL_POINTS = MONTHS_BACK + 1;

function monthDate(monthsAgo: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * POST /api/backfill
 * Body: { brandSlug, model, range? }
 *
 * Kicks off a durable backfill run via Workflow and returns a runId.
 * The client (RunPromptsPanel) polls GET /api/backfill/status?runId=…
 * for progress instead of re-POSTing — the old self-polling POST kept
 * hitting the 300 s serverless ceiling on large brands because it did
 * all 4 months × N prompts in a single invocation. The workflow
 * orchestrator handles months/prompts as separate retryable steps, so
 * nothing in here has to fit inside one function timeout.
 *
 * Setup work (cleanup, prompt expansion, which months are pending) is
 * still computed synchronously here because it's a one-shot read of
 * current DB state — cheap enough not to durably persist. Only the
 * expensive "call providers + write rows" loop moves into the
 * workflow.
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

  const { brandSlug, model, range } = body as {
    brandSlug?: string;
    model?: string;
    range?: number;
  };

  if (!brandSlug || !model || !VALID_MODELS.includes(model)) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }
  if (!isValidBrandSlug(brandSlug)) {
    return NextResponse.json({ error: "Invalid brand slug format" }, { status: 400 });
  }
  const accessError = await requireBrandAccess(brandSlug);
  if (accessError) return accessError;

  const jobRange = range ?? 90;

  const brand = await findOrCreateBrand(brandSlug);
  const brandName =
    (brand as unknown as { displayName?: string | null }).displayName || brand.name;

  const rawPrompts = await getEnabledPrompts(brand.id);

  // Expand comparative prompts with {competitor} into per-competitor entries
  const prompts: BackfillPrompt[] = [];
  const comparativeWithCompetitor = rawPrompts.filter(
    (p: { cluster: string; text: string }) =>
      p.cluster === "comparative" && p.text.includes("{competitor}"),
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
    const needsCompetitor =
      prompt.cluster === "comparative" && prompt.text.includes("{competitor}");
    if (needsCompetitor && competitors.length > 0) {
      for (const comp of competitors) {
        prompts.push({ id: prompt.id, text: prompt.text, competitor: comp });
      }
    } else if (needsCompetitor) {
      // No competitor to substitute — skip the prompt rather than
      // sending it with a literal "{competitor}" placeholder, which
      // produces unintelligible AI responses that then poison the
      // analysis extraction. The prompt silently drops for this run
      // and re-eligibilizes once any entity-response metric lands
      // that seeds the competitor list on the next run.
      continue;
    } else {
      prompts.push({ id: prompt.id, text: prompt.text });
    }
  }

  // Figure out which months need processing vs. already have a done Job
  const allWeeks: BackfillMonth[] = [];
  for (let m = MONTHS_BACK; m >= 0; m--) {
    const jobDate = monthDate(m);
    allWeeks.push({
      w: m,
      jobDateISO: jobDate.toISOString(),
      dateStr: jobDate.toISOString().slice(0, 10),
    });
  }

  const oldestDate = new Date(allWeeks[0].jobDateISO);
  oldestDate.setHours(0, 0, 0, 0);
  const newestDate = new Date(allWeeks[allWeeks.length - 1].jobDateISO);
  newestDate.setHours(23, 59, 59, 999);

  // Running Jobs older than this threshold are treated as abandoned
  // (workflow died / deployment rotated / browser closed mid-rerun);
  // younger ones are assumed to belong to an in-flight workflow and
  // are left alone. Without this guard, a client re-POST while a
  // workflow was mid-run deleted the live workflow's Job rows and
  // its subsequent Run upserts failed with FK errors.
  const RUNNING_STALE_MS = 30 * 60 * 1000; // 30 minutes
  const runningStaleCutoff = new Date(Date.now() - RUNNING_STALE_MS);

  const [doneJobs, staleJobs] = await Promise.all([
    prisma.job.findMany({
      where: {
        brandId: brand.id,
        model,
        range: jobRange,
        status: "done",
        finishedAt: { gte: oldestDate, lte: newestDate },
      },
      select: { finishedAt: true },
    }),
    prisma.job.findMany({
      where: {
        brandId: brand.id,
        model,
        range: jobRange,
        createdAt: { gte: oldestDate, lte: newestDate },
        OR: [
          { status: { in: ["error", "queued"] } },
          { status: "running", createdAt: { lt: runningStaleCutoff } },
        ],
      },
      select: { id: true },
    }),
  ]);

  // Dedup done months by YYYY-MM — a backfill on Apr 15 and a
  // revisit on Apr 20 produce different finishedAt day strings even
  // though they represent the same monthly data point. Previously we
  // keyed by YYYY-MM-DD and re-ran the whole month on every revisit
  // (duplicating Jobs + Runs). The status endpoint already dedups
  // this way; keeping the two in sync is the real fix.
  const doneMonths = new Set(
    doneJobs
      .map((j: { finishedAt: Date | null }) =>
        j.finishedAt?.toISOString().slice(0, 7),
      )
      .filter(Boolean),
  );

  // Stale-job cleanup: blow away runs + metrics + sources from prior
  // failed attempts so the workflow's upserts don't race with orphan
  // rows from a previous timed-out run.
  if (staleJobs.length > 0) {
    const staleIds = staleJobs.map((j: { id: string }) => j.id);
    const staleRunIds = (
      await prisma.run.findMany({
        where: { jobId: { in: staleIds } },
        select: { id: true },
      })
    ).map((r: { id: string }) => r.id);
    if (staleRunIds.length > 0) {
      await Promise.all([
        prisma.entityResponseMetric.deleteMany({ where: { runId: { in: staleRunIds } } }),
        prisma.sourceOccurrence.deleteMany({ where: { runId: { in: staleRunIds } } }),
      ]);
    }
    await prisma.run.deleteMany({ where: { jobId: { in: staleIds } } });
    await prisma.job.deleteMany({ where: { id: { in: staleIds } } });
  }

  const pending = allWeeks.filter((t) => !doneMonths.has(t.dateStr.slice(0, 7)));

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

  const run = await start(backfillWorkflow, [
    {
      brandId: brand.id,
      brandSlug: brand.slug,
      brandName,
      brandAliases: brand.aliases ?? [],
      brandIndustry: brand.industry,
      brandCategory: brand.category,
      model,
      jobRange,
      prompts,
      months: pending,
    },
  ]);

  return NextResponse.json({
    status: "running",
    runId: run.runId,
    completedWeeks: TOTAL_POINTS - pending.length,
    totalWeeks: TOTAL_POINTS,
    currentWeekDate: pending.map((t) => t.dateStr).join(", "),
  });
}
