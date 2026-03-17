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

  const sections: PageSection[] = [
    { id: "kpi-summary", label: "Scorecard", heading: "Visibility" },
    { id: "key-insights", label: "Key Insights" },
    { id: "visibility-trend", label: "Brand Recall Trend" },
    { id: "cross-model", label: "By AI Platform" },
    { id: "narrative-section", label: "How AI Describes You", heading: "Narrative" },
    { id: "standout-quotes", label: "What AI Is Saying" },
    { id: "competitor-snapshot", label: "Competitive Landscape", heading: "Issue Landscape" },
    { id: "competitor-alerts", label: "Competitor Movement" },
    { id: "sources-trend", label: "Top Sources", heading: "Sources" },
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
      <div className="flex-1 min-w-0 space-y-6 xl:max-w-[1060px]">
        {/* ── Visibility ─────────────────────────── */}
        <h2 className="text-lg font-semibold border-b border-border pb-2">Visibility</h2>

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
        <div id="key-insights" className="scroll-mt-24">
          <div className="rounded-xl bg-card shadow-section overflow-hidden">
            {/* Summary */}
            {apiData.visibilityKpis && (
              <div className="px-5 py-4">
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {(() => {
                    const kpis = apiData.visibilityKpis!;
                    const parts: string[] = [];
                    if (kpis.overallMentionRate >= 80 && kpis.avgRankScore > 0 && kpis.avgRankScore <= 1.5) {
                      parts.push(`When people ask ChatGPT, Gemini, or other AI tools about this space, ${brandName} comes up almost every time (${kpis.overallMentionRate}% of questions) — and it's usually the first name mentioned.`);
                    } else if (kpis.overallMentionRate >= 60) {
                      parts.push(`${brandName} has strong AI visibility. When people ask AI models general questions about this space, ${brandName} comes up ${kpis.overallMentionRate}% of the time and makes up ${kpis.shareOfVoice}% of all brand mentions in those answers.`);
                    } else if (kpis.overallMentionRate >= 30) {
                      parts.push(`When people ask AI models about this space, ${brandName} comes up in about ${kpis.overallMentionRate}% of answers — that means roughly ${100 - kpis.overallMentionRate}% of the time, AI is recommending others without mentioning ${brandName}. It accounts for ${kpis.shareOfVoice}% of all brand mentions.`);
                    } else if (kpis.overallMentionRate > 0) {
                      parts.push(`${brandName} rarely comes up when people ask AI models about this space — only ${kpis.overallMentionRate}% of the time. Most potential customers using AI for research won't see ${brandName} at all.`);
                    } else {
                      parts.push(`${brandName} doesn't appear in AI-generated answers yet. A growing number of people are using AI to find recommendations — and they won't hear about ${brandName}.`);
                    }
                    if (kpis.avgRankScore > 0) {
                      if (kpis.avgRankScore <= 1.3) parts.push(`When AI does mention ${brandName}, it's typically the very first brand recommended — it leads the list ${kpis.firstMentionRate}% of the time.`);
                      else if (kpis.avgRankScore <= 2.0) parts.push(`When it appears, ${brandName} is usually near the top of the list (on average, the ${kpis.avgRankScore <= 1.5 ? "1st or 2nd" : "2nd"} brand mentioned), and it's the first name ${kpis.firstMentionRate}% of the time.`);
                      else if (kpis.avgRankScore <= 3.0) parts.push(`However, when it does appear, ${brandName} is typically the ${Math.round(kpis.avgRankScore)}${Math.round(kpis.avgRankScore) === 2 ? "nd" : "rd"} brand listed — meaning ${100 - kpis.firstMentionRate}% of the time, competitors are named before ${brandName}.`);
                      else parts.push(`When mentioned, ${brandName} tends to appear around the ${Math.round(kpis.avgRankScore)}th brand listed — AI typically recommends several competitors before getting to ${brandName}.`);
                    }
                    const ss = apiData.sentimentSplit;
                    if (ss) {
                      if (ss.positive >= 70) parts.push(`The good news: when AI does talk about ${brandName}, the tone is very positive — ${ss.positive}% of responses describe it favorably.`);
                      else if (ss.positive >= 50) parts.push(`When AI discusses ${brandName}, the tone is generally positive (${ss.positive}% favorable)${ss.negative > 0 ? `, though ${ss.negative}% of responses raise concerns worth keeping an eye on` : ""}.`);
                      else if (ss.negative >= 30) parts.push(`A note of caution: ${ss.negative}% of AI responses describe ${brandName} in a negative light — it's worth understanding what's driving this.`);
                    }
                    const topFrame = data.topFrames[0]?.frame;
                    if (topFrame) parts.push(`The #1 theme AI associates with ${brandName} is "${topFrame}."`);
                    return parts.join(" ");
                  })()}
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
          <CrossModelTable models={data.modelComparison} />
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
              <h2 className="text-sm font-semibold mb-2">What AI Is Saying About You</h2>
              <StandoutQuotes quotes={quotesData.quotes} />
            </section>
          </div>
        )}

        {/* ── Issue Landscape ────────────────────── */}
        <h2 className="text-lg font-semibold border-b border-border pb-2 mt-2">Issue Landscape</h2>

        <div id="competitor-snapshot" className="scroll-mt-24">
          <CompetitorSnapshot brandSlug={params.slug} model={model} range={range} />
        </div>

        <div id="competitor-alerts" className="scroll-mt-24">
          <CompetitorAlerts brandSlug={params.slug} model={model} range={range} />
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
