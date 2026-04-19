import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { formatJobMeta } from "@/lib/apiPipeline";
import { requireBrandAccess } from "@/lib/brandAccess";
import { getTopBrandsForRun, RANKED_ENTITY_LIMIT } from "@/lib/visibility/rankedEntities";
import { filterRunsToBrandQueryUniverse, buildBrandIdentity } from "@/lib/visibility/brandScope";

// Pricing per 1M tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  chatgpt: { input: 0.15, output: 0.60 },   // gpt-4o-mini
  gemini: { input: 0.075, output: 0.30 },    // gemini-2.5-flash-lite
  claude: { input: 0.80, output: 4.00 },     // claude-haiku-4.5
  perplexity: { input: 0.20, output: 0.80 }, // sonar
};
const EXTRACT_PRICING = { input: 0.15, output: 0.60 }; // gpt-4o-mini for extraction

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const RESPONSE_SYSTEM_PREFIX = "Answer concisely and factually in 5 bullet points.\n\nQuestion: ";
const EXTRACT_SYSTEM_TOKENS = 300; // ~1200 char system prompt

export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }
  const access = await requireBrandAccess(brandSlug);
  if (access) return access;
  const model = req.nextUrl.searchParams.get("model") ?? "";
  const viewRange = parseInt(req.nextUrl.searchParams.get("range") ?? "90", 10);

  // Query ALL runs (no dedup) so the full data tab shows historical data
  const brand = await prisma.brand.findUnique({
    where: { slug: brandSlug },
    select: { id: true, name: true, displayName: true, slug: true, industry: true, aliases: true },
  });
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const isAll = model === "all";
  const rangeCutoff = new Date(Date.now() - viewRange * 86_400_000);
  const runWhere = isAll
    ? { brandId: brand.id, createdAt: { gte: rangeCutoff }, job: { status: "done" as const } }
    : { brandId: brand.id, model, createdAt: { gte: rangeCutoff }, job: { status: "done" as const } };

  const rawRuns = await prisma.run.findMany({
    where: runWhere,
    select: {
      id: true, model: true, promptId: true, createdAt: true,
      rawResponseText: true, promptTextHash: true, analysisJson: true,
      prompt: { select: { text: true, cluster: true, intent: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const job = await prisma.job.findFirst({
    where: isAll
      ? { brandId: brand.id, status: "done" }
      : { brandId: brand.id, model, status: "done" },
    orderBy: [{ finishedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, model: true, range: true, finishedAt: true },
  });

  if (rawRuns.length === 0) {
    return NextResponse.json({ hasData: false, reason: "no_runs" });
  }

  // Default export uses query-universe scope (matches dashboard semantics).
  // Optional ?scope=raw returns all rows for debugging.
  const scopeParam = req.nextUrl.searchParams.get("scope");
  const brandIdentity = buildBrandIdentity(brand);
  const runs = scopeParam === "raw" ? rawRuns : filterRunsToBrandQueryUniverse(rawRuns, brandIdentity);

  const brandName = brand.displayName || brand.name;

  try {
    const defaultPricing = MODEL_PRICING[model] ?? MODEL_PRICING.chatgpt;

    let totalResponseCost = 0;
    let totalExtractionCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const runData = runs.map((run) => {
      const pricing = MODEL_PRICING[run.model] ?? defaultPricing;
      let promptText = run.prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`);
      if (brand.industry) promptText = promptText.replace(/\bthe industry\b/gi, `the ${brand.industry} industry`);
      if (promptText.includes("{competitor}")) {
        const analysis = run.analysisJson as { competitors?: { name: string }[] } | null;
        const topComp = analysis?.competitors?.[0]?.name ?? "competitors";
        promptText = promptText.replace(/\{competitor\}/gi, topComp);
      }
      const fullInput = RESPONSE_SYSTEM_PREFIX + promptText;

      // Response generation tokens
      const respInputTokens = estimateTokens(fullInput);
      const respOutputTokens = estimateTokens(run.rawResponseText);
      const responseCost =
        (respInputTokens * pricing.input + respOutputTokens * pricing.output) / 1_000_000;

      // Extraction tokens (gpt-4o-mini)
      const extractInputTokens = EXTRACT_SYSTEM_TOKENS + estimateTokens(promptText) + estimateTokens(run.rawResponseText) + 30;
      const extractOutputTokens = 200; // ~800 chars JSON output
      const extractionCost =
        (extractInputTokens * EXTRACT_PRICING.input + extractOutputTokens * EXTRACT_PRICING.output) / 1_000_000;

      totalResponseCost += responseCost;
      totalExtractionCost += extractionCost;
      totalInputTokens += respInputTokens + extractInputTokens;
      totalOutputTokens += respOutputTokens + extractOutputTokens;

      // Extract top 5 brands by text order for industry-cluster runs
      // Uses shared helper — same logic as competitor movement
      const topBrands = run.prompt.cluster === "industry"
        ? getTopBrandsForRun({
            rawResponseText: run.rawResponseText,
            analysisJson: run.analysisJson,
            brandName,
            brandSlug: brand.slug,
            includeBrand: true,
            limit: RANKED_ENTITY_LIMIT,
          })
        : [];

      return {
        id: run.id,
        model: run.model,
        prompt: {
          text: promptText,
          cluster: run.prompt.cluster,
          intent: run.prompt.intent,
        },
        rawResponseText: run.rawResponseText,
        topBrands,
        createdAt: run.createdAt.toISOString(),
        cached: !!run.promptTextHash,
        cost: {
          response: Number(responseCost.toFixed(6)),
          extraction: Number(extractionCost.toFixed(6)),
          total: Number((responseCost + extractionCost).toFixed(6)),
        },
      };
    });

    return NextResponse.json({
      hasData: true,
      job: job ? formatJobMeta(job) : null,
      runs: runData,
      costs: {
        responseCost: Number(totalResponseCost.toFixed(6)),
        extractionCost: Number(totalExtractionCost.toFixed(6)),
        totalCost: Number((totalResponseCost + totalExtractionCost).toFixed(6)),
        totalInputTokens,
        totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
        model: model,
        note: "Estimated based on text length (~4 chars/token). Cached runs skip API calls.",
      },
    }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const stack = e instanceof Error ? e.stack : "";
    console.error("Responses API error:", message, "\n", stack);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
