"use client";

import {
  Brand,
  Filters,
  ModelKey,
  OverviewResponse,
  KpiCard,
  FrameDistribution,
  TrendPoint,
  NarrativeFrame,
  NarrativeResponse,
  ClusterMentions,
  VisibilityResponse,
  CompetitorSOV,
  LegacyCompetitionResponse,
  LegacyTopicsResponse,
} from "@/types/api";
import { getBrands, saveBrands, getLastViewedBrand, setLastViewedBrand } from "./storage";

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

const DEFAULT_BRANDS: { name: string }[] = [
  { name: "Patagonia" },
  { name: "Nike" },
  { name: "Allbirds" },
  { name: "Nuclear Energy" },
];

function ensureSeeded(): Brand[] {
  const existing = getBrands();
  if (existing.length > 0) return existing;

  const seeded: Brand[] = DEFAULT_BRANDS.map((b) => ({
    id: generateId(),
    name: b.name,
    type: "brand" as const,
    slug: toSlug(b.name),
    createdAt: new Date().toISOString(),
  }));

  saveBrands(seeded);
  return seeded;
}

// --- deterministic seeded random for consistent mock data ---
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Per-brand base profiles so data varies meaningfully
const BRAND_PROFILES: Record<string, {
  visibility: number;
  controversy: number;
  authority: number;
  frames: { frame: string; percentage: number }[];
}> = {
  patagonia: {
    visibility: 72,
    controversy: 18,
    authority: 85,
    frames: [
      { frame: "Sustainability Leader", percentage: 34 },
      { frame: "Premium Outdoor", percentage: 22 },
      { frame: "Activist Brand", percentage: 19 },
      { frame: "Quality Craftsmanship", percentage: 14 },
      { frame: "Anti-Corporate", percentage: 11 },
    ],
  },
  nike: {
    visibility: 91,
    controversy: 35,
    authority: 78,
    frames: [
      { frame: "Athletic Performance", percentage: 31 },
      { frame: "Cultural Icon", percentage: 24 },
      { frame: "Innovation Leader", percentage: 18 },
      { frame: "Labor Controversy", percentage: 16 },
      { frame: "Celebrity Endorsement", percentage: 11 },
    ],
  },
  allbirds: {
    visibility: 44,
    controversy: 8,
    authority: 52,
    frames: [
      { frame: "Eco-Friendly Materials", percentage: 38 },
      { frame: "DTC Disruptor", percentage: 25 },
      { frame: "Comfort Focus", percentage: 20 },
      { frame: "Greenwashing Skepticism", percentage: 17 },
    ],
  },
};

function getProfile(slug: string) {
  return BRAND_PROFILES[slug] ?? {
    visibility: 50,
    controversy: 20,
    authority: 60,
    frames: [
      { frame: "General Mention", percentage: 40 },
      { frame: "Product Quality", percentage: 30 },
      { frame: "Price Value", percentage: 30 },
    ],
  };
}

