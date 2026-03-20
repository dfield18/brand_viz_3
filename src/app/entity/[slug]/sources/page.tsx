"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Link from "next/link";
import { PageSkeleton } from "@/components/PageSkeleton";
import { VALID_MODELS, MODEL_LABELS } from "@/lib/constants";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { useBrandName, useBrandCategory } from "@/lib/useBrandName";
import type { SourcesResponse } from "@/types/api";
import SourceSummaryCards from "@/components/sources/SourceSummaryCards";
import TopDomainsTable from "@/components/sources/TopDomainsTable";
import EmergingSourcesList from "@/components/sources/EmergingSourcesList";
// SourceModelSplit merged into CompetitorSourceComparison
import DomainDetailDrawer from "@/components/sources/DomainDetailDrawer";
import TopCitedSources from "@/components/sources/TopCitedSources";
// SourcePromptMatrix merged into CompetitorSourceComparison
import OfficialSiteCitations from "@/components/sources/OfficialSiteCitations";
import SourceCategoryOverTime from "@/components/sources/SourceCategoryOverTime";
import CompetitorSourceComparison from "@/components/sources/CompetitorSourceComparison";
import CompetitorOnlySources from "@/components/sources/CompetitorOnlySources";
import { OnThisPage, type PageSection } from "@/components/OnThisPage";

interface ApiResponse {
  hasData: boolean;
  reason?: string;
  hint?: string;
  job?: { id: string; model: string; range: number; finishedAt: string | null };
  sources?: SourcesResponse;
  entityNames?: Record<string, string>;
  totals?: { totalRuns: number };
}

function SourcesInner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const brandName = useBrandName(params.slug);
  const brandCategory = useBrandCategory(params.slug);
  const isOrg = brandCategory === "political_advocacy";

  const range = Number(searchParams.get("range")) || 90;
  const model = searchParams.get("model") || "all";
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  const validModel = model === "all" || VALID_MODELS.includes(model);
  const url = validModel
    ? `/api/sources?brandSlug=${encodeURIComponent(params.slug)}&model=${model}&range=${range}`
    : null;
  const { data: apiData, loading, error } = useCachedFetch<ApiResponse>(url);

  // Loading
  if (loading) {
    return (
      <PageSkeleton label="Loading sources data...">
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
  if (!apiData?.sources) return null;
  const data = apiData.sources;

  const sections: PageSection[] = [
    { id: "kpi-summary", label: "Scorecard" },
    { id: "top-cited", label: "Top Cited Sources", heading: "Source Overview" },
    { id: "source-types-over-time", label: "Top Source Trends" },
    { id: "official-sites", label: "Official Sites" },
    { id: "competitor-only", label: isOrg ? "Uncited Sources" : "Competitor-Only Sources" },
    { id: "competitor-sources", label: "Source Citation Matrix", heading: "Source Breakout" },
    { id: "emerging-sources", label: "Emerging Sources" },
    { id: "domain-details", label: "All Sources", heading: "Deep Dive" },
  ];

  return (
    <div className="flex gap-8 xl:-ml-52">
      {/* Sidebar */}
      <div className="w-40 shrink-0">
        <OnThisPage sections={sections} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-8 xl:max-w-[1060px]">
        {/* KPI Summary */}
        <div id="kpi-summary" className="scroll-mt-24">
          <SourceSummaryCards scope={data.scope} summary={data.summary} emerging={data.emerging} topDomains={data.topDomains} range={range} />
        </div>

        <div className="px-5 py-4 mt-2">
          <p className="text-base text-muted-foreground leading-relaxed">
            See which websites and sources AI platforms cite when talking about {brandName}. Understanding where AI gets its information helps identify which content to optimize and which third-party sources are shaping {brandName}&apos;s AI presence.
          </p>
        </div>

        {/* ── Source Overview ─────────────────────────── */}
        <h2 className="text-lg font-semibold border-b border-border pb-2">Source Overview</h2>

        {/* Top Cited Sources */}
        <div id="top-cited" className="scroll-mt-24">
          <TopCitedSources topDomains={data.topDomains} modelSplit={data.modelSplit} onDomainClick={setSelectedDomain} brandSlug={params.slug} range={range} pageModel={model} brandName={brandName} />
        </div>

        {/* Top Source Trends */}
        {data.domainOverTime && data.domainOverTime.length > 0 && (
          <div id="source-types-over-time" className="scroll-mt-24">
            <SourceCategoryOverTime data={data.domainOverTime} brandSlug={params.slug} range={range} pageModel={model} />
          </div>
        )}

        {/* Official Sites */}
        {data.officialSites && data.officialSites.length > 0 && (
          <div id="official-sites" className="scroll-mt-24">
            <OfficialSiteCitations officialSites={data.officialSites} brandSlug={params.slug} range={range} pageModel={model} entityNames={apiData.entityNames} />
          </div>
        )}

        {/* Competitor-Only Sources */}
        {data.crossCitation && data.crossCitation.length > 0 && (
          <div id="competitor-only" className="scroll-mt-24">
            <CompetitorOnlySources crossCitation={data.crossCitation} brandSlug={params.slug} brandName={brandName} entityNames={apiData.entityNames} isOrg={isOrg} />
          </div>
        )}

        {/* ── Source Breakout ────────────────────── */}
        <h2 className="text-lg font-semibold border-b border-border pb-2">Source Breakout</h2>

        {/* Competitor Source Comparison */}
        {data.crossCitation && data.crossCitation.length > 0 && (
          <div id="competitor-sources" className="scroll-mt-24">
            <CompetitorSourceComparison crossCitation={data.crossCitation} topDomains={data.topDomains} brandSlug={params.slug} range={range} pageModel={model} matrix={data.sourcePromptMatrix} prompts={data.matrixPrompts} modelSplit={data.modelSplit} entityNames={apiData.entityNames} />
          </div>
        )}

        {/* Emerging Sources */}
        <div id="emerging-sources" className="scroll-mt-24">
          <EmergingSourcesList emerging={data.emerging} brandSlug={params.slug} range={range} pageModel={model} />
        </div>

        {/* ── Deep Dive ───────────────────────────────── */}
        <h2 className="text-lg font-semibold border-b border-border pb-2">Deep Dive</h2>

        {/* Domain Details */}
        <div id="domain-details" className="scroll-mt-24">
          <TopDomainsTable topDomains={data.topDomains} brandSlug={params.slug} model={model} range={range} pageModel={model} brandName={brandName} />
        </div>

        {/* Domain Detail Drawer */}
        <DomainDetailDrawer
          domain={selectedDomain}
          brandSlug={params.slug}
          model={model}
          range={range}
          onClose={() => setSelectedDomain(null)}
        />
      </div>
    </div>
  );
}

function Header({ brandName, range, model }: { brandName: string; range: number; model: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">
        {brandName} &mdash; Where AI Gets Its Information
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        {range}-day window &middot; {MODEL_LABELS[model] ?? model}
      </p>
    </div>
  );
}

export default function SourcesPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>}>
      <SourcesInner />
    </Suspense>
  );
}
