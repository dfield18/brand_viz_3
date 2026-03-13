import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
import { calculateProminenceScores, type EntityInput } from "../src/lib/prominence/prominence";

dotenv.config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Get all runs with their brand info
  const runs = await prisma.run.findMany({
    include: {
      brand: { select: { slug: true, name: true } },
    },
  });

  console.log(`Found ${runs.length} runs to backfill`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const run of runs) {
    // Build entity list: brand + competitors from analysis
    const entities: EntityInput[] = [
      {
        entityId: run.brand.slug,
        name: run.brand.name,
        variants: [run.brand.name, run.brand.name.toLowerCase(), run.brand.name.toUpperCase()],
      },
    ];

    // Extract competitor names from analysisJson
    const analysisJson = run.analysisJson;
    if (analysisJson && typeof analysisJson === "object") {
      const analysis = analysisJson as Record<string, unknown>;
      if (Array.isArray(analysis.competitors)) {
        for (const comp of analysis.competitors) {
          if (comp && typeof comp === "object" && "name" in comp) {
            const name = String((comp as { name: string }).name);
            const id = name.toLowerCase();
            if (id !== run.brand.slug && id !== run.brand.name.toLowerCase()) {
              entities.push({
                entityId: id,
                name,
                variants: [name, name.toLowerCase()],
              });
            }
          }
        }
      }
    }

    const results = calculateProminenceScores({
      responseText: run.rawResponseText,
      entities,
    });

    for (const result of results) {
      try {
        await prisma.entityResponseMetric.upsert({
          where: {
            runId_entityId: { runId: run.id, entityId: result.entityId },
          },
          update: {
            frequencyScore: result.frequency,
            positionScore: result.position,
            depthScore: result.depth,
            structureScore: result.structure,
            prominenceScore: result.prominence,
          },
          create: {
            runId: run.id,
            model: run.model,
            promptId: run.promptId,
            entityId: result.entityId,
            frequencyScore: result.frequency,
            positionScore: result.position,
            depthScore: result.depth,
            structureScore: result.structure,
            prominenceScore: result.prominence,
          },
        });
        created++;
      } catch {
        errors++;
      }
    }

    if (results.length === 0) skipped++;
  }

  console.log(`Done. Created/updated: ${created}, Skipped (no entities): ${skipped}, Errors: ${errors}`);

  // Verify
  const count = await prisma.entityResponseMetric.count();
  console.log(`EntityResponseMetric total rows: ${count}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