function generateOverview(brandId: string, filters: Filters): OverviewResponse {
  const profile = getProfile(brandId);
  const seed = hashString(brandId + filters.range + filters.model);
  const rand = seededRandom(seed);

  // Apply filter-based modifiers
  const rangeMultiplier = filters.range === 7 ? 0.9 : filters.range === 90 ? 1.1 : 1.0;
  const modelMultiplier =
    filters.model === "chatgpt" ? 1.05 :
    filters.model === "gemini" ? 0.95 :
    filters.model === "claude" ? 1.02 :
    filters.model === "perplexity" ? 0.88 : 1.0;

  const v = Math.round(profile.visibility * rangeMultiplier * modelMultiplier);
  const c = Math.round(profile.controversy * rangeMultiplier * modelMultiplier);
  const a = Math.round(profile.authority * rangeMultiplier * modelMultiplier);

  const kpis: KpiCard[] = [
    { label: "Visibility Score", value: Math.min(v, 100), unit: "score", delta: Math.round((rand() - 0.4) * 12) },
    { label: "Mention Rate", value: Math.round(v * 0.6 + rand() * 8), unit: "%", delta: Math.round((rand() - 0.3) * 8) },
    { label: "Authority Score", value: Math.min(a, 100), unit: "score", delta: Math.round((rand() - 0.45) * 10) },
    { label: "Controversy Index", value: Math.min(c, 100), unit: "score", delta: -Math.round(rand() * 5) },
    { label: "Source Count", value: Math.round(20 + v * 0.8 + rand() * 30), unit: "count", delta: Math.round((rand() - 0.3) * 15) },
  ];

  // Edge case: perplexity returns empty topFrames
  const topFrames: FrameDistribution[] =
    filters.model === "perplexity" ? [] : profile.frames;

  // Generate trend series
  const points = filters.range === 7 ? 7 : filters.range === 90 ? 90 : 30;
  const trend: TrendPoint[] = [];
  const now = new Date();
  for (let i = points - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const noise = () => Math.round((rand() - 0.5) * 10);
    trend.push({
      date: d.toISOString().slice(0, 10),
      visibility: Math.max(0, Math.min(100, v + noise())),
      controversy: Math.max(0, Math.min(100, c + noise())),
      authority: Math.max(0, Math.min(100, a + noise())),
    });
  }

  return { kpis, topFrames, trend, clusterVisibility: [], modelComparison: [] };
}

// --- Narrative mock data ---

const NARRATIVE_PROFILES: Record<string, {
  frames: { frame: string; percentage: number }[];
  legitimacy: number;
  controversy: number;
  hedgingRate: number;
}> = {
  patagonia: {
    frames: [
      { frame: "Sustainability Leader", percentage: 28 },
      { frame: "Premium Quality", percentage: 22 },
      { frame: "Ethical Labor", percentage: 18 },
      { frame: "Innovative", percentage: 14 },
      { frame: "Mainstream", percentage: 10 },
      { frame: "Controversial", percentage: 8 },
    ],
    legitimacy: 82,
    controversy: 15,
    hedgingRate: 22,
  },
  nike: {
    frames: [
      { frame: "Mainstream", percentage: 26 },
      { frame: "Controversial", percentage: 21 },
      { frame: "Innovative", percentage: 19 },
      { frame: "Premium Quality", percentage: 15 },
      { frame: "Ethical Labor", percentage: 11 },
      { frame: "Sustainability Leader", percentage: 8 },
    ],
    legitimacy: 74,
    controversy: 42,
    hedgingRate: 38,
  },
  allbirds: {
    frames: [
      { frame: "Sustainability Leader", percentage: 32 },
      { frame: "Innovative", percentage: 24 },
      { frame: "Premium Quality", percentage: 16 },
      { frame: "Mainstream", percentage: 12 },
      { frame: "Ethical Labor", percentage: 10 },
      { frame: "Controversial", percentage: 6 },
    ],
    legitimacy: 60,
    controversy: 12,
    hedgingRate: 28,
  },
};

function getNarrativeProfile(slug: string) {
  return NARRATIVE_PROFILES[slug] ?? {
    frames: [
      { frame: "Mainstream", percentage: 25 },
      { frame: "Premium Quality", percentage: 20 },
      { frame: "Innovative", percentage: 18 },
      { frame: "Sustainability Leader", percentage: 15 },
      { frame: "Ethical Labor", percentage: 12 },
      { frame: "Controversial", percentage: 10 },
    ],
    legitimacy: 50,
    controversy: 25,
    hedgingRate: 30,
  };
}

