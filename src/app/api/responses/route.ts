import { NextRequest, NextResponse } from "next/server";
import { fetchBrandRuns, formatJobMeta } from "@/lib/apiPipeline";

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
  const model = req.nextUrl.searchParams.get("model") ?? "";
  const viewRange = parseInt(req.nextUrl.searchParams.get("range") ?? "90", 10);

  type ResponseRun = {
    id: string;
    model: string;
    promptId: string;
    createdAt: Date;
    rawResponseText: string;
    promptTextHash: string | null;
    analysisJson: unknown;
    prompt: { text: string; cluster: string | null; intent: string | null };
  };
  const result = await fetchBrandRuns<ResponseRun>({
    brandSlug,
    model,
    viewRange,
    runQuery: { select: { id: true, model: true, promptId: true, createdAt: true, rawResponseText: true, promptTextHash: true, analysisJson: true, prompt: { select: { text: true, cluster: true, intent: true } } } },
    disableAllModel: false,
  });
  if (!result.ok) return result.response;
  const { brand, job, runs } = result;
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

      return {
        id: run.id,
        model: run.model,
        prompt: {
          text: promptText,
          cluster: run.prompt.cluster,
          intent: run.prompt.intent,
        },
        rawResponseText: run.rawResponseText,
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
      job: formatJobMeta(job!),
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
