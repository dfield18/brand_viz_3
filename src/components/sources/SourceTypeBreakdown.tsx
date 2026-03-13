"use client";

import { useMemo } from "react";
import type { TopDomainRow } from "@/types/api";

const CATEGORY_LABELS: Record<string, string> = {
  reviews: "Reviews",
  news_media: "News & Media",
  video: "Video",
  ecommerce: "E-commerce",
  reference: "Reference",
  social_media: "Social Media",
  government: "Government",
  academic: "Academic",
  blog_forum: "Blog / Forum",
  brand_official: "Brand / Official",
  technology: "Technology",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  reviews: "bg-amber-500",
  news_media: "bg-blue-500",
  video: "bg-red-500",
  ecommerce: "bg-emerald-500",
  reference: "bg-violet-500",
  social_media: "bg-pink-500",
  government: "bg-slate-500",
  academic: "bg-indigo-500",
  blog_forum: "bg-orange-500",
  brand_official: "bg-cyan-500",
  technology: "bg-teal-500",
  other: "bg-gray-400",
};

interface Props {
  topDomains: TopDomainRow[];
}

export default function SourceTypeBreakdown({ topDomains }: Props) {
  const breakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    let total = 0;

    for (const d of topDomains) {
      const cat = d.category || "other";
      counts[cat] = (counts[cat] ?? 0) + d.citations;
      total += d.citations;
    }

    if (total === 0) return [];

    return Object.entries(counts)
      .map(([category, citations]) => ({
        category,
        label: CATEGORY_LABELS[category] ?? category,
        citations,
        pct: Math.round((citations / total) * 1000) / 10,
        color: CATEGORY_COLORS[category] ?? "bg-gray-400",
      }))
      .sort((a, b) => b.citations - a.citations);
  }, [topDomains]);

  if (breakdown.length === 0) return null;

  const topCategory = breakdown[0];

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold">Source Types</h2>
      <p className="text-xs text-muted-foreground mt-1 mb-5">
        Distribution of citation sources by category
      </p>

      {/* Top source type callout */}
      <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 mb-5 flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full shrink-0 ${topCategory.color}`} />
        <div>
          <p className="text-sm font-medium">
            {topCategory.label} is the most common source type at <span className="tabular-nums">{topCategory.pct}%</span> of all citations
          </p>
          <p className="text-xs text-muted-foreground">
            {topCategory.citations} citation{topCategory.citations !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="flex h-4 w-full rounded-full overflow-hidden mb-4">
        {breakdown.map((b) => (
          <div
            key={b.category}
            className={`${b.color} transition-all duration-300`}
            style={{ width: `${b.pct}%` }}
            title={`${b.label}: ${b.pct}%`}
          />
        ))}
      </div>

      {/* Legend table */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
        {breakdown.map((b) => (
          <div key={b.category} className="flex items-center gap-2 py-1">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${b.color}`} />
            <span className="text-xs text-muted-foreground flex-1 truncate">{b.label}</span>
            <span className="text-xs font-medium tabular-nums">{b.pct}%</span>
            <span className="text-[11px] text-muted-foreground tabular-nums w-12 text-right">
              {b.citations}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
