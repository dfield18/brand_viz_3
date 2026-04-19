import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FREE_TIER_CONFIG } from "@/config/freeTier";
import { findOrCreateBrand } from "@/lib/brand";
import { getOpenAI } from "@/lib/openai";
import { getGemini } from "@/lib/gemini";
import { extractAnalysis } from "@/lib/extractAnalysis";
import { extractNarrativeForRun } from "@/lib/narrative/extractNarrative";
import { sha256 } from "@/lib/hash";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

// 5 prompts × 2 models = 10 parallel response calls plus 10 analysis
// extractions. In practice this completes in ~15–30s. Give it headroom.
export const maxDuration = 60;

/** Attach the anonymous session cookie to any response. 30-day lifetime so
 *  the per-session daily cap survives short breaks between runs. */
function setSessionCookie(res: NextResponse, sessionId: string) {
  res.cookies.set({
    name: FREE_TIER_CONFIG.sessionCookie,
    value: sessionId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Anonymous free runs get a random suffix so two users running "Apple"
 *  at the same time each get their own brand row, and neither can
 *  overwrite a paid user's existing "apple" brand. 8 hex chars → ~4B
 *  values; collisions are astronomically unlikely at our scale. */
function randomSlugSuffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8);
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

  // IP + session daily limits. IP blocks raw abuse; the session cookie
  // catches users sharing a NAT'd IP from the same browser. Both are
  // enforced so clearing cookies alone doesn't defeat the limit.
  const ip = getClientIp(req);
  const ipLimit = await checkRateLimit(`free-run:${ip}`, "freeRunIp");
  if (ipLimit) return ipLimit;

  const existingSession = req.cookies.get(FREE_TIER_CONFIG.sessionCookie)?.value;
  const sessionId = existingSession || crypto.randomUUID();
  const sessionLimit = await checkRateLimit(`free-run:${sessionId}`, "freeRunSession");
  if (sessionLimit) {
    // Stamp the cookie even on 429 so a cookie-clearing retry still counts
    // against the same session key rather than minting a fresh one.
    if (!existingSession) setSessionCookie(sessionLimit, sessionId);
    return sessionLimit;
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
  // Same shape checks as /api/free-run so a client can't skip the preview
  // step to sneak garbage past validation.
  if (brandName.length > 100 || industry.length > 100) {
    return NextResponse.json({ error: "brandName or industry is too long" }, { status: 400 });
  }
  if (!/\p{L}|\p{N}/u.test(brandName)) {
    return NextResponse.json({ error: "Enter a brand or organization name." }, { status: 400 });
  }
  if (promptTexts.length > 20 || promptTexts.some((t) => t.length > 500)) {
    return NextResponse.json({ error: "Prompts are too long or too many." }, { status: 400 });
  }

  try {
    // 1. Create a brand row for this specific free run. Always suffix with a
    // random ID so anonymous users never share a brand record — two people
    // running "Apple" seconds apart each get their own isolated result, and
    // neither can overwrite a Pro user's existing `apple` brand.
    const baseSlug = slugify(brandName);
    if (!baseSlug) {
      return NextResponse.json({ error: "Couldn't derive a URL slug from the brand name." }, { status: 400 });
    }
    const slug = `${baseSlug}-${randomSlugSuffix()}`;
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
    //    Per-prompt failures are swallowed so one bad prompt doesn't kill the
    //    rest, but we count how many runs actually landed. If a model
    //    produced zero runs, the job is marked "error" — not "done" — so the
    //    overview tab doesn't silently show empty data for it.
    const perModelCounts = await Promise.all(
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

        const results = await Promise.allSettled(
          createdPrompts.map(async (prompt) => {
            const rawResponseText = await runOnModel(model, prompt.text);

            // Run analysis + narrative extraction in parallel — both read
            // the full response and are independent. Narrative supplies
            // sentiment/themes that the overview tab reads from
            // narrativeJson.sentiment.label.
            const [analysisJson, narrativeJson] = await Promise.all([
              extractAnalysis(rawResponseText, brandName, prompt.text),
              extractNarrativeForRun(rawResponseText, brandName, brand.slug),
            ]);

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
                narrativeJson: JSON.parse(JSON.stringify(narrativeJson)),
              },
            });
          }),
        );

        const succeeded = results.filter((r) => r.status === "fulfilled").length;
        const firstError = results.find((r) => r.status === "rejected") as
          | PromiseRejectedResult
          | undefined;
        if (firstError) {
          console.error(
            `[free-run/execute] ${model}: ${results.length - succeeded}/${results.length} prompts failed. First error:`,
            firstError.reason,
          );
        }

        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: succeeded === 0 ? "error" : "done",
            error: succeeded === 0 ? String(firstError?.reason ?? "all prompts failed").slice(0, 500) : null,
            finishedAt: new Date(),
          },
        });

        return { model, succeeded, total: results.length };
      }),
    );

    // If every model failed every prompt, surface a 502 instead of
    // redirecting to an empty overview page.
    const totalSucceeded = perModelCounts.reduce((s, m) => s + m.succeeded, 0);
    if (totalSucceeded === 0) {
      const errorRes = NextResponse.json(
        {
          error:
            "Analysis ran but no model returned a usable response. Please try again in a moment.",
        },
        { status: 502 },
      );
      if (!existingSession) setSessionCookie(errorRes, sessionId);
      return errorRes;
    }

    const res = NextResponse.json({
      hasData: true,
      brandSlug: brand.slug,
    });
    if (!existingSession) setSessionCookie(res, sessionId);
    return res;
  } catch (err) {
    console.error("[api/free-run/execute] Error:", err);
    const errorRes = NextResponse.json(
      { error: "Something went wrong running your analysis. Please try again." },
      { status: 500 },
    );
    if (!existingSession) setSessionCookie(errorRes, sessionId);
    return errorRes;
  }
}
