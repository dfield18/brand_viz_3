"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { NarrativeResponse, NarrativeFrame, TopicsResponse, NarrativeDeltas, OverviewResponse } from "@/types/api";
import { NarrativeMetricCards } from "@/components/narrative/NarrativeMetricCards";
import { useResponseDetail } from "@/lib/useResponseDetail";

import { TopNarrativeQuotes } from "@/components/narrative/TopNarrativeQuotes";
import { NarrativeExamples } from "@/components/narrative/NarrativeExamples";
import { SentimentByQuestion } from "@/components/narrative/SentimentByQuestion";
import { SentimentTrendChart } from "@/components/narrative/SentimentTrendChart";
import { SentimentByModel } from "@/components/narrative/SentimentByModel";

import { NarrativeFrameBreakdown } from "@/components/narrative/NarrativeFrameBreakdown";
import { FrameTrendChart } from "@/components/narrative/FrameTrendChart";
import EmergingTopicsList from "@/components/topics/EmergingTopicsList";
import { OnThisPage, type PageSection } from "@/components/OnThisPage";
import { PageSkeleton } from "@/components/PageSkeleton";
import { VALID_MODELS, MODEL_LABELS } from "@/lib/constants";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { useBrandName, useBrandCategory } from "@/lib/useBrandName";

interface ApiResponse {
  hasData: boolean;
  reason?: string;
  hint?: string;
  job?: { id: string; model: string; range: number; finishedAt: string | null };
  narrative?: NarrativeResponse;
  narrativeDeltas?: NarrativeDeltas | null;
  totals?: { totalRuns: number; analyzedRuns: number };
}

interface TopicsApiResponse {
  hasData: boolean;
  topics?: TopicsResponse;
}

interface RecsApiResponse {
  hasData: boolean;
  negativeNarratives?: { weaknesses: { weakness: string; suggestion: string }[]; narrativeSummary?: string };
}

