import { NextRequest, NextResponse } from "next/server";
import { FREE_TIER_CONFIG } from "@/config/freeTier";

/**
 * POST /api/free-run
 *
 * Phase 1 stub. Accepts { brandName, industry } and echoes back a placeholder
 * response so the UI can render its full loading/success flow.
 *
 * Phase 2 will replace the body of this handler with the real orchestration:
 *   1. IP + session rate-limit check (config: FREE_TIER_RUNS_PER_IP_PER_DAY)
 *   2. findOrCreateBrand(slug) — reuse existing helper
 *   3. generateIndustryPrompts(brandName, industry, category) — reuse existing helper,
 *      slice to FREE_TIER_PROMPT_COUNT
 *   4. Create a Job + dispatch the models in FREE_TIER_MODELS
 *   5. Return a jobId the client polls for status + results
 */
export async function POST(req: NextRequest) {
  if (!FREE_TIER_CONFIG.enabled) {
    return NextResponse.json({ error: "Free tier is disabled." }, { status: 503 });
  }

  let body: { brandName?: string; industry?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const brandName = body.brandName?.trim();
  const industry = body.industry?.trim();
  if (!brandName || !industry) {
    return NextResponse.json({ error: "brandName and industry are required" }, { status: 400 });
  }

  return NextResponse.json({
    hasData: false,
    status: "queued",
    message: `Thanks — we received "${brandName}" in "${industry}". The free analysis pipeline will be wired up in Phase 2: ${FREE_TIER_CONFIG.promptCount} industry questions × ${FREE_TIER_CONFIG.models.join(" + ")}, rate-limited to ${FREE_TIER_CONFIG.runsPerIpPerDay} runs/IP/day.`,
  });
}
