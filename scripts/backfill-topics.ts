import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
import { classifyPromptTopic } from "../src/lib/topics/extractTopic";

dotenv.config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const prompts = await prisma.prompt.findMany({
    where: { topicKey: null },
    select: { id: true, text: true },
  });

  console.log(`Found ${prompts.length} prompts without topicKey`);

  let updated = 0;
  let errors = 0;
  const BATCH = 50;

  for (let i = 0; i < prompts.length; i += BATCH) {
    const batch = prompts.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (p) => {
        const { topicKey } = classifyPromptTopic(p.text);
        await prisma.prompt.update({
          where: { id: p.id },
          data: { topicKey },
        });
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") updated++;
      else errors++;
    }

    console.log(
      `  Processed ${Math.min(i + BATCH, prompts.length)}/${prompts.length} (${updated} updated, ${errors} errors)`,
    );
  }

  console.log(`Done. Updated: ${updated}, Errors: ${errors}`);

  // Verify
  const withTopic = await prisma.prompt.count({ where: { topicKey: { not: null } } });
  const totalPrompts = await prisma.prompt.count();
  console.log(`Prompts with topicKey: ${withTopic}/${totalPrompts}`);

  // Distribution
  const classified = await prisma.prompt.findMany({
    where: { topicKey: { not: null } },
    select: { topicKey: true },
  });
  const dist = new Map<string, number>();
  for (const p of classified) {
    dist.set(p.topicKey!, (dist.get(p.topicKey!) ?? 0) + 1);
  }
  console.log("\nTopic distribution:");
  for (const [key, count] of [...dist.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key}: ${count}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
