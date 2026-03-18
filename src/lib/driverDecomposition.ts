/**
 * Driver Decomposition: explains WHY a KPI moved between two time windows.
 *
 * For each dimension (model, cluster, topic) and each segment within it,
 * we compute:
 *   contribution = (segCurrentMetric − segPreviousMetric) × avg(segWeightCurrent, segWeightPrevious)
 * then normalize so contributions sum to the total delta (± rounding tolerance).
 */


/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type KpiKey =
  | "mentionRate"
  | "firstMentionRate"
  | "avgRank"
  | "shareOfVoice";

export interface DecomposedRun {
  model: string;
  cluster: string;
  topic: string;
  brandMentioned: boolean;
  brandMentionStrength: number;
  rank: number | null; // 1-based, null if not mentioned
  /** Number of competitors mentioned in this response (for SOV decomposition) */
  competitorCount?: number;
}

export interface Driver {
  dimension: string; // "model" | "cluster" | "topic"
  segment: string;
  contribution: number; // signed
  pctOfDelta: number; // 0-100, signed
  sampleSize: number;
  direction: "positive" | "negative" | "neutral";
}

export type Confidence = "High" | "Medium" | "Low";

export interface DecompositionResult {
  kpi: KpiKey;
  kpiLabel: string;
  totalDelta: number;
  periodCurrent: string;
  periodPrevious: string;
  drivers: Driver[];
  confidence: Confidence;
  caveats: string[];
  narrative: string;
}

/* -------------------------------------------------------------------------- */
/* KPI computation from run sets                                               */
/* -------------------------------------------------------------------------- */

export const KPI_LABELS: Record<KpiKey, string> = {
  mentionRate: "Mention Rate",
  firstMentionRate: "Top Result Rate",
  avgRank: "Avg Position",
  shareOfVoice: "Share of Voice",
};

