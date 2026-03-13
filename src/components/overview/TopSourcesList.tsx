"use client";

import type { SourcesResponse, TopDomainRow } from "@/types/api";
import { useCachedFetch } from "@/lib/useCachedFetch";

const CATEGORY_LABELS: Record<string, string> = {
  reviews: "Reviews",
  news_media: "News",
  video: "Video",
  ecommerce: "E-commerce",
  reference: "Reference",
  social_media: "Social",
  government: "Gov",
  academic: "Academic",
  blog_forum: "Blog",
  brand_official: "Official",
  technology: "Tech",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  reviews: "bg-sky-100 text-sky-700",
  news_media: "bg-indigo-100 text-indigo-700",
  video: "bg-slate-200 text-slate-800",
  ecommerce: "bg-orange-100 text-orange-700",
  reference: "bg-violet-100 text-violet-700",
  social_media: "bg-pink-100 text-pink-700",
  government: "bg-teal-100 text-teal-700",
  academic: "bg-indigo-100 text-indigo-700",
  blog_forum: "bg-lime-100 text-lime-700",
  brand_official: "bg-yellow-100 text-yellow-700",
  technology: "bg-cyan-100 text-cyan-700",
  other: "bg-gray-100 text-gray-600",
};

interface SourcesApiResponse {
  hasData: boolean;
  sources?: SourcesResponse;
}

interface Props {
  brandSlug: string;
  model: string;
  range: number;
}

export function TopSourcesList({ brandSlug, model, range }: Props) {
  const url = `/api/sources?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}`;
  const { data: apiData, loading } = useCachedFetch<SourcesApiResponse>(url);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-section animate-pulse">
        <div className="h-4 w-48 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-4 bg-muted rounded" />
              <div className="h-3 flex-1 bg-muted/60 rounded" />
              <div className="h-3 w-12 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!apiData?.hasData || !apiData.sources?.topDomains || apiData.sources.topDomains.length === 0) {
    return null;
  }

  const top5 = [...apiData.sources.topDomains]
    .sort((a, b) => b.citations - a.citations)
    .slice(0, 5);

  const maxCitations = top5[0]?.citations ?? 1;

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold">Top Sources AI Relies On</h2>
      <p className="text-xs text-muted-foreground mt-1 mb-4">
        The most-cited websites when AI discusses your industry
      </p>

      <div className="space-y-2.5">
        {top5.map((d, i) => {
          const barWidth = Math.max(4, (d.citations / maxCitations) * 100);
          const cat = d.category ?? "other";
          return (
            <div key={d.domain} className="flex items-center gap-3">
              <span className="w-5 text-xs text-muted-foreground text-right tabular-nums shrink-0">
                {i + 1}.
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium truncate">{d.domain}</span>
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none shrink-0 ${CATEGORY_COLORS[cat] || CATEGORY_COLORS.other}`}>
                    {CATEGORY_LABELS[cat] || "Other"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-chart-2"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums text-muted-foreground w-16 text-right shrink-0">
                    {d.citations} citations
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {apiData.sources.topDomains.length > 5 && (
        <p className="text-[11px] text-muted-foreground mt-3">
          +{apiData.sources.topDomains.length - 5} more sources — see the Sources tab for details
        </p>
      )}
    </section>
  );
}
