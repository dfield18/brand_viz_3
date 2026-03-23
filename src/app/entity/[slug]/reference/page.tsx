"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { VisibilityResponse } from "@/types/api";
import { SummaryStats } from "@/components/visibility/SummaryStats";
import { ModelBreakdownTable } from "@/components/visibility/ModelBreakdownTable";
import { ThemesChart } from "@/components/narrative/ThemesChart";
import { TopDescriptors } from "@/components/narrative/TopDescriptors";
import { PositioningQuadrant } from "@/components/narrative/PositioningQuadrant";
import { HedgingRate } from "@/components/narrative/HedgingRate";
import { ThemeTrendChart } from "@/components/narrative/ThemeTrendChart";
import { ClaimsSummary } from "@/components/narrative/ClaimsSummary";
import { ProminenceShareChart } from "@/components/competition/ProminenceShareChart";
import { CompetitorRankDistribution } from "@/components/competition/CompetitorRankDistribution";
import TopicSummaryCards from "@/components/topics/TopicSummaryCards";
import TopicImportanceChart from "@/components/topics/TopicImportanceChart";
import TopicMentionRateChart from "@/components/topics/TopicMentionRateChart";
import TopicRankChart from "@/components/topics/TopicRankChart";
import TopicOwnershipTable from "@/components/topics/TopicOwnershipTable";
import TopicProminenceChart from "@/components/topics/TopicProminenceChart";
import EmergingTopicsList from "@/components/topics/EmergingTopicsList";
import TopicTrendChart from "@/components/topics/TopicTrendChart";
import TopicPromptExamples from "@/components/topics/TopicPromptExamples";
import TopicModelSplit from "@/components/topics/TopicModelSplit";
import { CompetitiveOpportunities } from "@/components/competition/CompetitiveOpportunities";
import { CompetitorModelSplit } from "@/components/competition/CompetitorModelSplit";
import { CompetitorMatrix } from "@/components/competition/CompetitorMatrix";
import DomainCitationChart from "@/components/sources/DomainCitationChart";
import { CompetitorOnlySourcesTable } from "@/components/sources/CompetitorOnlySources";
import BrandAttributedSources from "@/components/sources/BrandAttributedSources";
import { NarrativeDriftChart } from "@/components/narrative/NarrativeDriftChart";
import { ClusterVisibilityChart } from "@/components/overview/ClusterVisibilityChart";
import { ResultsByPlatform } from "@/components/visibility/ResultsByPlatform";
import { NarrativeResponse, CompetitionResponse, TopicsResponse, SourcesResponse, OverviewResponse } from "@/types/api";
import { VALID_MODELS, MODEL_LABELS } from "@/lib/constants";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { useBrandName } from "@/lib/useBrandName";
import { PATAGONIA_DUMMY_VISIBILITY, PATAGONIA_DUMMY_TOTALS, PATAGONIA_DUMMY_JOB, NUCLEAR_ENERGY_DUMMY_VISIBILITY, NUCLEAR_ENERGY_DUMMY_TOTALS, NUCLEAR_ENERGY_DUMMY_JOB } from "@/lib/dummyVisibilityData";
import { PageSkeleton } from "@/components/PageSkeleton";

interface ApiResponse {
  hasData: boolean;
  reason?: string;
  job?: { id: string; model: string; range: number; finishedAt: string | null };
  visibility?: VisibilityResponse;
  totals?: { totalRuns: number; totalMentions: number };
}

interface NarrativeApiResponse {
  hasData: boolean;
  narrative?: NarrativeResponse;
}

interface CompetitionApiResponse {
  hasData: boolean;
  competition?: CompetitionResponse;
}

interface TopicsApiResponse {
  hasData: boolean;
  topics?: TopicsResponse;
}

interface SourcesApiResponse {
  hasData: boolean;
  sources?: SourcesResponse;
}

interface OverviewApiResponse {
  hasData: boolean;
  overview?: OverviewResponse;
}

