/**
 * Fix vertexaisearch.cloud.google.com URLs in SourceOccurrence records.
 *
 * These are Gemini proxy/wrapper URLs that should have been resolved to
 * the actual destination URL via HTTP redirect. This script:
 * 1. Finds all Source records with domain containing "vertexaisearch"
 * 2. Follows the HTTP redirect to get the real URL
 * 3. Updates the SourceOccurrence.normalizedUrl and re-links to the correct Source
 * 4. Cleans up orphaned Source records
 *
 * Usage: npx tsx scripts/fix-gemini-urls.ts [--dry-run]
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DRY_RUN = process.argv.includes("--dry-run");

async function resolveRedirect(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });
    return res.url || url;
  } catch {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      const resolved = res.url || url;
      await res.body?.cancel().catch(() => {});
      return resolved;
    } catch {
      return url;
    }
  }
}

function normalizeUrl(rawUrl: string): { normalized: string; domain: string } | null {
  const cleaned = rawUrl.replace(/[.,;:!?]+$/, "");
  try {
    const url = new URL(cleaned);
    url.hostname = url.hostname.toLowerCase();
    // Strip tracking params
    for (const p of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid", "mc_cid", "mc_eid", "ref", "source"]) {
      url.searchParams.delete(p);
    }
    url.hash = "";
    return { normalized: url.toString(), domain: url.hostname.replace(/^www\./, "") };
  } catch {
    return null;
  }
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN ===" : "=== LIVE RUN ===");

  // Find all sources with vertexaisearch domain
  const geminiSources = await prisma.source.findMany({
    where: { domain: { contains: "vertexaisearch" } },
    select: { id: true, domain: true },
  });

  console.log(`Found ${geminiSources.length} Source records with vertexaisearch domain`);
  if (geminiSources.length === 0) {
    console.log("Nothing to fix!");
    return;
  }

  // Find all occurrences linked to these sources
  const sourceIds = geminiSources.map((s) => s.id);
  const occurrences = await prisma.sourceOccurrence.findMany({
    where: { sourceId: { in: sourceIds } },
    select: {
      id: true,
      sourceId: true,
      originalUrl: true,
      normalizedUrl: true,
      source: { select: { domain: true } },
    },
  });

  console.log(`Found ${occurrences.length} SourceOccurrence records to fix`);

  // Deduplicate URLs to resolve
  const uniqueOriginalUrls = [...new Set(occurrences.map((o) => o.originalUrl))];
  console.log(`Resolving ${uniqueOriginalUrls.length} unique URLs...`);

  // Resolve redirects in batches of 5
  const resolved = new Map<string, string>();
  for (let i = 0; i < uniqueOriginalUrls.length; i += 5) {
    const batch = uniqueOriginalUrls.slice(i, i + 5);
    const results = await Promise.all(
      batch.map(async (url) => {
        const dest = await resolveRedirect(url);
        return { original: url, resolved: dest };
      }),
    );
    for (const r of results) {
      resolved.set(r.original, r.resolved);
      const changed = r.resolved !== r.original && !r.resolved.includes("vertexaisearch");
      console.log(`  ${changed ? "✓" : "✗"} ${r.original.slice(0, 80)}... → ${r.resolved.slice(0, 80)}${r.resolved.length > 80 ? "..." : ""}`);
    }
  }

  // Count results
  const successfullyResolved = [...resolved.entries()].filter(
    ([orig, dest]) => dest !== orig && !dest.includes("vertexaisearch"),
  );
  const stillUnresolved = [...resolved.entries()].filter(
    ([orig, dest]) => dest === orig || dest.includes("vertexaisearch"),
  );

  console.log(`\nResolved: ${successfullyResolved.length}, Unresolvable: ${stillUnresolved.length}`);

  if (DRY_RUN) {
    console.log("\nDry run — no changes made. Remove --dry-run to apply.");
    return;
  }

  // Apply updates
  let updated = 0;
  let deleted = 0;

  for (const occ of occurrences) {
    const dest = resolved.get(occ.originalUrl);
    if (!dest || dest.includes("vertexaisearch")) {
      // Can't resolve — delete this occurrence
      await prisma.sourceOccurrence.delete({ where: { id: occ.id } });
      deleted++;
      continue;
    }

    const norm = normalizeUrl(dest);
    if (!norm) {
      await prisma.sourceOccurrence.delete({ where: { id: occ.id } });
      deleted++;
      continue;
    }

    // Find or create the real Source record
    let realSource = await prisma.source.findFirst({
      where: { domain: norm.domain, normalizedUrl: norm.normalized },
    });
    if (!realSource) {
      realSource = await prisma.source.create({
        data: { domain: norm.domain, normalizedUrl: norm.normalized },
      });
    }

    // Update the occurrence
    await prisma.sourceOccurrence.update({
      where: { id: occ.id },
      data: {
        sourceId: realSource.id,
        normalizedUrl: norm.normalized,
      },
    });
    updated++;
  }

  // Clean up orphaned Gemini Source records
  for (const s of geminiSources) {
    const remaining = await prisma.sourceOccurrence.count({ where: { sourceId: s.id } });
    if (remaining === 0) {
      await prisma.source.delete({ where: { id: s.id } });
      console.log(`  Deleted orphaned Source: ${s.domain}`);
    }
  }

  console.log(`\nDone! Updated: ${updated}, Deleted (unresolvable): ${deleted}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
