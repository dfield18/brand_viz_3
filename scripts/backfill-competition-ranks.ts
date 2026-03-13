import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
import { assignRanks } from "../src/lib/competition/computeCompetition";

dotenv.config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Find all distinct runIds that have metrics missing rankPosition
  const runsNeedingRanks = await prisma.entityResponseMetric.findMany({
    where: { rankPosition: null },
    select: { runId: true },
    distinct: ["runId"],
  });

  const runIds = runsNeedingRanks.map((r) => r.runId);
  console.log(`Found ${runIds.length} runs needing rank backfill`);

  let updated = 0;
  let errors = 0;
  const BATCH = 50;

  for (let i = 0; i < runIds.length; i += BATCH) {
    const batchIds = runIds.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batchIds.map(async (runId) => {
        // Fetch all metrics for this run
        const metrics = await prisma.entityResponseMetric.findMany({
          where: { runId },
          select: { id: true, entityId: true, prominenceScore: true },
        });

        // Compute ranks
        const ranked = assignRanks(
          metrics.map((m) => ({ entityId: m.entityId, prominenceScore: m.prominenceScore })),
        );
        const rankMap = new Map(ranked.map((r) => [r.entityId, r]));

        // Update each metric
        await Promise.all(
          metrics.map((m) => {
            const rank = rankMap.get(m.entityId);
            return prisma.entityResponseMetric.update({
              where: { id: m.id },
              data: {
                rankPosition: rank?.rankPosition ?? null,
                normalizedRankScore: rank?.normalizedRankScore ?? null,
                competitorsInResponse: rank?.competitorsInResponse ?? null,
              },
            });
          }),
        );
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") updated++;
      else {
        errors++;
        console.error("  Error:", (r as PromiseRejectedResult).reason);
      }
    }

    console.log(
      `  Processed ${Math.min(i + BATCH, runIds.length)}/${runIds.length} runs (${updated} updated, ${errors} errors)`,
    );
  }

  console.log(`Done. Updated: ${updated}, Errors: ${errors}`);

  // Verify
  const withRank = await prisma.entityResponseMetric.count({ where: { rankPosition: { not: null } } });
  const totalMetrics = await prisma.entityResponseMetric.count();
  console.log(`Metrics with rankPosition: ${withRank}/${totalMetrics}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
