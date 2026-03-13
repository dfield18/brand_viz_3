import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchBrandRuns, formatJobMeta } from "@/lib/apiPipeline";
import {
  computeTopicRows,
  computeTopicOwnership,
  detectEmergingTopics,
  computeTopicImportance,
  computeTopicTrend,
  computeTopicProminence,
  computeTopicPromptExamples,
  computeTopicFragmentation,
  type TopicMetricInput,
  type RunPromptInfo,
} from "@/lib/topics/topicRollups";
import { TOPIC_TAXONOMY } from "@/lib/topics/topicTaxonomy";
import type { TopicModelSplitRow } from "@/types/api";

const TOPIC_LABEL_MAP: Record<string, string> = {};
for (const t of TOPIC_TAXONOMY) {
  TOPIC_LABEL_MAP[t.key] = t.label;
}

function topicLabel(key: string): string {
  return TOPIC_LABEL_MAP[key] ?? key;
}

export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }
  const model = req.nextUrl.searchParams.get("model") ?? "";
  const viewRange = parseInt(req.nextUrl.searchParams.get("range") ?? "90", 10);

  type MinimalRun = { id: string; model: string; promptId: string; createdAt: Date };
  const result = await fetchBrandRuns<MinimalRun>({
    brandSlug,
    model,
    viewRange,
    runQuery: { select: { id: true, model: true, promptId: true, createdAt: true } },
  });
  if (!result.ok) return result.response;
  const { brand, job, runs, rangeCutoff } = result;

  try {
    const runIds = runs.map((r) => r.id);
    const totalResponses = runIds.length;

    if (totalResponses === 0) {
      return NextResponse.json({ hasData: false, reason: "no_runs_in_range" });
    }

    // Get prompt topicKey mapping + text + cluster (industry prompts only)
    const promptIds = [...new Set(runs.map((r) => r.promptId))];
    const prompts = await prisma.prompt.findMany({
      where: { id: { in: promptIds }, topicKey: { not: null }, cluster: "industry" },
      select: { id: true, topicKey: true, text: true, cluster: true },
    });
    const promptTopicMap = new Map(prompts.map((p) => [p.id, p.topicKey!]));
    const promptTextMap = new Map(prompts.map((p) => [p.id, p.text]));
    const promptClusterMap = new Map(prompts.map((p) => [p.id, p.cluster ?? ""]));
    const classifiedPromptIds = new Set(prompts.map((p) => p.id));

    // Filter to runs with classified prompts
    const classifiedRuns = runs.filter((r) => classifiedPromptIds.has(r.promptId));
    const classifiedRunIds = classifiedRuns.map((r) => r.id);

    if (classifiedRunIds.length === 0) {
      return NextResponse.json({
        hasData: false,
        reason: "no_classified_prompts",
        hint: "Run the backfill script to classify existing prompts.",
      });
    }

    // Bulk query EntityResponseMetric
    const metrics = await prisma.entityResponseMetric.findMany({
      where: { runId: { in: classifiedRunIds } },
      select: {
        runId: true,
        entityId: true,
        model: true,
        promptId: true,
        prominenceScore: true,
        rankPosition: true,
      },
    });

    // Map to TopicMetricInput
    const runDateMap = new Map(runs.map((r) => [r.id, r.createdAt]));
    const topicMetrics: TopicMetricInput[] = metrics
      .filter((m) => promptTopicMap.has(m.promptId))
      .map((m) => ({
        runId: m.runId,
        promptId: m.promptId,
        topicKey: promptTopicMap.get(m.promptId)!,
        entityId: m.entityId,
        model: m.model,
        prominenceScore: m.prominenceScore,
        rankPosition: m.rankPosition,
        createdAt: runDateMap.get(m.runId) ?? new Date(),
      }));

    // Total responses per topic
    const totalResponsesByTopic = new Map<string, number>();
    for (const run of runs) {
      const tk = promptTopicMap.get(run.promptId);
      if (tk) {
        totalResponsesByTopic.set(tk, (totalResponsesByTopic.get(tk) ?? 0) + 1);
      }
    }

    // Run date strings for trend
    const runDateStrings = new Map<string, string>();
    for (const run of runs) {
      runDateStrings.set(run.id, run.createdAt.toISOString().slice(0, 10));
    }

    // RunPromptInfo for prompt examples
    const runPromptInfos: RunPromptInfo[] = classifiedRuns.map((r) => ({
      runId: r.id,
      promptId: r.promptId,
      promptText: promptTextMap.get(r.promptId) ?? "",
      model: r.model,
      cluster: promptClusterMap.get(r.promptId) ?? "",
      topicKey: promptTopicMap.get(r.promptId)!,
    }));

    // Compute all rollups
    const topics = computeTopicRows(topicMetrics, brand.slug, totalResponsesByTopic);
    const ownership = computeTopicOwnership(topicMetrics, brand.slug);

    // Emerging: split at midpoint
    const midpoint = new Date(
      rangeCutoff.getTime() + (Date.now() - rangeCutoff.getTime()) / 2,
    );
    const emerging = detectEmergingTopics(topicMetrics, brand.slug, midpoint, promptTextMap);

    // New computations
    const importance = computeTopicImportance(totalResponsesByTopic, totalResponses);
    const trend = computeTopicTrend(topicMetrics, brand.slug, totalResponsesByTopic, runDateStrings);
    const prominence = computeTopicProminence(topicMetrics, brand.slug);
    const promptExamples = computeTopicPromptExamples(topicMetrics, brand.slug, runPromptInfos);
    const fragmentation = computeTopicFragmentation(topicMetrics);

    // Model Split
    const modelsIncluded = [...new Set(runs.map((r) => r.model))];
    const modelSplit: TopicModelSplitRow[] = modelsIncluded.map((modelId) => {
      const modelRunIds = new Set(
        runs.filter((r) => r.model === modelId).map((r) => r.id),
      );
      const modelMetrics = topicMetrics.filter((m) => modelRunIds.has(m.runId));
      const brandModelMetrics = modelMetrics.filter(
        (m) => m.entityId === brand.slug && m.prominenceScore > 0,
      );

      const byTopic = new Map<string, typeof brandModelMetrics>();
      for (const m of brandModelMetrics) {
        const arr = byTopic.get(m.topicKey) ?? [];
        arr.push(m);
        byTopic.set(m.topicKey, arr);
      }

      const modelTotalByTopic = new Map<string, number>();
      for (const run of runs) {
        if (run.model !== modelId) continue;
        const tk = promptTopicMap.get(run.promptId);
        if (tk) {
          modelTotalByTopic.set(tk, (modelTotalByTopic.get(tk) ?? 0) + 1);
        }
      }

      const topicEntries = [...byTopic.entries()].map(([key, ms]) => {
        const total = modelTotalByTopic.get(key) ?? ms.length;
        const validRanks = ms
          .map((m) => m.rankPosition)
          .filter((r): r is number => r !== null);
        return {
          topicKey: key,
          topicLabel: topicLabel(key),
          mentionRate: total > 0 ? Math.round((ms.length / total) * 100) : 0,
          avgRank: validRanks.length > 0
            ? Math.round((validRanks.reduce((s, r) => s + r, 0) / validRanks.length) * 100) / 100
            : null,
        };
      });

      return { model: modelId, topics: topicEntries };
    });

    return NextResponse.json({
      hasData: true,
      job: formatJobMeta(job!),
      topics: {
        scope: {
          totalResponses,
          modelsIncluded,
          topicsClassified: classifiedPromptIds.size,
          unclassifiedPrompts: promptIds.length - classifiedPromptIds.size,
        },
        topics,
        ownership,
        emerging,
        modelSplit,
        importance,
        trend,
        prominence,
        promptExamples,
        fragmentation,
      },
      totals: { totalRuns: totalResponses },
    }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Topics API error:", message);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
