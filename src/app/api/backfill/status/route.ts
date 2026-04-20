import { NextRequest, NextResponse } from "next/server";
import { getRun } from "workflow/api";
import { prisma } from "@/lib/prisma";
import { VALID_MODELS } from "@/lib/constants";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

const MONTHS_BACK = 3;
const TOTAL_POINTS = MONTHS_BACK + 1;

function monthDate(monthsAgo: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * GET /api/backfill/status?runId=...&brandSlug=...&model=...&range=...
 *
 * Poll endpoint for the backfill workflow started by POST /api/backfill.
 * Returns the same shape the old self-polling POST used to emit so the
 * client polling loop keeps the same structure — just pointed at a
 * cheap read instead of re-kicking expensive work.
 *
 * Status precedence:
 *   1. Workflow "failed"    → return "error" with the error message
 *   2. Workflow "completed" → return "done"
 *   3. Workflow "running"   → return "running" with live Job counts
 *   4. Run not found        → fall back to DB-only counts (runId may
 *                              be stale; client should re-POST)
 */
export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth();
  if (authError) return authError;
  const rlError = await checkRateLimit(userId, "read");
  if (rlError) return rlError;

  const runId = req.nextUrl.searchParams.get("runId");
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  const model = req.nextUrl.searchParams.get("model");
  const rangeParam = req.nextUrl.searchParams.get("range");

  if (!runId || !brandSlug || !model || !VALID_MODELS.includes(model)) {
    return NextResponse.json({ error: "Invalid params" }, { status: 400 });
  }

  const jobRange = rangeParam ? Number(rangeParam) : 90;

  const brand = await prisma.brand.findUnique({
    where: { slug: brandSlug },
    select: { id: true },
  });
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const run = getRun(runId);
  const exists = await run.exists;

  // Compute progress from Job rows — this is what drives the UI. The
  // workflow status is authoritative only for "done" / "error"
  // transitions; the per-month counter is always derived from DB.
  const oldest = monthDate(MONTHS_BACK);
  oldest.setHours(0, 0, 0, 0);
  const newest = monthDate(0);
  newest.setHours(23, 59, 59, 999);

  const [doneCount, latestJob] = await Promise.all([
    prisma.job.count({
      where: {
        brandId: brand.id,
        model,
        range: jobRange,
        status: "done",
        finishedAt: { gte: oldest, lte: newest },
      },
    }),
    prisma.job.findFirst({
      where: { brandId: brand.id, model, range: jobRange, status: "done" },
      orderBy: { finishedAt: "desc" },
      select: { id: true },
    }),
  ]);

  if (!exists) {
    // RunId may be from a previous deployment or was garbage-collected.
    // Fall through to DB counts; if already done, report done; else
    // signal the client that the workflow is gone.
    return NextResponse.json({
      status: doneCount >= TOTAL_POINTS ? "done" : "error",
      error: doneCount >= TOTAL_POINTS ? undefined : "Workflow run not found",
      completedWeeks: doneCount,
      totalWeeks: TOTAL_POINTS,
      latestJobId: latestJob?.id ?? null,
    });
  }

  const wfStatus = await run.status;

  if (wfStatus === "failed") {
    const errJob = await prisma.job.findFirst({
      where: {
        brandId: brand.id,
        model,
        range: jobRange,
        status: "error",
        createdAt: { gte: oldest, lte: newest },
      },
      select: { error: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      status: "error",
      error: errJob?.error ?? "Backfill workflow failed",
      completedWeeks: doneCount,
      totalWeeks: TOTAL_POINTS,
      latestJobId: latestJob?.id ?? null,
    });
  }

  if (wfStatus === "completed") {
    return NextResponse.json({
      status: "done",
      completedWeeks: Math.max(doneCount, TOTAL_POINTS),
      totalWeeks: TOTAL_POINTS,
      latestJobId: latestJob?.id ?? null,
    });
  }

  return NextResponse.json({
    status: "running",
    completedWeeks: doneCount,
    totalWeeks: TOTAL_POINTS,
    latestJobId: latestJob?.id ?? null,
  });
}