function ReferenceInner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();

  const range = Number(searchParams.get("range")) || 90;
  const model = searchParams.get("model") || "all";
  const validModel = model === "all" || VALID_MODELS.includes(model);
  const brandName = useBrandName(params.slug);

  // DUMMY DATA OVERRIDE
  const dummyMap: Record<string, ApiResponse> = {
    patagonia: { hasData: true, job: PATAGONIA_DUMMY_JOB, visibility: PATAGONIA_DUMMY_VISIBILITY, totals: PATAGONIA_DUMMY_TOTALS },
    "nuclear-energy": { hasData: true, job: NUCLEAR_ENERGY_DUMMY_JOB, visibility: NUCLEAR_ENERGY_DUMMY_VISIBILITY, totals: NUCLEAR_ENERGY_DUMMY_TOTALS },
  };
  const hasDummy = params.slug in dummyMap;

  const url = validModel && !hasDummy
    ? `/api/visibility?brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`
    : null;
  const { data: rawApiData, loading, error } = useCachedFetch<ApiResponse>(url);

  const narrativeUrl = validModel
    ? `/api/narrative?brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`
    : null;
  const { data: narrativeData } = useCachedFetch<NarrativeApiResponse>(narrativeUrl);

  const competitionUrl = validModel
    ? `/api/competition?brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`
    : null;
  const { data: competitionData } = useCachedFetch<CompetitionApiResponse>(competitionUrl);

  const topicsUrl = validModel
    ? `/api/topics?brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`
    : null;
  const { data: topicsData } = useCachedFetch<TopicsApiResponse>(topicsUrl);

  const sourcesUrl = validModel
    ? `/api/sources?brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`
    : null;
  const { data: sourcesData } = useCachedFetch<SourcesApiResponse>(sourcesUrl);

  const overviewUrl = validModel
    ? `/api/overview?brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`
    : null;
  const { data: overviewData } = useCachedFetch<OverviewApiResponse>(overviewUrl);

  const apiData: ApiResponse | null = hasDummy ? dummyMap[params.slug] : rawApiData;

  if (loading) {
    return (
      <PageSkeleton label="Loading reference data...">
        <Header slug={params.slug} range={range} model={model} />
      </PageSkeleton>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
        <Header slug={params.slug} range={range} model={model} />
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (!apiData?.visibility) {
    return (
      <div className="space-y-8">
        <Header slug={params.slug} range={range} model={model} />
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No data available. Run prompts from Overview first.</p>
        </div>
      </div>
    );
  }

  const data = apiData.visibility;
  const totals = apiData.totals ?? { totalRuns: 0, totalMentions: 0 };

  return (
    <div className="space-y-8">
      <Header slug={params.slug} range={range} model={model} />

      {/* KPI Cards: Rate, Share of Voice, Avg Position, Top Result Rate, Prominence */}
      <SummaryStats
        overallMentionRate={data.overallMentionRate}
        shareOfVoice={data.shareOfVoice}
        avgRankScore={data.avgRankScore}
        firstMentionRate={data.firstMentionRate}
        totalRuns={totals.totalRuns}
        totalMentions={totals.totalMentions}
        kpiDeltas={data.kpiDeltas}
      />

      {/* Performance by Model Table */}
      <section className="rounded-xl bg-card p-6 shadow-section">
        <h2 className="text-base font-semibold">Performance by Model</h2>
        <p className="text-xs text-muted-foreground mt-1 mb-5">
          Mention rate, average position, and first-mention share per AI model
        </p>
        <ModelBreakdownTable rows={data.modelBreakdown} />
      </section>

      {/* Visibility by Prompt Cluster (moved from Overview tab) */}
      {overviewData?.hasData && overviewData.overview?.clusterVisibility && overviewData.overview.clusterVisibility.length > 0 && (
        <ClusterVisibilityChart clusters={overviewData.overview.clusterVisibility} />
      )}

      {/* Results by AI Platform (moved from Visibility tab) */}
      <ResultsByPlatform rows={data.modelBreakdown} brandName={params.slug.replace(/-/g, " ")} />

      {/* How AI Describes This Brand (moved from Narrative tab) */}
      {narrativeData?.hasData && narrativeData.narrative?.themes && narrativeData.narrative.themes.length > 0 && (
        <ThemesChart
          themes={narrativeData.narrative.themes}
          frames={narrativeData.narrative.frames}
          brandSlug={params.slug}
          range={range}
          pageModel={model}
        />
      )}

      {/* Top Descriptors (moved from Narrative tab) */}
      {narrativeData?.hasData && narrativeData.narrative?.descriptors && narrativeData.narrative.descriptors.length > 0 && (
        <TopDescriptors descriptors={narrativeData.narrative.descriptors} />
      )}

      {/* Positioning & Hedging Rate (moved from Narrative tab) */}
      {narrativeData?.hasData && narrativeData.narrative && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-xl bg-card p-6 shadow-section">
            <h2 className="text-base font-semibold mb-4">Positioning</h2>
            <PositioningQuadrant points={narrativeData.narrative.positioning} />
          </section>

          <section className="rounded-xl bg-card p-6 shadow-section">
            <h2 className="text-base font-semibold mb-4">Hedging Rate</h2>
            <HedgingRate rate={narrativeData.narrative.hedgingRate} trend={narrativeData.narrative.hedgingTrend} />
          </section>
        </div>
      )}

      {/* Most Common Claims (moved from Narrative tab) */}
      {narrativeData?.hasData && narrativeData.narrative &&
        ((narrativeData.narrative.strengths && narrativeData.narrative.strengths.length > 0) ||
          (narrativeData.narrative.weaknesses && narrativeData.narrative.weaknesses.length > 0)) && (
        <ClaimsSummary
          strengths={narrativeData.narrative.strengths ?? []}
          weaknesses={narrativeData.narrative.weaknesses ?? []}
          weaknessesAreNeutral={narrativeData.narrative.weaknessesAreNeutral}
        />
      )}

      {/* Theme Trend (moved from Narrative tab) */}
      {narrativeData?.hasData && narrativeData.narrative?.drift && narrativeData.narrative.drift.length >= 2 && (
        <ThemeTrendChart drift={narrativeData.narrative.drift} />
      )}

      {/* How the AI Story Is Shifting (moved from Narrative tab) */}
      {narrativeData?.hasData && narrativeData.narrative?.drift && narrativeData.narrative.drift.length > 0 && (
        <section className="rounded-xl bg-card p-6 shadow-section">
          <NarrativeDriftChart
            drift={narrativeData.narrative.drift}
            title="How the AI Story Is Shifting"
            description={`Tracks how much the AI story about ${params.slug.replace(/-/g, " ")} is shifting week to week. Higher values mean bigger changes in what AI says.`}
          />
          <details className="mt-5 group">
            <summary className="text-[11px] font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              How is this calculated?
            </summary>
            <div className="mt-3 text-[11px] text-muted-foreground leading-relaxed space-y-2 border-t border-border pt-3">
              <p>
                Each week, we measure the mix of narratives AI uses to describe the brand — for example, 40% sustainability, 30% innovation, 30% trust.
              </p>
              <p>
                The <span className="font-medium text-foreground">shift score</span> compares this week&apos;s narrative mix to the previous week&apos;s. A score of 0 means the story stayed exactly the same. A score closer to 1 means AI is telling a completely different story than last week.
              </p>
              <p>
                When filtering by an individual narrative, the score measures how much that specific narrative&apos;s share grew or shrank relative to everything else.
              </p>
            </div>
          </details>
        </section>
      )}

      {/* Prominence Share (moved from Competition tab) */}
      {competitionData?.hasData && competitionData.competition && competitionData.competition.prominenceShare.length > 0 && (
        <section className="rounded-xl bg-card p-6 shadow-section">
          <h2 className="text-base font-semibold">Prominence Share</h2>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Each brand&apos;s share of total prominence — how substantively AI discusses a brand, not just whether it&apos;s mentioned
          </p>
          <ProminenceShareChart
            prominenceShare={competitionData.competition.prominenceShare}
            brandEntityId={params.slug}
          />
        </section>
      )}

      {/* Rank Distribution (moved from Competition tab) */}
      {competitionData?.hasData && competitionData.competition && (
        <section className="rounded-xl bg-card p-6 shadow-section">
          <h2 className="text-base font-semibold mb-4">Rank Distribution</h2>
          <CompetitorRankDistribution
            competitors={competitionData.competition.competitors}
            rankDistribution={competitionData.competition.rankDistribution}
            brandEntityId={params.slug}
          />
        </section>
      )}

      {/* Competitive Opportunities (moved from Competition tab) */}
      {competitionData?.hasData && competitionData.competition && competitionData.competition.competitiveOpportunities.length > 0 && (
        <section className="rounded-xl bg-card p-6 shadow-section">
          <h2 className="text-base font-semibold mb-4">Competitive Opportunities</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Prompts where competitors outrank {brandName} or {brandName} is absent. Higher impact score = bigger opportunity.
          </p>
          <CompetitiveOpportunities opportunities={competitionData.competition.competitiveOpportunities} brandName={params.slug} />
        </section>
      )}

      {/* Model Split (moved from Competition tab) */}
      {competitionData?.hasData && competitionData.competition && competitionData.competition.modelSplit.length > 1 && (
        <section className="rounded-xl bg-card p-6 shadow-section">
          <h2 className="text-base font-semibold">How Each AI Platform Sees {brandName} vs Competitors</h2>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Different AI platforms recommend brands at different rates. This shows {brandName}&apos;s share of voice on each platform compared to competitors.
          </p>
          <CompetitorModelSplit modelSplit={competitionData.competition.modelSplit} brandEntityId={params.slug} />
        </section>
      )}

      {/* Response Details by Question (moved from Competition tab) */}
      {competitionData?.hasData && competitionData.competition && competitionData.competition.promptMatrix.length > 0 && (() => {
        const entityIds = competitionData.competition!.competitors.map((c) => c.entityId);
        const entityNames: Record<string, string> = {};
        for (const c of competitionData.competition!.competitors) {
          entityNames[c.entityId] = c.name;
        }
        return (
          <section className="rounded-xl bg-card p-6 shadow-section">
            <h2 className="text-base font-semibold">Response Details by Question</h2>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              See how each AI platform ranks brands for every question asked
            </p>
            <CompetitorMatrix
              matrix={competitionData.competition!.promptMatrix}
              entityIds={entityIds}
              entityNames={entityNames}
              brandEntityId={params.slug}
              brandSlug={params.slug}
              brandName={params.slug.replace(/-/g, " ")}
            />
          </section>
        );
      })()}

      {/* ── Topics Section ── */}
      {topicsData?.hasData && topicsData.topics && (
        <>
          {/* Topic KPI Cards */}
          <TopicSummaryCards scope={topicsData.topics.scope} topics={topicsData.topics.topics} emerging={topicsData.topics.emerging} />

          {/* Topic Importance */}
          {topicsData.topics.importance.length > 0 && (
            <TopicImportanceChart importance={topicsData.topics.importance} />
          )}

          {/* Topic Mention Rate */}
          {topicsData.topics.topics.length > 0 && (
            <TopicMentionRateChart topics={topicsData.topics.topics} brandName={brandName} />
          )}

          {/* Avg Rank by Topic + Topic Ownership */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TopicRankChart topics={topicsData.topics.topics} />
            <TopicOwnershipTable ownership={topicsData.topics.ownership} fragmentation={topicsData.topics.fragmentation} brandSlug={params.slug} brandName={brandName} />
          </div>

          {/* Topic Prominence */}
          {topicsData.topics.prominence.length > 0 && (
            <TopicProminenceChart prominence={topicsData.topics.prominence} brandName={brandName} />
          )}

          {/* Emerging Topics */}
          <EmergingTopicsList emerging={topicsData.topics.emerging} />

          {/* Topic Trend */}
          {topicsData.topics.trend.length > 1 && (
            <TopicTrendChart trend={topicsData.topics.trend} topics={topicsData.topics.topics} />
          )}

          {/* Topic Prompt Examples */}
          {topicsData.topics.promptExamples.length > 0 && (
            <TopicPromptExamples promptExamples={topicsData.topics.promptExamples} topics={topicsData.topics.topics} brandName={brandName} />
          )}

          {/* Topic Performance by Model */}
          <TopicModelSplit modelSplit={topicsData.topics.modelSplit} />
        </>
      )}

      {/* Top Cited Domains (moved from Sources tab) */}
      {sourcesData?.hasData && sourcesData.sources && sourcesData.sources.topDomains.length > 0 && (
        <DomainCitationChart topDomains={sourcesData.sources.topDomains} />
      )}

      {/* Sources Cited Near Brand Mentions */}
      {sourcesData?.hasData && sourcesData.sources?.brandAttributedSources && sourcesData.sources.brandAttributedSources.length > 0 && (
        <BrandAttributedSources
          sources={sourcesData.sources.brandAttributedSources}
          brandName={params.slug.replace(/-/g, " ")}
          brandSlug={params.slug}
          range={range}
          pageModel={model}
        />
      )}

      {/* Competitor-Only Sources — Full List */}
      {sourcesData?.hasData && sourcesData.sources?.domainsNotCitingBrand && sourcesData.sources.domainsNotCitingBrand.length > 0 && (
        <CompetitorOnlySourcesTable
          rows={sourcesData.sources.domainsNotCitingBrand}
          brandName={brandName}
        />
      )}
    </div>
  );
}

function Header({ slug, range, model }: { slug: string; range: number; model: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">
        {slug} &mdash; Reference
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        Additional charts and data tables &middot; {range}-day window &middot; {MODEL_LABELS[model] ?? model}
      </p>
    </div>
  );
}

export default function ReferencePage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>}>
      <ReferenceInner />
    </Suspense>
  );
}