interface OverviewApiResponse {
  hasData: boolean;
  overview?: OverviewResponse;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^#+\s+/gm, "")
    .replace(/`/g, "")
    .replace(/~~/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/^[\s•\-–—]+/gm, "") // strip leading bullets/dashes
    .replace(/\s{2,}/g, " ")
    .trim();
}

function NarrativeInner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const brandName = useBrandName(params.slug);
  const brandCategory = useBrandCategory(params.slug);
  const { openByRunId } = useResponseDetail(params.slug);

  const range = Number(searchParams.get("range")) || 90;
  const model = searchParams.get("model") || "all";

  const validModel = model === "all" || VALID_MODELS.includes(model);
  const url = validModel
    ? `/api/narrative?brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`
    : null;
  const { data: apiData, loading, error } = useCachedFetch<ApiResponse>(url);

  // Secondary fetch for topics data (emerging topics)
  const topicsUrl = validModel
    ? `/api/topics?brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`
    : null;
  const { data: topicsData } = useCachedFetch<TopicsApiResponse>(topicsUrl);

  // Fetch recommendations for narrative insight
  const recsUrl = validModel
    ? `/api/recommendations?brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`
    : null;
  const { data: recsData } = useCachedFetch<RecsApiResponse>(recsUrl);

  // Fetch overview frames so "How AI Describes You" matches the overview tab exactly
  const overviewUrl = validModel
    ? `/api/overview?brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`
    : null;
  const { data: overviewData } = useCachedFetch<OverviewApiResponse>(overviewUrl);

  // Loading
  if (loading) {
    return (
      <PageSkeleton label="Loading narrative data...">
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

  // No data
  if (apiData && !apiData.hasData) {
    const qs = new URLSearchParams({ range: String(range), model }).toString();
    return (
      <div className="space-y-8">
        <Header brandName={brandName} range={range} model={model} />
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            {apiData.hint || (
              <>
                No completed runs yet for <span className="font-medium text-foreground">{MODEL_LABELS[model] ?? model}</span> with a {range}-day range.
              </>
            )}
          </p>
          <p className="text-sm text-muted-foreground">
            Use{" "}
            <Link
              href={`/entity/${params.slug}/overview?${qs}`}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Run prompts on Overview
            </Link>
            {" "}to generate data.
          </p>
        </div>
      </div>
    );
  }

  // Has data
  if (!apiData?.narrative) return null;
  const data = apiData.narrative;

  // Use overview frames when available so "How AI Describes You" matches the overview tab
  const frames: NarrativeFrame[] = overviewData?.overview?.topFrames
    ? overviewData.overview.topFrames.map((f) => ({
        frame: f.frame,
        percentage: f.percentage,
        byModel: {
          chatgpt: f.byModel?.chatgpt ?? 0,
          gemini: f.byModel?.gemini ?? 0,
          claude: f.byModel?.claude ?? 0,
          perplexity: f.byModel?.perplexity ?? 0,
          google: f.byModel?.google ?? 0,
        },
      }))
    : data.frames ?? [];

  const sections: PageSection[] = [
    { id: "kpi-summary", label: "Scorecard" },
    { id: "narrative-insight", label: "Key Insights" },
    { id: "sentiment-trend", label: "Sentiment Trend" },
    { id: "narrative-frames", label: "Narrative Frames", heading: "Narratives" },
    { id: "top-narratives", label: "Top Narratives" },
    { id: "frame-trend", label: "Frame Trend" },
    { id: "sentiment-by-model", label: "Sentiment by Platform", heading: "Sentiment" },
    { id: "sentiment-by-prompt", label: "Sentiment by Question" },
    { id: "emerging-topics", label: "Emerging Topics", heading: "Trends & Exploration" },
    { id: "evidence-examples", label: "Explore AI Responses" },
  ];

  return (
    <div className="flex gap-8 xl:-ml-52">
      {/* Sidebar */}
      <div className="hidden lg:block w-40 shrink-0">
        <OnThisPage sections={sections} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-8 xl:max-w-[1060px]">
        {/* Metric Cards */}
        <div id="kpi-summary" className="scroll-mt-24">
          <NarrativeMetricCards
            sentimentSplit={data.sentimentSplit}
            polarization={data.polarization}
            frames={frames}
            hedgingRate={data.hedgingRate}
            sentimentTrend={data.sentimentTrend}
            narrativeDeltas={apiData.narrativeDeltas}
            brandName={brandName}
            category={brandCategory}
          />
        </div>

        <div className="px-5 py-4 mt-2">
          <p className="text-base text-muted-foreground leading-relaxed">
            When AI talks about {brandName}, what story does it tell? These metrics reveal the narrative AI platforms build around {brandName} — the themes, sentiment, and framing that shape how people perceive the brand through AI-generated answers.
          </p>
        </div>

        {/* Narrative Insight — concise summary + optional perception issue */}
        <div id="narrative-insight" className="scroll-mt-24">
          {data.sentimentSplit && frames.length > 0 && (
            <div className="rounded-xl bg-card shadow-section overflow-hidden">
              <div className="px-5 py-4">
                <p className="text-base text-foreground/80 leading-relaxed">
                  {(() => {
                    const topFrame = frames[0];
                    const split = data.sentimentSplit!;
                    let summary = `AI frames ${brandName} as "${topFrame.frame}" (${topFrame.percentage}% of responses). `;

                    if (split.positive >= 60) summary += `Sentiment: ${split.positive}% positive.`;
                    else if (split.negative >= 40) summary += `${split.negative}% negative sentiment — worth monitoring.`;
                    else if (split.neutral >= 50) summary += `Mostly neutral (${split.neutral}%).`;
                    else if (split.positive >= 40) summary += `Leaning positive (${split.positive}%).`;
                    else summary += `Mixed: ${split.positive}% positive, ${split.neutral}% neutral, ${split.negative}% negative.`;

                    if (data.polarization === "High") summary += ` Platforms disagree significantly.`;

                    return summary;
                  })()}
                </p>
              </div>

              {recsData?.hasData && recsData.negativeNarratives?.weaknesses && recsData.negativeNarratives.weaknesses.length > 0 && (
                <div className="flex items-start gap-3 px-5 py-3 border-t border-border bg-amber-50/20">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-[13px] text-foreground/70 leading-relaxed">
                    <span className="font-medium text-amber-700 mr-1.5">Perception Issue:</span>
                    {(() => {
                      const raw = recsData.negativeNarratives.narrativeSummary
                        ? recsData.negativeNarratives.narrativeSummary.split("\n").filter(Boolean)[0]
                        : recsData.negativeNarratives.weaknesses[0].weakness;
                      // Strip the suggestion suffix (e.g. " — consider publishing content...")
                      const cleaned = stripMarkdown(raw).replace(/\s*[—–-]+\s*consider\s.*/i, "");
                      return `"${cleaned}"`;
                    })()}{" — "}
                    <span className="text-muted-foreground">consider publishing content that directly addresses this perception.</span>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sentiment Trend — right after scorecard for trend visibility */}
        {data.sentimentTrend && data.sentimentTrend.length > 0 && (
          <div id="sentiment-trend" className="scroll-mt-24">
            <SentimentTrendChart
              trend={data.sentimentTrend}
              brandSlug={params.slug}
              range={range}
              pageModel={model}
              brandName={brandName}
              category={brandCategory}
            />
          </div>
        )}

        {/* Section: Narratives */}
        <h2 className="text-lg font-semibold border-b border-border pb-2">Narratives</h2>

        {/* Narrative Frame Breakdown */}
        {frames.length > 0 && (
          <div id="narrative-frames" className="scroll-mt-24">
            <NarrativeFrameBreakdown frames={frames} brandName={brandName} />
          </div>
        )}

        {/* Top Narratives with Quotes */}
        {frames.length > 0 && data.examples && data.examples.length > 0 && (
          <div id="top-narratives" className="scroll-mt-24">
            <TopNarrativeQuotes
              frames={frames}
              examples={data.examples}
              brandName={brandName}
              category={brandCategory}
              frameTrend={data.frameTrend}
              onFrameClick={() => {
                const el = document.getElementById("frame-trend");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              onQuoteClick={(runId) => openByRunId(runId, { brandName })}
            />
          </div>
        )}

        {/* Narrative Frame Trend */}
        {data.frameTrend && data.frameTrend.length >= 2 && (
          <div id="frame-trend" className="scroll-mt-24">
            <FrameTrendChart
              frameTrend={data.frameTrend}
              topFrameNames={[...frames].sort((a, b) => b.percentage - a.percentage).map((f) => f.frame)}
            />
          </div>
        )}

        {/* Section: Sentiment */}
        <h2 className="text-lg font-semibold border-b border-border pb-2">Sentiment</h2>

        {/* Sentiment by Model */}
        {data.sentimentTrend && data.sentimentTrend.length > 0 && (
          <div id="sentiment-by-model" className="scroll-mt-24">
            <SentimentByModel trend={data.sentimentTrend} brandName={brandName} category={brandCategory} modelComparison={overviewData?.overview?.modelComparison} />
          </div>
        )}

        {/* Sentiment by Question */}
        {data.sentimentByQuestion && data.sentimentByQuestion.length > 0 && (
          <div id="sentiment-by-prompt" className="scroll-mt-24">
            <SentimentByQuestion
              data={data.sentimentByQuestion}
              brandName={params.slug.replace(/-/g, " ")}
              brandSlug={params.slug}
              range={range}
              pageModel={model}
            />
          </div>
        )}

        {/* Section: Trends & Exploration */}
        <h2 className="text-lg font-semibold border-b border-border pb-2">Trends & Exploration</h2>

        {/* Emerging Topics */}
        {topicsData?.hasData && topicsData.topics && topicsData.topics.emerging.length > 0 && (
          <div id="emerging-topics" className="scroll-mt-24">
            <EmergingTopicsList emerging={topicsData.topics.emerging} />
          </div>
        )}

        {/* Section: Explore AI Responses by Narrative */}
        {data.examples && data.examples.length > 0 && (
          <div id="evidence-examples" className="scroll-mt-24">
            <section className="rounded-xl bg-card p-6 shadow-section">
              <NarrativeExamples examples={data.examples} brandSlug={params.slug} brandName={params.slug.replace(/-/g, " ")} />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Header({ brandName, range, model }: { brandName: string; range: number; model: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">
        {brandName} &mdash; AI Brand Narrative Report
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        {range}-day window &middot; {MODEL_LABELS[model] ?? model}
      </p>
    </div>
  );
}

export default function NarrativePage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>}>
      <NarrativeInner />
    </Suspense>
  );
}
