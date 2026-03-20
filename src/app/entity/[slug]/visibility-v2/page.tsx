"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState, useMemo } from "react";
import Link from "next/link";
import { VisibilityResponse } from "@/types/api";
import { SummaryCardsDonut } from "@/components/visibility/SummaryCardsDonut";
import { ResultsByQuestion } from "@/components/visibility/ResultsByQuestion";
import { VisibilityTrendChart } from "@/components/visibility/VisibilityTrendChart";

import { PositionDistribution } from "@/components/visibility/PositionDistribution";
import { PositionDistributionOverTime } from "@/components/visibility/PositionDistributionOverTime";
import { BrandPositionByPlatform } from "@/components/visibility/BrandPositionByPlatform";
import { OnThisPage, type PageSection } from "@/components/OnThisPage";
import { DriverDecomposition } from "@/components/overview/DriverDecomposition";

import { RefreshCw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VALID_MODELS, MODEL_LABELS } from "@/lib/constants";
import { useBrandName, useBrandCategory } from "@/lib/useBrandName";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { PageSkeleton } from "@/components/PageSkeleton";
// DUMMY DATA — remove this import and the override block below to revert to real API calls
import { PATAGONIA_DUMMY_VISIBILITY, PATAGONIA_DUMMY_TOTALS, PATAGONIA_DUMMY_JOB, NUCLEAR_ENERGY_DUMMY_VISIBILITY, NUCLEAR_ENERGY_DUMMY_TOTALS, NUCLEAR_ENERGY_DUMMY_JOB } from "@/lib/dummyVisibilityData";

interface ApiResponse {
  hasData: boolean;
  reason?: string;
  brandIndustry?: string | null;
  job?: { id: string; model: string; range: number; finishedAt: string | null };
  visibility?: VisibilityResponse;
  totals?: { totalRuns: number; totalMentions: number };
}

type MetricTab = "visibility" | "sov" | "topResult";

const METRIC_TABS: { key: MetricTab; label: string }[] = [
  { key: "visibility", label: "Brand Recall" },
  { key: "sov", label: "Share of Voice" },
  { key: "topResult", label: "Top Result Rate" },
];

const METRIC_KPI_MAP: Record<MetricTab, string> = {
  visibility: "mentionRate",
  sov: "shareOfVoice",
  topResult: "firstMentionRate",
};

function getMetricTitle(tab: MetricTab, name: string): string {
  switch (tab) {
    case "visibility": return `${name}\u2019s Brand Recall Over Time`;
    case "sov": return `${name}\u2019s Share of Voice Over Time`;
    case "topResult": return `Top Result Rate Over Time`;
  }
}

function getMetricDescription(tab: MetricTab, name: string): string {
  switch (tab) {
    case "visibility": return `How often AI platforms mention ${name} when answering general industry questions.`;
    case "sov": return `${name}\u2019s share of all brand mentions in AI responses \u2014 how much of the conversation ${name} owns.`;
    case "topResult": return `How often ${name} is the first brand mentioned in AI responses across all industry queries.`;
  }
}

