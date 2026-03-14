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
import { TopRecommendation } from "@/components/overview/TopRecommendation";
import { CompetitorAlerts } from "@/components/overview/CompetitorAlerts";
import { PromptManager } from "@/components/PromptManager";
import { TrendChart } from "@/components/overview/TrendChart";
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
    { id: "kpi-summary", label: "Scorecard", heading: "Summary" },
    { id: "key-insights", label: "Key Insights" },
    { id: "visibility-trend", label: "Visibility Trend" },
    { id: "narrative-section", label: "Top Narratives", heading: "Narrative" },
    { id: "standout-quotes", label: "What AI Is Saying" },
    { id: "competitor-snapshot", label: "Competitive Landscape", heading: "Competition" },
    { id: "competitor-alerts", label: "Competitor Movement" },
    { id: "cross-model", label: "Cross-Model Comparison" },
    { id: "sources-trend", label: "Top Sources", heading: "More" },
    { id: "prompt-manager", label: "Run Prompts" },
  ];

  // Compute scorecard values
  const scorecardData = apiData.visibilityKpis ? (() => {
    const kpis = apiData.visibilityKpis!;
    const rankScore = kpis.avgRankScore > 0 ? Math.max(0, 100 - (kpis.avgRankScore - 1) * 25) : 0;
    const visibilityScore = Math.round(
      kpis.overallMentionRate * 0.3 +
      kpis.shareOfVoice * 0.2 +
      rankScore * 0.25 +
      kpis.firstMentionRate * 0.25,
    );
    const ss = apiData.sentimentSplit;
    const sentimentScore = ss ? Math.round(ss.positive + ss.neutral * 0.5) : 50;
    const topFrame = data.topFrames[0];
    const dominantFrame = topFrame ? { name: topFrame.frame, percentage: topFrame.percentage } : null;
    return { visibilityScore, sentimentScore, dominantFrame };
  })() : null;

  return (
    <div className="flex gap-8 xl:-ml-52">
      {/* Sidebar */}
      <div className="w-40 shrink-0">
        <OnThisPage sections={sections} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-8 xl:max-w-[1060px]">
        {/* Brand context line */}
        <p className="text-sm text-muted-foreground">
          How AI sees {brandName} — a snapshot of your brand&apos;s presence, sentiment, and positioning across AI platforms.
        </p>

        {/* Scorecard */}
        <div id="kpi-summary" className="scroll-mt-24">
          {scorecardData && (
            <OverviewScorecard
              visibilityScore={scorecardData.visibilityScore}
              sentimentScore={scorecardData.sentimentScore}
              dominantFrame={scorecardData.dominantFrame}
              topSourceType={apiData.topSourceType ?? null}
            />
          )}
        </div>

        {/* Key Insights: Executive Summary + Top Recommendation merged */}
        <div id="key-insights" className="scroll-mt-24 rounded-xl border border-border bg-card shadow-section overflow-hidden">
          {/* Executive Summary — accent left border */}
          {apiData.visibilityKpis && (
            <div className="px-5 py-4 border-l-4 border-l-primary/40">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {(() => {
                  const kpis = apiData.visibilityKpis!;
                  const parts: string[] = [];
                  if (kpis.overallMentionRate >= 80 && kpis.avgRankScore > 0 && kpis.avgRankScore <= 1.5) {
                    parts.push(`${brandName} dominates the AI conversation — surfacing in ${kpis.overallMentionRate}% of industry queries and consistently landing as the #1 recommendation.`);
                  } else if (kpis.overallMentionRate >= 60) {
                    parts.push(`${brandName} is well-established in AI responses, appearing in ${kpis.overallMentionRate}% of industry queries and capturing ${kpis.shareOfVoice}% of all brand mentions.`);
                  } else if (kpis.overallMentionRate >= 30) {
                    parts.push(`AI models are aware of ${brandName}, but there's room to grow — the brand shows up in ${kpis.overallMentionRate}% of industry queries with a ${kpis.shareOfVoice}% share of voice.`);
                  } else if (kpis.overallMentionRate > 0) {
                    parts.push(`${brandName} is flying under the AI radar, appearing in just ${kpis.overallMentionRate}% of industry queries. There's significant untapped opportunity here.`);
                  } else {
                    parts.push(`${brandName} isn't showing up in AI-generated responses yet — this is a blank canvas to build visibility from the ground up.`);
                  }
                  if (kpis.avgRankScore > 0) {
                    if (kpis.avgRankScore <= 1.3) parts.push(`When mentioned, it's almost always the first name out of the gate — ${kpis.firstMentionRate}% top-result rate.`);
                    else if (kpis.avgRankScore <= 2.0) parts.push(`It typically ranks near the top (avg position ${kpis.avgRankScore.toFixed(1)}), earning the #1 spot ${kpis.firstMentionRate}% of the time.`);
                    else if (kpis.avgRankScore <= 3.0) parts.push(`Positioning is mid-tier at avg #${kpis.avgRankScore.toFixed(1)} — competitors are edging ahead in ${100 - kpis.firstMentionRate}% of responses.`);
                    else parts.push(`AI models tend to mention ${brandName} after several competitors (avg #${kpis.avgRankScore.toFixed(1)}).`);
                  }
                  const ss = apiData.sentimentSplit;
                  if (ss) {
                    if (ss.positive >= 70) parts.push(`The tone is overwhelmingly positive — ${ss.positive}% of responses paint the brand favorably.`);
                    else if (ss.positive >= 50) parts.push(`Sentiment leans positive (${ss.positive}%)${ss.negative > 0 ? `, though ${ss.negative}% flag concerns worth monitoring` : ""}.`);
                    else if (ss.negative >= 30) parts.push(`Watch the sentiment: ${ss.negative}% of AI responses carry a critical tone.`);
                  }
                  const topFrame = data.topFrames[0]?.frame;
                  if (topFrame) parts.push(`AI primarily frames ${brandName} as a "${topFrame}."`);
                  return parts.join(" ");
                })()}
              </p>
            </div>
          )}
          {/* Top Recommendation — inline below summary */}
          <div className="border-t border-border/50">
            <TopRecommendation brandSlug={params.slug} brandName={brandName} model={model} range={range} />
          </div>
        </div>

        {/* Compact Visibility Trend */}
        {data.trend.length > 0 && (
          <div id="visibility-trend" className="scroll-mt-24">
            <TrendChart trend={data.trend} />
          </div>
        )}

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

        <div id="competitor-snapshot" className="scroll-mt-24">
          <CompetitorSnapshot brandSlug={params.slug} model={model} range={range} />
        </div>

        <div id="competitor-alerts" className="scroll-mt-24">
          <CompetitorAlerts brandSlug={params.slug} model={model} range={range} />
        </div>

        <div id="cross-model" className="scroll-mt-24">
          <CrossModelTable models={data.modelComparison} />
        </div>

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
