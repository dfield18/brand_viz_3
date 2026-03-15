import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VALID_MODELS, VALID_RANGES } from "@/lib/constants";
import { parseAnalysis } from "@/lib/aggregateAnalysis";
import { computeBrandRank } from "@/lib/visibility/brandMention";
import {
  decomposeKpi,
  type DecomposedRun,
  type KpiKey,
  type DecompositionResult,
} from "@/lib/driverDecomposition";

const VALID_KPIS: KpiKey[] = ["mentionRate", "avgProminence", "firstMentionRate", "avgRank", "shareOfVoice"];

export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  const model = req.nextUrl.searchParams.get("model");
  const rangeParam = req.nextUrl.searchParams.get("range");

  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }
  if (!model || (model !== "all" && !VALID_MODELS.includes(model))) {
    return NextResponse.json({ error: "Invalid model" }, { status: 400 });
  }
  const range = parseInt(rangeParam ?? "", 10);
  if (!VALID_RANGES.includes(range)) {
    return NextResponse.json({ error: "Invalid range" }, { status: 400 });
  }

  const maybeBrand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
  if (!maybeBrand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }
  const brand = maybeBrand;
  const brandAliases = brand.aliases?.length ? brand.aliases : undefined;

  const isAll = model === "all";
  const modelFilter = isAll ? {} : { model };

  // Compare the two most recent distinct data-point dates (month-over-month)
  const now = new Date();
  const DAY = 86_400_000;
  const lookback = Math.max(range, 90); // look back far enough to find 2 dates

  const runSelect = {
    model: true,
    rawResponseText: true,
    analysisJson: true,
    createdAt: true,
    prompt: { select: { cluster: true, topicKey: true } },
  } as const;

  const recentRuns = await prisma.run.findMany({
    where: {
      brandId: brand.id,
      ...modelFilter,
      createdAt: { gte: new Date(now.getTime() - lookback * DAY), lte: now },
      job: { status: "done" },
    },
    select: runSelect,
    orderBy: { createdAt: "desc" },
  });

  // Group by date string to find distinct dates
  const byDate = new Map<string, typeof recentRuns>();
  for (const r of recentRuns) {
    const dateKey = r.createdAt.toISOString().slice(0, 10);
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(r);
  }

  const sortedDates = [...byDate.keys()].sort().reverse(); // most recent first
  const currentRawRuns = sortedDates.length >= 1 ? byDate.get(sortedDates[0])! : [];
  const previousRawRuns = sortedDates.length >= 2 ? byDate.get(sortedDates[1])! : [];

  let currentStart = now;
  let previousStart = new Date(now.getTime() - 30 * DAY);
  let previousEnd = previousStart;
  if (sortedDates.length >= 2) {
    currentStart = new Date(sortedDates[0] + "T00:00:00Z");
    previousStart = new Date(sortedDates[1] + "T00:00:00Z");
    previousEnd = new Date(sortedDates[1] + "T23:59:59Z");
  }

  function toDecomposed(
    runs: typeof currentRawRuns,
  ): DecomposedRun[] {
    return runs
      .filter((r) => !r.rawResponseText.startsWith("[stub:"))
      .map((r) => {
        const analysis = parseAnalysis(r.analysisJson);
        return {
          model: r.model,
          cluster: r.prompt.cluster,
          topic: r.prompt.topicKey ?? "other",
          brandMentioned: analysis?.brandMentioned ?? false,
          brandMentionStrength: analysis?.brandMentionStrength ?? 0,
          rank: computeBrandRank(
            r.rawResponseText,
            brand.name,
            brand.slug,
            r.analysisJson,
            brandAliases,
          ),
          competitorCount: analysis?.competitors?.length ?? 0,
        };
      });
  }

  const currentRuns = toDecomposed(currentRawRuns);
  const previousRuns = toDecomposed(previousRawRuns);

  const periodCurrent = `${currentStart.toISOString().slice(0, 10)} to ${now.toISOString().slice(0, 10)}`;
  const periodPrevious = `${previousStart.toISOString().slice(0, 10)} to ${previousEnd.toISOString().slice(0, 10)}`;

  // If insufficient data for either window, return low-confidence fallback
  if (currentRuns.length < 2 || previousRuns.length < 2) {
    return NextResponse.json({
      hasData: false,
      reason: "insufficient_data",
      hint: "Need at least 2 runs in both current and previous periods for decomposition.",
      currentRunCount: currentRuns.length,
      previousRunCount: previousRuns.length,
    });
  }

  const decompositions: DecompositionResult[] = VALID_KPIS.map((kpi) =>
    decomposeKpi(currentRuns, previousRuns, kpi, periodCurrent, periodPrevious),
  );

  return NextResponse.json({
    hasData: true,
    range,
    model,
    currentRunCount: currentRuns.length,
    previousRunCount: previousRuns.length,
    periodCurrent,
    periodPrevious,
    decompositions,
  }, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
  });
}
