"use client";

import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import type { CompetitionResponse, CompetitorNarrative, WinLossData, CompetitorRow } from "@/types/api";
import { CompetitionSummaryCards } from "@/components/competition/CompetitionSummaryCards";
import { BrandBreakdown } from "@/components/competition/BrandBreakdown";
import { CompetitorSentimentMap } from "@/components/competition/CompetitorSentimentMap";
import { WinLossTable } from "@/components/competition/WinLossTable";
import { CompetitiveVisibilityTrend } from "@/components/competition/CompetitiveVisibilityTrend";
import { CoMentionHeatmap } from "@/components/competition/CoMentionHeatmap";
import { SentimentDistribution } from "@/components/competition/SentimentDistribution";
import { BiggestThreat } from "@/components/competition/BiggestThreat";
import { CompetitorNarrativeCards } from "@/components/competition/CompetitorNarrativeCards";
import { CompetitorFrameBreakdown, CompetitorEntityDropdown, useDefaultCompetitorEntity } from "@/components/competition/CompetitorFrameBreakdown";
import { CompetitiveSentimentTrend } from "@/components/competition/CompetitiveSentimentTrend";
import { OnThisPage, type PageSection } from "@/components/OnThisPage";
import { PageSkeleton } from "@/components/PageSkeleton";
import { VALID_MODELS, MODEL_LABELS } from "@/lib/constants";
import { useBrandName } from "@/lib/useBrandName";
import { useCachedFetch } from "@/lib/useCachedFetch";

interface ApiResponse {
  hasData: boolean;
  reason?: string;
  hint?: string;
  job?: { id: string; model: string; range: number; finishedAt: string | null };
  competition?: CompetitionResponse;
  totals?: { totalRuns: number };
}

