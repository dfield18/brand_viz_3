import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchBrandRuns, formatJobMeta } from "@/lib/apiPipeline";
import { requireBrandAccess, brandCacheControl } from "@/lib/brandAccess";
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
import { classifyPromptTopicDynamic } from "@/lib/topics/extractTopic";
import type { TopicModelSplitRow } from "@/types/api";
import { buildEntityDisplayNames, expandPromptPlaceholders } from "@/lib/utils";
import { normalizeEntityIds } from "@/lib/competition/normalizeEntities";
import { computeBrandRank } from "@/lib/visibility/brandMention";
import { filterRunsToBrandQueryUniverse, buildBrandIdentity } from "@/lib/visibility/brandScope";

const TOPIC_LABEL_MAP: Record<string, string> = {};
for (const t of TOPIC_TAXONOMY) {
  TOPIC_LABEL_MAP[t.key] = t.label;
}

function topicLabel(key: string): string {
  if (TOPIC_LABEL_MAP[key]) return TOPIC_LABEL_MAP[key];
  // Title-case dynamic snake_case keys
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }
  const access = await requireBrandAccess(brandSlug);
  if (access) return access;
  const model = req.nextUrl.searchParams.get("model") ?? "";
  const viewRange = parseInt(req.nextUrl.searchParams.get("range") ?? "90", 10);

  type MinimalRun = { id: string; model: string; promptId: string; createdAt: Date; analysisJson: unknown; rawResponseText: string };
  const result = await fetchBrandRuns<MinimalRun>({
    brandSlug,
    model,
    viewRange,
    runQuery: { select: { id: true, model: true, promptId: true, createdAt: true, analysisJson: true, rawResponseText: true } },
  });
  if (!result.ok) return result.response;
  const { brand, job, runs: rawRuns, rangeCutoff } = result;
  const runs = filterRunsToBrandQueryUniverse(rawRuns, buildBrandIdentity(brand));

  try {
    const runIds = runs.map((r) => r.id);
    const totalResponses = runIds.length;

    if (totalResponses === 0) {
      return NextResponse.json({ hasData: false, reason: "no_runs_in_range" });
    }

    // Get prompt topicKey mapping + text + cluster (industry prompts only)
    const promptIds = [...new Set(runs.map((r) => r.promptId))];
    const prompts = await prisma.prompt.findMany({
      where: { id: { in: promptIds }, cluster: "industry" },
      select: { id: true, topicKey: true, text: true, cluster: true },
    });

    // Classify prompts that have no topicKey yet
    const unclassified = prompts.filter((p) => !p.topicKey);
    if (unclassified.length > 0) {
      await Promise.all(
        unclassified.map(async (p) => {
          try {
            const { topicKey } = await classifyPromptTopicDynamic(p.text, brand.name);
            await prisma.prompt.update({ where: { id: p.id }, data: { topicKey } });
            p.topicKey = topicKey;
          } catch { /* leave null */ }
        }),
      );
    }
    // Reclassify prompts stuck on "other" using GPT dynamic classification
    const otherPrompts = prompts.filter((p) => p.topicKey === "other");
    if (otherPrompts.length > 0) {
      const reclassified = await Promise.all(
        otherPrompts.map(async (p) => {
          try {
            const { topicKey } = await classifyPromptTopicDynamic(p.text, brand.name);
            if (topicKey !== "other") {
              await prisma.prompt.update({ where: { id: p.id }, data: { topicKey } });
              return { id: p.id, topicKey };
            }
          } catch { /* keep existing */ }
          return null;
        }),
      );
      for (const r of reclassified) {
        if (r) {
          const prompt = prompts.find((p) => p.id === r.id);
          if (prompt) prompt.topicKey = r.topicKey;
        }
      }
    }

    const classifiedPrompts = prompts.filter((p) => p.topicKey);
    const promptTopicMap = new Map(classifiedPrompts.map((p) => [p.id, p.topicKey!]));
    const brandName = brand.displayName || brand.name;
    const promptTextMap = new Map(classifiedPrompts.map((p) => [p.id, expandPromptPlaceholders(p.text, { brandName, industry: brand.industry })]));
    const promptClusterMap = new Map(classifiedPrompts.map((p) => [p.id, p.cluster ?? ""]));
    const classifiedPromptIds = new Set(classifiedPrompts.map((p) => p.id));

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

    // Bulk query EntityResponseMetric (for entity detection)
    const rawMetrics = await prisma.entityResponseMetric.findMany({
      where: { runId: { in: classifiedRunIds } },
      select: {
        runId: true,
        entityId: true,
        model: true,
        promptId: true,
        rankPosition: true,
      },
    });

    // Compute text-order ranks for brand (consistent with other tabs)
    const brandAliases = brand.aliases?.length ? brand.aliases : undefined;
    const brandTextRanks = new Map<string, number | null>();
    for (const r of runs) {
      brandTextRanks.set(r.id, computeBrandRank(r.rawResponseText, brand.name, brand.slug, r.analysisJson, brandAliases));
    }

    // Map to TopicMetricInput, replacing brand's rankPosition with text-order
    const runDateMap = new Map(runs.map((r) => [r.id, r.createdAt]));
    const topicMetrics: TopicMetricInput[] = rawMetrics
      .filter((m) => promptTopicMap.has(m.promptId))
      .map((m) => ({
        runId: m.runId,
        promptId: m.promptId,
        topicKey: promptTopicMap.get(m.promptId)!,
        entityId: m.entityId,
        model: m.model,
        rankPosition: m.entityId === brand.slug ? (brandTextRanks.get(m.runId) ?? null) : m.rankPosition,
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

    // Build display name map from original GPT-extracted competitor names
    const entityDisplayNames = buildEntityDisplayNames(runs);
    // Ensure the searched brand uses its proper display name
    const brandDisplayName = (brand as unknown as { displayName?: string | null }).displayName || brand.name;
    entityDisplayNames.set(brand.slug, brandDisplayName);

    // Normalize entity IDs: merge duplicates (same as competition API)
    const allEntityIds = [...new Set(topicMetrics.map((m) => m.entityId))].filter((id) => id !== brand.slug);
    const aliasMap = await normalizeEntityIds(allEntityIds, brand.slug);
    aliasMap.set(brand.slug, brand.slug);
    // Apply normalization to topicMetrics in-place
    for (const m of topicMetrics) {
      m.entityId = aliasMap.get(m.entityId) ?? m.entityId;
    }
    // Update display names for canonical IDs
    for (const [entityId, canonical] of aliasMap) {
      if (entityId !== canonical && !entityDisplayNames.has(canonical)) {
        const aliasName = entityDisplayNames.get(entityId);
        if (aliasName) entityDisplayNames.set(canonical, aliasName);
      }
    }

    // Compute all rollups
    const topics = computeTopicRows(topicMetrics, brand.slug, totalResponsesByTopic, entityDisplayNames);
    const ownership = computeTopicOwnership(topicMetrics, brand.slug, entityDisplayNames);

    // Emerging: split at midpoint
    const midpoint = new Date(
      rangeCutoff.getTime() + (Date.now() - rangeCutoff.getTime()) / 2,
    );
    const emerging = detectEmergingTopics(topicMetrics, brand.slug, midpoint, promptTextMap);

    // New computations
    const importance = computeTopicImportance(totalResponsesByTopic, totalResponses);
    const trend = computeTopicTrend(topicMetrics, brand.slug, totalResponsesByTopic, runDateStrings);
    const prominence = computeTopicProminence(topicMetrics, brand.slug);
    const promptExamples = computeTopicPromptExamples(topicMetrics, brand.slug, runPromptInfos, entityDisplayNames);
    const fragmentation = computeTopicFragmentation(topicMetrics, entityDisplayNames);

    // Model Split
    const modelsIncluded = [...new Set(runs.map((r) => r.model))];
    const modelSplit: TopicModelSplitRow[] = modelsIncluded.map((modelId) => {
      const modelRunIds = new Set(
        runs.filter((r) => r.model === modelId).map((r) => r.id),
      );
      const modelMetrics = topicMetrics.filter((m) => modelRunIds.has(m.runId));
      const brandModelMetrics = modelMetrics.filter(
        (m) => m.entityId === brand.slug,
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
      headers: { "Cache-Control": brandCacheControl(brandSlug) },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Topics API error:", message);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
