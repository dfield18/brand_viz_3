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
                    const ordinal = (n: number) => {
                      const s = ["th", "st", "nd", "rd"];
                      const v = n % 100;
                      return n + (s[(v - 20) % 10] || s[v] || s[0]);
                    };
                    const parts: string[] = [];
                    if (kpis.overallMentionRate >= 80 && kpis.avgRankScore > 0 && kpis.avgRankScore <= 1.5) {
                      parts.push(`Great news — when someone asks an AI tool about this space, ${brandName} comes up ${kpis.overallMentionRate}% of the time, and it's usually the very first name mentioned. That's a strong position.`);
                    } else if (kpis.overallMentionRate >= 60) {
                      parts.push(`${brandName} is showing up well — it's mentioned in ${kpis.overallMentionRate}% of AI answers about this space and makes up ${kpis.shareOfVoice}% of all the brand names AI brings up. That's solid visibility.`);
                    } else if (kpis.overallMentionRate >= 30) {
                      parts.push(`Right now, when someone asks an AI tool about this space, ${brandName} comes up about ${kpis.overallMentionRate}% of the time. That means in roughly ${100 - kpis.overallMentionRate}% of those conversations, people are hearing about other brands instead. ${brandName} makes up ${kpis.shareOfVoice}% of all the brand names mentioned.`);
                    } else if (kpis.overallMentionRate > 0) {
                      parts.push(`Here's something to pay attention to: ${brandName} only comes up in ${kpis.overallMentionRate}% of AI answers about this space. That means most people asking AI for recommendations in this area won't hear about ${brandName} at all.`);
                    } else {
                      parts.push(`${brandName} isn't showing up in AI answers about this space yet. More and more people are turning to AI tools like ChatGPT and Google to get recommendations — and right now, they won't find ${brandName} in those results.`);
                    }
                    if (kpis.avgRankScore > 0) {
                      const rounded = Math.round(kpis.avgRankScore);
                      if (kpis.avgRankScore <= 1.3) parts.push(`Even better, when ${brandName} does come up, it's typically the first name on the list — AI leads with it ${kpis.firstMentionRate}% of the time.`);
                      else if (kpis.avgRankScore <= 2.0) parts.push(`When it does come up, ${brandName} is usually near the top — it's the ${kpis.avgRankScore <= 1.5 ? "1st or 2nd" : "2nd"} brand AI mentions, and it leads the list ${kpis.firstMentionRate}% of the time.`);
                      else if (kpis.avgRankScore <= 3.0) parts.push(`When it does come up, ${brandName} is typically listed as the ${ordinal(rounded)} brand — so competitors tend to get named first. Only ${kpis.firstMentionRate}% of the time is ${brandName} the first name mentioned.`);
                      else parts.push(`When AI does mention ${brandName}, it usually lists ${rounded === 4 ? "three or four" : "several"} other brands first — ${brandName} tends to show up around the ${ordinal(rounded)} spot. There's an opportunity to move up.`);
                    }
                    const ss = apiData.sentimentSplit;
                    if (ss) {
                      if (ss.positive >= 70) parts.push(`On the bright side, when AI talks about ${brandName}, it's overwhelmingly positive — ${ss.positive}% of what it says is favorable.`);
                      else if (ss.positive >= 50) parts.push(`When AI does talk about ${brandName}, the tone is mostly positive (${ss.positive}% favorable)${ss.negative > 0 ? `, but ${ss.negative}% of the time it raises some concerns worth looking into` : ""}.`);
                      else if (ss.negative >= 30) parts.push(`Something to keep an eye on: ${ss.negative}% of the time, AI describes ${brandName} in a negative way. It's worth digging into what's behind that.`);
                    }
                    const topFrame = data.topFrames[0]?.frame;
                    if (topFrame) parts.push(`The biggest theme AI connects with ${brandName}? "${topFrame}."`);
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
