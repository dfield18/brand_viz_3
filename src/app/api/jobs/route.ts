import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/hash";
import { VALID_MODELS, VALID_RANGES } from "@/lib/constants";
import { extractAnalysis } from "@/lib/extractAnalysis";
import { findOrCreateBrand, isValidBrandSlug } from "@/lib/brand";
import { getEnabledPrompts } from "@/lib/promptService";
import { requireAuth } from "@/lib/auth";
import { requireBrandAccess } from "@/lib/brandAccess";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth();
  if (authError) return authError;
  const rlError = await checkRateLimit(userId, "expensive");
  if (rlError) return rlError;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { brandSlug, model, range } = body as {
    brandSlug?: string;
    model?: string;
    range?: number;
  };

  if (!brandSlug || typeof brandSlug !== "string") {
    return NextResponse.json({ error: "Missing or invalid brandSlug" }, { status: 400 });
  }
  if (!isValidBrandSlug(brandSlug)) {
    return NextResponse.json({ error: "Invalid brand slug format" }, { status: 400 });
  }
  const accessError = await requireBrandAccess(brandSlug);
  if (accessError) return accessError;
  if (!model || !VALID_MODELS.includes(model)) {
    return NextResponse.json(
      { error: `Invalid model. Must be one of: ${VALID_MODELS.join(", ")}` },
      { status: 400 },
    );
  }
  if (!range || !VALID_RANGES.includes(range)) {
    return NextResponse.json(
      { error: `Invalid range. Must be one of: ${VALID_RANGES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    // Find or create brand (handle concurrent requests gracefully)
    const brand = await findOrCreateBrand(brandSlug);
    const brandName = (brand as unknown as { displayName?: string | null }).displayName || brand.name;

    // Materialize prompts first so we have the latest templates
    const enabledPrompts = await getEnabledPrompts(brand.id);

    // Check for a recent completed job with the same brand+model+range
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const existingJob = await prisma.job.findFirst({
      where: {
        brandId: brand.id,
        model,
        range,
        status: "done",
        finishedAt: { gte: thirtyDaysAgo },
      },
      orderBy: { finishedAt: "desc" },
    });

    if (existingJob) {
      // Validate BOTH coverage and freshness before reusing
      const allRuns = await prisma.run.findMany({
        where: { jobId: existingJob.id },
        select: { id: true, rawResponseText: true, analysisJson: true, promptId: true, promptTextHash: true },
      });
      const runsByPromptId = new Map(allRuns.map((r) => [r.promptId, r]));

      let valid = true;
      for (const prompt of enabledPrompts) {
        const run = runsByPromptId.get(prompt.id);
        if (!run) {
          valid = false;
          break;
        }
        const expectedHash = sha256(`${model}|${prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`)}`);
        if (run.promptTextHash !== expectedHash) {
          valid = false;
          break;
        }
      }

      if (!valid) {
        const job = await prisma.job.create({
          data: { brandId: brand.id, model, range, status: "queued" },
        });
        return NextResponse.json(
          { jobId: job.id, brandId: brand.id, status: job.status },
          { status: 201 },
        );
      }

      // Backfill: if cached runs lack analysisJson, extract from existing raw responses
      const runsToBackfill = allRuns.filter((r) => r.analysisJson === null);

      if (runsToBackfill.length > 0) {
        const promptMap = new Map(enabledPrompts.map((p) => [p.id, p.text]));

        await Promise.all(
          runsToBackfill.map(async (run) => {
            const promptText = (promptMap.get(run.promptId) ?? "").replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`);
            const analysis = await extractAnalysis(run.rawResponseText, brand.name, promptText, brand.category ?? undefined);
            await prisma.run.update({
              where: { id: run.id },
              data: { analysisJson: JSON.parse(JSON.stringify(analysis)) },
            });
          }),
        );
      }

      return NextResponse.json(
        { jobId: existingJob.id, brandId: brand.id, status: existingJob.status, cached: true },
        { status: 200 },
      );
    }

    const job = await prisma.job.create({
      data: {
        brandId: brand.id,
        model,
        range,
        status: "queued",
      },
    });

    return NextResponse.json(
      { jobId: job.id, brandId: brand.id, status: job.status },
      { status: 201 },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const code = typeof err === "object" && err !== null && "code" in err ? (err as { code: string }).code : undefined;

    // Surface connection errors clearly
    if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || message.includes("connect")) {
      console.error("[POST /api/jobs] Database connection failed:", code, message);
      return NextResponse.json(
        { error: "Unable to connect to the database. Please try again in a moment." },
        { status: 503 },
      );
    }

    console.error("[POST /api/jobs] Unexpected error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 },
    );
  }
}