export function computeKpi(runs: DecomposedRun[], kpi: KpiKey): number | null {
  if (runs.length === 0) return null;
  switch (kpi) {
    case "mentionRate": {
      const mentioned = runs.filter((r) => r.brandMentioned).length;
      return Math.round((mentioned / runs.length) * 1000) / 10;
    }
    case "firstMentionRate": {
      const first = runs.filter((r) => r.rank === 1).length;
      return Math.round((first / runs.length) * 1000) / 10;
    }
    case "avgRank": {
      const ranked = runs.filter((r) => r.rank !== null);
      if (ranked.length === 0) return null;
      const sum = ranked.reduce((s, r) => s + r.rank!, 0);
      return Math.round((sum / ranked.length) * 100) / 100;
    }
    case "shareOfVoice": {
      // SOV = brand mentions / total entity mentions (brand + competitors)
      let brandMentions = 0;
      let totalMentions = 0;
      for (const r of runs) {
        const competitors = r.competitorCount ?? 0;
        const brandCount = r.brandMentioned ? 1 : 0;
        brandMentions += brandCount;
        totalMentions += brandCount + competitors;
      }
      if (totalMentions === 0) return 0;
      return Math.round((brandMentions / totalMentions) * 1000) / 10;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Decomposition math                                                          */
/* -------------------------------------------------------------------------- */

interface SegmentBucket {
  segment: string;
  currentRuns: DecomposedRun[];
  previousRuns: DecomposedRun[];
}

function groupByDimension(
  currentRuns: DecomposedRun[],
  previousRuns: DecomposedRun[],
  dimension: string,
  accessor: (r: DecomposedRun) => string,
): SegmentBucket[] {
  const allSegments = new Set<string>();
  for (const r of currentRuns) allSegments.add(accessor(r));
  for (const r of previousRuns) allSegments.add(accessor(r));

  return [...allSegments].map((segment) => ({
    segment,
    currentRuns: currentRuns.filter((r) => accessor(r) === segment),
    previousRuns: previousRuns.filter((r) => accessor(r) === segment),
  }));
}

/**
 * Decompose a KPI delta along one dimension.
 *
 * contribution_i = (metric_curr_i - metric_prev_i) × avg(weight_curr_i, weight_prev_i)
 * where weight = segment_count / total_count
 */
export function decomposeAlongDimension(
  currentRuns: DecomposedRun[],
  previousRuns: DecomposedRun[],
  kpi: KpiKey,
  dimension: string,
  accessor: (r: DecomposedRun) => string,
  totalDelta: number,
): Driver[] {
  const buckets = groupByDimension(currentRuns, previousRuns, dimension, accessor);
  const totalCurrent = currentRuns.length || 1;
  const totalPrevious = previousRuns.length || 1;

  const raw: { segment: string; contribution: number; sampleSize: number }[] = [];

  for (const { segment, currentRuns: cRuns, previousRuns: pRuns } of buckets) {
    const metricCurr = computeKpi(cRuns, kpi);
    const metricPrev = computeKpi(pRuns, kpi);
    if (metricCurr === null && metricPrev === null) continue;

    const mc = metricCurr ?? 0;
    const mp = metricPrev ?? 0;
    const weightCurr = cRuns.length / totalCurrent;
    const weightPrev = pRuns.length / totalPrevious;
    const avgWeight = (weightCurr + weightPrev) / 2;
    const contribution = (mc - mp) * avgWeight;

    raw.push({
      segment,
      contribution,
      sampleSize: cRuns.length + pRuns.length,
    });
  }

  // Normalize so contributions sum to totalDelta
  const rawSum = raw.reduce((s, d) => s + d.contribution, 0);
  const scale = rawSum !== 0 ? totalDelta / rawSum : 0;

  return raw.map((d) => {
    const adjusted = d.contribution * scale;
    return {
      dimension,
      segment: d.segment,
      contribution: Math.round(adjusted * 100) / 100,
      pctOfDelta: totalDelta !== 0 ? Math.round((adjusted / totalDelta) * 1000) / 10 : 0,
      sampleSize: d.sampleSize,
      direction: adjusted > 0.05 ? "positive" : adjusted < -0.05 ? "negative" : "neutral",
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Confidence                                                                  */
/* -------------------------------------------------------------------------- */

export function assessConfidence(
  currentRuns: DecomposedRun[],
  previousRuns: DecomposedRun[],
  models: Set<string>,
): Confidence {
  const minSample = Math.min(currentRuns.length, previousRuns.length);
  if (minSample < 3) return "Low";
  if (minSample < 8) return "Medium";
  // Also check model agreement: if only 1 model, lower confidence
  if (models.size <= 1 && minSample < 15) return "Medium";
  return "High";
}

/* -------------------------------------------------------------------------- */
/* Narrative generation                                                        */
/* -------------------------------------------------------------------------- */

function formatDelta(delta: number, kpi: KpiKey): string {
  const abs = Math.abs(delta);
  const direction = delta > 0 ? "increased" : "decreased";
  const unit = kpi === "avgRank" ? " positions" : " percentage points";
  // For avgRank, decrease is improvement
  if (kpi === "avgRank") {
    const improved = delta < 0 ? "improved" : "worsened";
    return `${improved} by ${abs.toFixed(1)}${unit}`;
  }
  return `${direction} by ${abs.toFixed(1)}${unit}`;
}

export function generateNarrative(
  kpi: KpiKey,
  totalDelta: number,
  drivers: Driver[],
  confidence: Confidence,
): string {
  const label = KPI_LABELS[kpi];
  const movement = formatDelta(totalDelta, kpi);

  if (Math.abs(totalDelta) < 0.1) {
    return `${label} remained essentially flat this period.`;
  }

  const positiveDrivers = drivers
    .filter((d) => d.direction === "positive")
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);

  const negativeDrivers = drivers
    .filter((d) => d.direction === "negative")
    .sort((a, b) => a.contribution - b.contribution)
    .slice(0, 3);

  const parts: string[] = [`${label} ${movement}.`];

  if (positiveDrivers.length > 0) {
    const items = positiveDrivers.map(
      (d) => `${d.segment} (${d.dimension}, +${Math.abs(d.pctOfDelta).toFixed(0)}%)`,
    );
    parts.push(`Top positive drivers: ${items.join(", ")}.`);
  }

  if (negativeDrivers.length > 0) {
    const items = negativeDrivers.map(
      (d) => `${d.segment} (${d.dimension}, −${Math.abs(d.pctOfDelta).toFixed(0)}%)`,
    );
    parts.push(`Negative contributors: ${items.join(", ")}.`);
  }

  parts.push(`Confidence: ${confidence}.`);

  return parts.join(" ");
}

/* -------------------------------------------------------------------------- */
/* Main entry: full decomposition for one KPI                                  */
/* -------------------------------------------------------------------------- */

export function decomposeKpi(
  currentRuns: DecomposedRun[],
  previousRuns: DecomposedRun[],
  kpi: KpiKey,
  periodCurrent: string,
  periodPrevious: string,
): DecompositionResult {
  const metricCurr = computeKpi(currentRuns, kpi);
  const metricPrev = computeKpi(previousRuns, kpi);
  const totalDelta = (metricCurr ?? 0) - (metricPrev ?? 0);

  const allRuns = [...currentRuns, ...previousRuns];
  const models = new Set(allRuns.map((r) => r.model));
  const confidence = assessConfidence(currentRuns, previousRuns, models);

  const caveats: string[] = ["Drivers are correlational, not causal."];
  if (confidence === "Low") {
    caveats.unshift("Insufficient data for reliable decomposition.");
  }

  // Decompose along each dimension
  const byModel = decomposeAlongDimension(
    currentRuns, previousRuns, kpi, "model",
    (r) => r.model, totalDelta,
  );
  const byCluster = decomposeAlongDimension(
    currentRuns, previousRuns, kpi, "cluster",
    (r) => r.cluster, totalDelta,
  );
  const byTopic = decomposeAlongDimension(
    currentRuns, previousRuns, kpi, "topic",
    (r) => r.topic, totalDelta,
  );
  const byModelTopic = decomposeAlongDimension(
    currentRuns, previousRuns, kpi, "model_topic",
    (r) => `${r.model}|${r.topic}`, totalDelta,
  );

  const drivers = [...byModel, ...byCluster, ...byTopic, ...byModelTopic]
    .filter((d) => d.direction !== "neutral")
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const narrative = generateNarrative(kpi, totalDelta, drivers, confidence);

  return {
    kpi,
    kpiLabel: KPI_LABELS[kpi],
    totalDelta: Math.round(totalDelta * 100) / 100,
    periodCurrent,
    periodPrevious,
    drivers,
    confidence,
    caveats,
    narrative,
  };
}
