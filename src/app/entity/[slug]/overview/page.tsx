"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import Link from "next/link";
import { Lightbulb } from "lucide-react";
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
import { DataFooter } from "@/components/DataFooter";

interface ApiResponse {
  hasData: boolean;
  aiSummary?: string | null;
  brandCategory?: string | null;
  brandIndustry?: string | null;
  brandIndustryScope?: string | null;
  brandScopeFacets?: string[] | null;
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

function highlightSummary(
  text: string,
  industryCandidates: string | string[] | null | undefined,
  brandName: string,
): React.ReactNode {
  type Range = { start: number; end: number };
  const ranges: Range[] = [];

  // Accept a single string or an ordered list of candidate scope
  // phrases — e.g. ["senators from Alabama", "Republican senators",
  // "immigration reform"] for a political figure. Bold every candidate
  // that actually appears in the summary text (LLM may use more than
  // one), falling back to no highlight if none match.
  const candidates = Array.isArray(industryCandidates)
    ? industryCandidates
    : industryCandidates
      ? [industryCandidates]
      : [];
  const lowerText = text.toLowerCase();
  for (const candidate of candidates) {
    if (!candidate) continue;
    const idx = lowerText.indexOf(candidate.toLowerCase());
    if (idx !== -1) ranges.push({ start: idx, end: idx + candidate.length });
  }

  const escBrand = brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // The full "<brand> is mentioned in N% of responses" phrasing —
  // when present, bold the whole phrase as a single unit.
  const mentionRe = new RegExp(
    `${escBrand}\\s+is mentioned in \\d+(?:\\.\\d+)?% of responses`,
    "i",
  );
  const mentionMatch = mentionRe.exec(text);
  if (mentionMatch) {
    ranges.push({ start: mentionMatch.index, end: mentionMatch.index + mentionMatch[0].length });
  } else {
    // LLM didn't use the exact "is mentioned in X%" phrasing (it
    // varies — "has a low mention rate of 10%", "shows up in 10% of
    // responses", etc.). Still bold the brand name on its own so the
    // subject pops in any sentence shape. First occurrence only —
    // multiple bolds of the same name across one sentence reads as
    // overemphasis. Word-boundary anchors so "Bernie" doesn't catch
    // a substring inside "Bernie Sanders Foundation."
    const brandNameRe = new RegExp(`\\b${escBrand}\\b`, "i");
    const nameMatch = brandNameRe.exec(text);
    if (nameMatch) {
      ranges.push({ start: nameMatch.index, end: nameMatch.index + nameMatch[0].length });
    }
  }

  if (ranges.length === 0) return text;

  ranges.sort((a, b) => a.start - b.start);
  const merged: Range[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start < last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ ...r });
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  merged.forEach(({ start, end }, i) => {
    if (cursor < start) parts.push(text.slice(cursor, start));
    parts.push(
      <strong key={i} className="font-semibold text-foreground">
        {text.slice(start, end)}
      </strong>,
    );
    cursor = end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function OverviewInner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const brandName = useBrandName(params.slug);

  // Force scroll-to-top only when this is a fresh page load (e.g. after a
  // free-tier run redirects here from /, where the browser can restore the
  // landing page's scroll position mid-page). Skip for back/forward
  // navigation so the browser's own scroll restoration keeps working when
  // the user returns from another tab.
  useEffect(() => {
    const entries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (entries[0]?.type === "back_forward") return;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

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
  // Defer the sibling-tab prefetch to idle time so it doesn't fight
  // the Overview tab's own render for CPU / network on slower
  // devices. Seven parallel GPT-backed GETs kicked off immediately
  // on mount pushed LCP by a few hundred ms on cold loads; waiting
  // for requestIdleCallback keeps the same snappy tab-switching
  // behavior without the initial render cost.
  useEffect(() => {
    if (!apiData?.hasData || !validModel) return;
    const base = `brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`;
    const urls = [
      `/api/visibility?${base}`,
      `/api/narrative?${base}`,
      `/api/competition?${base}`,
      `/api/sources?${base}`,
      `/api/topics?${base}`,
      `/api/responses?${base}`,
      `/api/recommendations?${base}`,
    ];
    const idleWindow = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    let handle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    if (typeof idleWindow.requestIdleCallback === "function") {
      handle = idleWindow.requestIdleCallback(() => prefetchAll(urls), { timeout: 4000 });
    } else {
      // Safari still doesn't ship requestIdleCallback — 1s timeout
      // as a fallback preserves the original intent.
      timeoutHandle = setTimeout(() => prefetchAll(urls), 1000);
    }
    return () => {
      if (handle !== null && typeof idleWindow.cancelIdleCallback === "function") {
        idleWindow.cancelIdleCallback(handle);
      }
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);
    };
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
    { id: "kpi-summary", label: "Scorecard" },
    { id: "key-insights", label: "Key Insights" },
    { id: "visibility-trend", label: "Mention Rate Trend" },
    { id: "cross-model", label: "By AI Platform" },
    { id: "narrative-section", label: `How AI Describes ${brandName}`, heading: "Narrative" },
    { id: "standout-quotes", label: "What AI Is Saying" },
    { id: "competitor-snapshot", label: isOrg ? "Landscape" : "Competitive Landscape", heading: isOrg ? "Issue Landscape" : "Competitive Marketplace" },
    { id: "competitor-alerts", label: isOrg ? "Movement" : "Competitor Movement" },
    { id: "sources-trend", label: "Top Sources", heading: "Sources" },
  ];

  const kpis = apiData.visibilityKpis;
  const industry = apiData.brandIndustry;
  // Prefer the most specific scope phrase available. Facets read best
  // grammatically ("senators from Illinois", "Republican senators"),
  // then composed scope ("gun control and Connecticut"), then raw
  // industry, then a generic placeholder. "Questions about X" is used
  // instead of "X questions" so noun phrases (e.g. "senators from
  // Illinois") fit without awkward "senators from Illinois questions."
  const industryLabel =
    (apiData.brandScopeFacets && apiData.brandScopeFacets[0]) ||
    apiData.brandIndustryScope ||
    industry ||
    "this space";
  // Non-breaking spaces inside "last 90 days" so the phrase wraps as
  // a unit (before "last") instead of orphaning "days" onto its own
  // line when the caption is near the available width.
  const rangeSuffix = ` — last\u00A0${range}\u00A0days`;
  // Bold the brand name and the scope phrase so the caption's two
  // most load-bearing phrases pop visually instead of blurring into
  // the surrounding gray muted-foreground text.
  const BrandBold = <strong className="font-semibold text-foreground">{brandName}</strong>;
  const ScopeBold = <strong className="font-semibold text-foreground">{industryLabel}</strong>;
  const trendDescriptions: Record<string, React.ReactNode> = {
    visibility: (
      <>How often AI mentions {BrandBold} in questions about {ScopeBold}{rangeSuffix}</>
    ),
    topResult: (
      <>How often {BrandBold} ranks #1 when AI answers questions about {ScopeBold}{rangeSuffix}</>
    ),
    sov: (
      <>{BrandBold}&apos;s share of mentions when AI discusses {ScopeBold}{rangeSuffix}</>
    ),
  };
  // Collect all frames tied at the top percentage (sort to ensure highest first)
  const sortedFrames = [...data.topFrames].sort((a, b) => b.percentage - a.percentage);
  const topPct = sortedFrames[0]?.percentage ?? 0;
  const dominantFrames = sortedFrames
    .filter((f) => f.percentage === topPct)
    .map((f) => ({ name: f.frame, percentage: f.percentage }));

  return (
    <div className="flex gap-8 xl:-ml-52">
      {/* Sidebar — hidden on mobile */}
      <div className="hidden lg:block w-40 shrink-0">
        <OnThisPage sections={sections} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-8 xl:max-w-[1060px]">
        {/* Scorecard */}
        <div id="kpi-summary" className="scroll-mt-24">
          {kpis && (
            <>
              <OverviewScorecard
                overallMentionRate={kpis.overallMentionRate}
                kpiDeltas={apiData.kpiDeltas ?? null}
                brandName={brandName}
                industry={industry}
                industryLabel={industryLabel}
                category={apiData.brandCategory}
                dominantFrames={dominantFrames}
                sentimentSplit={apiData.sentimentSplit ?? null}
                topSourceType={apiData.topSourceType ?? null}
              />
              <DataFooter prompts="mixed" date={range} mode="snapshot" />
            </>
          )}
        </div>

        {/* Key Insights: Executive Summary + Top Recommendation merged */}
        <div id="key-insights" className="scroll-mt-24">
          <div className="rounded-xl bg-card shadow-section overflow-hidden">
            {/* 1-sentence AI insight */}
            {apiData.aiSummary && (
              <div className="flex items-start gap-3 px-5 py-3.5">
                <Lightbulb className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-[13px] text-foreground/70 leading-relaxed">
                  <span className="font-medium text-blue-700 mr-1.5">Key Insight:</span>
                  {highlightSummary(
                    apiData.aiSummary,
                    apiData.brandScopeFacets && apiData.brandScopeFacets.length > 0
                      ? apiData.brandScopeFacets
                      : apiData.brandIndustryScope || apiData.brandIndustry,
                    brandName,
                  )}
                </p>
              </div>
            )}
            {/* Top Recommendation — inline separator */}
            <TopRecommendation brandSlug={params.slug} brandName={brandName} model={model} range={range} />
          </div>
          <DataFooter prompts="mixed" date={range} mode="snapshot" />
        </div>

        {/* Mention Rate Trend — free-tier brands (slug ends in
            `--<8 hex>`) have training-knowledge-estimated historical
            points, so dash the line and swap the caption. The double
            hyphen is deliberate: the Pro slugifier collapses runs of
            non-alphanumerics to a single dash, so `--` can't collide
            with a legitimate Pro brand name. Hash verification runs
            server-side in isPubliclyViewableBrand; client styling
            doesn't need it. */}
        {visData?.visibility?.trend && visData.visibility.trend.length > 0 && (
          <div id="visibility-trend" className="scroll-mt-24">
            <section className="rounded-xl bg-card p-6 shadow-section">
              <VisibilityTrendChart
                trend={visData.visibility.trend}
                brandName={brandName}
                descriptionOverride={trendDescriptions}
                historicalEstimated={/--[0-9a-f]{8}$/.test(params.slug)}
              />
            </section>
            <DataFooter prompts="industry" date={range} />
          </div>
        )}

        <div id="cross-model" className="scroll-mt-24">
          <CrossModelTable models={data.modelComparison} brandName={brandName} category={apiData.brandCategory} />
          <DataFooter prompts="mixed" date={range} mode="snapshot" />
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
          <DataFooter prompts="all" date={range} />
        </div>

        {/* Standout Quotes */}
        {quotesData?.quotes && quotesData.quotes.length > 0 && (
          <div id="standout-quotes" className="scroll-mt-24">
            <section className="rounded-xl bg-card px-5 py-4 shadow-section">
              <h2 className="text-sm font-semibold mb-2">What AI Is Saying About {brandName}</h2>
              <StandoutQuotes quotes={quotesData.quotes} />
            </section>
            <DataFooter prompts="all" date={range} mode="snapshot" />
          </div>
        )}

        {/* ── Competition section ────────────────────── */}
        <h2 className="text-lg font-semibold border-b border-border pb-2 mt-2">{isOrg ? "Issue Landscape" : "Competitive Marketplace"}</h2>

        <div id="competitor-snapshot" className="scroll-mt-24">
          <CompetitorSnapshot brandSlug={params.slug} model={model} range={range} brandCategory={apiData.brandCategory} brandName={brandName} />
          <DataFooter prompts="all" date={range} mode="snapshot" />
        </div>

        <div id="competitor-alerts" className="scroll-mt-24">
          <CompetitorAlerts brandSlug={params.slug} model={model} range={range} brandCategory={apiData.brandCategory} />
          <DataFooter prompts="industry" date={range} mode="snapshot" />
        </div>

        {/* ── Sources ────────────────────────────── */}
        <h2 className="text-lg font-semibold border-b border-border pb-2 mt-2">Sources</h2>

        <div id="sources-trend" className="scroll-mt-24">
          <TopSourcesList brandSlug={params.slug} model={model} range={range} />
          <DataFooter prompts="all" date={range} />
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
