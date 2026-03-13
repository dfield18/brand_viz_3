"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import Link from "next/link";
import { OverviewResponse, KpiDeltas } from "@/types/api";
import { OverviewScorecard } from "@/components/overview/OverviewScorecard";
import { NarrativeSection } from "@/components/overview/NarrativeSection";
import { CrossModelTable } from "@/components/overview/CrossModelTable";
import { StandoutQuotes } from "@/components/visibility/StandoutQuotes";
import { CompetitorSnapshot } from "@/components/overview/CompetitorSnapshot";
import { TopSourcesList } from "@/components/overview/TopSourcesList";
import { ExecutiveSummary } from "@/components/overview/ExecutiveSummary";
import { TopRecommendation } from "@/components/overview/TopRecommendation";
import { CompetitorAlerts } from "@/components/overview/CompetitorAlerts";
import { PromptManager } from "@/components/PromptManager";
import { OnThisPage, type PageSection } from "@/components/OnThisPage";
import { VALID_MODELS, MODEL_LABELS } from "@/lib/constants";
import { useCachedFetch, prefetchAll } from "@/lib/useCachedFetch";
import { useBrandName } from "@/lib/useBrandName";
import { PageSkeleton } from "@/components/PageSkeleton";

interface ApiResponse {
  hasData: boolean;
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
  const { data: apiData, loading, error } = useCachedFetch<ApiResponse>(url);
  const { data: quotesData } = useCachedFetch<QuotesResponse>(quotesUrl);

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
        <PromptManager brandSlug={params.slug} model={model} range={range} />
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
              href={`/entity/${params.slug}/overview?${qs}`}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Run prompts
            </Link>
            {" "}panel below to generate data.
          </p>
        </div>
        <PromptManager brandSlug={params.slug} model={model} range={range} />
      </div>
    );
  }

  // Has data — render charts
  if (!apiData?.overview) return null;
  const data = apiData.overview;

  const sections: PageSection[] = [
    { id: "kpi-summary", label: "Scorecard" },
    { id: "exec-summary", label: "Executive Summary" },
    { id: "top-recommendation", label: "Top Recommendation" },
    { id: "narrative-section", label: "Top Narratives" },
    { id: "standout-quotes", label: "What AI Is Saying" },
    { id: "competitor-snapshot", label: "Competitive Landscape" },
    { id: "competitor-alerts", label: "Competitor Movement" },
    { id: "cross-model", label: "Cross-Model Comparison" },
    { id: "sources-trend", label: "Top Sources" },
    { id: "prompt-manager", label: "Run Prompts" },
  ];

  return (
    <div className="flex gap-8 xl:-ml-52">
      {/* Sidebar */}
      <div className="w-40 shrink-0">
        <OnThisPage sections={sections} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-8 xl:max-w-[1060px]">
        <div id="kpi-summary" className="scroll-mt-24">
          {apiData.visibilityKpis && (() => {
            const kpis = apiData.visibilityKpis;
            // Composite visibility: weighted blend of mention rate, SoV, rank score, top-result rate
            const rankScore = kpis.avgRankScore > 0 ? Math.max(0, 100 - (kpis.avgRankScore - 1) * 25) : 0;
            const visibilityScore = Math.round(
              kpis.overallMentionRate * 0.3 +
              kpis.shareOfVoice * 0.2 +
              rankScore * 0.25 +
              kpis.firstMentionRate * 0.25,
            );
            // Sentiment score: 0–100 scale from split
            const ss = apiData.sentimentSplit;
            const sentimentScore = ss ? Math.round(ss.positive + ss.neutral * 0.5) : 50;
            // Dominant frame from overview.topFrames
            const topFrame = data.topFrames[0];
            const dominantFrame = topFrame ? { name: topFrame.frame, percentage: topFrame.percentage } : null;

            return (
              <OverviewScorecard
                visibilityScore={visibilityScore}
                sentimentScore={sentimentScore}
                dominantFrame={dominantFrame}
                topSourceType={apiData.topSourceType ?? null}
              />
            );
          })()}
        </div>

        {/* Executive Summary */}
        {apiData.visibilityKpis && (
          <div id="exec-summary" className="scroll-mt-24">
            <ExecutiveSummary
              brandName={brandName}
              mentionRate={apiData.visibilityKpis.overallMentionRate}
              shareOfVoice={apiData.visibilityKpis.shareOfVoice}
              avgRank={apiData.visibilityKpis.avgRankScore}
              firstMentionRate={apiData.visibilityKpis.firstMentionRate}
              activeModels={apiData.activeModels}
              topFrame={data.topFrames[0]?.frame}
              sentimentSplit={apiData.sentimentSplit}
            />
          </div>
        )}

        <div id="top-recommendation" className="scroll-mt-24">
          <TopRecommendation brandSlug={params.slug} brandName={brandName} model={model} range={range} />
        </div>

        <div id="narrative-section" className="scroll-mt-24">
          <NarrativeSection frames={data.topFrames} brandName={brandName} />
        </div>

        {/* Standout Quotes */}
        {quotesData?.quotes && quotesData.quotes.length > 0 && (
          <div id="standout-quotes" className="scroll-mt-24">
            <section className="rounded-xl border border-border bg-card px-5 py-4 shadow-section">
              <h2 className="text-sm font-semibold mb-2">What AI Models Are Saying</h2>
              <StandoutQuotes quotes={quotesData.quotes} />
            </section>
          </div>
        )}

        {/* Competitive Landscape: ranking + biggest threat */}
        <div id="competitor-snapshot" className="scroll-mt-24">
          <CompetitorSnapshot brandSlug={params.slug} model={model} range={range} />
        </div>

        {/* Competitor Movement Alerts */}
        <div id="competitor-alerts" className="scroll-mt-24">
          <CompetitorAlerts brandSlug={params.slug} model={model} range={range} />
        </div>

        <div id="cross-model" className="scroll-mt-24">
          <CrossModelTable models={data.modelComparison} />
        </div>

        {/* Top Sources */}
        <div id="sources-trend" className="scroll-mt-24">
          <TopSourcesList brandSlug={params.slug} model={model} range={range} />
        </div>

        <div id="prompt-manager" className="scroll-mt-24">
          <PromptManager brandSlug={params.slug} model={model} range={range} />
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
