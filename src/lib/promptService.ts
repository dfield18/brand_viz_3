import { prisma } from "@/lib/prisma";
import { classifyPromptTopicDynamic } from "@/lib/topics/extractTopic";
import {
  classifyBrandCategory,
  classifyBrandDisplayName,
  classifyBrandIndustry,
  generateBrandAliases,
  generateBrandPrompts,
  generateIndustryPrompts,
  type BrandCategory,
} from "@/lib/generateFeaturePrompts";

/**
 * Ensure brand-specific prompts exist. On first call for a brand:
 * 1. Classify the brand (category, industry, display name, aliases)
 * 2. Generate dynamic brand + industry prompts via GPT
 *
 * Idempotent — if prompts already exist, only runs classification
 * for any missing fields and topic-key backfill.
 */
export async function materializePromptsForBrand(brandId: string) {
  // --- 1. Classify brand metadata if not yet set ---
  let brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) return;

  try {
    const updates: Record<string, unknown> = {};
    if (!brand.category) {
      updates.category = await classifyBrandCategory(brand.name);
    }
    if (!brand.industry) {
      updates.industry = await classifyBrandIndustry(brand.name);
    }
    if (!brand.displayName) {
      updates.displayName = await classifyBrandDisplayName(brand.name);
    }
    if (!brand.aliases || brand.aliases.length === 0) {
      const aliases = await generateBrandAliases(brand.name);
      if (aliases.length > 0) updates.aliases = aliases;
    }
    if (Object.keys(updates).length > 0) {
      brand = await prisma.brand.update({ where: { id: brandId }, data: updates });
    }
  } catch (err) {
    console.error("[materializePromptsForBrand] Brand classification failed (non-blocking):", err);
  }

  // --- 2. Generate prompts if none exist yet ---
  const existing = await prisma.prompt.findMany({
    where: { brandId },
    select: { id: true, source: true },
  });

  if (existing.length === 0) {
    const brandName = brand.displayName || brand.name;
    const industry = brand.industry || brandName;
    const category = (brand.category || "commercial") as BrandCategory;

    // Generate brand + industry prompts in parallel
    const [brandPrompts, industryPrompts] = await Promise.all([
      generateBrandPrompts(brandName, industry, category),
      generateIndustryPrompts(brandName, industry, category),
    ]);

    const allPrompts = [...brandPrompts, ...industryPrompts];

    if (allPrompts.length > 0) {
      await prisma.prompt.createMany({
        data: allPrompts.map((p) => ({
          brandId,
          text: p.text,
          cluster: p.cluster,
          intent: p.intent,
          source: p.source,
          originalText: p.text,
          enabled: true,
        })),
      });
    }
  }

  // --- 3. Classify topic keys for any prompts missing them ---
  const unclassified = await prisma.prompt.findMany({
    where: { brandId, topicKey: null },
    select: { id: true, text: true },
  });
  if (unclassified.length > 0) {
    await Promise.all(
      unclassified.map(async (p) => {
        const { topicKey } = await classifyPromptTopicDynamic(p.text, brand!.name);
        return prisma.prompt.update({
          where: { id: p.id },
          data: { topicKey },
        });
      }),
    );
  }
}

/**
 * Get all prompts for a brand (for management UI). Materializes first if needed.
 */
export async function getAllBrandPrompts(brandId: string) {
  await materializePromptsForBrand(brandId);
  return prisma.prompt.findMany({
    where: { brandId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Get enabled prompts for a brand. Materializes first if needed.
 * Used by process/backfill routes.
 */
export async function getEnabledPrompts(brandId: string) {
  await materializePromptsForBrand(brandId);
  return prisma.prompt.findMany({
    where: { brandId, enabled: true },
    orderBy: { createdAt: "asc" },
  });
}
