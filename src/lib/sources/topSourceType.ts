/**
 * Shared helper for computing the top cited source category from scoped run IDs.
 * Used by both overview and visibility routes so they agree with the Sources API.
 */

import { prisma } from "@/lib/prisma";
import { classifyDomains } from "./classifyDomain";

export interface TopSourceTypeResult {
  category: string;
  count: number;
  totalSources: number;
}

/**
 * Compute the most-cited source category for a set of run IDs.
 *
 * Steps:
 * 1. Fetch source occurrences for the given run IDs
 * 2. Group by domain, take top 25
 * 3. Classify domains (DB cache → static map → GPT)
 * 4. Aggregate by category, return the top non-"other" category
 *
 * This matches the Sources API methodology.
 * Input must be scoped run IDs (not raw brandId) to avoid ambiguous-brand contamination.
 */
export async function computeTopSourceType(
  scopedRunIds: string[],
): Promise<TopSourceTypeResult | null> {
  if (scopedRunIds.length === 0) return null;

  const occurrences = await prisma.sourceOccurrence.findMany({
    where: { runId: { in: scopedRunIds } },
    select: { source: { select: { domain: true, category: true } } },
  });

  if (occurrences.length === 0) return null;

  // Fast path: use cached categories from Source records when available
  const domainCounts = new Map<string, number>();
  const domainCategories = new Map<string, string>();
  for (const o of occurrences) {
    const d = o.source.domain;
    domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
    if (o.source.category && !domainCategories.has(d)) {
      domainCategories.set(d, o.source.category);
    }
  }

  // All domains sorted by count (classify all, not just top 25)
  const allDomains = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1]);

  // Classify any domains without cached categories
  const uncategorized = allDomains.filter(([d]) => !domainCategories.has(d)).map(([d]) => d);
  if (uncategorized.length > 0) {
    const classified = await classifyDomains(uncategorized);
    for (const [d, cat] of Object.entries(classified)) {
      domainCategories.set(d, cat);
    }
  }

  // Aggregate by category across ALL domains
  const catCounts: Record<string, number> = {};
  let total = 0;
  for (const [domain, count] of allDomains) {
    const cat = domainCategories.get(domain) ?? "other";
    catCounts[cat] = (catCounts[cat] ?? 0) + count;
    total += count;
  }

  const sorted = Object.entries(catCounts).sort((a, b) => b[1] - a[1]);
  const top = sorted.find(([cat]) => cat !== "other") ?? sorted[0];
  if (!top) return null;

  return { category: top[0], count: top[1], totalSources: total };
}
