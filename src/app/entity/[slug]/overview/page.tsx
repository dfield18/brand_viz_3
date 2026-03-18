"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import Link from "next/link";
import { OverviewResponse, KpiDeltas, VisibilityTrendPoint } from "@/types/api";
import { OverviewScorecard } from "@/components/overview/OverviewScorecard";
import { NarrativeFrameBreakdown } from "@/components/narrative/NarrativeFrameBreakdown";
import { CrossModelTable } from "@/components/overview/CrossModelTable";
import { StandoutQuotes } from "@/components/visibility/StandoutQuotes";
import { CompetitorSnapshot } from "@/components/overview/CompetitorSnapshot";
import { TopSourcesList } from "@/components/overview/TopSourcesList";
import { TopRecommendation } from "@/components/overview/TopRecommendation";
import { CompetitorAlerts } from "@/components/overview/CompetitorAlerts";
import { VisibilityTrendChart } from "@/components/visibility/VisibilityTrendChart";
import { OnThisPage, type PageSection } from "@/components/OnThisPage";
import { VALID_MODELS, MODEL_LABELS } from "@/lib/constants";
import { useCachedFetch, prefetchAll } from "@/lib/useCachedFetch";
import { useBrandName } from "@/lib/useBrandName";
import { PageSkeleton } from "@/components/PageSkeleton";

interface ApiResponse {
  hasData: boolean;
  aiSummary?: string | null;
  brandCategory?: string | null;
  brandIndustry?: string | null;
  reason?: string;
  hint?: string;
  job?: { id: string; model: string; range: number; finishedAt: string | null };
  overview?: OverviewResponse;
  visibilityKpis?: {
    overallMentionRate: number;
    shareOfVoice: number;
    firstMentionRate: number;
    avgRankScore: number;
  };
  kpiDeltas?: KpiDeltas | null;
  sentimentSplit?: { positive: number; neutral: number; negative: number } | null;
  competitiveRank?: { rank: number; totalCompetitors: number } | null;
  topSourceType?: { category: string; count: number; totalSources: number } | null;
  totals?: { totalRuns: number; analyzedRuns: number };
  activeModels?: string[];
}

interface QuotesResponse {
  quotes: { quote: string; model: string; context: string }[];
}

