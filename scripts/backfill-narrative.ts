import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
import { extractNarrativeForRun } from "../src/lib/narrative/extractNarrative";

dotenv.config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Get all runs missing narrativeJson
  const runs = await prisma.run.findMany({
    where: { narrativeJson: { equals: Prisma.DbNull } },
    include: {
      brand: { select: { slug: true, name: true } },
    },
  });

  console.log(`Found ${runs.length} runs without narrativeJson`);

  let updated = 0;
  let errors = 0;
  const BATCH = 50;

  for (let i = 0; i < runs.length; i += BATCH) {
    const batch = runs.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (run) => {
        const narrative = await extractNarrativeForRun(
          run.rawResponseText,
          run.brand.name,
          run.brand.slug,
        );
        await prisma.run.update({
          where: { id: run.id },
          data: { narrativeJson: JSON.parse(JSON.stringify(narrative)) },
        });
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") updated++;
      else errors++;
    }

    console.log(`  Processed ${Math.min(i + BATCH, runs.length)}/${runs.length} (${updated} updated, ${errors} errors)`);
  }

  console.log(`Done. Updated: ${updated}, Errors: ${errors}`);

  // Verify
  const withNarrative = await prisma.run.count({ where: { narrativeJson: { not: Prisma.DbNull } } });
  const totalRuns = await prisma.run.count();
  console.log(`Runs with narrativeJson: ${withNarrative}/${totalRuns}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
