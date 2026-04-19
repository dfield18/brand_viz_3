import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/hash";

/**
 * POST /api/free-run/invalidate
 *
 * Admin-only: nuke a free-tier cached brand's Jobs + Runs + their
 * EntityResponseMetrics + SourceOccurrences + Prompts so the next
 * `/api/free-run/execute` call for that brand name skips the cache and
 * rebuilds from scratch. The Brand row itself is kept (its industry /
 * aliases / displayName will just be updated on the next run).
 *
 * Auth: `Authorization: Bearer $ADMIN_SECRET` header, where
 * ADMIN_SECRET is set in the deploy env. If ADMIN_SECRET is unset the
 * route returns 503 so you can't accidentally run an unprotected
 * invalidation endpoint in production.
 *
 * Body: { "brandName": "Kamala Harris" }
 *
 * Scope guard: only slugs matching the free-tier ephemeral pattern
 * (ends in `--cached` legacy or `--<8 hex>` new) are eligible — the
 * route refuses to touch Pro brands even with a valid secret.
 */

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const EPHEMERAL_PATTERN = /--(cached|[0-9a-f]{8})$/;

export async function POST(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET not configured; invalidation endpoint disabled." },
      { status: 503 },
    );
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { brandName?: string; slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const brandName = body.brandName?.trim();
  const explicitSlug = body.slug?.trim();
  if (!brandName && !explicitSlug) {
    return NextResponse.json(
      { error: "brandName or slug is required" },
      { status: 400 },
    );
  }

  // Derive the cached slug. For brand names, use the same hash scheme
  // the execute route uses so "Kamala Harris" → "kamala-harris--<hash>"
  // matches. An explicit slug override is also accepted for invalidating
  // legacy "--cached" rows.
  let slug: string;
  if (explicitSlug) {
    slug = explicitSlug;
  } else {
    const baseSlug = slugify(brandName!);
    if (!baseSlug) {
      return NextResponse.json(
        { error: "Couldn't derive a URL slug from the brand name." },
        { status: 400 },
      );
    }
    slug = `${baseSlug}--${sha256(baseSlug).slice(0, 8)}`;
  }

  if (!EPHEMERAL_PATTERN.test(slug)) {
    return NextResponse.json(
      { error: "Refusing to invalidate — slug is not a free-tier cached brand.", slug },
      { status: 400 },
    );
  }

  const brand = await prisma.brand.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!brand) {
    return NextResponse.json({ hadBrand: false, slug });
  }

  const runRows = await prisma.run.findMany({
    where: { brandId: brand.id },
    select: { id: true },
  });
  const runIds = runRows.map((r) => r.id);

  // No onDelete cascade on the schema — delete children before parents.
  const result = await prisma.$transaction([
    prisma.entityResponseMetric.deleteMany({ where: { runId: { in: runIds } } }),
    prisma.sourceOccurrence.deleteMany({ where: { runId: { in: runIds } } }),
    prisma.run.deleteMany({ where: { id: { in: runIds } } }),
    prisma.job.deleteMany({ where: { brandId: brand.id } }),
    prisma.prompt.deleteMany({ where: { brandId: brand.id } }),
  ]);

  console.log(
    `[free-run/invalidate] slug=${slug} deleted runs=${runIds.length} transaction=${JSON.stringify(result.map((r) => r.count))}`,
  );

  return NextResponse.json({
    hadBrand: true,
    slug,
    deleted: {
      entityResponseMetrics: result[0].count,
      sourceOccurrences: result[1].count,
      runs: result[2].count,
      jobs: result[3].count,
      prompts: result[4].count,
    },
  });
}