function generateNarrative(brandId: string, filters: Filters): NarrativeResponse {
  const profile = getNarrativeProfile(brandId);
  const brands = ensureSeeded();
  const brand = brands.find((b) => b.slug === brandId);
  const brandName = brand?.name ?? brandId;
  const seed = hashString("narrative" + brandId + filters.range + filters.model);
  const rand = seededRandom(seed);

  const isPerplexity = filters.model === "perplexity";

  // Build frames with per-model breakdown
  const frames: NarrativeFrame[] = isPerplexity
    ? []
    : profile.frames.map((f) => {
        const base = f.percentage;
        const models: ModelKey[] = ["chatgpt", "gemini", "claude", "perplexity"];
        const byModel = {} as Record<ModelKey, number>;
        models.forEach((m) => {
          // Each model deviates ±8 from the base percentage
          byModel[m] = Math.max(0, Math.min(100, Math.round(base + (rand() - 0.5) * 16)));
        });
        return { frame: f.frame, percentage: base, byModel };
      });

  // Positioning — always present
  const rangeShift = filters.range === 7 ? -3 : filters.range === 90 ? 3 : 0;
  const positioning = [
    {
      legitimacy: Math.min(100, Math.max(0, profile.legitimacy + rangeShift + Math.round((rand() - 0.5) * 6))),
      controversy: Math.min(100, Math.max(0, profile.controversy + rangeShift + Math.round((rand() - 0.5) * 6))),
      label: brandName,
    },
  ];

  // Hedging rate + trend
  const hedgingRate = Math.min(100, Math.max(0, Math.round(profile.hedgingRate + (rand() - 0.5) * 8)));

  const hedgingTrend = isPerplexity
    ? []
    : Array.from({ length: 12 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (11 - i) * 7);
        return {
          date: d.toISOString().slice(0, 10),
          value: Math.max(0, Math.min(100, Math.round(hedgingRate + (rand() - 0.5) * 14))),
        };
      });

  const sentimentSplit = { positive: 55 + Math.round((rand() - 0.5) * 20), neutral: 30 + Math.round((rand() - 0.5) * 10), negative: 15 + Math.round((rand() - 0.5) * 10) };
  const trustRate = Math.round(35 + rand() * 40);
  const weaknessRate = Math.round(10 + rand() * 30);
  const polarization = (["Low", "Moderate", "High"] as const)[Math.floor(rand() * 3)];

  const themes = [
    { key: "quality", label: "Quality & Craftsmanship", count: Math.round(5 + rand() * 10), pct: 25 },
    { key: "sustainability", label: "Sustainability", count: Math.round(4 + rand() * 8), pct: 20 },
    { key: "innovation", label: "Innovation", count: Math.round(3 + rand() * 7), pct: 18 },
    { key: "market_leadership", label: "Market Leadership", count: Math.round(2 + rand() * 6), pct: 15 },
    { key: "trust_reliability", label: "Trust & Reliability", count: Math.round(2 + rand() * 5), pct: 12 },
  ];

  const descriptors = [
    { word: "reliable", polarity: "positive" as const, count: Math.round(3 + rand() * 5) },
    { word: "innovative", polarity: "positive" as const, count: Math.round(2 + rand() * 4) },
    { word: "expensive", polarity: "negative" as const, count: Math.round(1 + rand() * 3) },
    { word: "sustainable", polarity: "positive" as const, count: Math.round(1 + rand() * 3) },
  ];

  const strengths = [
    { text: `${brandName} is recognized as a leader in sustainable practices.`, count: Math.round(2 + rand() * 3), model: "chatgpt", prompt: `What are the top brands in ${brandName}'s industry?` },
    { text: `${brandName} has built a trusted reputation over decades.`, count: Math.round(1 + rand() * 2), model: "gemini", prompt: `Tell me about ${brandName}` },
  ];
  const mockWeaknesses = [
    { text: `${brandName} products are considered expensive compared to competitors.`, count: Math.round(1 + rand() * 2), model: "claude", prompt: `What are the downsides of ${brandName}?` },
  ];

  return { frames, positioning, hedgingRate, hedgingTrend, sentimentSplit, trustRate, weaknessRate, polarization, themes, descriptors, strengths, weaknesses: mockWeaknesses };
}

