import { prisma } from "@/lib/prisma";
import { classifyPromptTopic } from "@/lib/topics/extractTopic";
import {
  classifyBrandCategory,
  classifyBrandDisplayName,
  classifyBrandIndustry,
  generateBrandAliases,
} from "@/lib/generateFeaturePrompts";

/**
 * Ensure brand-specific prompt rows exist by copying from global templates.
 * Also generates feature-based comparative prompts using GPT if not yet created.
 * Idempotent — safe to call on every request.
 */
export async function materializePromptsForBrand(brandId: string) {
  const templates = await prisma.prompt.findMany({
    where: { brandId: null },
    orderBy: { createdAt: "asc" },
  });

  const existing = await prisma.prompt.findMany({
    where: { brandId },
    orderBy: { createdAt: "asc" },
  });

  const existingTemplateIds = new Set(
    existing.filter((p) => p.templateId).map((p) => p.templateId),
  );

  const toCreate = templates.filter((t) => !existingTemplateIds.has(t.id));

  if (toCreate.length > 0) {
    await prisma.prompt.createMany({
      data: toCreate.map((t) => ({
        brandId,
        text: t.text,
        cluster: t.cluster,
        intent: t.intent,
        source: "suggested",
        originalText: t.text,
        templateId: t.id,
        enabled: true,
      })),
    });
  }

  // Classify brand category and industry if not yet set
  try {
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (brand) {
      if (!brand.category) {
        const category = await classifyBrandCategory(brand.name);
        await prisma.brand.update({ where: { id: brandId }, data: { category } });
      }
      if (!brand.industry) {
        const industry = await classifyBrandIndustry(brand.name);
        await prisma.brand.update({ where: { id: brandId }, data: { industry } });
      }
      if (!brand.displayName) {
        const displayName = await classifyBrandDisplayName(brand.name);
        await prisma.brand.update({ where: { id: brandId }, data: { displayName } });
      }
      if (!brand.aliases || brand.aliases.length === 0) {
        const aliases = await generateBrandAliases(brand.name);
        if (aliases.length > 0) {
          await prisma.brand.update({ where: { id: brandId }, data: { aliases } });
        }
      }
    }
  } catch (err) {
    console.error("[materializePromptsForBrand] Brand classification failed (non-blocking):", err);
  }

  // Classify any prompts that don't yet have a topicKey
  const unclassified = await prisma.prompt.findMany({
    where: { brandId, topicKey: null },
    select: { id: true, text: true },
  });
  if (unclassified.length > 0) {
    await Promise.all(
      unclassified.map((p) => {
        const { topicKey } = classifyPromptTopic(p.text);
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
