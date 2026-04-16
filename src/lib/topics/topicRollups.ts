/**
 * Pure computation functions for topic metrics.
 * No database access — all functions take data in, return results out.
 */

import type {
  TopicRow,
  TopicOwnershipRow,
  EmergingTopic,
  TopicImportanceRow,
  TopicTrendPoint,
  TopicProminenceRow,
  TopicPromptExample,
  TopicFragmentationRow,
} from "@/types/api";
import { TOPIC_TAXONOMY } from "./topicTaxonomy";
import { resolveEntityName } from "@/lib/utils";

export interface TopicMetricInput {
  runId: string;
  promptId: string;
  topicKey: string;
  entityId: string;
  model: string;
  rankPosition: number | null;
  createdAt: Date;
}

/** Extra per-run info needed for prompt examples. */
export interface RunPromptInfo {
  runId: string;
  promptId: string;
  promptText: string;
  model: string;
  cluster: string;
  topicKey: string;
}

/** Resolve a topic key to a human label — supports both static taxonomy and dynamic GPT-generated keys */
function topicLabel(key: string, dynamicLabels?: Map<string, string>): string {
  // Check dynamic labels first (from prompt-level storage)
  if (dynamicLabels?.has(key)) return dynamicLabels.get(key)!;
  // Then static taxonomy
  const found = TOPIC_TAXONOMY.find((t) => t.key === key);
  if (found) return found.label;
  // Fall back to title-casing the snake_case key
  return key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// 1. Topic Importance
// ---------------------------------------------------------------------------

export function computeTopicImportance(
  totalResponsesByTopic: Map<string, number>,
  totalResponses: number,
): TopicImportanceRow[] {
  const rows: TopicImportanceRow[] = [];
  for (const [key, count] of totalResponsesByTopic) {
    rows.push({
      topicKey: key,
      topicLabel: topicLabel(key),
      importanceRate: totalResponses > 0
        ? Math.round((count / totalResponses) * 10000) / 100
        : 0,
      nPrompts: count,
      nResponses: totalResponses,
    });
  }
  return rows.sort((a, b) => b.importanceRate - a.importanceRate);
}

// ---------------------------------------------------------------------------
// 2. Topic Rows (with baseline context)
// ---------------------------------------------------------------------------

export function computeTopicRows(
  metrics: TopicMetricInput[],
  brandEntityId: string,
  totalResponsesByTopic: Map<string, number>,
  entityDisplayNames?: Map<string, string>,
): TopicRow[] {
  const brandMetrics = metrics.filter(
    (m) => m.entityId === brandEntityId,
  );

  // Group brand metrics by topicKey
  const byTopic = new Map<string, TopicMetricInput[]>();
  for (const m of brandMetrics) {
    const arr = byTopic.get(m.topicKey) ?? [];
    arr.push(m);
    byTopic.set(m.topicKey, arr);
  }

  // Count distinct prompts per topic (all entities)
  const promptsByTopic = new Map<string, Set<string>>();
  for (const m of metrics) {
    const set = promptsByTopic.get(m.topicKey) ?? new Set();
    set.add(m.promptId);
    promptsByTopic.set(m.topicKey, set);
  }

  // Compute per-entity per-topic mention counts (for baselines)
  const entityTopicMentions = new Map<string, Map<string, number>>();
  for (const m of metrics) {
    const topicMap = entityTopicMentions.get(m.topicKey) ?? new Map<string, number>();
    topicMap.set(m.entityId, (topicMap.get(m.entityId) ?? 0) + 1);
    entityTopicMentions.set(m.topicKey, topicMap);
  }

  const rows: TopicRow[] = [];

  for (const [key, topicMetrics] of byTopic) {
    const mentions = topicMetrics.length;
    const totalResponses = totalResponsesByTopic.get(key) ?? mentions;
    const validRanks = topicMetrics
      .map((m) => m.rankPosition)
      .filter((r): r is number => r !== null);

    // Category avg: average mention rate across all tracked entities in this topic
    const entityMap = entityTopicMentions.get(key) ?? new Map<string, number>();
    const entityRates = [...entityMap.values()].map((c) =>
      totalResponses > 0 ? (c / totalResponses) * 100 : 0,
    );
    const categoryAvg = entityRates.length > 0
      ? Math.round((entityRates.reduce((s, r) => s + r, 0) / entityRates.length) * 100) / 100
      : 0;

    // Leader: entity with highest mention rate in this topic
    let leaderName = "";
    let leaderRate = 0;
    for (const [entityId, count] of entityMap) {
      const rate = totalResponses > 0 ? (count / totalResponses) * 100 : 0;
      if (rate > leaderRate) {
        leaderRate = rate;
        leaderName = resolveEntityName(entityId, entityDisplayNames ?? new Map());
      }
    }

    rows.push({
      topicKey: key,
      topicLabel: topicLabel(key),
      promptCount: promptsByTopic.get(key)?.size ?? 0,
      mentionCount: mentions,
      mentionRate: totalResponses > 0
        ? Math.round((mentions / totalResponses) * 100)
        : 0,
      avgRank: validRanks.length > 0
        ? Math.round((validRanks.reduce((s, r) => s + r, 0) / validRanks.length) * 100) / 100
        : null,
      rank1Rate: validRanks.length > 0
        ? Math.round((validRanks.filter((r) => r === 1).length / validRanks.length) * 100)
        : 0,
      categoryAvgMentionRate: categoryAvg,
      leaderMentionRate: Math.round(leaderRate * 100) / 100,
      leaderName,
    });
  }

  return rows.sort((a, b) => b.mentionRate - a.mentionRate);
}

// ---------------------------------------------------------------------------
// 3. Topic Ownership
// ---------------------------------------------------------------------------

export function computeTopicOwnership(
  metrics: TopicMetricInput[],
  brandEntityId: string,
  entityDisplayNames?: Map<string, string>,
): TopicOwnershipRow[] {
  const byTopic = new Map<string, TopicMetricInput[]>();
  for (const m of metrics) {
    const arr = byTopic.get(m.topicKey) ?? [];
    arr.push(m);
    byTopic.set(m.topicKey, arr);
  }

  const rows: TopicOwnershipRow[] = [];

  for (const [key, topicMetrics] of byTopic) {
    const entityAppearances = new Map<string, number>();
    for (const m of topicMetrics) {
      entityAppearances.set(m.entityId, (entityAppearances.get(m.entityId) ?? 0) + 1);
    }

    const totalAppearances = topicMetrics.length;
    let leaderId = "";
    let leaderCount = 0;
    for (const [entityId, count] of entityAppearances) {
      if (count > leaderCount) {
        leaderCount = count;
        leaderId = entityId;
      }
    }

    const brandCount = entityAppearances.get(brandEntityId) ?? 0;
    const sorted = [...entityAppearances.entries()].sort((a, b) => b[1] - a[1]);
    const brandIdx = sorted.findIndex(([id]) => id === brandEntityId);

    rows.push({
      topicKey: key,
      topicLabel: topicLabel(key),
      leaderEntityId: leaderId,
      leaderName: resolveEntityName(leaderId, entityDisplayNames ?? new Map()),
      leaderMentionShare: totalAppearances > 0
        ? Math.round((leaderCount / totalAppearances) * 10000) / 100
        : 0,
      brandMentionShare: totalAppearances > 0
        ? Math.round((brandCount / totalAppearances) * 10000) / 100
        : 0,
      brandRank: brandIdx >= 0 ? brandIdx + 1 : null,
    });
  }

  return rows.sort((a, b) => b.leaderMentionShare - a.leaderMentionShare);
}

// ---------------------------------------------------------------------------
// 4. Emerging Topics (enhanced with confidence + sample prompts)
// ---------------------------------------------------------------------------

export function detectEmergingTopics(
  metrics: TopicMetricInput[],
  brandEntityId: string,
  midpointDate: Date,
  promptTexts: Map<string, string>,
): EmergingTopic[] {
  const brandMetrics = metrics.filter(
    (m) => m.entityId === brandEntityId,
  );

  const current = brandMetrics.filter((m) => m.createdAt >= midpointDate);
  const previous = brandMetrics.filter((m) => m.createdAt < midpointDate);

  const currentByTopic = countByTopic(current);
  const previousByTopic = countByTopic(previous);

  // Collect prompt IDs per topic from current period for sample prompts
  const promptsByTopic = new Map<string, Set<string>>();
  for (const m of current) {
    const set = promptsByTopic.get(m.topicKey) ?? new Set();
    set.add(m.promptId);
    promptsByTopic.set(m.topicKey, set);
  }

  const allKeys = new Set([...currentByTopic.keys(), ...previousByTopic.keys()]);
  const results: EmergingTopic[] = [];

  for (const key of allKeys) {
    const cur = currentByTopic.get(key) ?? 0;
    const prev = previousByTopic.get(key) ?? 0;

    if (cur < 2) continue;

    const growthRate = prev > 0
      ? Math.round(((cur - prev) / prev) * 100)
      : 100;

    if (growthRate >= 25) {
      // Confidence heuristic
      const confidence: "Low" | "Medium" | "High" =
        cur >= 8 ? "High" : cur >= 4 ? "Medium" : "Low";

      // Sample prompts (up to 3)
      const topicPromptIds = promptsByTopic.get(key) ?? new Set();
      const samplePrompts: string[] = [];
      for (const pid of topicPromptIds) {
        const text = promptTexts.get(pid);
        if (text) samplePrompts.push(text);
        if (samplePrompts.length >= 3) break;
      }

      results.push({
        topicKey: key,
        topicLabel: topicLabel(key),
        currentMentions: cur,
        previousMentions: prev,
        growthRate,
        confidence,
        samplePrompts,
      });
    }
  }

  return results.sort((a, b) => b.growthRate - a.growthRate);
}

// ---------------------------------------------------------------------------
// 5. Topic Visibility Trend
// ---------------------------------------------------------------------------

export function computeTopicTrend(
  metrics: TopicMetricInput[],
  brandEntityId: string,
  totalResponsesByTopic: Map<string, number>,
  runDates: Map<string, string>, // runId → "YYYY-MM-DD"
): TopicTrendPoint[] {
  // Group metrics by date
  const byDate = new Map<string, TopicMetricInput[]>();
  for (const m of metrics) {
    const date = runDates.get(m.runId);
    if (!date) continue;
    const arr = byDate.get(date) ?? [];
    arr.push(m);
    byDate.set(date, arr);
  }

  const dates = [...byDate.keys()].sort();
  if (dates.length < 2) return [];

  return dates.map((date) => {
    const dayMetrics = byDate.get(date)!;
    const brandDay = dayMetrics.filter(
      (m) => m.entityId === brandEntityId,
    );

    // Count total runs per topic for this date
    const dayRunsByTopic = new Map<string, Set<string>>();
    for (const m of dayMetrics) {
      const set = dayRunsByTopic.get(m.topicKey) ?? new Set();
      set.add(m.runId);
      dayRunsByTopic.set(m.topicKey, set);
    }

    // Count brand mentions per topic
    const brandByTopic = new Map<string, number>();
    for (const m of brandDay) {
      brandByTopic.set(m.topicKey, (brandByTopic.get(m.topicKey) ?? 0) + 1);
    }

    const values: Record<string, number> = {};
    for (const [topicKey, count] of brandByTopic) {
      const total = dayRunsByTopic.get(topicKey)?.size ?? count;
      values[topicKey] = total > 0 ? Math.round((count / total) * 10000) / 100 : 0;
    }

    return {
      date,
      values,
      sampleSize: new Set(dayMetrics.map((m) => m.runId)).size,
    };
  });
}

// ---------------------------------------------------------------------------
// 6. Topic Prominence
// ---------------------------------------------------------------------------

export function computeTopicProminence(
  metrics: TopicMetricInput[],
  brandEntityId: string,
): TopicProminenceRow[] {
  const brandMetrics = metrics.filter(
    (m) => m.entityId === brandEntityId,
  );

  // Group by topic
  const byTopic = new Map<string, TopicMetricInput[]>();
  for (const m of brandMetrics) {
    const arr = byTopic.get(m.topicKey) ?? [];
    arr.push(m);
    byTopic.set(m.topicKey, arr);
  }

  // Total mentions per topic across all entities (for share)
  const totalMentionsByTopic = new Map<string, number>();
  for (const m of metrics) {
    totalMentionsByTopic.set(
      m.topicKey,
      (totalMentionsByTopic.get(m.topicKey) ?? 0) + 1,
    );
  }

  const rows: TopicProminenceRow[] = [];

  for (const [key, topicMetrics] of byTopic) {
    const brandCount = topicMetrics.length;
    const totalAll = totalMentionsByTopic.get(key) ?? brandCount;

    rows.push({
      topicKey: key,
      topicLabel: topicLabel(key),
      nMentions: brandCount,
      mentionShare: totalAll > 0
        ? Math.round((brandCount / totalAll) * 10000) / 100
        : 0,
    });
  }

  return rows.sort((a, b) => b.mentionShare - a.mentionShare);
}

// ---------------------------------------------------------------------------
// 7. Topic Prompt Examples
// ---------------------------------------------------------------------------

export function computeTopicPromptExamples(
  metrics: TopicMetricInput[],
  brandEntityId: string,
  runPromptInfo: RunPromptInfo[],
  entityDisplayNames?: Map<string, string>,
): TopicPromptExample[] {
  // Build a map: runId → metrics for that run
  const metricsByRun = new Map<string, TopicMetricInput[]>();
  for (const m of metrics) {
    const arr = metricsByRun.get(m.runId) ?? [];
    arr.push(m);
    metricsByRun.set(m.runId, arr);
  }

  const examples: TopicPromptExample[] = [];
  const seen = new Set<string>(); // promptId|model dedup

  for (const info of runPromptInfo) {
    const dedupKey = `${info.promptId}|${info.model}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const runMetrics = metricsByRun.get(info.runId) ?? [];

    // Brand's rank in this run
    const brandMetric = runMetrics.find(
      (m) => m.entityId === brandEntityId,
    );

    // Top competitor (non-brand, best rank)
    const competitors = runMetrics
      .filter((m) => m.entityId !== brandEntityId)
      .sort((a, b) => (a.rankPosition ?? 999) - (b.rankPosition ?? 999));
    const topComp = competitors[0] ?? null;

    examples.push({
      promptId: info.promptId,
      promptText: info.promptText,
      topicKey: info.topicKey,
      topicLabel: topicLabel(info.topicKey),
      model: info.model,
      brandRank: brandMetric?.rankPosition ?? null,
      topCompetitor: topComp ? resolveEntityName(topComp.entityId, entityDisplayNames ?? new Map()) : null,
      topCompetitorRank: topComp?.rankPosition ?? null,
      cluster: info.cluster,
    });
  }

  return examples;
}

// ---------------------------------------------------------------------------
// 8. Topic Fragmentation
// ---------------------------------------------------------------------------

export function computeTopicFragmentation(
  metrics: TopicMetricInput[],
  entityDisplayNames?: Map<string, string>,
): TopicFragmentationRow[] {
  // Group by topic, count entity appearances
  const byTopic = new Map<string, Map<string, number>>();
  for (const m of metrics) {
    const entityMap = byTopic.get(m.topicKey) ?? new Map<string, number>();
    entityMap.set(m.entityId, (entityMap.get(m.entityId) ?? 0) + 1);
    byTopic.set(m.topicKey, entityMap);
  }

  const rows: TopicFragmentationRow[] = [];

  for (const [key, entityMap] of byTopic) {
    const totalMentions = [...entityMap.values()].reduce((s, c) => s + c, 0);
    if (totalMentions === 0) continue;

    let leaderName = "";
    let leaderCount = 0;
    for (const [entityId, count] of entityMap) {
      if (count > leaderCount) {
        leaderCount = count;
        leaderName = resolveEntityName(entityId, entityDisplayNames ?? new Map());
      }
    }

    const leaderShare = totalMentions > 0
      ? Math.round((leaderCount / totalMentions) * 10000) / 100
      : 0;

    const label: "Fragmented" | "Moderate" | "Concentrated" =
      leaderShare < 30 ? "Fragmented" : leaderShare <= 50 ? "Moderate" : "Concentrated";

    rows.push({
      topicKey: key,
      topicLabel: topicLabel(key),
      label,
      leaderName,
      leaderShare,
    });
  }

  return rows.sort((a, b) => a.leaderShare - b.leaderShare); // most fragmented first
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countByTopic(metrics: TopicMetricInput[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of metrics) {
    map.set(m.topicKey, (map.get(m.topicKey) ?? 0) + 1);
  }
  return map;
}
