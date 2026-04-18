import { NextRequest, NextResponse } from "next/server";
import { FREE_TIER_CONFIG } from "@/config/freeTier";

// Actual multi-model execution will take longer than the classification step;
// leave room for ~30s of combined streaming/polling.
export const maxDuration = 60;

/**
 * POST /api/free-run/execute
 *
 * Body: { brandName: string, industry: string, prompts: { text: string }[] }
 *
 * Phase 2b placeholder. Accepts the brand, industry, and the (possibly user-
 * edited) prompt list, and will eventually fan the prompts out to each of
 * FREE_TIER_CONFIG.models, collect responses, extract structured analysis,
 * and return a summary (brand recall, share of voice, competitor snapshot,
 * sample excerpts).
 *
 * For now it validates input and returns a friendly "coming soon" message so
 * the Run report button has a real endpoint to hit without pretending to do
 * real work.
 */
export async function POST(req: NextRequest) {
  if (!FREE_TIER_CONFIG.enabled) {
    return NextResponse.json({ error: "Free tier is disabled." }, { status: 503 });
  }

  let body: { brandName?: string; industry?: string; prompts?: { text?: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const brandName = body.brandName?.trim();
  const industry = body.industry?.trim();
  const promptTexts = (body.prompts ?? [])
    .map((p) => p.text?.trim())
    .filter((t): t is string => !!t);

  if (!brandName || !industry || promptTexts.length === 0) {
    return NextResponse.json(
      { error: "brandName, industry, and at least one prompt are required" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    hasData: false,
    status: "pending",
    message: `Ready to run ${promptTexts.length} question${promptTexts.length === 1 ? "" : "s"} for "${brandName}" across ${FREE_TIER_CONFIG.models.join(" and ")}. The full analysis pipeline is next on the roadmap — sign up to get the complete report with all 5 AI platforms, sentiment, competitor tracking, and source citations.`,
  });
}
