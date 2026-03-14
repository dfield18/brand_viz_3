"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Lightbulb } from "lucide-react";
import { NarrativeResponse, TopicsResponse, NarrativeDeltas } from "@/types/api";
import { NarrativeMetricCards } from "@/components/narrative/NarrativeMetricCards";

import { StrengthsWeaknesses } from "@/components/narrative/StrengthsWeaknesses";
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
import { useBrandName } from "@/lib/useBrandName";

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

function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^#+\s+/gm, "")
    .replace(/`/g, "")
    .replace(/~~/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function NarrativeInner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const brandName = useBrandName(params.slug);

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

  const sections: PageSection[] = [
    { id: "kpi-summary", label: "Scorecard" },
    { id: "narrative-insight", label: "Key Insights" },
    { id: "sentiment-trend", label: "Sentiment Trend" },
    { id: "narrative-frames", label: "Narrative Frames", heading: "Narratives" },
    { id: "top-narratives", label: "Top Narratives" },
    { id: "frame-trend", label: "Frame Trend" },
    { id: "strengths-weaknesses", label: "Strengths & Weaknesses", heading: "Sentiment" },
    { id: "sentiment-by-model", label: "Sentiment by Platform" },
    { id: "sentiment-by-prompt", label: "Sentiment by Question" },
    { id: "emerging-topics", label: "Emerging Topics", heading: "Trends & Exploration" },
    { id: "evidence-examples", label: "Explore AI Responses" },
  ];

  return (
    <div className="flex gap-8 xl:-ml-52">
      {/* Sidebar */}
      <div className="w-40 shrink-0">
        <OnThisPage sections={sections} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-10 xl:max-w-[1060px]">
        <p className="text-base text-muted-foreground leading-relaxed">
          This tab shows how AI platforms talk about {brandName}. Start with <span className="font-medium text-muted-foreground">Narratives</span> to see which stories and themes AI uses most often when describing {brandName}, then check <span className="font-medium text-muted-foreground">Sentiment</span> to understand whether those stories are casting {brandName} positively or negatively — and how much platforms agree.
        </p>

        {/* Metric Cards */}
        <div id="kpi-summary" className="scroll-mt-24">
          <NarrativeMetricCards
            sentimentSplit={data.sentimentSplit}
            trustRate={data.trustRate}
            weaknessRate={data.weaknessRate}
            polarization={data.polarization}
            frames={data.frames}
            hedgingRate={data.hedgingRate}
            sentimentTrend={data.sentimentTrend}
            narrativeDeltas={apiData.narrativeDeltas}
          />
        </div>

        {/* Narrative Summary + Recommendation */}
        <div id="narrative-insight" className="scroll-mt-24 space-y-4">
          {/* Narrative Summary */}
          {data.sentimentSplit && data.frames && data.frames.length > 0 && (
            <div className="rounded-xl border border-border bg-card shadow-section overflow-hidden">
              <div className="px-6 py-5 border-l-4 border-l-primary/40">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Narrative Summary</h3>
                <p className="text-sm text-foreground/80 leading-[1.7]">
                  {(() => {
                    const parts: string[] = [];
                    const topFrame = data.frames![0];
                    const split = data.sentimentSplit!;

                    // Frame
                    parts.push(`AI primarily frames ${brandName} as a "${topFrame.frame}" — this narrative appears in ${topFrame.percentage}% of responses.`);

                    // Sentiment
                    if (split.positive >= 60) {
                      parts.push(`Sentiment is strongly positive at ${split.positive}%, with only ${split.negative}% negative responses.`);
                    } else if (split.positive >= 40) {
                      parts.push(`Sentiment leans positive (${split.positive}%), though ${split.neutral}% of responses remain neutral.`);
                    } else if (split.neutral >= 60) {
                      parts.push(`Most responses (${split.neutral}%) are neutral — AI isn't strongly advocating for or against the brand.`);
                    } else if (split.negative >= 30) {
                      parts.push(`Watch the sentiment: ${split.negative}% of responses carry a negative tone, with only ${split.positive}% positive.`);
                    } else {
                      parts.push(`Sentiment is mixed — ${split.positive}% positive, ${split.neutral}% neutral, ${split.negative}% negative.`);
                    }

                    // Consistency
                    if (data.polarization === "High") {
                      parts.push(`AI platforms disagree significantly about ${brandName} — different models tell very different stories.`);
                    } else if (data.polarization === "Low") {
                      parts.push(`AI platforms largely agree on how they describe ${brandName}.`);
                    }

                    // Confidence
                    if (data.hedgingRate != null) {
                      const conf = 100 - data.hedgingRate;
                      if (conf < 65) {
                        parts.push(`AI models frequently hedge when discussing ${brandName}, using cautious language ${data.hedgingRate}% of the time.`);
                      } else if (conf >= 85) {
                        parts.push(`AI models speak confidently about ${brandName}, with direct recommendations ${conf}% of the time.`);
                      }
                    }

                    return parts.join(" ");
                  })()}
                </p>
              </div>
            </div>
          )}

          {/* Narrative Recommendation */}
          {recsData?.hasData && recsData.negativeNarratives?.weaknesses && recsData.negativeNarratives.weaknesses.length > 0 && (
            <div className="rounded-xl border border-border bg-card shadow-section overflow-hidden">
              <div className="flex items-start gap-4 px-6 py-5 bg-amber-50/30">
                <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">Narrative Action</span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                      Perception Issue
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80 leading-[1.7]">
                    {stripMarkdown(
                      recsData.negativeNarratives.narrativeSummary
                        ? recsData.negativeNarratives.narrativeSummary.split("\n").filter(Boolean)[0]
                        : recsData.negativeNarratives.weaknesses[0].suggestion
                    )}
                  </p>
                </div>
              </div>
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
            />
          </div>
        )}

        {/* Section: Narratives */}
        <h2 className="text-lg font-semibold border-b border-border pb-2">Narratives</h2>

        {/* Narrative Frame Breakdown */}
        {data.frames && data.frames.length > 0 && (
          <div id="narrative-frames" className="scroll-mt-24">
            <NarrativeFrameBreakdown frames={data.frames} brandName={brandName} />
          </div>
        )}

        {/* Top Narratives with Quotes */}
        {data.frames && data.frames.length > 0 && data.examples && data.examples.length > 0 && (
          <div id="top-narratives" className="scroll-mt-24">
            <TopNarrativeQuotes
              frames={data.frames}
              examples={data.examples}
              brandName={brandName}
              frameTrend={data.frameTrend}
              onFrameClick={(frame) => {
                const el = document.getElementById("frame-trend");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
          </div>
        )}

        {/* Narrative Frame Trend */}
        {data.frameTrend && data.frameTrend.length >= 2 && (
          <div id="frame-trend" className="scroll-mt-24">
            <FrameTrendChart frameTrend={data.frameTrend} />
          </div>
        )}

        {/* Section: Sentiment */}
        <h2 className="text-lg font-semibold border-b border-border pb-2">Sentiment</h2>

        {/* Strengths vs Weaknesses */}
        {((data.strengths && data.strengths.length > 0) ||
          (data.weaknesses && data.weaknesses.length > 0)) && (
          <div id="strengths-weaknesses" className="scroll-mt-24">
            <section className="rounded-xl border border-border bg-card p-6 shadow-section">
              <h2 className="text-base font-semibold mb-4">Strengths vs Weaknesses</h2>
              <StrengthsWeaknesses
                strengths={data.strengths ?? []}
                weaknesses={data.weaknesses ?? []}
                weaknessesAreNeutral={data.weaknessesAreNeutral}
                brandName={brandName}
              />
            </section>
          </div>
        )}

        {/* Sentiment by Model */}
        {data.sentimentTrend && data.sentimentTrend.length > 0 && (
          <div id="sentiment-by-model" className="scroll-mt-24">
            <SentimentByModel trend={data.sentimentTrend} brandName={brandName} />
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
            <section className="rounded-xl border border-border bg-card p-6 shadow-section">
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