function OverviewInner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const brandName = useBrandName(params.slug);

  const range = Number(searchParams.get("range")) || 90;
  const model = searchParams.get("model") || "all";

  const validModel = model === "all" || VALID_MODELS.includes(model);
  const url = validModel
    ? `/api/overview?brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`
    : null;
  const quotesUrl = validModel
    ? `/api/visibility/quotes?brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`
    : null;
  const visUrl = validModel
    ? `/api/visibility?brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`
    : null;
  const { data: apiData, loading, error } = useCachedFetch<ApiResponse>(url);
  const { data: quotesData } = useCachedFetch<QuotesResponse>(quotesUrl);
  const { data: visData } = useCachedFetch<{ hasData: boolean; visibility?: { trend: VisibilityTrendPoint[] } }>(visUrl);

  // Prefetch other tab data once overview loads
  useEffect(() => {
    if (!apiData?.hasData || !validModel) return;
    const base = `brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`;
    prefetchAll([
      `/api/visibility?${base}`,
      `/api/narrative?${base}`,
      `/api/competition?${base}`,
      `/api/sources?${base}`,
      `/api/topics?${base}`,
      `/api/responses?${base}`,
      `/api/recommendations?${base}`,
    ]);
  }, [apiData?.hasData, validModel, params.slug, model, range]);

  // Loading
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
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  // No completed job or no analysis data
  if (apiData && !apiData.hasData) {
    const qs = new URLSearchParams({ range: String(range), model }).toString();
    return (
      <div className="space-y-8">
        <Header brandName={brandName} range={range} model={model} />
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            {apiData.hint || (
              <>
                No completed runs yet for <span className="font-medium text-foreground">{MODEL_LABELS[model]}</span> with a {range}-day range.
              </>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            Use the{" "}
            <Link
              href={`/entity/${params.slug}/prompts?${qs}`}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Prompts
            </Link>
            {" "}tab to generate data.
          </p>
        </div>
      </div>
    );
  }

  // Has data — render charts
  if (!apiData?.overview) return null;
  const data = apiData.overview;

  const isOrg = apiData.brandCategory === "political_advocacy";
  const sections: PageSection[] = [
    { id: "kpi-summary", label: "Scorecard", heading: "Visibility" },
    { id: "key-insights", label: "Key Insights" },
    { id: "visibility-trend", label: "Brand Recall Trend" },
    { id: "cross-model", label: "By AI Platform" },
    { id: "narrative-section", label: `How AI Describes ${brandName}`, heading: "Narrative" },
    { id: "standout-quotes", label: "What AI Is Saying" },
    { id: "competitor-snapshot", label: isOrg ? "Landscape" : "Competitive Landscape", heading: "Issue Landscape" },
    { id: "competitor-alerts", label: isOrg ? "Movement" : "Competitor Movement" },
    { id: "sources-trend", label: "Top Sources", heading: "Sources" },
  ];

  const kpis = apiData.visibilityKpis;
  const topFrame = data.topFrames[0];
  const dominantFrame = topFrame ? { name: topFrame.frame, percentage: topFrame.percentage } : null;

  return (
    <div className="flex gap-8 xl:-ml-52">
      {/* Sidebar */}
      <div className="w-40 shrink-0">
        <OnThisPage sections={sections} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-6 xl:max-w-[1060px]">
        {/* ── Visibility ─────────────────────────── */}
        <h2 className="text-lg font-semibold border-b border-border pb-2">Visibility</h2>

        {/* Scorecard */}
        <div id="kpi-summary" className="scroll-mt-24">
          {kpis && (
            <OverviewScorecard
              overallMentionRate={kpis.overallMentionRate}
              avgRankScore={kpis.avgRankScore}
              kpiDeltas={apiData.kpiDeltas ?? null}
              brandName={brandName}
              dominantFrame={dominantFrame}
              sentimentSplit={apiData.sentimentSplit ?? null}
            />
          )}
        </div>

        {/* Key Insights: Executive Summary + Top Recommendation merged */}
        <div id="key-insights" className="scroll-mt-24">
          <div className="rounded-xl bg-card shadow-section overflow-hidden">
            {/* AI Summary */}
            {apiData.aiSummary && (
              <div className="px-5 py-4">
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {apiData.aiSummary}
                </p>
              </div>
            )}
            {/* Top Recommendation — inline separator */}
            <TopRecommendation brandSlug={params.slug} brandName={brandName} model={model} range={range} />
          </div>
        </div>

        {/* Brand Recall Trend */}
        {visData?.visibility?.trend && visData.visibility.trend.length > 0 && (
          <div id="visibility-trend" className="scroll-mt-24">
            <section className="rounded-xl bg-card p-6 shadow-section">
              <VisibilityTrendChart trend={visData.visibility.trend} brandName={brandName} />
            </section>
          </div>
        )}

        <div id="cross-model" className="scroll-mt-24">
          <CrossModelTable models={data.modelComparison} brandName={brandName} />
        </div>

        {/* ── Narrative ──────────────────────────── */}
        <h2 className="text-lg font-semibold border-b border-border pb-2 mt-2">Narrative</h2>

        <div id="narrative-section" className="scroll-mt-24">
          <NarrativeFrameBreakdown
            frames={data.topFrames.map((f) => ({
              frame: f.frame,
              percentage: f.percentage,
              byModel: {
                chatgpt: f.byModel?.chatgpt ?? 0,
                gemini: f.byModel?.gemini ?? 0,
                claude: f.byModel?.claude ?? 0,
                perplexity: f.byModel?.perplexity ?? 0,
                google: f.byModel?.google ?? 0,
              },
            }))}
            brandName={brandName}
          />
        </div>

        {/* Standout Quotes */}
        {quotesData?.quotes && quotesData.quotes.length > 0 && (
          <div id="standout-quotes" className="scroll-mt-24">
            <section className="rounded-xl bg-card px-5 py-4 shadow-section">
              <h2 className="text-sm font-semibold mb-2">What AI Is Saying About {brandName}</h2>
              <StandoutQuotes quotes={quotesData.quotes} />
            </section>
          </div>
        )}

        {/* ── Issue Landscape ────────────────────── */}
        <h2 className="text-lg font-semibold border-b border-border pb-2 mt-2">Issue Landscape</h2>

        <div id="competitor-snapshot" className="scroll-mt-24">
          <CompetitorSnapshot brandSlug={params.slug} model={model} range={range} brandCategory={apiData.brandCategory} brandName={brandName} />
        </div>

        <div id="competitor-alerts" className="scroll-mt-24">
          <CompetitorAlerts brandSlug={params.slug} model={model} range={range} brandCategory={apiData.brandCategory} />
        </div>

        {/* ── Sources ────────────────────────────── */}
        <h2 className="text-lg font-semibold border-b border-border pb-2 mt-2">Sources</h2>

        <div id="sources-trend" className="scroll-mt-24">
          <TopSourcesList brandSlug={params.slug} model={model} range={range} />
        </div>
      </div>
    </div>
  );
}

function Header({ brandName, range, model }: { brandName: string; range: number; model: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">
        {brandName} &mdash; Overview
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        {range}-day window &middot; {MODEL_LABELS[model] ?? model}
      </p>
    </div>
  );
}

export default function OverviewPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>}>
      <OverviewInner />
    </Suspense>
  );
}
