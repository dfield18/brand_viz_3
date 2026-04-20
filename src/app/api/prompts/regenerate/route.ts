import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireBrandAccess } from "@/lib/brandAccess";
import { checkRateLimit } from "@/lib/rateLimit";
import { generateBrandPrompts, generateIndustryPrompts, type BrandCategory } from "@/lib/generateFeaturePrompts";
import { classifyPromptTopicDynamic } from "@/lib/topics/extractTopic";

/**
 * POST /api/prompts/regenerate
 * Body: { brandSlug }
 *
 * Deletes all suggested (non-custom) prompts and regenerates them.
 * Custom prompts are preserved.
 */
export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth();
  if (authError) return authError;
  const rlError = await checkRateLimit(userId, "write");
  if (rlError) return rlError;

  const body = await req.json();
  const { brandSlug } = body;
  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }

  const accessError = await requireBrandAccess(brandSlug);
  if (accessError) return accessError;

  const brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  try {
    // Delete all suggested prompts (keep custom ones)
    await prisma.prompt.deleteMany({
      where: {
        brandId: brand.id,
        source: { not: "custom" },
        // Only delete prompts without runs to avoid orphaned data
        runs: { none: {} },
      },
    });

    // For suggested prompts with runs, just disable them
    await prisma.prompt.updateMany({
      where: {
        brandId: brand.id,
        source: { not: "custom" },
      },
      data: { enabled: false },
    });

    const brandName = brand.displayName || brand.name;
    const industry = brand.industry || brandName;
    const category = (brand.category || "commercial") as BrandCategory;

    // Generate new prompts
    const [brandPrompts, industryPrompts] = await Promise.all([
      generateBrandPrompts(brandName, industry, category),
      generateIndustryPrompts(brandName, industry, category),
    ]);

    const allPrompts = [...brandPrompts, ...industryPrompts];

    // Save to DB
    for (const p of allPrompts) {
      await prisma.prompt.create({
        data: {
          brandId: brand.id,
          text: p.text,
          cluster: p.cluster,
          intent: p.intent,
          source: "suggested",
          enabled: true,
        },
      });
    }

    // Classify topics in background
    const newPrompts = await prisma.prompt.findMany({
      where: { brandId: brand.id, topicKey: null, enabled: true },
      select: { id: true, text: true },
    });
    await Promise.allSettled(
      newPrompts.map(async (p) => {
        const topic = await classifyPromptTopicDynamic(p.text, brandName);
        if (topic?.topicKey) {
          await prisma.prompt.update({ where: { id: p.id }, data: { topicKey: topic.topicKey } });
        }
      }),
    );

    // Return updated prompt list
    const updatedPrompts = await prisma.prompt.findMany({
      where: { brandId: brand.id, enabled: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      regenerated: allPrompts.length,
      prompts: updatedPrompts.map((p) => ({
        id: p.id,
        text: p.text,
        cluster: p.cluster,
        intent: p.intent,
        source: p.source,
        enabled: p.enabled,
        originalText: p.originalText,
      })),
    });
  } catch (err) {
    console.error("[prompts/regenerate] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to regenerate prompts" }, { status: 500 });
  }
}
