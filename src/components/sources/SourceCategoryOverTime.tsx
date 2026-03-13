"use client";

import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { SourceCategoryOverTimeEntry, SourcesResponse } from "@/types/api";
import { VALID_MODELS, MODEL_LABELS, VALID_CLUSTERS, CLUSTER_LABELS } from "@/lib/constants";
import { useCachedFetch } from "@/lib/useCachedFetch";

interface Props {
  data: SourceCategoryOverTimeEntry[];
  brandSlug: string;
  range: number;
  pageModel: string;
}

interface ApiResponse {
  hasData: boolean;
  sources?: SourcesResponse;
}

const CATEGORY_SERIES: { key: string; label: string; color: string }[] = [
  { key: "reviews", label: "Reviews", color: "hsl(38, 92%, 50%)" },
  { key: "news_media", label: "News & Media", color: "hsl(217, 91%, 50%)" },
  { key: "video", label: "Video", color: "hsl(0, 72%, 55%)" },
  { key: "ecommerce", label: "E-commerce", color: "hsl(160, 60%, 45%)" },
  { key: "reference", label: "Reference", color: "hsl(263, 70%, 55%)" },
  { key: "social_media", label: "Social Media", color: "hsl(330, 80%, 55%)" },
  { key: "government", label: "Government", color: "hsl(215, 15%, 47%)" },
  { key: "academic", label: "Academic", color: "hsl(239, 84%, 57%)" },
  { key: "blog_forum", label: "Blog / Forum", color: "hsl(24, 95%, 53%)" },
  { key: "brand_official", label: "Brand / Official", color: "hsl(187, 72%, 45%)" },
  { key: "technology", label: "Technology", color: "hsl(172, 66%, 40%)" },
  { key: "other", label: "Other", color: "hsl(218, 11%, 65%)" },
];

const MODEL_KEYS = ["chatgpt", "gemini", "claude", "perplexity", "google"] as const;

const selectClass = "text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0";

export default function SourceCategoryOverTime({ data: initialData, brandSlug, range, pageModel }: Props) {
  const [selectedModel, setSelectedModel] = useState("all");
  const [cluster, setCluster] = useState("all");

  const needsFetch = cluster !== "all";
  const url = needsFetch
    ? `/api/sources?brandSlug=${encodeURIComponent(brandSlug)}&model=${pageModel}&range=${range}&cluster=${cluster}`
    : null;
  const { data: apiData, loading } = useCachedFetch<ApiResponse>(url);

  const data = needsFetch && apiData?.sources?.categoryOverTime
    ? apiData.sources.categoryOverTime
    : needsFetch && apiData && !apiData.sources
    ? []
    : initialData;

  const models = useMemo(() => {
    const set = new Set(data.map((d) => d.model));
    return MODEL_KEYS.filter((m) => set.has(m));
  }, [data]);

  // Filter to selected model, keep top 6 categories by total volume, merge rest into "Other"
  const { chartData, activeCategories } = useMemo(() => {
    const filtered = data.filter((d) => d.model === selectedModel);

    // Sum totals per category across all time points
    const catTotals: Record<string, number> = {};
    for (const entry of filtered) {
      for (const key of Object.keys(entry)) {
        if (key !== "date" && key !== "model") {
          catTotals[key] = (catTotals[key] ?? 0) + Number(entry[key] ?? 0);
        }
      }
    }

    // Pick top 6 categories by total, everything else goes to "other"
    const sorted = Object.entries(catTotals)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a);
    const top6Keys = new Set(sorted.slice(0, 6).map(([k]) => k));
    const mergedKeys = sorted.filter(([k]) => !top6Keys.has(k)).map(([k]) => k);

    const active = CATEGORY_SERIES.filter((s) => top6Keys.has(s.key) && s.key !== "other");
    if (mergedKeys.length > 0 || top6Keys.has("other")) {
      const otherSeries = CATEGORY_SERIES.find((s) => s.key === "other");
      if (otherSeries) active.push(otherSeries);
    }

    const filled = filtered.map((entry) => {
      const row: Record<string, string | number> = { date: entry.date, model: entry.model };
      let otherVal = 0;
      for (const s of active) {
        if (s.key === "other") continue;
        row[s.key] = Number(entry[s.key]) || 0;
      }
      for (const k of mergedKeys) {
        otherVal += Number(entry[k]) || 0;
      }
      otherVal += Number(entry["other"]) || 0;
      if (active.some((s) => s.key === "other")) {
        row["other"] = otherVal;
      }
      return row;
    });

    return { chartData: filled, activeCategories: active };
  }, [data, selectedModel]);

  if (!loading && data.length === 0 && initialData.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-base font-semibold">Source Types Over Time</h2>
          <p className="text-xs text-muted-foreground mt-1">
            How the mix of source types AI references is changing over time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={cluster} onChange={(e) => setCluster(e.target.value)} className={selectClass}>
            {Object.entries(CLUSTER_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className={selectClass}>
            <option value="all">All AI Platforms</option>
            {models.map((m) => (
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

      {!loading && chartData.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No source category data for this selection.</p>
        </div>
      )}

      {!loading && chartData.length > 0 && (
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
              stackOffset="expand"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                fontSize={11}
                tickLine={false}
                tickFormatter={(d: string) => {
                  const [, m, day] = d.split("-");
                  return `${m}/${day}`;
                }}
              />
              <YAxis
                domain={[0, 1]}
                fontSize={12}
                tickLine={false}
                tickFormatter={(v) => `${Math.round(v * 100)}%`}
                width={48}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const date = new Date(String(label) + "T00:00:00");
                  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  const items = [...payload].filter((p) => (p.value as number) > 0).sort((a, b) => (b.value as number) - (a.value as number));
                  return (
                    <div className="rounded-lg border border-border bg-popover p-3 shadow-md text-xs space-y-1.5">
                      <p className="font-medium text-popover-foreground">{dateStr}</p>
                      {items.map((item) => (
                        <p key={item.dataKey as string} className="text-muted-foreground flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                          {item.name}: <span className="font-medium text-popover-foreground">{Math.round(Number(item.value) * 100)}%</span>
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              <Legend
                verticalAlign="top"
                height={44}
                wrapperStyle={{ paddingBottom: 8 }}
                formatter={(value: string) => (
                  <span style={{ fontSize: 12, marginRight: 12, color: "var(--foreground)" }}>{value}</span>
                )}
              />

              {activeCategories.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stackId="cat"
                  fill={s.color}
                  stroke={s.color}
                  strokeWidth={0}
                  name={s.label}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