// --- Visibility mock data ---

const VISIBILITY_PROFILES: Record<string, {
  clusters: { cluster: ClusterMentions["cluster"]; rate: number }[];
  highIntent: number; // percentage for high-intent (informational = 100 - highIntent)
  overallMentionRate: number;
  avgRankScore: number;
  firstMentionRate: number;
}> = {
  patagonia: {
    clusters: [
      { cluster: "brand", rate: 68 },
      { cluster: "brand", rate: 52 },
      { cluster: "brand", rate: 41 },
      { cluster: "brand", rate: 28 },
    ],
    highIntent: 35,
    overallMentionRate: 58,
    avgRankScore: 0.72,
    firstMentionRate: 45,
  },
  nike: {
    clusters: [
      { cluster: "brand", rate: 88 },
      { cluster: "brand", rate: 71 },
      { cluster: "brand", rate: 62 },
      { cluster: "brand", rate: 45 },
    ],
    highIntent: 54,
    overallMentionRate: 82,
    avgRankScore: 0.85,
    firstMentionRate: 72,
  },
  allbirds: {
    clusters: [
      { cluster: "brand", rate: 42 },
      { cluster: "brand", rate: 31 },
      { cluster: "brand", rate: 55 },
      { cluster: "brand", rate: 18 },
    ],
    highIntent: 28,
    overallMentionRate: 36,
    avgRankScore: 0.48,
    firstMentionRate: 30,
  },
};

function getVisibilityProfile(slug: string) {
  return VISIBILITY_PROFILES[slug] ?? {
    clusters: [
      { cluster: "brand" as const, rate: 50 },
      { cluster: "brand" as const, rate: 40 },
      { cluster: "brand" as const, rate: 35 },
      { cluster: "brand" as const, rate: 22 },
    ],
    highIntent: 40,
    overallMentionRate: 45,
    avgRankScore: 0.55,
    firstMentionRate: 40,
  };
}

