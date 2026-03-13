/**
 * Shared data-fetching pipeline for API routes.
 *
 * Consolidates the brand → job → runs → deduplicate pattern
 * used across 8+ API routes into a single reusable function.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VALID_MODELS, VALID_RANGES } from "@/lib/constants";
import { computeRangeCutoff } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineBrand {
  id: string;
  name: string;
  displayName: string | null;
  slug: string;
  industry: string | null;
}

export interface PipelineJob {
  id: string;
  model: string;
  range: number;
  finishedAt: Date | null;
}

export interface PipelineSuccess<R> {
  ok: true;
  brand: PipelineBrand;
  job: PipelineJob;
  runs: R[];
  isAll: boolean;
  rangeCutoff: Date;
}

export interface PipelineNoJob<R> {
  ok: true;
  brand: PipelineBrand;
  job: null;
  runs: R[];
  isAll: boolean;
  rangeCutoff: Date;
}

export interface PipelineEarlyReturn {
  ok: false;
  response: NextResponse;
}

export type PipelineResult<R> =
  | PipelineSuccess<R>
  | PipelineNoJob<R>
  | PipelineEarlyReturn;

export interface PipelineOptions {
  brandSlug: string;
  model: string;
  viewRange: number;
  /** Prisma run query — pass either select or include. Must yield model + promptId fields. */
  runQuery: {
    select?: Record<string, unknown>;
    include?: Record<string, unknown>;
  };
  /** Skip the job existence check (e.g., quotes route). */
  skipJobCheck?: boolean;
  /** Reject model="all" (e.g., responses route). */
  disableAllModel?: boolean;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Shared data-fetching pipeline:
 * 1. Validates model param
 * 2. Computes rangeCutoff
 * 3. Looks up brand
 * 4. Finds latest completed job (optional)
 * 5. Fetches runs with caller-specified select/include
 * 6. Deduplicates by model|promptId (all) or promptId (single)
 */
export async function fetchBrandRuns<R extends { model: string; promptId: string }>(
  options: PipelineOptions,
): Promise<PipelineResult<R>> {
  const {
    brandSlug,
    model,
    viewRange,
    runQuery,
    skipJobCheck = false,
    disableAllModel = false,
  } = options;

  const isAll = model === "all";

  // Validate model
  if (disableAllModel) {
    if (!model || !VALID_MODELS.includes(model)) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: `Invalid model. Must be one of: ${VALID_MODELS.join(", ")}` },
          { status: 400 },
        ),
      };
    }
  } else {
    if (!model || (!isAll && !VALID_MODELS.includes(model))) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: `Invalid model. Must be one of: all, ${VALID_MODELS.join(", ")}` },
          { status: 400 },
        ),
      };
    }
  }

  // Validate range
  if (!VALID_RANGES.includes(viewRange)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Invalid range. Must be one of: ${VALID_RANGES.join(", ")}` },
        { status: 400 },
      ),
    };
  }

  const rangeCutoff = computeRangeCutoff(viewRange);

  // Look up brand
  const brand = await prisma.brand.findUnique({
    where: { slug: brandSlug },
    select: { id: true, name: true, displayName: true, slug: true, industry: true },
  });
  if (!brand) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Brand not found" }, { status: 404 }),
    };
  }

  // Find latest completed job (optional)
  let job: PipelineJob | null = null;
  if (!skipJobCheck) {
    const jobWhere = isAll
      ? { brandId: brand.id, status: "done" as const }
      : { brandId: brand.id, model, status: "done" as const };

    const found = await prisma.job.findFirst({
      where: jobWhere,
      orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true, model: true, range: true, finishedAt: true },
    });

    if (!found) {
      return {
        ok: false,
        response: NextResponse.json({ hasData: false, reason: "no_completed_job" }),
      };
    }
    job = found;
  }

  // Fetch runs — only from completed jobs to avoid partial/in-progress data
  const runWhere = isAll
    ? { brandId: brand.id, createdAt: { gte: rangeCutoff }, job: { status: "done" } }
    : { brandId: brand.id, model, createdAt: { gte: rangeCutoff }, job: { status: "done" } };

  const queryArgs: Record<string, unknown> = {
    where: runWhere,
    orderBy: { createdAt: "desc" },
  };
  if (runQuery.select) queryArgs.select = runQuery.select;
  if (runQuery.include) queryArgs.include = runQuery.include;

  const allRuns = (await (prisma.run as unknown as { findMany: (args: unknown) => Promise<R[]> }).findMany(queryArgs)) as R[];

  // Deduplicate: latest run per model+prompt (all) or per prompt (single)
  const seen = new Set<string>();
  const runs = allRuns.filter((r) => {
    const key = isAll ? `${r.model}|${r.promptId}` : r.promptId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (job) {
    return { ok: true, brand, job, runs, isAll, rangeCutoff };
  }
  return { ok: true, brand, job: null, runs, isAll, rangeCutoff } as PipelineNoJob<R>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format job metadata for API responses. */
export function formatJobMeta(job: PipelineJob) {
  return {
    id: job.id,
    model: job.model,
    range: job.range,
    finishedAt: job.finishedAt?.toISOString() ?? null,
  };
}
