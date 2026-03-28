"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { useBrandName } from "@/lib/useBrandName";
import { MODEL_LABELS } from "@/lib/constants";
import { Loader2, Printer } from "lucide-react";

/**
 * Reference page — renders ALL tab components on one scrollable page.
 * Guarantees full data parity because it uses the exact same components
 * and data-fetching logic as the individual tabs.
 */

const OverviewPage = dynamic(() => import("../overview/page"), { ssr: false });
const VisibilityPage = dynamic(() => import("../visibility-v2/page"), { ssr: false });
const NarrativePage = dynamic(() => import("../narrative/page"), { ssr: false });
const CompetitionPage = dynamic(() => import("../competition/page"), { ssr: false });
const SourcesPage = dynamic(() => import("../sources/page"), { ssr: false });
const RecommendationsPage = dynamic(() => import("../recommendations/page"), { ssr: false });

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="mt-12 mb-6">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <h2 className="text-lg font-bold text-muted-foreground uppercase tracking-wide shrink-0">{title}</h2>
        <div className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}

function TabLoading({ label }: { label: string }) {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
      Loading {label}...
    </div>
  );
}

function ReferenceInner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const brandName = useBrandName(params.slug);
  const range = Number(searchParams.get("range") ?? 90);
  const model = searchParams.get("model") ?? "all";

  return (
    <div>
      {/* Header */}
      <div className="max-w-[1200px] mx-auto px-6 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{brandName} — Combined Reference</h1>
            <p className="text-sm text-muted-foreground mt-1">
              All tabs on one page · {MODEL_LABELS[model] ?? model} · {range}-day window
            </p>
          </div>
          <button
            onClick={() => {
              const qs = new URLSearchParams({ model, range: String(range) }).toString();
              window.open(`/entity/${params.slug}/print?${qs}`, "_blank");
            }}
            className="inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Print / Save PDF
          </button>
        </div>
      </div>

      {/* Tab sections — each fetches its own data identically to the dashboard */}
      <Suspense fallback={<TabLoading label="Overview" />}>
        <SectionDivider title="Overview" />
        <OverviewPage />
      </Suspense>

      <Suspense fallback={<TabLoading label="Visibility" />}>
        <SectionDivider title="Visibility" />
        <VisibilityPage />
      </Suspense>

      <Suspense fallback={<TabLoading label="Narrative" />}>
        <SectionDivider title="Narrative" />
        <NarrativePage />
      </Suspense>

      <Suspense fallback={<TabLoading label="Issue Landscape" />}>
        <SectionDivider title="Issue Landscape" />
        <CompetitionPage />
      </Suspense>

      <Suspense fallback={<TabLoading label="Sources" />}>
        <SectionDivider title="Sources" />
        <SourcesPage />
      </Suspense>

      <Suspense fallback={<TabLoading label="Recommendations" />}>
        <SectionDivider title="Recommendations" />
        <RecommendationsPage />
      </Suspense>

      {/* Footer */}
      <div className="max-w-[1200px] mx-auto px-6 mt-10 pt-4 border-t border-border text-xs text-muted-foreground text-center">
        {brandName} Combined Reference · {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}

export default function ReferencePage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">Loading reference view...</div>}>
      <ReferenceInner />
    </Suspense>
  );
}