function generateVisibility(brandId: string, filters: Filters): VisibilityResponse {
  const profile = getVisibilityProfile(brandId);
  const seed = hashString("visibility" + brandId + filters.range + filters.model);
  const rand = seededRandom(seed);

  const isPerplexity = filters.model === "perplexity";

  const rangeAdj = filters.range === 7 ? -4 : filters.range === 90 ? 3 : 0;

  const clusters: ClusterMentions[] = isPerplexity
    ? []
    : profile.clusters.map((c) => {
        const rate = Math.max(0, Math.min(100, c.rate + rangeAdj + Math.round((rand() - 0.5) * 8)));
        const models: ModelKey[] = ["chatgpt", "gemini", "claude", "perplexity"];
        const byModel = {} as Record<ModelKey, number>;
        models.forEach((m) => {
          byModel[m] = Math.max(0, Math.min(100, Math.round(rate + (rand() - 0.5) * 18)));
        });
        return { cluster: c.cluster, mentionRate: rate, byModel };
      });

  const hi = Math.max(0, Math.min(100, Math.round(profile.highIntent + (rand() - 0.5) * 8)));
  const intentSplit = [
    { intent: "high-intent" as const, percentage: hi },
    { intent: "informational" as const, percentage: 100 - hi },
  ];

  const overallMentionRate = Math.max(0, Math.min(100,
    Math.round(profile.overallMentionRate + rangeAdj + (rand() - 0.5) * 6)));
  const avgRankScore = Math.max(0, Math.min(1,
    parseFloat((profile.avgRankScore + (rand() - 0.5) * 0.1).toFixed(2))));
  const firstMentionRate = Math.max(0, Math.min(100,
    Math.round(profile.firstMentionRate + (rand() - 0.5) * 10)));
  const shareOfVoice = Math.max(0, Math.min(100,
    Math.round(overallMentionRate * (0.3 + rand() * 0.4))));

  const clusterBreakdown = clusters.map((c) => ({
    cluster: c.cluster,
    mentionRate: c.mentionRate,
    avgRank: parseFloat((1 + rand() * 2).toFixed(2)),
    firstMentionPct: Math.round(Math.max(0, c.mentionRate - 10 + (rand() - 0.5) * 20)),
  }));

  const modelBreakdownKeys = ["chatgpt", "gemini", "claude", "perplexity"] as const;
  const modelBreakdown = modelBreakdownKeys.map((mk) => {
    const mr = Math.max(0, Math.min(100, Math.round(overallMentionRate + (rand() - 0.5) * 20)));
    return {
      model: mk,
      mentionRate: mr,
      avgRank: parseFloat((1 + rand() * 2).toFixed(2)),
      firstMentionPct: Math.round(Math.max(0, mr - 10 + (rand() - 0.5) * 20)),
      totalRuns: Math.round(4 + rand() * 8),
    };
  });

  const topPromptWins = [
    { prompt: `What is ${brandId} known for?`, rank: 1, cluster: "brand" },
    { prompt: `Best brands in ${brandId}'s industry`, rank: 1, cluster: "brand" },
    { prompt: `${brandId} vs competitors`, rank: 1, cluster: "brand" },
  ].filter(() => rand() > 0.3);

  const trendModels = ["all", "chatgpt", "gemini", "claude", "perplexity"];
  const trend = trendModels.flatMap((m) =>
    Array.from({ length: 8 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (7 - i) * 7);
      const mr = Math.max(0, Math.min(100, Math.round(overallMentionRate + (rand() - 0.5) * 16)));
      return {
        date: d.toISOString().slice(0, 10),
        model: m,
        mentionRate: mr,
        avgPosition: parseFloat((1 + rand() * 2.5).toFixed(2)),
        firstMentionPct: Math.max(0, Math.min(100, Math.round(firstMentionRate + (rand() - 0.5) * 20))),
        sovPct: Math.max(0, Math.min(100, Math.round(shareOfVoice + (rand() - 0.5) * 12))),
      };
    }),
  );

  const rankDistribution = [
    { rank: 1, count: Math.round(firstMentionRate * 0.1), percentage: firstMentionRate },
    { rank: 2, count: Math.round((100 - firstMentionRate) * 0.06), percentage: Math.round((100 - firstMentionRate) * 0.6) },
    { rank: 3, count: Math.round((100 - firstMentionRate) * 0.03), percentage: Math.round((100 - firstMentionRate) * 0.3) },
    { rank: 4, count: Math.round((100 - firstMentionRate) * 0.01), percentage: Math.round((100 - firstMentionRate) * 0.1) },
  ].filter((r) => r.count > 0);

  const visibilityRanking = [
    { entityId: brandId, name: brandId.charAt(0).toUpperCase() + brandId.slice(1), score: Math.round(overallMentionRate + (rand() - 0.5) * 10), isBrand: true },
    { entityId: "competitor-a", name: "Competitor A", score: Math.round(overallMentionRate * 0.85 + (rand() - 0.5) * 10), isBrand: false },
    { entityId: "competitor-b", name: "Competitor B", score: Math.round(overallMentionRate * 0.65 + (rand() - 0.5) * 10), isBrand: false },
    { entityId: "competitor-c", name: "Competitor C", score: Math.round(overallMentionRate * 0.45 + (rand() - 0.5) * 10), isBrand: false },
  ].map((r) => ({ ...r, score: Math.max(0, Math.min(100, r.score)) })).sort((a, b) => b.score - a.score);

  const positionDistribution = ["all", "chatgpt", "gemini", "claude", "perplexity"].flatMap((m) =>
    [
      { position: 1, model: m, count: Math.round(firstMentionRate * 0.1), percentage: firstMentionRate },
      { position: 2, model: m, count: 2, percentage: Math.round((100 - firstMentionRate) * 0.5) },
      { position: 3, model: m, count: 1, percentage: Math.round((100 - firstMentionRate) * 0.3) },
    ].filter((r) => r.count > 0),
  );

  const opportunityPrompts = [
    { prompt: `Best brands in ${brandId}'s industry`, competitorCount: 3, competitors: ["Competitor A", "Competitor B", "Competitor C"] },
    { prompt: `Top rated ${brandId} alternatives`, competitorCount: 2, competitors: ["Competitor A", "Competitor B"] },
  ];

  const kpiDeltas = null;
  const worstPerformingPrompts = [
    { prompt: `Best alternatives to ${brandId}`, rank: 4, competitors: ["Competitor A", "Competitor B", "Competitor C"] },
    { prompt: `${brandId} vs competitors`, rank: null, competitors: ["Competitor B", "Competitor D"] },
  ];

  const resultsByQuestion = [
    { promptText: `Best brands in ${brandId}'s industry`, model: "chatgpt", aiVisibility: 100, shareOfVoice: 20, firstPosition: 50, avgPosition: 1.5, avgSentiment: "Positive" as const },
    { promptText: `Best brands in ${brandId}'s industry`, model: "gemini", aiVisibility: 83, shareOfVoice: 15, firstPosition: 33, avgPosition: 2.0, avgSentiment: "Neutral" as const },
  ];

  const promptPositions = [
    { promptText: `Best brands in ${brandId}'s industry`, model: "chatgpt", position: 1 as number | null },
    { promptText: `Best brands in ${brandId}'s industry`, model: "gemini", position: 2 as number | null },
    { promptText: `Top alternatives to ${brandId}`, model: "chatgpt", position: 1 as number | null },
    { promptText: `Top alternatives to ${brandId}`, model: "gemini", position: null },
  ];

  return { clusters, clusterBreakdown, modelBreakdown, topPromptWins, trend, rankDistribution, intentSplit, overallMentionRate, shareOfVoice, avgRankScore, firstMentionRate, visibilityRanking, positionDistribution, positionDistributionOverTime: [], opportunityPrompts, kpiDeltas, worstPerformingPrompts, resultsByQuestion, promptPositions };
}

