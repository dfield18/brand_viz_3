import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
import { extractUrls } from "../src/lib/sources/parseUrls";
import { attributeEntitiesToUrls, buildEntityList } from "../src/lib/sources/attributeEntity";

dotenv.config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Find runs that have no source occurrences
  const runs = await prisma.run.findMany({
    where: { sourceOccurrences: { none: {} } },
    select: {
      id: true,
      model: true,
      promptId: true,
      rawResponseText: true,
      analysisJson: true,
      brand: { select: { name: true, slug: true } },
    },
  });

  console.log(`Found ${runs.length} runs without source occurrences`);

  let processed = 0;
  let sourcesCreated = 0;
  let errors = 0;
  const BATCH = 50;

  for (let i = 0; i < runs.length; i += BATCH) {
    const batch = runs.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (run) => {
        const urls = extractUrls(run.rawResponseText);
        if (urls.length === 0) return 0;

        const entities = buildEntityList(run.brand.name, run.brand.slug, run.analysisJson);
        const attributed = attributeEntitiesToUrls({
          responseText: run.rawResponseText,
          urls,
          entities,
        });

        let count = 0;
        for (const url of attributed) {
          try {
            const source = await prisma.source.upsert({
              where: { domain: url.domain },
              create: { domain: url.domain },
              update: {},
            });

            await prisma.sourceOccurrence.create({
              data: {
                runId: run.id,
                promptId: run.promptId,
                model: run.model,
                entityId: url.entityId,
                sourceId: source.id,
                normalizedUrl: url.normalizedUrl,
                originalUrl: url.originalUrl,
                sourceType: url.sourceType,
                positionIndex: url.positionIndex,
              },
            });
            count++;
          } catch {
            // Skip duplicates or errors
          }
        }
        return count;
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        processed++;
        sourcesCreated += r.value;
      } else {
        errors++;
      }
    }

    console.log(
      `  Processed ${Math.min(i + BATCH, runs.length)}/${runs.length} runs (${sourcesCreated} source occurrences, ${errors} errors)`,
    );
  }

  console.log(`\nDone. Processed: ${processed}, Sources created: ${sourcesCreated}, Errors: ${errors}`);

  // Verify
  const totalSources = await prisma.source.count();
  const totalOccurrences = await prisma.sourceOccurrence.count();
  console.log(`\nTotal sources (domains): ${totalSources}`);
  console.log(`Total source occurrences: ${totalOccurrences}`);

  // Top domains
  const topDomains = await prisma.sourceOccurrence.groupBy({
    by: ["sourceId"],
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 10,
  });

  if (topDomains.length > 0) {
    const sourceIds = topDomains.map((d) => d.sourceId);
    const sources = await prisma.source.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, domain: true },
    });
    const domainById = new Map(sources.map((s) => [s.id, s.domain]));

    console.log("\nTop 10 domains:");
    for (const d of topDomains) {
      console.log(`  ${domainById.get(d.sourceId) ?? d.sourceId}: ${d._count.id} occurrences`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
