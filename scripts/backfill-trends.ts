import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const entry = args.find((a) => a.startsWith(`--${name}=`));
  return entry?.split("=")[1];
}

const BRAND_SLUG = getArg("brand");
const WEEKS = parseInt(getArg("weeks") ?? "12", 10);
const RANGE = parseInt(getArg("range") ?? "90", 10);

if (!BRAND_SLUG) {
  console.error(
    "Usage: npx tsx scripts/backfill-trends.ts --brand=<slug> [--weeks=12] [--range=30]",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Prisma + API clients (no path aliases in scripts)
// ---------------------------------------------------------------------------

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const gemini = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODELS = ["chatgpt", "gemini"] as const;
const OPENAI_MODEL = "gpt-4o-mini";
const GEMINI_MODEL = "gemini-2.5-flash-lite";
const EXTRACT_MODEL = "gpt-4o-mini";
const DELAY_MS = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function weekDate(weeksAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - weeksAgo * 7);
  d.setHours(12, 0, 0, 0);
  return d;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// API call functions (inlined, no path aliases)
// ---------------------------------------------------------------------------

async function callOpenAI(promptText: string): Promise<string> {
  const input = `Answer concisely and factually in 5 bullet points.\n\nQuestion: ${promptText}`;
  const response = await openai.responses.create({
    model: OPENAI_MODEL,
    input,
    max_output_tokens: 512,
  });
  return response.output_text ?? JSON.stringify(response);
}

async function callGemini(promptText: string): Promise<string> {
  const input = `Answer concisely and factually in 5 bullet points.\n\nQuestion: ${promptText}`;
  const model = gemini.getGenerativeModel({ model: GEMINI_MODEL });
  const result = await model.generateContent(input);
  return result.response.text() || JSON.stringify(result.response);
}

const EXTRACT_SYSTEM_PROMPT = `You are a structured data extractor for brand visibility analysis.
Given an AI response about a brand, extract the following as JSON:

{
  "brandMentioned": boolean,
  "brandMentionStrength": 0-100 (how prominently the brand is discussed),
  "competitors": [{"name": string, "mentionStrength": 0-100}],
  "topics": [{"name": string, "relevance": 0-100}] (up to 5 most relevant topics),
  "frames": [{"name": string, "strength": 0-100}] (narrative frames like "Sustainability Leader", "Innovation Pioneer", "Premium Quality", "Value Proposition", "Market Disruptor", "Ethical Business", "Cultural Icon", "Industry Standard"),
  "sentiment": {"legitimacy": 0-100, "controversy": 0-100},
  "hedgingScore": 0-100 (amount of hedging language like "some say", "arguably", "it depends"),
  "authorityScore": 0-100 (how authoritatively the response treats the brand)
}

Return ONLY valid JSON. No markdown fences, no explanation.`;

async function extractAnalysis(
  rawResponseText: string,
  brandName: string,
  promptText: string,
) {
  const userPrompt = `Brand: "${brandName}"
Original question: "${promptText}"

AI Response to analyze:
${rawResponseText}`;

  try {
    const response = await openai.responses.create({
      model: EXTRACT_MODEL,
      input: [
        { role: "system", content: EXTRACT_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_output_tokens: 512,
    });
    const text = response.output_text ?? "";
    const cleaned = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("  Analysis extraction failed:", e);
    return {
      brandMentioned: rawResponseText
        .toLowerCase()
        .includes(brandName.toLowerCase()),
      brandMentionStrength: 0,
      competitors: [],
      topics: [],
      frames: [],
      sentiment: { legitimacy: 50, controversy: 50 },
      hedgingScore: 0,
      authorityScore: 0,
    };
  }
}

// ---------------------------------------------------------------------------
// Load cached runs from the latest completed job for a brand+model+range
// ---------------------------------------------------------------------------

interface CachedRun {
  promptId: string;
  rawResponseText: string;
  analysisJson: unknown;
}

async function loadCachedRuns(
  brandId: string,
  model: string,
): Promise<Map<string, CachedRun>> {
  const latestJob = await prisma.job.findFirst({
    where: { brandId, model, range: RANGE, status: "done" },
    orderBy: { finishedAt: "desc" },
  });
  if (!latestJob) return new Map();

  const runs = await prisma.run.findMany({
    where: { jobId: latestJob.id },
    select: {
      promptId: true,
      rawResponseText: true,
      analysisJson: true,
    },
  });

  const map = new Map<string, CachedRun>();
  for (const r of runs) {
    map.set(r.promptId, r);
  }
  console.log(
    `  Loaded ${map.size} cached runs from latest ${model} job (${latestJob.id})`,
  );
  return map;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(
    `Backfilling ${WEEKS} weeks for brand "${BRAND_SLUG}" (range=${RANGE})...\n`,
  );

  const brand = await prisma.brand.findUnique({ where: { slug: BRAND_SLUG } });
  if (!brand) {
    console.error(`Brand "${BRAND_SLUG}" not found. Create it first.`);
    process.exit(1);
  }

  const prompts = await prisma.prompt.findMany({
    orderBy: { createdAt: "asc" },
  });
  if (prompts.length === 0) {
    console.error("No prompts found. Run seed-prompts.ts first.");
    process.exit(1);
  }

  for (const model of MODELS) {
    console.log(`\n=== Model: ${model} ===\n`);

    // Load existing cached runs to reuse analysis where possible
    const cached = await loadCachedRuns(brand.id, model);

    for (let w = WEEKS; w >= 1; w--) {
      const jobDate = weekDate(w);
      const dateStr = jobDate.toISOString().slice(0, 10);

      // Check if a job already exists for this approximate date
      const dayStart = new Date(jobDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(jobDate);
      dayEnd.setHours(23, 59, 59, 999);

      const existing = await prisma.job.findFirst({
        where: {
          brandId: brand.id,
          model,
          range: RANGE,
          status: "done",
          finishedAt: { gte: dayStart, lte: dayEnd },
        },
      });

      if (existing) {
        console.log(
          `  [${dateStr}] Already exists (job ${existing.id}), skipping.`,
        );
        continue;
      }

      console.log(`  [${dateStr}] Creating job...`);

      // Create job with backdated timestamps
      const job = await prisma.job.create({
        data: {
          brandId: brand.id,
          model,
          range: RANGE,
          status: "running",
          createdAt: jobDate,
          startedAt: jobDate,
        },
      });

      let hasError = false;

      for (const prompt of prompts) {
        const originalText = prompt.text.replace(/\{brand\}/g, brand.name);
        const datedText = `As of ${dateStr}, ${originalText}`;

        try {
          // Check DB cache: reuse response + analysis if an identical query exists
          const promptTextHash = sha256(`${model}|${datedText}`);
          const cachedRow = await prisma.run.findFirst({
            where: { promptTextHash },
            select: { rawResponseText: true, analysisJson: true },
          });

          let responseText: string;
          let analysis: unknown;

          if (cachedRow) {
            responseText = cachedRow.rawResponseText;
            analysis = cachedRow.analysisJson;
            console.log(`    ⚡ "${prompt.text.slice(0, 40)}..." (cached)`);
          } else {
            // Call the real API with a dated prompt for response variety
            if (model === "chatgpt") {
              responseText = await callOpenAI(datedText);
            } else {
              responseText = await callGemini(datedText);
            }

            await sleep(DELAY_MS);

            analysis = await extractAnalysis(
              responseText,
              brand.name,
              datedText,
            );

            await sleep(DELAY_MS);
            console.log(`    ✓ "${prompt.text.slice(0, 40)}..."`);
          }

          // Save run
          const requestHash = sha256(`${job.id}|${prompt.id}|v1`);
          await prisma.run.create({
            data: {
              jobId: job.id,
              brandId: brand.id,
              promptId: prompt.id,
              model,
              requestHash,
              promptTextHash,
              rawResponseText: responseText,
              analysisJson: JSON.parse(JSON.stringify(analysis)),
              createdAt: jobDate,
            },
          });
        } catch (e) {
          console.error(
            `    ✗ "${prompt.text.slice(0, 40)}..." — ${e}`,
          );
          hasError = true;
        }
      }

      // Mark job as done with backdated finishedAt
      const finishedAt = new Date(jobDate);
      finishedAt.setMinutes(finishedAt.getMinutes() + 5);

      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: hasError ? "error" : "done",
          finishedAt,
          ...(hasError
            ? { error: "Some prompts failed during backfill" }
            : {}),
        },
      });

      console.log(
        `  [${dateStr}] Job ${job.id} → ${hasError ? "error" : "done"}`,
      );
    }
  }

  console.log("\nBackfill complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
