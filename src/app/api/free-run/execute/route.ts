import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FREE_TIER_CONFIG } from "@/config/freeTier";
import { findOrCreateBrand } from "@/lib/brand";
import { getOpenAI } from "@/lib/openai";
import { getGemini } from "@/lib/gemini";
import { extractAnalysis } from "@/lib/extractAnalysis";
import { sha256 } from "@/lib/hash";

// 5 prompts × 2 models = 10 parallel response calls plus 10 analysis
// extractions. In practice this completes in ~15–30s. Give it headroom.
export const maxDuration = 60;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Minimal ChatGPT call — mirrors the primary job pipeline but skips citation
 * extraction and retries. The free tier trades robustness for simplicity so
 * the whole run fits in a single request.
 */
async function callChatGPT(promptText: string): Promise<string> {
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const input = `Today is ${today}. Answer concisely and factually in 5 bullet points using the most recent information available.\n\nQuestion: ${promptText}`;

  const response = await getOpenAI().responses.create({
    model: "gpt-4o-mini",
    tools: [{ type: "web_search" as const }],
    input,
    max_output_tokens: 1024,
  });

  let text = "";
  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part.type === "output_text") text += part.text;
        }
      }
    }
  }
  if (!text && response.output_text) text = response.output_text;
  return text;
}

async function callGemini(promptText: string): Promise<string> {
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const input = `Today is ${today}. Answer concisely and factually in 5 bullet points using the most recent information available.\n\nQuestion: ${promptText}`;

  const model = getGemini().getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    tools: [{ googleSearch: {} } as never],
  });
  const result = await model.generateContent(input);
  return result.response.text();
}

async function runOnModel(model: string, promptText: string): Promise<string> {
  if (model === "chatgpt") return callChatGPT(promptText);
  if (model === "gemini") return callGemini(promptText);
  throw new Error(`Unsupported free-tier model: ${model}`);
}

/**
 * POST /api/free-run/execute
 *
 * Body: { brandName, industry, prompts: { text }[] }
 *
 * Synchronous free-tier run. Creates (or re-uses) the brand, saves the
 * user-edited prompts, fans them out to the configured models in parallel,
 * extracts structured analysis for each response, and persists the runs.
 * Returns the brand slug so the caller can redirect to the overview tab.
 */
export async function POST(req: NextRequest) {
  if (!FREE_TIER_CONFIG.enabled) {
    return NextResponse.json({ error: "Free tier is disabled." }, { status: 503 });
  }

  let body: {
    brandName?: string;
    industry?: string;
    prompts?: { text?: string }[];
  };
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

  try {
    // 1. Upsert the brand + its display metadata.
    const slug = slugify(brandName);
    if (!slug) {
      return NextResponse.json({ error: "Couldn't derive a URL slug from the brand name." }, { status: 400 });
    }
    const brand = await findOrCreateBrand(slug);
    await prisma.brand.update({
      where: { id: brand.id },
      data: { displayName: brandName, industry },
    });

    // 2. Save the prompts (one row per question) so they're tied to this brand.
    const createdPrompts = await Promise.all(
      promptTexts.map((text) =>
        prisma.prompt.create({
          data: {
            text,
            cluster: "industry",
            intent: "informational",
            brandId: brand.id,
            source: "custom",
            enabled: true,
          },
        }),
      ),
    );

    // 3. Fan out: one Job per model, each runs all prompts in parallel.
    await Promise.all(
      FREE_TIER_CONFIG.models.map(async (model) => {
        const job = await prisma.job.create({
          data: {
            brandId: brand.id,
            model,
            range: 90,
            status: "running",
            startedAt: new Date(),
          },
        });

        await Promise.allSettled(
          createdPrompts.map(async (prompt) => {
            try {
              const rawResponseText = await runOnModel(model, prompt.text);
              const analysisJson = await extractAnalysis(rawResponseText, brandName, prompt.text);

              await prisma.run.create({
                data: {
                  jobId: job.id,
                  brandId: brand.id,
                  promptId: prompt.id,
                  model,
                  requestHash: sha256(`free|${brand.id}|${job.id}|${prompt.id}|${model}`),
                  promptTextHash: sha256(`${model}|${prompt.text}`),
                  rawResponseText,
                  analysisJson: JSON.parse(JSON.stringify(analysisJson)),
                },
              });
            } catch (err) {
              console.error(`[free-run/execute] ${model} × ${prompt.id} failed:`, err);
            }
          }),
        );

        await prisma.job.update({
          where: { id: job.id },
          data: { status: "done", finishedAt: new Date() },
        });
      }),
    );

    return NextResponse.json({
      hasData: true,
      brandSlug: brand.slug,
    });
  } catch (err) {
    console.error("[api/free-run/execute] Error:", err);
    return NextResponse.json(
      { error: "Something went wrong running your analysis. Please try again." },
      { status: 500 },
    );
  }
}
