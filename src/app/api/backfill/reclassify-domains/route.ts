import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { classifyDomains, CATEGORY_LABELS } from "@/lib/sources/classifyDomain";

/**
 * POST /api/backfill/reclassify-domains
 *
 * Re-classifies all source domains by clearing cached categories and
 * running them through the static map + GPT classification pipeline.
 *
 * This fixes stale or incorrect GPT classifications (e.g. advocacy
 * sites misclassified as social_media).
 *
 * Optional query params:
 *   ?dryRun=true  — show what would change without writing to DB
 *   ?category=social_media  — only reclassify domains currently in this category
 */
export async function POST(req: NextRequest) {
  const { error: authError } = await requireAuth();
  if (authError) return authError;

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";
  const filterCategory = req.nextUrl.searchParams.get("category") ?? "";

  // Fetch all sources with a cached category
  const sources = await prisma.source.findMany({
    where: filterCategory
      ? { category: { not: null, equals: filterCategory } }
      : { category: { not: null } },
    select: { id: true, domain: true, category: true },
  });

  if (sources.length === 0) {
    return NextResponse.json({ message: "No sources to reclassify", count: 0 });
  }

  // Clear cached categories so classifyDomains re-evaluates from static map + GPT
  if (!dryRun) {
    await prisma.source.updateMany({
      where: { id: { in: sources.map((s) => s.id) } },
      data: { category: null },
    });
  }

  // Re-classify all domains
  const domains = sources.map((s) => s.domain);
  const newClassifications = await classifyDomains(domains);

  // Build change report
  const changes: { domain: string; oldCategory: string; newCategory: string }[] = [];
  let unchanged = 0;
  for (const s of sources) {
    const newCat = newClassifications[s.domain] ?? "other";
    if (newCat !== s.category) {
      changes.push({ domain: s.domain, oldCategory: s.category!, newCategory: newCat });
    } else {
      unchanged++;
    }
  }

  return NextResponse.json({
    dryRun,
    total: sources.length,
    changed: changes.length,
    unchanged,
    changes: changes.map((c) => ({
      domain: c.domain,
      from: `${c.oldCategory} (${CATEGORY_LABELS[c.oldCategory] ?? c.oldCategory})`,
      to: `${c.newCategory} (${CATEGORY_LABELS[c.newCategory] ?? c.newCategory})`,
    })),
  });
}
