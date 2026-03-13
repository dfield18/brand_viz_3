import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const PROMPTS: { text: string; cluster: string; intent: string; source: string }[] = [
  // Direct — brand perception
  { text: "What is {brand} known for?", cluster: "direct", intent: "informational", source: "suggested" },
  { text: "What are the pros and cons of {brand}?", cluster: "direct", intent: "informational", source: "suggested" },
  { text: "What has {brand} been in the news for recently?", cluster: "direct", intent: "informational", source: "suggested" },

  // High-intent — purchase/decision prompts
  { text: "Would you recommend {brand}?", cluster: "direct", intent: "high-intent", source: "suggested" },
  { text: "What are the best alternatives to {brand}?", cluster: "direct", intent: "high-intent", source: "suggested" },



  // Industry — generic questions that test organic brand visibility
  { text: "What are the top brands in {industry}?", cluster: "industry", intent: "high-intent", source: "suggested" },
  { text: "If I needed a product or service in {industry}, what would you recommend?", cluster: "industry", intent: "high-intent", source: "suggested" },
  { text: "Who are the market leaders in {industry}?", cluster: "industry", intent: "informational", source: "suggested" },
  { text: "What are the most trusted names in {industry}?", cluster: "industry", intent: "informational", source: "suggested" },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run seed script in production. Set FORCE_SEED=1 to override.");
    if (!process.env.FORCE_SEED) process.exit(1);
  }

  // Migrate old industry prompts: replace "{brand}'s industry/space/category/field/sector" with "{industry}"
  const INDUSTRY_PATTERN = /\{brand\}'s\s+(industry|space|category|field|sector)/g;
  const oldIndustryPrompts = await prisma.prompt.findMany({
    where: { text: { contains: "{brand}'s" } },
    select: { id: true, text: true },
  });
  for (const p of oldIndustryPrompts) {
    if (INDUSTRY_PATTERN.test(p.text)) {
      const newText = p.text.replace(INDUSTRY_PATTERN, "{industry}");
      await prisma.prompt.update({
        where: { id: p.id },
        data: { text: newText, originalText: newText },
      });
      console.log(`  ~ migrated: "${p.text}" → "${newText}"`);
    }
  }

  // Check which prompts already exist as global templates (by text)
  const existingTemplates = await prisma.prompt.findMany({
    where: { brandId: null },
    select: { id: true, text: true, cluster: true },
  });
  const existingTexts = new Set(existingTemplates.map((t) => t.text));

  const missing = PROMPTS.filter((p) => !existingTexts.has(p.text));

  if (missing.length > 0) {
    console.log(
      `Missing ${missing.length} template(s). Adding...`,
    );
    for (const p of missing) {
      console.log(`  + [${p.cluster}] ${p.text}`);
    }
    const result = await prisma.prompt.createMany({ data: missing });
    console.log(`Seeded ${result.count} template prompt(s).`);
  } else {
    console.log(`All ${existingTemplates.length} template prompts present — skipping seed.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