// --- Competition mock data ---

const COMPETITION_PROFILES: Record<string, {
  competitors: { brand: string; sov: number }[];
  selfSOV: number;
  frameDiffs: { frame: string; selfShare: number; competitorAvgShare: number }[];
}> = {
  patagonia: {
    selfSOV: 28,
    competitors: [
      { brand: "Arc'teryx", sov: 24 },
      { brand: "The North Face", sov: 26 },
      { brand: "REI", sov: 22 },
    ],
    frameDiffs: [
      { frame: "Sustainability", selfShare: 42, competitorAvgShare: 18 },
      { frame: "Value", selfShare: 15, competitorAvgShare: 28 },
      { frame: "Premium Quality", selfShare: 35, competitorAvgShare: 30 },
      { frame: "Innovation", selfShare: 22, competitorAvgShare: 25 },
    ],
  },
  nike: {
    selfSOV: 35,
    competitors: [
      { brand: "Adidas", sov: 28 },
      { brand: "Under Armour", sov: 18 },
      { brand: "Puma", sov: 19 },
    ],
    frameDiffs: [
      { frame: "Sustainability", selfShare: 12, competitorAvgShare: 20 },
      { frame: "Value", selfShare: 18, competitorAvgShare: 30 },
      { frame: "Premium Quality", selfShare: 38, competitorAvgShare: 26 },
      { frame: "Innovation", selfShare: 40, competitorAvgShare: 22 },
    ],
  },
  allbirds: {
    selfSOV: 18,
    competitors: [
      { brand: "Veja", sov: 22 },
      { brand: "Adidas", sov: 32 },
      { brand: "Nike", sov: 28 },
    ],
    frameDiffs: [
      { frame: "Sustainability", selfShare: 48, competitorAvgShare: 15 },
      { frame: "Value", selfShare: 20, competitorAvgShare: 25 },
      { frame: "Premium Quality", selfShare: 24, competitorAvgShare: 32 },
      { frame: "Innovation", selfShare: 30, competitorAvgShare: 28 },
    ],
  },
};

