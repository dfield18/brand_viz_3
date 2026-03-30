"use client";

import { useState } from "react";
import type { TopDomainRow, SourceModelSplitRow, SourcesResponse } from "@/types/api";
import { VALID_MODELS, MODEL_LABELS, CLUSTER_LABELS } from "@/lib/constants";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useCachedFetch } from "@/lib/useCachedFetch";

const CATEGORY_LABELS_MAP: Record<string, string> = {
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

const CATEGORY_COLORS: Record<string, string> = {
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

const MODEL_SHORT: Record<string, string> = {
  chatgpt: "GPT",
  gemini: "Gem",
  claude: "Claude",
  perplexity: "Pplx",
};

const MODEL_COLORS: Record<string, string> = {
  chatgpt: "bg-emerald-100 text-emerald-800",
  gemini: "bg-sky-100 text-sky-800",
  claude: "bg-orange-100 text-orange-800",
  perplexity: "bg-violet-100 text-violet-800",
  google: "bg-teal-100 text-teal-800",
};

interface ApiResponse {
  hasData: boolean;
  sources?: SourcesResponse;
}

interface Props {
  topDomains: TopDomainRow[];
  modelSplit: SourceModelSplitRow[];
  categoryBreakdown?: { category: string; count: number; pct: number }[];
  onDomainClick?: (domain: string) => void;
  brandSlug: string;
  range: number;
  pageModel: string;
  brandName?: string;
}

const selectClass = "text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0";

export default function TopCitedSources({ topDomains: initialTopDomains, modelSplit: initialModelSplit, categoryBreakdown: initialCategoryBreakdown, onDomainClick, brandSlug, range, pageModel, brandName }: Props) {
  const [model, setModel] = useState(pageModel);
  const [cluster, setCluster] = useState("all");
  const [hoveredSlice, setHoveredSlice] = useState<{ name: string; value: number; pct: number } | null>(null);

  const needsFetch = model !== pageModel || cluster !== "all";
  const url = needsFetch
    ? `/api/sources?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}&cluster=${cluster}`
    : null;
  const { data: apiData, loading } = useCachedFetch<ApiResponse>(url);

  const topDomains = needsFetch && apiData?.sources?.topDomains
    ? apiData.sources.topDomains
    : needsFetch && apiData && !apiData.sources ? [] : initialTopDomains;
  const modelSplit = needsFetch && apiData?.sources?.modelSplit
    ? apiData.sources.modelSplit
    : needsFetch && apiData && !apiData.sources ? [] : initialModelSplit;
  const categoryBreakdown = needsFetch && apiData?.sources?.allDomainCategoryBreakdown
    ? apiData.sources.allDomainCategoryBreakdown
    : needsFetch && apiData && !apiData.sources ? undefined : initialCategoryBreakdown;

  const rows = topDomains;
  if (!loading && rows.length === 0) return null;

  // Build model lookup: domain → set of models that cited it
  const domainModels = new Map<string, string[]>();
  for (const ms of modelSplit) {
    for (const d of ms.domains) {
      const existing = domainModels.get(d.domain) || [];
      existing.push(ms.model);
      domainModels.set(d.domain, existing);
    }
  }

  // Compute category breakdown from all domains (if available) or top domains
  const { pieData, totalCitations } = (() => {
    let categoryTotals: Map<string, number>;
    let total: number;

    if (categoryBreakdown && categoryBreakdown.length > 0) {
      // All-domain breakdown from API
      categoryTotals = new Map(categoryBreakdown.map((c) => [c.category, c.count]));
      total = categoryBreakdown.reduce((s, c) => s + c.count, 0);
    } else {
      // Fallback: compute from top 25 domains
      categoryTotals = new Map<string, number>();
      total = 0;
      for (const d of topDomains) {
        const cat = d.category || "other";
        categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + d.citations);
        total += d.citations;
      }
    }

    const rawSlices = [...categoryTotals.entries()]
      .map(([cat, count]) => ({
        name: CATEGORY_LABELS_MAP[cat] || cat,
        value: count,
        key: cat,
        pct: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    let otherValue = 0;
    const slices: typeof rawSlices = [];
    for (const slice of rawSlices) {
      if (slice.pct < 5 || slice.key === "other") {
        otherValue += slice.value;
      } else {
        slices.push({ ...slice, pct: Math.round(slice.pct) });
      }
    }
    if (otherValue > 0) {
      slices.push({
        name: "Other",
        value: otherValue,
        key: "other",
        pct: total > 0 ? Math.round((otherValue / total) * 100) : 0,
      });
    }
    return { pieData: slices, totalCitations: total };
  })();

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold mb-1">Top Cited Sources</h2>
          <p className="text-xs text-muted-foreground">
            The websites AI references most often when discussing {brandName || "this industry"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={cluster} onChange={(e) => setCluster(e.target.value)} className={selectClass}>
            {Object.entries(CLUSTER_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={model} onChange={(e) => setModel(e.target.value)} className={selectClass}>
            <option value="all">All AI Platforms</option>
            {VALID_MODELS.map((m) => (
              <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-8">
          {/* Left: Ranked domain list */}
          <div className={`space-y-1.5 ${rows.length > 10 ? "max-h-[400px] overflow-y-auto" : ""}`}>
            {rows.map((d, i) => {
              const models = domainModels.get(d.domain) || [];
              const shownModels = models.slice(0, 3);
              const extraCount = models.length - shownModels.length;

              return (
                <div
                  key={d.domain}
                  className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0"
                >
                  <span className="w-6 text-xs text-muted-foreground text-right tabular-nums shrink-0">
                    {i + 1}.
                  </span>
                  <button
                    type="button"
                    onClick={() => onDomainClick?.(d.domain)}
                    className="w-44 text-xs font-medium truncate hover:text-foreground hover:underline underline-offset-2 transition-colors text-left shrink-0"
                    title={d.domain}
                  >
                    {d.domain.replace(/^www\./, "")}
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {shownModels.map((m) => (
                      <span
                        key={m}
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${MODEL_COLORS[m] || "bg-gray-100 text-gray-700"}`}
                      >
                        {MODEL_SHORT[m] || MODEL_LABELS[m] || m}
                      </span>
                    ))}
                    {extraCount > 0 && (
                      <span className="inline-flex items-center rounded bg-gray-100 text-gray-500 px-1.5 py-0.5 text-[10px] font-medium leading-none">
                        +{extraCount}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-auto text-right whitespace-nowrap mr-4">
                    {d.citations} citations
                  </span>
                </div>
              );
            })}
          </div>

          {/* Right: Source Type donut chart */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Source Types</h3>
            <div className="relative">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
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
                        fill={CATEGORY_COLORS[entry.key] || CATEGORY_COLORS.other}
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
                            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[d.key] || CATEGORY_COLORS.other }} />
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
                    <span className="text-lg font-bold tabular-nums">{totalCitations.toLocaleString()}</span>
                    <span className="text-[10px] text-muted-foreground">Total citations</span>
                  </>
                )}
              </div>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-2">
              {pieData.map((entry) => (
                <div key={entry.key} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[entry.key] || CATEGORY_COLORS.other }}
                  />
                  <span className="text-muted-foreground">
                    {entry.name} {entry.pct}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
