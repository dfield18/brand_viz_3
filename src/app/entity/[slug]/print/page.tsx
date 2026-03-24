"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { useBrandName } from "@/lib/useBrandName";
import { MODEL_LABELS } from "@/lib/constants";
import { Printer, Loader2 } from "lucide-react";

const OverviewPage = dynamic(() => import("../overview/page"), { ssr: false });
const VisibilityPage = dynamic(() => import("../visibility/page"), { ssr: false });
const NarrativePage = dynamic(() => import("../narrative/page"), { ssr: false });
const CompetitionPage = dynamic(() => import("../competition/page"), { ssr: false });
const SourcesPage = dynamic(() => import("../sources/page"), { ssr: false });
const RecommendationsPage = dynamic(() => import("../recommendations/page"), { ssr: false });

function SectionDivider({ title }: { title: string }) {
  return (
    <div className="print-section-break mt-12 mb-6 print:mt-4 print:mb-3">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-300" />
        <h2 className="text-lg font-bold text-gray-700 uppercase tracking-wide shrink-0">{title}</h2>
        <div className="h-px flex-1 bg-gray-300" />
      </div>
    </div>
  );
}

function TabLoading({ label }: { label: string }) {
  return (
    <div className="py-8 text-center text-sm text-gray-400">
      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
      Loading {label}...
    </div>
  );
}

/**
 * Content-based readiness: polls the DOM for loading indicators.
 * Only signals ready when no spinners or "Loading..." text remain.
 */
function useContentReady(containerRef: React.RefObject<HTMLElement | null>) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 60; // 30 seconds max

    const check = () => {
      attempts++;
      const el = containerRef.current;
      if (!el) {
        if (attempts < maxAttempts) setTimeout(check, 500);
        return;
      }

      // Check for any remaining loading indicators
      const spinners = el.querySelectorAll(".animate-spin");
      const loadingText = el.querySelectorAll("[class*='animate-pulse']");

      if (spinners.length === 0 && loadingText.length === 0 && attempts >= 6) {
        // No spinners, no pulse animations, and at least 3s has passed
        setReady(true);
      } else if (attempts < maxAttempts) {
        setTimeout(check, 500);
      } else {
        // Max attempts reached — go ahead anyway
        setReady(true);
      }
    };

    // Start checking after initial render
    setTimeout(check, 2000);
  }, [containerRef]);

  return ready;
}

function PrintInner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const brandName = useBrandName(params.slug);
  const range = Number(searchParams.get("range") ?? 90);
  const model = searchParams.get("model") ?? "all";
  const containerRef = useRef<HTMLDivElement>(null);
  const ready = useContentReady(containerRef);
  const [printed, setPrinted] = useState(false);

  // Auto-print once content is ready
  useEffect(() => {
    if (!ready || printed) return;
    setPrinted(true);
    const timer = setTimeout(() => window.print(), 500);
    return () => clearTimeout(timer);
  }, [ready, printed]);

  return (
    <div ref={containerRef} className="print-report">
      <style>{`
        @media print {
          nav, header, [data-tab-nav], .no-print, .print-hide { display: none !important; }
          .print-report [class*="xl:-ml-"] { margin-left: 0 !important; }
          .print-report [class*="w-40"][class*="shrink-0"]:has(a) { display: none !important; }
          .print-report select { display: none !important; }
          .print-report button:not(.print-keep) { display: none !important; }
          .print-section-break { page-break-before: always; }
          .print-section-break:first-of-type { page-break-before: auto; }
          body { font-size: 11px; }
          @page { margin: 0.5in; }
        }
      `}</style>

      <div className="max-w-[1200px] mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6 no-print">
          <div>
            <h1 className="text-2xl font-bold">{brandName} — Full Report</h1>
            <p className="text-sm text-gray-500 mt-1">
              {MODEL_LABELS[model] ?? model} · {range}-day window · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!ready && (
              <span className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading all tabs...
              </span>
            )}
            <button
              onClick={() => window.print()}
              className="print-keep inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Printer className="h-4 w-4" />
              {ready ? "Print / Save PDF" : "Loading..."}
            </button>
          </div>
        </div>

        <div className="hidden print:block mb-4">
          <h1 className="text-xl font-bold">{brandName} — AI Visibility Report</h1>
          <p className="text-xs text-gray-500">
            {MODEL_LABELS[model] ?? model} · {range}-day window · {new Date().toLocaleDateString()}
          </p>
        </div>
      </div>

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

      <div className="max-w-[1200px] mx-auto px-6 mt-10 pt-4 border-t border-gray-200 text-xs text-gray-400 text-center print:mt-4">
        {brandName} AI Visibility Report · {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}

export default function PrintPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-gray-500">Preparing print view...</div>}>
      <PrintInner />
    </Suspense>
  );
}
