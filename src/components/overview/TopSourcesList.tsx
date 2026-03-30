"use client";

import { useMemo, useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { SourcesResponse, TopDomainRow } from "@/types/api";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { MODEL_LABELS } from "@/lib/constants";

const CATEGORY_LABELS: Record<string, string> = {
  reviews: "Reviews",
  news_media: "News & Media",
  video: "Video",
  ecommerce: "E-commerce",
  reference: "Reference",
  advocacy: "Advocacy / Nonprofit",
  social_media: "Social Media",
  government: "Government",
  academic: "Academic",
  blog_forum: "Blog / Forum",
  brand_official: "Brand / Official",
  technology: "Technology",
  other: "Other",
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  reviews: "product & service ratings",
  news_media: "journalism & media outlets",
  video: "video platforms",
  ecommerce: "online retailers",
  reference: "encyclopedias & data portals",
  advocacy: "nonprofits & advocacy organizations",
  social_media: "forums & discussion sites",
  government: "government agency sites",
  academic: "research & journals",
  blog_forum: "blogs & indie publishers",
  brand_official: "brand's own website",
  technology: "developer tools & platforms",
  other: "uncategorized sites",
};

const CATEGORY_BADGE_COLORS: Record<string, string> = {
  reviews: "bg-sky-100 text-sky-700",
  news_media: "bg-indigo-100 text-indigo-700",
  video: "bg-slate-200 text-slate-800",
  ecommerce: "bg-orange-100 text-orange-700",
  reference: "bg-violet-100 text-violet-700",
  advocacy: "bg-emerald-100 text-emerald-700",
  social_media: "bg-pink-100 text-pink-700",
  government: "bg-teal-100 text-teal-700",
  academic: "bg-indigo-100 text-indigo-700",
  blog_forum: "bg-lime-100 text-lime-700",
  brand_official: "bg-yellow-100 text-yellow-700",
  technology: "bg-cyan-100 text-cyan-700",
  other: "bg-gray-100 text-gray-600",
};

const DONUT_COLORS: Record<string, string> = {
  reviews: "#38bdf8",
  news_media: "#818cf8",
  video: "#fb7185",
  ecommerce: "#f97316",
  reference: "#a78bfa",
  advocacy: "#34d399",
  social_media: "#f472b6",
  government: "#14b8a6",
  academic: "#6366f1",
  blog_forum: "#84cc16",
  brand_official: "#eab308",
  technology: "#06b6d4",
  other: "#cbd5e1",
};

/* ─── Mini Donut ──────────────────────────────────────────────────── */

function SourceTypeDonut({ categoryBreakdown }: { categoryBreakdown: { category: string; count: number; pct: number }[] }) {
  const { pieData, chartTotal } = useMemo(() => {
    if (categoryBreakdown.length === 0) return { pieData: [], chartTotal: 0 };
    const total = categoryBreakdown.reduce((s, c) => s + c.count, 0);
    // Roll up categories under 5% into "Other"
    let otherValue = 0;
    const slices: { key: string; name: string; value: number; pct: number }[] = [];
    for (const entry of categoryBreakdown) {
      const pct = total > 0 ? (entry.count / total) * 100 : 0;
      if (pct < 5 || entry.category === "other") {
        otherValue += entry.count;
      } else {
        slices.push({
          key: entry.category,
          name: CATEGORY_LABELS[entry.category] ?? entry.category,
          value: entry.count,
          pct: Math.round(pct),
        });
      }
    }
    if (otherValue > 0) {
      slices.push({
        key: "other",
        name: "Other",
        value: otherValue,
        pct: total > 0 ? Math.round((otherValue / total) * 100) : 0,
      });
    }
    return { pieData: slices, chartTotal: total };
  }, [categoryBreakdown]);

  const [hoveredSlice, setHoveredSlice] = useState<{ name: string; value: number; pct: number } | null>(null);

  if (pieData.length === 0) return null;

  return (
    <div className="flex flex-col items-center">
      <p className="text-sm font-semibold mb-1">Source Types</p>
      <p className="text-[10px] text-muted-foreground/60 mb-2 text-center leading-snug">
        Category breakdown across all cited domains.
      </p>
      <div className="relative" style={{ width: 200, height: 200, margin: "0 auto" }}>
        <ResponsiveContainer width={200} height={200}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={85}
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
              stroke="none"
              onMouseEnter={(_, idx) => {
                const d = pieData[idx];
                if (d) setHoveredSlice({ name: d.name, value: d.value, pct: d.pct });
              }}
              onMouseLeave={() => setHoveredSlice(null)}
            >
              {pieData.map((entry) => (
                <Cell
                  key={entry.key}
                  fill={DONUT_COLORS[entry.key] ?? DONUT_COLORS.other}
                />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as (typeof pieData)[number];
                return (
                  <div className="rounded-lg border border-border bg-popover p-3 shadow-md text-xs space-y-1">
                    <p className="font-medium text-popover-foreground flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DONUT_COLORS[d.key] ?? DONUT_COLORS.other }} />
                      {d.name}
                    </p>
                    <p className="text-muted-foreground">{d.value} citations &middot; {d.pct}%</p>
                  </div>
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {hoveredSlice ? (
            <>
              <span className="text-lg font-bold tabular-nums">{hoveredSlice.pct}%</span>
              <span className="text-[11px] font-medium text-foreground">{hoveredSlice.name}</span>
              <span className="text-[10px] text-muted-foreground">{hoveredSlice.value} citations</span>
            </>
          ) : (
            <>
              <span className="text-lg font-bold tabular-nums">{chartTotal}</span>
              <span className="text-[10px] text-muted-foreground leading-tight text-center">Total citations</span>
            </>
          )}
        </div>
      </div>
      {/* Horizontal legend (matches sources tab) */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-2">
        {pieData.map((entry) => (
          <div key={entry.key} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: DONUT_COLORS[entry.key] ?? DONUT_COLORS.other }}
            />
            <span className="text-muted-foreground">
              {entry.name} {entry.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface SourcesApiResponse {
  hasData: boolean;
  sources?: SourcesResponse;
}

interface Props {
  brandSlug: string;
  model: string;
  range: number;
}

const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All Models" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "gemini", label: "Gemini" },
  { value: "claude", label: "Claude" },
  { value: "perplexity", label: "Perplexity" },
  { value: "google", label: "Google" },
];

export function TopSourcesList({ brandSlug, model, range }: Props) {
  const [localModel, setLocalModel] = useState(model);
  const url = `/api/sources?brandSlug=${encodeURIComponent(brandSlug)}&model=${localModel}&range=${range}`;
  const { data: apiData, loading } = useCachedFetch<SourcesApiResponse>(url);

  if (loading) {
    return (
      <div className="rounded-xl bg-card p-6 shadow-section animate-pulse">
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
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold">Top Sources AI Relies On</h2>
          <p className="text-xs text-muted-foreground mt-1">
            The most-cited websites when AI discusses this space
          </p>
        </div>
        <select
          value={localModel}
          onChange={(e) => setLocalModel(e.target.value)}
          className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0"
        >
          {MODEL_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-6">
        {/* Left: top source bars (55%) */}
        <div className="min-w-0 space-y-4" style={{ flex: "0 1 55%" }}>
          {top5.map((d, i) => {
            const barWidth = Math.max(4, (d.citations / maxCitations) * 100);
            const cat = d.category ?? "other";
            return (
              <div key={d.domain} className="flex items-center gap-3">
                <span className="w-5 text-xs text-muted-foreground text-right tabular-nums shrink-0">
                  {i + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm font-medium truncate">{d.domain}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none shrink-0 ${CATEGORY_BADGE_COLORS[cat] || CATEGORY_BADGE_COLORS.other}`}
                      title={CATEGORY_DESCRIPTIONS[cat] || ""}
                    >
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

          {apiData.sources.topDomains.length > 5 && (
            <p className="text-[11px] text-muted-foreground mt-3">
              +{apiData.sources.topDomains.length - 5} more sources — see the Sources tab for details.
              Category breakdown reflects all cited domains. Citations are deduplicated by normalized URL per response.
            </p>
          )}
        </div>

        {/* Right: source type donut (45%) */}
        <div className="hidden sm:block" style={{ flex: "0 1 45%" }}>
          <SourceTypeDonut
            categoryBreakdown={apiData.sources.allDomainCategoryBreakdown ?? []}
          />
        </div>
      </div>
    </section>
  );
}