function VisibilityV2Inner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const brandName = useBrandName(params.slug);
  const brandCategory = useBrandCategory(params.slug);
  const isOrg = brandCategory === "political_advocacy";

  const range = Number(searchParams.get("range")) || 90;
  const model = searchParams.get("model") || "all";
  const [activeMetric, setActiveMetric] = useState<MetricTab>("visibility");
  const [deepDiveModel, setDeepDiveModel] = useState("all");
  const [promptModel, setPromptModel] = useState("all");
  const [driversOpen, setDriversOpen] = useState(false);

  const validModel = model === "all" || VALID_MODELS.includes(model);

  // DUMMY DATA OVERRIDE — only active in development
  const dummyMap: Record<string, ApiResponse> = process.env.NODE_ENV === "development" ? {
    patagonia: { hasData: true, job: PATAGONIA_DUMMY_JOB, visibility: PATAGONIA_DUMMY_VISIBILITY, totals: PATAGONIA_DUMMY_TOTALS },
    "nuclear-energy": { hasData: true, job: NUCLEAR_ENERGY_DUMMY_JOB, visibility: NUCLEAR_ENERGY_DUMMY_VISIBILITY, totals: NUCLEAR_ENERGY_DUMMY_TOTALS },
  } : {};
  const hasDummy = params.slug in dummyMap;

  const url = validModel && !hasDummy
    ? `/api/visibility?brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`
    : null;
  const { data: rawApiData, loading, error, refetch } = useCachedFetch<ApiResponse>(url);

  const apiData: ApiResponse | null = hasDummy ? dummyMap[params.slug] : rawApiData;

  // Must be called before any early returns (Rules of Hooks)
  const [mountTime] = useState(() => Date.now());
  const rangeCutoff = useMemo(() => new Date(mountTime - range * 86_400_000).toISOString().slice(0, 10), [mountTime, range]);

  // Compute trend-derived values before early returns (Rules of Hooks)
  const filteredTrend = useMemo(() => {
    const trend = apiData?.visibility?.trend ?? [];
    return trend.filter((t) => t.date >= rangeCutoff);
  }, [apiData?.visibility?.trend, rangeCutoff]);

  const deepDiveTrend = useMemo(() => {
    if (deepDiveModel === "all") return filteredTrend;
    return filteredTrend.filter((t) => t.model === deepDiveModel);
  }, [filteredTrend, deepDiveModel]);

  const deepDiveModels = useMemo(() => {
    const set = new Set(filteredTrend.map((t) => t.model));
    set.delete("all");
    return ["chatgpt", "gemini", "claude", "perplexity", "google"].filter((m) => set.has(m));
  }, [filteredTrend]);

  // Sparkline data for scorecard cards (last 3 "all" trend points)
  const sparklines = useMemo(() => {
    const allPoints = filteredTrend.filter((t) => t.model === "all" && (!t.prompt || t.prompt === "all"));
    const last3 = allPoints.slice(-3);
    return {
      visibility: last3.map((t) => t.mentionRate),
      sov: last3.map((t) => t.sovPct ?? 0),
      topResult: last3.map((t) => t.firstMentionPct ?? 0),
    };
  }, [filteredTrend]);

  // Invalid model selection
  if (!validModel) {
    return (
      <div className="space-y-8">
        <Header brandName={brandName} range={range} model={model} />
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm font-medium text-foreground mb-1">
            Select a model
          </p>
          <p className="text-sm text-muted-foreground">
            Choose All, ChatGPT, Gemini, Claude, or Perplexity to view visibility metrics.
          </p>
        </div>
      </div>
    );
  }

  // Loading — skeleton placeholders
  if (loading) {
    return (
      <PageSkeleton variant="cards">
        <Header brandName={brandName} range={range} model={model} />
      </PageSkeleton>
    );
  }

  // Error
  if (error) {
    return (
      <div className="space-y-8">
        <Header brandName={brandName} range={range} model={model} />
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center space-y-3">
          <p className="text-sm text-red-700">{error}</p>
          <Button variant="outline" size="sm" onClick={refetch} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // No completed job
  if (apiData && !apiData.hasData) {
    const qs = new URLSearchParams({ range: String(range), model }).toString();
    return (
      <div className="space-y-8">
        <Header brandName={brandName} range={range} model={model} />
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center space-y-3">
          <p className="text-sm font-medium text-foreground">
            No completed runs yet
          </p>
          <p className="text-sm text-muted-foreground">
            Run prompts from Overview to generate visibility data for this brand.
          </p>
          <Link
            href={`/entity/${params.slug}/overview?${qs}`}
            className="inline-flex items-center text-sm text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
          >
            Go to Overview
          </Link>
        </div>
      </div>
    );
  }

  // Has data — render
  if (!apiData?.visibility) return null;
  const data = apiData.visibility;
  const totals = apiData.totals ?? { totalRuns: 0, totalMentions: 0 };
  const industryLabel = apiData.brandIndustry || `${brandName}'s industry`;
  const expandPrompt = (text: string) =>
    text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, industryLabel);

  const handleCardClick = (metric: MetricTab) => {
    setActiveMetric(metric);
    document.getElementById("metric-deep-dive")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const sections: PageSection[] = [
    { id: "kpi-summary", label: "Scorecard", heading: "Visibility" },
    { id: "metric-deep-dive", label: "Trend Over Time" },
    { id: "ranking-breakdown", label: "Position Over Time", heading: "Ranking" },
    { id: "ranking-distribution", label: "Position Distribution" },
    { id: "brand-position", label: `Where AI Ranks ${brandName}`, heading: "Performance" },
    { id: "results-by-prompt", label: "Performance by Question" },
  ];

  return (
    <div className="flex gap-8 xl:-ml-52">
      {/* Sidebar */}
      <div className="w-40 shrink-0">
        <OnThisPage sections={sections} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-8 xl:max-w-[1060px]">
        {/* ── Visibility ─────────────────────────── */}
        <h2 className="text-lg font-semibold border-b border-border pb-2">Visibility</h2>

        {/* Scorecard KPI Cards */}
        <div id="kpi-summary" className="scroll-mt-24">
          <SummaryCardsDonut
            overallMentionRate={data.overallMentionRate}
            shareOfVoice={data.shareOfVoice}
            avgRankScore={data.avgRankScore}
            firstMentionRate={data.firstMentionRate}
            kpiDeltas={data.kpiDeltas}
            brandName={brandName}
            onCardClick={handleCardClick}
            activeMetric={activeMetric}
            sparklines={sparklines}
          />
        </div>

        <div className="px-5 py-4 mt-2">
          <p className="text-base text-muted-foreground leading-relaxed">
            When someone asks AI about this space, does {brandName} come up? These metrics track how often AI platforms mention {brandName} unprompted—no brand in the query, just pure organic visibility.
          </p>
          {data.resultsByQuestion?.[0]?.promptText && (
            <p className="text-[13px] text-muted-foreground/60 italic mt-2">
              Example: &ldquo;{expandPrompt(data.resultsByQuestion[0].promptText)}&rdquo;
            </p>
          )}
        </div>

        {/* Trend Over Time */}
        <div id="metric-deep-dive" className="scroll-mt-24 rounded-xl bg-card px-6 pt-5 pb-6 shadow-section">
          <div className="flex items-start justify-between mb-4">
            <h3 className="text-base font-semibold">Trend Over Time</h3>
            <select
              value={deepDiveModel}
              onChange={(e) => setDeepDiveModel(e.target.value)}
              className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card"
            >
              <option value="all">All AI Platforms</option>
              {deepDiveModels.map((m) => (
                <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
              ))}
            </select>
          </div>
          {/* Metrics toggle */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex items-center rounded-full bg-muted p-0.5">
              {METRIC_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveMetric(tab.key)}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${
                    activeMetric === tab.key
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <h3 className="text-base font-semibold text-foreground -mt-3 mb-1">
            {getMetricTitle(activeMetric, brandName)}
          </h3>
          <p className="text-sm text-muted-foreground mb-5">
            {getMetricDescription(activeMetric, brandName)}
          </p>

          {/* Trend chart */}
          <VisibilityTrendChart
            trend={deepDiveTrend}
            prompts={[...new Set(data.resultsByQuestion.map((r) => r.promptText))]}
            fixedMetric={activeMetric}
            brandName={brandName}
            compact
          />

          {/* Collapsible driver section */}
          <div id="metric-drivers" className="scroll-mt-24 mt-8 pt-7 border-t border-border/50">
            <button
              onClick={() => setDriversOpen((o) => !o)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${driversOpen ? "rotate-180" : ""}`} />
              <span className="font-medium">What&apos;s Driving This</span>
            </button>
            {driversOpen && (
              <div className="mt-4">
                <DriverDecomposition
                  brandSlug={params.slug}
                  model={deepDiveModel}
                  range={range}
                  fixedKpi={METRIC_KPI_MAP[activeMetric]}
                  brandName={brandName}
                  inline
                  compact
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Ranking ──────────────────────────── */}
        <h2 className="text-lg font-semibold border-b border-border pb-2 mt-2">Ranking</h2>

        {/* Ranking: Position Distribution Over Time + Breakdown */}
        {data.positionDistributionOverTime && data.positionDistributionOverTime.length > 0 && (
          <PositionDistributionOverTime
            id="ranking-breakdown"
            data={data.positionDistributionOverTime.filter((d) => d.date >= rangeCutoff)}
            brandName={brandName}
          >
            {(selectedModel: string) => (
              <div id="ranking-distribution" className="scroll-mt-24">
                <PositionDistribution data={data.positionDistribution} inline externalModel={selectedModel} brandName={brandName} />
              </div>
            )}
          </PositionDistributionOverTime>
        )}

        {/* ── Performance ──────────────────────── */}
        <h2 className="text-lg font-semibold border-b border-border pb-2 mt-2">Performance</h2>

        {/* Performance: Where AI Ranks Brand + Performance by Question */}
        <div id="brand-position" className="scroll-mt-24 rounded-xl bg-card px-6 pt-5 pb-6 shadow-section">
          <div className="flex items-start justify-between mb-6">
            <p className="text-sm text-muted-foreground">How {brandName} performs across individual AI queries — broken down by platform and question</p>
            <select
              value={promptModel}
              onChange={(e) => setPromptModel(e.target.value)}
              className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card"
            >
              <option value="all">All AI Platforms</option>
              {["chatgpt", "gemini", "claude", "perplexity", "google"]
                .filter((m) => data.modelBreakdown.some((mb) => mb.model === m && mb.totalRuns > 0))
                .map((m) => (
                  <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
                ))}
            </select>
          </div>

          <BrandPositionByPlatform promptPositions={data.promptPositions} modelBreakdown={data.modelBreakdown} brandSlug={params.slug} brandName={brandName} inline externalModel={promptModel} />

          <div id="results-by-prompt" className="scroll-mt-24 border-t border-border/40 mt-10 pt-8">
            <ResultsByQuestion results={data.resultsByQuestion} wins={data.topPromptWins} opportunities={data.worstPerformingPrompts} brandSlug={params.slug} brandName={brandName} inline externalModel={promptModel} isOrg={isOrg} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Header({ brandName, range, model }: { brandName: string; range: number; model: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">
        {brandName} &mdash; AI Visibility Scorecard
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        {range}-day window &middot; {MODEL_LABELS[model] ?? model}
      </p>
    </div>
  );
}

export default function VisibilityV2Page() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>}>
      <VisibilityV2Inner />
    </Suspense>
  );
}
