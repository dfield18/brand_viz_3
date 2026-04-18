import { NextRequest, NextResponse } from "next/server";
import { FREE_TIER_CONFIG } from "@/config/freeTier";
import {
  classifyBrandCategory,
  classifyBrandIndustry,
  generateIndustryPrompts,
} from "@/lib/generateFeaturePrompts";

// Three GPT-4o-mini calls (category + industry + prompt generation) can take
// a few seconds together; give the handler room to finish.
export const maxDuration = 60;

/**
 * POST /api/free-run
 *
 * Body: { brandName: string }
 *
 * Phase 2a: auto-detect the brand's category + industry via GPT-4o-mini,
 * then generate N industry-cluster sample questions. Returns the detected
 * metadata and the questions so the free dashboard can preview what we'd
 * send to ChatGPT and Gemini.
 *
 * Phase 2b will extend this to actually run the questions through the
 * configured models and return analysis results. For now we stop at the
 * prompt preview so a visitor can see exactly what they're signing up to run.
 */
export async function POST(req: NextRequest) {
  if (!FREE_TIER_CONFIG.enabled) {
    return NextResponse.json({ error: "Free tier is disabled." }, { status: 503 });
  }

  let body: { brandName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const brandName = body.brandName?.trim();
  if (!brandName) {
    return NextResponse.json({ error: "brandName is required" }, { status: 400 });
  }

  try {
    // Category + industry classifications are independent — run in parallel.
    const [category, industry] = await Promise.all([
      classifyBrandCategory(brandName),
      classifyBrandIndustry(brandName),
    ]);

    const generated = await generateIndustryPrompts(brandName, industry, category);
    const prompts = generated.slice(0, FREE_TIER_CONFIG.promptCount);

    if (prompts.length === 0) {
      return NextResponse.json(
        {
          error:
            "Couldn't generate questions for this brand. Try a more specific name or check spelling.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      hasData: true,
      brandName,
      industry,
      category,
      prompts: prompts.map((p) => ({ text: p.text, intent: p.intent })),
    });
  } catch (err) {
    console.error("[api/free-run] Error generating prompts for", brandName, err);
    return NextResponse.json(
      { error: "Something went wrong generating your analysis. Please try again." },
      { status: 500 },
    );
  }
}
