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

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VALID_MODELS, MODEL_LABELS } from "@/lib/constants";
import { useBrandName } from "@/lib/useBrandName";
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

function VisibilityInner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const brandName = useBrandName(params.slug);

  const range = Number(searchParams.get("range")) || 90;
  const model = searchParams.get("model") || "all";

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

  // Expand template placeholders — must be called before early returns (Rules of Hooks)
  const data = useMemo(() => {
    const vis = apiData?.visibility;
    if (!vis) return null;
    const label = apiData?.brandIndustry || `${brandName}'s industry`;
    const expand = (text: string) =>
      text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, label);
    return {
      ...vis,
      resultsByQuestion: vis.resultsByQuestion?.map((r) => ({ ...r, promptText: expand(r.promptText) })),
      promptPositions: vis.promptPositions?.map((p) => ({ ...p, promptText: expand(p.promptText) })),
      topPromptWins: vis.topPromptWins?.map((w) => ({ ...w, prompt: expand(w.prompt) })),
      worstPerformingPrompts: vis.worstPerformingPrompts?.map((w) => ({ ...w, prompt: expand(w.prompt) })),
      trend: vis.trend?.map((t) => ({ ...t, prompt: t.prompt ? expand(t.prompt) : t.prompt })),
      opportunityPrompts: vis.opportunityPrompts?.map((o) => ({ ...o, prompt: expand(o.prompt) })),
    };
  }, [apiData, brandName]);

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
  if (!data || !apiData) return null;
  const totals = apiData.totals ?? { totalRuns: 0, totalMentions: 0 };

  // Filter trend data to respect selected range
  const filteredTrend = data.trend.filter((t) => t.date >= rangeCutoff);

  const sections: PageSection[] = [
    { id: "kpi-summary", label: "Scorecard" },
    { id: "visibility-trend", label: "Brand Recall Trend", heading: "Metrics Deep Dive", subheading: "Brand Recall" },
    { id: "driver-decomposition", label: "What's Driving This" },
    { id: "sov-trend", label: "Share of Voice Trend", subheading: "Share of Voice" },
    { id: "sov-driver-decomposition", label: "What's Driving This" },
    { id: "top-result-trend", label: "Top Result Trend", subheading: "Top Result Rate" },
    { id: "top-result-driver-decomposition", label: "What's Driving This" },
    { id: "position-distribution", label: "Ranking Breakdown", heading: "Ranking" },
    { id: "position-over-time", label: "Position Over Time" },
    { id: "brand-position", label: "Where AI Ranks You", heading: "Performance" },
    { id: "results-by-prompt", label: "Performance by Question" },
  ];

  return (
    <div className="flex gap-8 xl:-ml-52">
      {/* Sidebar */}
      <div className="w-40 shrink-0">
        <OnThisPage sections={sections} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-6 xl:max-w-[1060px]">
        <Header brandName={brandName} range={range} model={model} />

        {/* Data source */}
        {apiData.job?.finishedAt && (
          <p className="text-xs text-muted-foreground" suppressHydrationWarning>
            Based on {totals.totalRuns} AI {totals.totalRuns === 1 ? "query" : "queries"} &middot; Updated{" "}
            {new Date(apiData.job.finishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        )}

        {/* Section: Scorecard */}
        <h2 className="text-lg font-semibold border-b border-border pb-2">Scorecard</h2>

        {/* Donut KPI Cards */}
        <div id="kpi-summary" className="scroll-mt-24">
          <SummaryCardsDonut
            overallMentionRate={data.overallMentionRate}
            shareOfVoice={data.shareOfVoice}
            avgRankScore={data.avgRankScore}
            firstMentionRate={data.firstMentionRate}
            kpiDeltas={data.kpiDeltas}
            brandName={brandName}
          />
        </div>

        <p className="text-xs text-muted-foreground/80 leading-relaxed -mt-8">
          All metrics on this tab are based on general industry prompts only — prompts that mention the brand by name are excluded.
          Data reflects most recent responses.
        </p>

        {/* Section: Metrics Deep Dive */}
        <h2 className="text-lg font-semibold border-b border-border pb-2 mt-4">Metrics Deep Dive</h2>

        {/* Visibility Trend — AI Visibility */}
        <section id="visibility-trend" className="scroll-mt-24 rounded-xl bg-card p-6 shadow-section">
          <VisibilityTrendChart trend={filteredTrend} prompts={[...new Set(data.resultsByQuestion.map((r) => r.promptText))]} fixedMetric="visibility" brandName={brandName} />
        </section>

        {/* Driver Decomposition — visibility only */}
        <div id="driver-decomposition" className="scroll-mt-24">
          <DriverDecomposition brandSlug={params.slug} model={model} range={range} fixedKpi="mentionRate" brandName={brandName} />
        </div>

        {/* Visibility Trend — Share of Voice */}
        <section id="sov-trend" className="scroll-mt-24 rounded-xl bg-card p-6 shadow-section">
          <VisibilityTrendChart trend={filteredTrend} prompts={[...new Set(data.resultsByQuestion.map((r) => r.promptText))]} fixedMetric="sov" brandName={brandName} />
        </section>

        {/* Driver Decomposition — Share of Voice */}
        <div id="sov-driver-decomposition" className="scroll-mt-24">
          <DriverDecomposition brandSlug={params.slug} model={model} range={range} fixedKpi="shareOfVoice" brandName={brandName} />
        </div>

        {/* Visibility Trend — Top Result Rate */}
        <section id="top-result-trend" className="scroll-mt-24 rounded-xl bg-card p-6 shadow-section">
          <VisibilityTrendChart trend={filteredTrend} prompts={[...new Set(data.resultsByQuestion.map((r) => r.promptText))]} fixedMetric="topResult" />
        </section>

        {/* Driver Decomposition — Top Result Rate */}
        <div id="top-result-driver-decomposition" className="scroll-mt-24">
          <DriverDecomposition brandSlug={params.slug} model={model} range={range} fixedKpi="firstMentionRate" brandName={brandName} />
        </div>

        {/* Section: Ranking */}
        <h2 className="text-lg font-semibold border-b border-border pb-2 mt-4">Ranking</h2>

        {/* Position Distribution */}
        <div id="position-distribution" className="scroll-mt-24">
          <PositionDistribution data={data.positionDistribution} />
        </div>

        {/* Position Distribution Over Time */}
        {data.positionDistributionOverTime && data.positionDistributionOverTime.length > 0 && (
          <div id="position-over-time" className="scroll-mt-24">
            <PositionDistributionOverTime
              data={data.positionDistributionOverTime.filter((d) => d.date >= rangeCutoff)}
            />
          </div>
        )}

        <p className="text-[11px] text-muted-foreground -mt-7 leading-relaxed">
          <span className="font-medium">Note:</span> Past data points are simulated using today&apos;s AI models with knowledge cutoffs set to each date. Results are representative but may differ from original responses.
        </p>

        {/* Section: Performance */}
        <h2 className="text-lg font-semibold border-b border-border pb-2 mt-4">Performance</h2>

        {/* Brand Position by Platform — dot plot */}
        <div id="brand-position" className="scroll-mt-24">
          <BrandPositionByPlatform promptPositions={data.promptPositions} modelBreakdown={data.modelBreakdown} brandSlug={params.slug} brandName={params.slug.replace(/-/g, " ")} />
        </div>

        {/* Results by Prompt (includes wins & opportunities) */}
        <div id="results-by-prompt" className="scroll-mt-24">
          <ResultsByQuestion results={data.resultsByQuestion} wins={data.topPromptWins} opportunities={data.worstPerformingPrompts} brandSlug={params.slug} brandName={params.slug.replace(/-/g, " ")} />
        </div>
      </div>
    </div>
  );
}

function Header({ brandName, range, model }: { brandName: string; range: number; model: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">
        {brandName} &mdash; AI Visibility Report
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        {range}-day window &middot; {MODEL_LABELS[model] ?? model}
      </p>
    </div>
  );
}

export default function VisibilityPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>}>
      <VisibilityInner />
    </Suspense>
  );
}
