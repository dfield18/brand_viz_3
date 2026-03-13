import type { RunAnalysis } from "@/lib/analysisSchema";
import type {
  OverviewResponse,
  KpiCard,
  FrameDistribution,
  TrendPoint,
  NarrativeResponse,
  NarrativeFrame,
  PositioningPoint,
  LegacyCompetitionResponse,
  CompetitorSOV,
  FrameDifferential,
  LegacyTopicsResponse,
  LegacyTopicAssociation,
  ModelKey,
} from "@/types/api";

const MODEL_KEYS: ModelKey[] = ["chatgpt", "gemini", "claude", "perplexity", "google"];

function avg(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((s, n) => s + n, 0) / nums.length;
}

function pct(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

function zeroByModel(model: string, value: number): Record<ModelKey, number> {
  const m: Record<string, number> = {};
  for (const mk of MODEL_KEYS) {
    m[mk] = mk === model ? value : 0;
  }
  return m as Record<ModelKey, number>;
}

export function computeStability(analyses: RunAnalysis[]): number {
  if (analyses.length < 2) return 80;
  const tempBuckets: Record<string, number[]> = {};
  for (const a of analyses) {
    for (const f of a.frames) {
      (tempBuckets[f.name] ??= []).push(f.strength);
    }
  }
  const frameStdDevs: number[] = [];
  for (const strengths of Object.values(tempBuckets)) {
    if (strengths.length < 2) continue;
    const mean = strengths.reduce((s, n) => s + n, 0) / strengths.length;
    const variance = strengths.reduce((s, n) => s + (n - mean) ** 2, 0) / strengths.length;
    frameStdDevs.push(Math.sqrt(variance));
  }
  const avgStdDev = frameStdDevs.length > 0
    ? frameStdDevs.reduce((s, n) => s + n, 0) / frameStdDevs.length
    : 0;
  return Math.max(0, Math.min(100, Math.round(100 - avgStdDev)));
}

export function parseAnalysis(analysisJson: unknown): RunAnalysis | null {
  if (!analysisJson || typeof analysisJson !== "object") return null;
  const a = analysisJson as Record<string, unknown>;
  if (typeof a.brandMentioned !== "boolean") return null;
  return analysisJson as RunAnalysis;
}

// --- Overview ---

export function aggregateOverview(
  latestAnalyses: RunAnalysis[],
  brandName: string,
  trendData: { date: Date; analyses: RunAnalysis[] }[],
): OverviewResponse {
  if (latestAnalyses.length === 0) {
    return { kpis: [], topFrames: [], trend: [], clusterVisibility: [], modelComparison: [] };
  }

  // KPIs from latest job only
  const avgMentionStrength = avg(latestAnalyses.map((a) => a.brandMentionStrength));
  const mentionRate = pct(
    latestAnalyses.filter((a) => a.brandMentioned).length,
    latestAnalyses.length,
  );
  const avgControversy = avg(latestAnalyses.map((a) => a.sentiment.controversy));
  const narrativeStability = computeStability(latestAnalyses);

  // Compute dominant frame using frequency-based methodology
  // (same as narrative tab: % of responses containing frame with strength >= 20)
  const STRENGTH_THRESHOLD = 20;
  const frameCounts: Record<string, number> = {};
  const totalResponses = latestAnalyses.length;
  for (const a of latestAnalyses) {
    for (const f of a.frames) {
      if (f.strength >= STRENGTH_THRESHOLD) {
        frameCounts[f.name] = (frameCounts[f.name] ?? 0) + 1;
      }
    }
  }
  const allFramesSorted = Object.entries(frameCounts)
    .map(([frame, count]) => ({
      frame,
      percentage: totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0,
    }))
    .sort((a, b) => b.percentage - a.percentage);
  const dominantFrame = allFramesSorted[0] ?? null;
  // Find all frames tied for the top percentage
  const tiedTopFrames = dominantFrame
    ? allFramesSorted.filter((f) => f.percentage === dominantFrame.percentage)
    : [];

  // Find the trend entry closest to 7 days ago for computing deltas
  const prevAnalyses: RunAnalysis[] | null = (() => {
    if (trendData.length < 2) return null;
    const sevenDaysAgo = Date.now() - 7 * 86_400_000;
    const older = trendData
      .filter((td) => td.date.getTime() <= sevenDaysAgo && td.analyses.length > 0)
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    return older.length > 0 ? older[0].analyses : null;
  })();

  const currentVisibility = Math.round(avgMentionStrength);
  const visibilityDelta = prevAnalyses
    ? currentVisibility - Math.round(avg(prevAnalyses.map((a) => a.brandMentionStrength)))
    : 0;

  const controversyDelta = prevAnalyses
    ? Math.round(avgControversy) - Math.round(avg(prevAnalyses.map((a) => a.sentiment.controversy)))
    : 0;

  const stabilityDelta = prevAnalyses && prevAnalyses.length >= 2
    ? narrativeStability - computeStability(prevAnalyses)
    : 0;

  const kpis: KpiCard[] = [
    { label: "Visibility Score", value: currentVisibility, unit: "score", delta: visibilityDelta },
    { label: "Mention Rate", value: mentionRate, unit: "%", delta: 0 },
    {
      label: "Dominant Narrative Frame",
      value: dominantFrame?.percentage ?? 0,
      unit: "score",
      delta: 0,
      displayText: tiedTopFrames.length > 1
        ? tiedTopFrames.map((f) => f.frame).join(" & ")
        : dominantFrame?.frame ?? "—",
      barPct: dominantFrame?.percentage ?? 0,
    },
    { label: "Controversy Index", value: Math.round(avgControversy), unit: "score", delta: controversyDelta },
    { label: "Narrative Stability", value: narrativeStability, unit: "score", delta: stabilityDelta },
  ];

  // Top frames from latest job only
  const topFrames: FrameDistribution[] = allFramesSorted
    .slice(0, 8);

  // Trend: one data point per job, sorted by date
  const trend: TrendPoint[] = trendData
    .filter((td) => td.analyses.length > 0)
    .map((td) => ({
      date: td.date.toISOString().slice(0, 10),
      visibility: Math.round(avg(td.analyses.map((a) => a.brandMentionStrength))),
      controversy: Math.round(avg(td.analyses.map((a) => a.sentiment.controversy))),
      authority: Math.round(avg(td.analyses.map((a) => a.authorityScore))),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { kpis, topFrames, trend, clusterVisibility: [], modelComparison: [] };
}

// --- Narrative ---

export function aggregateNarrative(
  analyses: RunAnalysis[],
  brandName: string,
  model: string,
): NarrativeResponse {
  if (analyses.length === 0) {
    return { frames: [], positioning: [], hedgingRate: 0, hedgingTrend: [] };
  }

  // Aggregate frames by name — use frequency (% of responses containing the frame
  // with meaningful strength) rather than normalizing strengths to sum to 100%.
  // This gives more differentiated values (e.g. 60% vs 20%) instead of all ~12%.
  const STRENGTH_THRESHOLD = 20; // ignore weak frame signals
  const frameBuckets: Record<string, number[]> = {};
  for (const a of analyses) {
    for (const f of a.frames) {
      if (f.strength >= STRENGTH_THRESHOLD) {
        (frameBuckets[f.name] ??= []).push(f.strength);
      }
    }
  }

  const totalResponses = analyses.length;
  const rawFrames = Object.entries(frameBuckets).map(([name, strengths]) => ({
    name,
    frequency: strengths.length / totalResponses, // % of responses with this frame
    avgStrength: avg(strengths),
  }));

  // Percentage = how often this frame appears (with meaningful strength) across responses
  const frames: NarrativeFrame[] = rawFrames
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 8)
    .map((f) => {
      const percentage = Math.round(f.frequency * 100);
      return {
        frame: f.name,
        percentage,
        byModel: zeroByModel(model, percentage),
      };
    });

  // Positioning: average legitimacy/controversy
  const positioning: PositioningPoint[] = [
    {
      legitimacy: Math.round(avg(analyses.map((a) => a.sentiment.legitimacy))),
      controversy: Math.round(avg(analyses.map((a) => a.sentiment.controversy))),
      label: brandName,
    },
  ];

  const hedgingRate = Math.round(avg(analyses.map((a) => a.hedgingScore)));

  return { frames, positioning, hedgingRate, hedgingTrend: [] };
}

// --- Competition ---

/** @deprecated Replaced by competition API using EntityResponseMetric */
export function aggregateCompetition(
  analyses: RunAnalysis[],
  brandName: string,
  model: string,
): LegacyCompetitionResponse {
  if (analyses.length === 0) {
    return { shareOfVoice: [], frameDifferentials: [] };
  }

  // Aggregate competitor mentions
  const competitorBuckets: Record<string, number[]> = {};
  for (const a of analyses) {
    for (const c of a.competitors) {
      const key = c.name.toLowerCase();
      (competitorBuckets[key] ??= []).push(c.mentionStrength);
    }
  }

  // Brand's own strength
  const brandStrength = avg(analyses.map((a) => a.brandMentionStrength));

  // Build SOV entries: brand + competitors
  const entries: { brand: string; rawStrength: number }[] = [
    { brand: brandName, rawStrength: brandStrength },
  ];
  for (const [name, strengths] of Object.entries(competitorBuckets)) {
    entries.push({
      brand: name.charAt(0).toUpperCase() + name.slice(1),
      rawStrength: avg(strengths),
    });
  }

  // Normalize to percentages
  const totalRaw = entries.reduce((s, e) => s + e.rawStrength, 0);
  const shareOfVoice: CompetitorSOV[] = entries
    .sort((a, b) => b.rawStrength - a.rawStrength)
    .slice(0, 5)
    .map((e) => {
      const sov = totalRaw > 0 ? Math.round((e.rawStrength / totalRaw) * 100) : 0;
      return {
        brand: e.brand,
        shareOfVoice: sov,
        byModel: zeroByModel(model, sov),
      };
    });

  // Frame differentials: brand's frame strengths vs competitor average
  const brandFrameBuckets: Record<string, number[]> = {};
  const competitorFrameBuckets: Record<string, number[]> = {};

  for (const a of analyses) {
    for (const f of a.frames) {
      (brandFrameBuckets[f.name] ??= []).push(f.strength);
    }
    // Use competitor mention strengths as a proxy for their frame presence
    for (const c of a.competitors) {
      for (const f of a.frames) {
        (competitorFrameBuckets[f.name] ??= []).push(c.mentionStrength);
      }
    }
  }

  const frameDifferentials: FrameDifferential[] = Object.keys(brandFrameBuckets)
    .slice(0, 4)
    .map((frame) => ({
      frame,
      selfShare: Math.round(avg(brandFrameBuckets[frame] ?? [])),
      competitorAvgShare: Math.round(avg(competitorFrameBuckets[frame] ?? [])),
    }));

  return { shareOfVoice, frameDifferentials };
}

// --- Topics ---

/** @deprecated Replaced by topics API using EntityResponseMetric + Prompt.topicKey */
export function aggregateTopics(
  analyses: RunAnalysis[],
  model: string,
): LegacyTopicsResponse {
  if (analyses.length === 0) {
    return { topics: [], topTopicTrend: [] };
  }

  const topicBuckets: Record<string, number[]> = {};
  for (const a of analyses) {
    for (const t of a.topics) {
      (topicBuckets[t.name] ??= []).push(t.relevance);
    }
  }

  const topics: LegacyTopicAssociation[] = Object.entries(topicBuckets)
    .map(([topic, relevances]) => {
      const strength = Math.round(avg(relevances));
      return {
        topic,
        strength,
        byModel: zeroByModel(model, strength),
      };
    })
    .sort((a, b) => b.strength - a.strength);

  return { topics, topTopicTrend: [] };
}