function CompetitionInner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const brandName = useBrandName(params.slug);

  const range = Number(searchParams.get("range")) || 90;
  const model = searchParams.get("model") || "all";

  const validModel = model === "all" || VALID_MODELS.includes(model);
  const url = validModel
    ? `/api/competition?brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`
    : null;
  const { data: apiData, loading, error } = useCachedFetch<ApiResponse>(url);

  // Loading
  if (loading) {
    return (
      <PageSkeleton label="Loading competition data...">
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
  if (!apiData?.competition) return null;
  const data = apiData.competition;
  const brandEntityId = params.slug;
  const brandCompetitor = data.competitors.find((c) => c.isBrand);
  const compBrandName = brandCompetitor?.name ?? brandName;

  // Build entity name map
  const entityNames: Record<string, string> = {};
  for (const c of data.competitors) {
    entityNames[c.entityId] = c.name;
  }
  const entityIds = data.competitors.map((c) => c.entityId);

  // Build unique prompt list from promptMatrix for dropdowns
  const prompts = (() => {
    const seen = new Map<string, string>();
    for (const row of data.promptMatrix) {
      if (!seen.has(row.promptId)) {
        seen.set(row.promptId, row.promptText);
      }
    }
    return [...seen.entries()].map(([id, text]) => ({ id, text }));
  })();

  const sections: PageSection[] = [
    { id: "kpi-summary", label: "Scorecard" },
    { id: "visibility-trend", label: "AI Mentions Over Time", heading: "Metrics Deep Dive" },
    { id: "brand-breakdown", label: "Competitive Leaderboard" },
    { id: "competitor-frames", label: "Competitor Positioning", heading: "Perception", subheading: "Narratives" },
    { id: "visibility-sentiment", label: "Mentioned vs Praised", subheading: "Sentiment" },
    { id: "sentiment", label: "Brand Sentiment" },
    { id: "sentiment-trend", label: "Sentiment Over Time" },
    { id: "win-loss", label: "Win Rate", heading: "Head-to-Head" },
    { id: "competitor-prompts", label: "Where You Lose" },
    { id: "co-mention", label: "Brand Associations" },
  ];

  return (
    <div className="flex gap-8 xl:-ml-52">
      {/* Sidebar */}
      <div className="w-40 shrink-0">
        <OnThisPage sections={sections} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-6 xl:max-w-[1060px]">
        {/* KPI Cards */}
        <div id="kpi-summary" className="scroll-mt-24">
          {brandCompetitor && (
            <CompetitionSummaryCards
              scope={data.scope}
              brandCompetitor={brandCompetitor}
              winLoss={data.winLoss}
              fragmentation={data.fragmentation}
              brandName={compBrandName}
            />
          )}
        </div>

        {/* ── Metrics Deep Dive ─────────────────────────── */}
        <h2 className="text-lg font-semibold text-foreground mt-4">Metrics Deep Dive</h2>
        <p className="text-sm text-muted-foreground leading-relaxed -mt-6">
          This tab shows how {compBrandName} stacks up against competitors in AI responses. See who AI mentions most often, track how competitive positioning is shifting over time, and identify where {compBrandName} is winning or losing head-to-head matchups.
        </p>

        {/* Visibility Trend */}
        {data.competitiveTrend.length >= 1 && (
          <div id="visibility-trend" className="scroll-mt-24">
            <CompetitiveVisibilityTrend
              trend={data.competitiveTrend}
              entityNames={entityNames}
              brandEntityId={brandEntityId}
              brandSlug={params.slug}
              brandName={compBrandName}
              range={range}
              pageModel={model}
            />
          </div>
        )}

        <p className="text-xs text-muted-foreground/80 leading-relaxed">
          All metrics on this tab are based on general industry prompts only — prompts that mention the brand by name are excluded. Data reflects most recent responses.
        </p>

        {/* Brand Breakdown + Rank Distribution */}
        <div id="brand-breakdown" className="scroll-mt-24">
          <BrandBreakdown
            competitors={data.competitors}
            brandSlug={params.slug}
            brandName={compBrandName}
            range={range}
            pageModel={model}
            winLoss={data.winLoss}
            modelSplit={data.modelSplit}
            rankDistribution={data.rankDistribution}
            brandEntityId={brandEntityId}
            prompts={prompts}
          />
        </div>

        {/* ── Perception ───────────────────────────────── */}
        <h2 className="text-lg font-semibold text-foreground mt-4">Perception</h2>

        {/* How AI Positions Competitors — frames + narrative cards in one box */}
        {data.competitorNarratives && data.competitorNarratives.length > 0 && (
          <div id="competitor-frames" className="scroll-mt-24">
            <CompetitorPerceptionSection
              narratives={data.competitorNarratives}
              competitors={data.competitors}
              brandName={compBrandName}
              brandSlug={params.slug}
              range={range}
              pageModel={model}
            />
          </div>
        )}

        {/* Visibility vs Sentiment */}
        <div id="visibility-sentiment" className="scroll-mt-24">
          <SentimentMapSection
            competitors={data.competitors}
            brandEntityId={brandEntityId}
            brandSlug={params.slug}
            range={range}
            pageModel={model}
          />
        </div>

        {/* Sentiment Distribution */}
        <div id="sentiment" className="scroll-mt-24">
          <section className="rounded-xl bg-card p-6 shadow-section">
            <h2 className="text-base font-semibold">How Positively AI Talks About Each Brand</h2>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              How positive or negative AI is about each competitor
            </p>
            <SentimentDistribution competitors={data.competitors} />
          </section>
        </div>

        {/* Sentiment Trend */}
        {data.sentimentTrend && data.sentimentTrend.length > 0 && (
          <div id="sentiment-trend" className="scroll-mt-24">
            <CompetitiveSentimentTrend
              trend={data.sentimentTrend}
              entityNames={entityNames}
              brandEntityId={brandEntityId}
              brandSlug={params.slug}
              brandName={entityNames[brandEntityId]}
              range={range}
              pageModel={model}
            />
          </div>
        )}

        {/* ── Head-to-Head ──────────────────────────────── */}
        <h2 className="text-lg font-semibold text-foreground mt-4">Head-to-Head</h2>

        <div id="win-loss" className="scroll-mt-24">
          <WinLossSection
            winLoss={data.winLoss}
            competitors={data.competitors}
            brandSlug={params.slug}
            brandName={compBrandName}
            range={range}
            pageModel={model}
          />
        </div>

        {/* Co-Mention Network */}
        {data.coMentions.length > 0 && (
          <div id="co-mention" className="scroll-mt-24">
            <section className="rounded-xl bg-card p-6 shadow-section">
              <h2 className="text-base font-semibold">Brand Associations: Who AI Groups Together</h2>
              <p className="text-xs text-muted-foreground mt-1 mb-5">
                When AI mentions one brand, which others tend to appear in the same response
              </p>
              <CoMentionHeatmap
                coMentions={data.coMentions}
                entityIds={entityIds}
                entityNames={entityNames}
                brandEntityId={brandEntityId}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function SentimentMapSection({
  competitors: initialCompetitors,
  brandEntityId,
  brandSlug,
  range,
  pageModel,
}: {
  competitors: CompetitorRow[];
  brandEntityId: string;
  brandSlug: string;
  range: number;
  pageModel: string;
}) {
  const [model, setModel] = useState(pageModel);

  const url =
    model !== pageModel
      ? `/api/competition?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}`
      : null;
  const { data: apiData, loading } = useCachedFetch<ApiResponse>(url);

  const competitors =
    model !== pageModel && apiData?.competition
      ? apiData.competition.competitors
      : initialCompetitors;

  return (
    <section className="rounded-xl bg-card p-6 shadow-section outline-none [&_*]:focus:outline-none">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold">Who Gets Mentioned vs Who Gets Praised</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Brands in the top-right are mentioned often and described positively — the ideal position
          </p>
        </div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0"
        >
          <option value="all">All Models</option>
          {VALID_MODELS.map((m) => (
            <option key={m} value={m}>
              {MODEL_LABELS[m] ?? m}
            </option>
          ))}
        </select>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      ) : (
        <CompetitorSentimentMap competitors={competitors} brandEntityId={brandEntityId} />
      )}
    </section>
  );
}

function WinLossSection({
  winLoss: initialWinLoss,
  competitors: initialCompetitors,
  brandSlug,
  brandName,
  range,
  pageModel,
}: {
  winLoss: WinLossData;
  competitors: CompetitorRow[];
  brandSlug: string;
  brandName: string;
  range: number;
  pageModel: string;
}) {
  const [model, setModel] = useState(pageModel);

  const url =
    model !== pageModel
      ? `/api/competition?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}`
      : null;
  const { data: apiData, loading } = useCachedFetch<ApiResponse>(url);

  const winLoss =
    model !== pageModel && apiData?.competition
      ? apiData.competition.winLoss
      : initialWinLoss;

  const competitors =
    model !== pageModel && apiData?.competition
      ? apiData.competition.competitors
      : initialCompetitors;

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold">Win Rate: When AI Picks {brandName} Over Competitors</h2>
          <p className="text-xs text-muted-foreground mt-1">
            How often {brandName} outranks each competitor when both appear in the same AI response
          </p>
        </div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0"
        >
          <option value="all">All Models</option>
          {VALID_MODELS.map((m) => (
            <option key={m} value={m}>
              {MODEL_LABELS[m] ?? m}
            </option>
          ))}
        </select>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      ) : (
        <>
          <BiggestThreat competitors={competitors} winLoss={winLoss} brandName={brandName} />
          <div className="mt-5">
            <WinLossTable winLoss={winLoss} />
          </div>

          {/* Prompts where competitors rank higher */}
          {winLoss.topLosses && winLoss.topLosses.length > 0 && (
            <div id="competitor-prompts" className="mt-6 pt-5 border-t border-border scroll-mt-24">
              <h3 className="text-sm font-semibold mb-1">Prompts Where Competitors Rank Higher</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Questions where other brands outrank {brandName} — these are opportunities to improve positioning
              </p>
              <div className={`space-y-2 ${winLoss.topLosses.length > 6 ? "max-h-[340px] overflow-y-auto" : ""}`}>
                {winLoss.topLosses.map((loss, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3"
                  >
                    <p className="text-xs font-medium text-foreground mb-2 leading-relaxed">
                      &ldquo;{loss.promptText}&rdquo;
                    </p>
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                      <span>
                        <span className="font-medium text-red-500">{loss.competitorName}</span>
                        {" "}ranked #{loss.competitorRank ?? "—"}
                      </span>
                      <span className="text-border">|</span>
                      <span>
                        <span className="font-medium text-foreground">{brandName}</span>
                        {" "}ranked #{loss.yourRank ?? "not mentioned"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
        Based on prompts where both brands were mentioned — shows which brand AI positioned more favorably.
      </p>
    </section>
  );
}

function CompetitorPerceptionSection({
  narratives: initialNarratives,
  competitors: initialCompetitors,
  brandName,
  brandSlug,
  range,
  pageModel,
}: {
  narratives: CompetitorNarrative[];
  competitors: CompetitorRow[];
  brandName: string;
  brandSlug: string;
  range: number;
  pageModel: string;
}) {
  const [model, setModel] = useState(pageModel);
  const defaultEntity = useDefaultCompetitorEntity(initialNarratives, initialCompetitors);
  const [selectedEntity, setSelectedEntity] = useState(defaultEntity);

  const url =
    model !== pageModel
      ? `/api/competition?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}`
      : null;
  const { data: apiData, loading } = useCachedFetch<ApiResponse>(url);

  const narratives =
    model !== pageModel && apiData?.competition?.competitorNarratives
      ? apiData.competition.competitorNarratives
      : initialNarratives;

  const competitors =
    model !== pageModel && apiData?.competition
      ? apiData.competition.competitors
      : initialCompetitors;

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-6">
        <h2 className="text-base font-semibold">How AI Positions {brandName}&apos;s Competitors</h2>
        <div className="flex items-center gap-2 shrink-0">
          <CompetitorEntityDropdown
            narratives={narratives}
            competitors={competitors}
            selectedEntity={selectedEntity}
            onEntityChange={setSelectedEntity}
          />
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0"
          >
            <option value="all">All Models</option>
            {VALID_MODELS.map((m) => (
              <option key={m} value={m}>
                {MODEL_LABELS[m] ?? m}
              </option>
            ))}
          </select>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      ) : (
        <>
          <CompetitorFrameBreakdown
            narratives={narratives}
            competitors={competitors}
            brandName={brandName}
            selectedEntity={selectedEntity}
            onEntityChange={setSelectedEntity}
          />
          <div className="mt-8 pt-8 border-t border-border" id="competitor-narratives">
            <div className="mb-5">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">What AI Says About Each Competitor</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Key themes, descriptions, and claims AI makes about each competitor — expand a brand to see details
              </p>
            </div>
            <CompetitorNarrativeCards
              narratives={narratives}
              competitors={competitors}
              selectedEntityId={selectedEntity}
            />
          </div>
        </>
      )}
    </section>
  );
}

function Header({ brandName, range, model }: { brandName: string; range: number; model: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">
        {brandName} &mdash; Competitive Landscape
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        {range}-day window &middot; {MODEL_LABELS[model] ?? model}
      </p>
    </div>
  );
}

export default function CompetitionPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>}>
      <CompetitionInner />
    </Suspense>
  );
}
