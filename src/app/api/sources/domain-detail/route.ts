import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchBrandRuns } from "@/lib/apiPipeline";

export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  const domain = req.nextUrl.searchParams.get("domain");
  if (!brandSlug || !domain) {
    return NextResponse.json({ error: "Missing brandSlug or domain" }, { status: 400 });
  }
  const model = req.nextUrl.searchParams.get("model") ?? "";
  const viewRange = parseInt(req.nextUrl.searchParams.get("range") ?? "90", 10);

  type MinimalRun = { id: string; model: string; promptId: string; createdAt: Date };
  const result = await fetchBrandRuns<MinimalRun>({
    brandSlug,
    model,
    viewRange,
    runQuery: { select: { id: true, model: true, promptId: true, createdAt: true } },
    skipJobCheck: true,
  });
  if (!result.ok) return result.response;
  const { brand, runs } = result;

  try {
    // Find the Source record for this domain
    const source = await prisma.source.findUnique({ where: { domain } });
    if (!source) {
      return NextResponse.json({ domain, examples: [], totalOccurrences: 0 });
    }

    const runIds = runs.map((r) => r.id);

    if (runIds.length === 0) {
      return NextResponse.json({ domain, examples: [], totalOccurrences: 0 });
    }

    // Query occurrences for this domain within valid runs
    const occurrences = await prisma.sourceOccurrence.findMany({
      where: { sourceId: source.id, runId: { in: runIds } },
      select: {
        runId: true,
        entityId: true,
        normalizedUrl: true,
        model: true,
        positionIndex: true,
        run: {
          select: {
            rawResponseText: true,
            createdAt: true,
            prompt: { select: { text: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const totalOccurrences = occurrences.length;

    // Get brand metrics for prominence/rank context
    const metricRunIds = [...new Set(occurrences.map((o) => o.runId))];
    const brandMetrics = await prisma.entityResponseMetric.findMany({
      where: { runId: { in: metricRunIds }, entityId: brand.slug },
      select: { runId: true, prominenceScore: true, rankPosition: true },
    });
    const metricByRun = new Map(brandMetrics.map((m) => [m.runId, m]));

    // Build examples (limit to 10)
    const examples = occurrences.slice(0, 10).map((o) => {
      const metric = metricByRun.get(o.runId);
      const responseText = o.run.rawResponseText;

      // Extract ±200 char excerpt around the URL position
      const pos = o.positionIndex;
      const start = Math.max(0, pos - 200);
      const end = Math.min(responseText.length, pos + 200);
      let excerpt = responseText.slice(start, end);
      if (start > 0) excerpt = "..." + excerpt;
      if (end < responseText.length) excerpt = excerpt + "...";

      return {
        promptText: o.run.prompt.text,
        responseExcerpt: excerpt,
        model: o.model,
        entityId: o.entityId,
        normalizedUrl: o.normalizedUrl,
        brandProminence: metric?.prominenceScore ?? null,
        brandRank: metric?.rankPosition ?? null,
        createdAt: o.run.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ domain, examples, totalOccurrences }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Domain detail API error:", message);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