function getCompetitionProfile(slug: string) {
  return COMPETITION_PROFILES[slug] ?? {
    selfSOV: 25,
    competitors: [
      { brand: "Competitor A", sov: 25 },
      { brand: "Competitor B", sov: 25 },
      { brand: "Competitor C", sov: 25 },
    ],
    frameDiffs: [
      { frame: "Sustainability", selfShare: 25, competitorAvgShare: 25 },
      { frame: "Value", selfShare: 25, competitorAvgShare: 25 },
      { frame: "Premium Quality", selfShare: 25, competitorAvgShare: 25 },
      { frame: "Innovation", selfShare: 25, competitorAvgShare: 25 },
    ],
  };
}

function generateCompetition(brandId: string, filters: Filters): LegacyCompetitionResponse {
  const profile = getCompetitionProfile(brandId);
  const brands = ensureSeeded();
  const brand = brands.find((b) => b.slug === brandId);
  const brandName = brand?.name ?? brandId;
  const seed = hashString("competition" + brandId + filters.range + filters.model);
  const rand = seededRandom(seed);

  const isPerplexity = filters.model === "perplexity";

  const rangeAdj = filters.range === 7 ? -2 : filters.range === 90 ? 2 : 0;

  const shareOfVoice: CompetitorSOV[] = isPerplexity
    ? []
    : [
        { brand: brandName, shareOfVoice: profile.selfSOV, byModel: {} as Record<ModelKey, number> },
        ...profile.competitors.map((c) => ({
          brand: c.brand,
          shareOfVoice: c.sov,
          byModel: {} as Record<ModelKey, number>,
        })),
      ].map((entry) => {
        const base = entry.shareOfVoice + rangeAdj + Math.round((rand() - 0.5) * 4);
        const sov = Math.max(0, Math.min(100, base));
        const models: ModelKey[] = ["chatgpt", "gemini", "claude", "perplexity"];
        const byModel = {} as Record<ModelKey, number>;
        models.forEach((m) => {
          byModel[m] = Math.max(0, Math.min(100, Math.round(sov + (rand() - 0.5) * 12)));
        });
        return { brand: entry.brand, shareOfVoice: sov, byModel };
      });

  const frameDifferentials = profile.frameDiffs.map((f) => ({
    frame: f.frame,
    selfShare: Math.max(0, Math.min(100, f.selfShare + rangeAdj + Math.round((rand() - 0.5) * 6))),
    competitorAvgShare: Math.max(0, Math.min(100, f.competitorAvgShare + Math.round((rand() - 0.5) * 6))),
  }));

  return { shareOfVoice, frameDifferentials };
}

// --- Topics mock data ---

const TOPICS_PROFILES: Record<string, { topic: string; strength: number }[]> = {
  patagonia: [
    { topic: "Sustainability", strength: 88 },
    { topic: "Ethical Labor", strength: 76 },
    { topic: "Outdoor Performance", strength: 71 },
    { topic: "Premium Pricing", strength: 64 },
    { topic: "Activism", strength: 60 },
    { topic: "Supply Chain Transparency", strength: 52 },
    { topic: "Recycled Materials", strength: 48 },
    { topic: "Corporate Responsibility", strength: 42 },
    { topic: "Warranty & Repair", strength: 35 },
    { topic: "Climate Policy", strength: 28 },
  ],
  nike: [
    { topic: "Performance", strength: 92 },
    { topic: "Innovation", strength: 84 },
    { topic: "Athlete Endorsements", strength: 78 },
    { topic: "Streetwear", strength: 72 },
    { topic: "Labor Practices", strength: 65 },
    { topic: "Brand Heritage", strength: 58 },
    { topic: "Sneaker Culture", strength: 54 },
    { topic: "Digital Fitness", strength: 46 },
    { topic: "Sustainability Efforts", strength: 38 },
    { topic: "Pricing Strategy", strength: 30 },
  ],
  allbirds: [
    { topic: "Sustainability", strength: 90 },
    { topic: "Comfort", strength: 82 },
    { topic: "Minimalist Design", strength: 68 },
    { topic: "Value", strength: 62 },
    { topic: "Materials Innovation", strength: 58 },
    { topic: "Carbon Footprint", strength: 50 },
    { topic: "DTC Model", strength: 44 },
    { topic: "Wool Technology", strength: 40 },
    { topic: "Brand Authenticity", strength: 34 },
    { topic: "Retail Expansion", strength: 26 },
  ],
};

