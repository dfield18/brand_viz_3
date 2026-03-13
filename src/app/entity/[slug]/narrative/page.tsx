"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { NarrativeResponse, TopicsResponse } from "@/types/api";
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
  totals?: { totalRuns: number; analyzedRuns: number };
}

interface TopicsApiResponse {
  hasData: boolean;
  topics?: TopicsResponse;
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
    { id: "narrative-frames", label: "Narrative Frames", heading: "Narratives" },
    { id: "top-narratives", label: "Top Narratives" },
    { id: "frame-trend", label: "Frame Trend" },
    { id: "strengths-weaknesses", label: "Strengths & Weaknesses", heading: "Sentiment" },
    { id: "sentiment-trend", label: "Sentiment Over Time" },
    { id: "sentiment-by-model", label: "Sentiment by Platform" },
    { id: "sentiment-by-prompt", label: "Sentiment by Question" },
    { id: "emerging-topics", label: "Emerging Topics", heading: "More" },
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
          />
        </div>

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

        {/* Sentiment Trend */}
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

        {/* Section: More */}
        <h2 className="text-lg font-semibold border-b border-border pb-2">More</h2>

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