function getTopicsProfile(slug: string) {
  return TOPICS_PROFILES[slug] ?? [
    { topic: "General", strength: 60 },
    { topic: "Quality", strength: 50 },
    { topic: "Price", strength: 45 },
    { topic: "Service", strength: 40 },
    { topic: "Reputation", strength: 35 },
    { topic: "Innovation", strength: 30 },
    { topic: "Marketing", strength: 25 },
    { topic: "Distribution", strength: 20 },
  ];
}

function generateTopics(brandId: string, filters: Filters): LegacyTopicsResponse {
  const profile = getTopicsProfile(brandId);
  const seed = hashString("topics" + brandId + filters.range + filters.model);
  const rand = seededRandom(seed);

  const isPerplexity = filters.model === "perplexity";
  const rangeAdj = filters.range === 7 ? -3 : filters.range === 90 ? 2 : 0;

  const topics = isPerplexity
    ? []
    : profile
        .map((t) => {
          const strength = Math.max(0, Math.min(100, t.strength + rangeAdj + Math.round((rand() - 0.5) * 8)));
          const models: ModelKey[] = ["chatgpt", "gemini", "claude", "perplexity"];
          const byModel = {} as Record<ModelKey, number>;
          models.forEach((m) => {
            byModel[m] = Math.max(0, Math.min(100, Math.round(strength + (rand() - 0.5) * 16)));
          });
          return { topic: t.topic, strength, byModel };
        })
        .sort((a, b) => b.strength - a.strength);

  // topTopicTrend — always present, based on #1 topic's base strength
  const topStrength = profile[0]?.strength ?? 50;
  const trendBase = topStrength + rangeAdj;
  const topTopicTrend = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (11 - i) * 7);
    return {
      date: d.toISOString().slice(0, 10),
      value: Math.max(0, Math.min(100, Math.round(trendBase + (rand() - 0.5) * 14))),
    };
  });

  return { topics, topTopicTrend };
}

export const mockClient = {
  listBrands(): Brand[] {
    return ensureSeeded();
  },

  createBrand(input: { name: string }): Brand {
    const brands = ensureSeeded();
    const brand: Brand = {
      id: generateId(),
      name: input.name,
      type: "brand",
      slug: toSlug(input.name),
      createdAt: new Date().toISOString(),
    };
    saveBrands([...brands, brand]);
    return brand;
  },

  getOverview(brandId: string, filters: Filters): OverviewResponse {
    return generateOverview(brandId, filters);
  },

  getNarrative(brandId: string, filters: Filters): NarrativeResponse {
    return generateNarrative(brandId, filters);
  },

  getVisibility(brandId: string, filters: Filters): VisibilityResponse {
    return generateVisibility(brandId, filters);
  },

  getCompetition(brandId: string, filters: Filters): LegacyCompetitionResponse {
    return generateCompetition(brandId, filters);
  },

  getTopics(brandId: string, filters: Filters): LegacyTopicsResponse {
    return generateTopics(brandId, filters);
  },

  getLastViewedBrand,
  setLastViewedBrand,
};
