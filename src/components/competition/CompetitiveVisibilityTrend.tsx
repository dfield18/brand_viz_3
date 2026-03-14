"use client";

import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { CompetitiveTrendPoint, CompetitionResponse } from "@/types/api";
import { VALID_MODELS, MODEL_LABELS } from "@/lib/constants";
import { useCachedFetch } from "@/lib/useCachedFetch";

type MetricMode = "visibility" | "mentionShare" | "topResult";

interface CompetitiveVisibilityTrendProps {
  trend: CompetitiveTrendPoint[];
  entityNames: Record<string, string>;
  brandEntityId: string;
  brandSlug: string;
  brandName?: string;
  range: number;
  pageModel: string;
}

interface ApiResponse {
  hasData: boolean;
  competition?: CompetitionResponse;
}

const METRIC_CONFIG: Record<MetricMode, {
  title: string;
  subtitle: string;
  yAxisLabel: string;
  yDomain: [number, number] | "auto";
  tickFormatter: (v: number) => string;
  tooltipFormatter: (v: number) => string;
  reversed?: boolean;
}> = {
  visibility: {
    title: "How Often AI Mentions Each Brand",
    subtitle: "% of AI responses that mention each brand",
    yAxisLabel: "Brand Recall",
    yDomain: [0, 100],
    tickFormatter: (v) => `${v}%`,
    tooltipFormatter: (v) => `${v}%`,
  },
  mentionShare: {
    title: "Share of Voice Over Time",
    subtitle: "Each brand's share of all AI brand mentions",
    yAxisLabel: "Share of Voice",
    yDomain: [0, 100],
    tickFormatter: (v) => `${v}%`,
    tooltipFormatter: (v) => `${v}%`,
  },
  topResult: {
    title: "Top Result Rate Over Time",
    subtitle: "% of mentions where each brand appears as the #1 recommendation",
    yAxisLabel: "Top Result Rate",
    yDomain: [0, 100],
    tickFormatter: (v) => `${v}%`,
    tooltipFormatter: (v) => `${v}%`,
  },
};

export function CompetitiveVisibilityTrend({
  trend: initialTrend,
  entityNames: initialEntityNames,
  brandEntityId,
  brandSlug,
  brandName,
  range,
  pageModel,
}: CompetitiveVisibilityTrendProps) {
  const [model, setModel] = useState(pageModel);
  const [metric, setMetric] = useState<MetricMode>("visibility");

  const url =
    model !== pageModel
      ? `/api/competition?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}`
      : null;
  const { data: apiData, loading } = useCachedFetch<ApiResponse>(url);

  const trend =
    model !== pageModel && apiData?.competition
      ? apiData.competition.competitiveTrend
      : initialTrend;

  const entityNames = useMemo(() => {
    if (model !== pageModel && apiData?.competition) {
      const names: Record<string, string> = {};
      for (const c of apiData.competition.competitors) {
        names[c.entityId] = c.name;
      }
      return names;
    }
    return initialEntityNames;
  }, [model, pageModel, apiData, initialEntityNames]);

  // Get entity IDs from first data point
  const entityIds = useMemo(() => {
    if (trend.length === 0) return [];
    return Object.keys(trend[0].mentionRate ?? trend[0].mentionShare);
  }, [trend]);

  // Flatten data for Recharts based on selected metric
  const chartData = useMemo(() => {
    return trend.map((point) => {
      const source =
        metric === "visibility"
          ? point.mentionRate
          : metric === "mentionShare"
            ? point.mentionShare
            : point.rank1Rate ?? {};
      return {
        date: point.date,
        ...source,
      };
    });
  }, [trend, metric]);

  // Hero stat: current brand value + delta from start
  const { currentValue, delta } = useMemo(() => {
    if (chartData.length === 0 || !brandEntityId) return { currentValue: null, delta: null };
    const last = chartData[chartData.length - 1] as Record<string, unknown>;
    const first = chartData[0] as Record<string, unknown>;
    const cur = typeof last[brandEntityId] === "number" ? (last[brandEntityId] as number) : null;
    const prev = typeof first[brandEntityId] === "number" ? (first[brandEntityId] as number) : null;
    const d = cur !== null && prev !== null ? +(cur - prev).toFixed(1) : null;
    return { currentValue: cur, delta: d };
  }, [chartData, brandEntityId]);

  // Auto-scale Y for area chart style (pad 10% around data range)
  const areaYDomain = useMemo(() => {
    const vals: number[] = [];
    for (const row of chartData) {
      for (const [k, v] of Object.entries(row)) {
        if (k !== "date" && typeof v === "number") vals.push(v);
      }
    }
    if (vals.length === 0) return [0, 100] as [number, number];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const padding = Math.max((max - min) * 0.15, 5);
    const lo = Math.max(0, Math.floor((min - padding) / 5) * 5);
    const hi = Math.min(100, Math.ceil((max + padding) / 5) * 5);
    return [lo, hi] as [number, number];
  }, [chartData]);

  // Sort entity IDs so brand comes first
  const sortedEntityIds = useMemo(() => {
    return [...entityIds].sort((a, b) => {
      if (a === brandEntityId) return -1;
      if (b === brandEntityId) return 1;
      return 0;
    });
  }, [entityIds, brandEntityId]);

  const config = METRIC_CONFIG[metric];
  const strokeColor = metric === "visibility" ? "var(--chart-1)" : metric === "topResult" ? "var(--chart-3)" : "var(--chart-2)";
  const gradientId = metric === "visibility" ? "compVisGradient" : metric === "topResult" ? "compTrGradient" : "compSovGradient";
  const metricLabel = metric === "visibility" ? "Brand Recall" : metric === "topResult" ? "Top Result Rate" : "Share of Voice";
  const COMPETITOR_COLORS = ["var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-4">
        <h2 className="text-base font-semibold">{config.title}</h2>
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
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center rounded-full bg-muted p-0.5">
          <button
            onClick={() => setMetric("visibility")}
            className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${
              metric === "visibility"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Brand Recall
          </button>
          <button
            onClick={() => setMetric("mentionShare")}
            className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${
              metric === "mentionShare"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Share of Voice
          </button>
          <button
            onClick={() => setMetric("topResult")}
            className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-colors ${
              metric === "topResult"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Top Result Rate
          </button>
        </div>
      </div>
      {/* Hero stat */}
      {currentValue !== null && (
        <div className="flex items-baseline gap-2.5 mt-2">
          <span className="text-3xl font-bold tabular-nums">{Math.round(currentValue)}%</span>
          {delta !== null && delta !== 0 && (
            <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${delta > 0 ? "text-emerald-600" : "text-red-500"}`}>
              {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {delta > 0 ? "+" : ""}{delta}% vs start
            </span>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-1">
        How {brandName ?? "the brand"}&apos;s metrics compare to competitors over time
      </p>
      <p className="text-[11px] text-muted-foreground/70 mt-0.5">
        {config.subtitle}
      </p>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      )}

      {!loading && trend.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No trend data yet. Run prompts to generate data.
          </p>
        </div>
      )}

      {!loading && trend.length >= 1 && (
        <div className="mt-6">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 20, bottom: 5, left: 5 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={strokeColor} stopOpacity={0.15} />
                  <stop offset="100%" stopColor={strokeColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
              <XAxis
                dataKey="date"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(d: string) => {
                  const [, m, day] = d.split("-");
                  return `${m}/${day}`;
                }}
                padding={{ left: 20 }}
              />
              <YAxis
                domain={areaYDomain}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
                width={48}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const date = new Date(String(label) + "T00:00:00");
                  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  const seen = new Set<string>();
                  const items = payload
                    .filter((entry) => {
                      if (entry.value == null) return false;
                      const key = String(entry.dataKey);
                      if (seen.has(key)) return false;
                      seen.add(key);
                      return true;
                    })
                    .map((entry) => ({
                      name: entityNames[String(entry.dataKey)] ?? String(entry.dataKey),
                      value: Number(entry.value),
                      color: String(entry.color ?? entry.stroke ?? "#888"),
                      isBrand: String(entry.dataKey) === brandEntityId,
                    }))
                    .sort((a, b) => {
                      if (a.isBrand && !b.isBrand) return -1;
                      if (!a.isBrand && b.isBrand) return 1;
                      return b.value - a.value;
                    });
                  return (
                    <div className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-md text-xs">
                      <p className="font-medium text-foreground mb-1.5">{dateStr}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{metricLabel}</p>
                      {items.map((item, i) => (
                        <div key={i} className={`flex items-center justify-between gap-4 ${item.isBrand ? "py-1 mb-0.5" : "py-0.5"}`}>
                          <div className="flex items-center gap-1.5">
                            <span className={`${item.isBrand ? "w-2.5 h-2.5" : "w-2 h-2"} rounded-full shrink-0`} style={{ backgroundColor: item.color }} />
                            <span className={item.isBrand ? "text-foreground text-sm font-semibold" : "text-foreground"}>{item.name}</span>
                          </div>
                          <span className={item.isBrand ? "font-bold tabular-nums text-sm" : "font-medium tabular-nums"}>{item.value}%</span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              {/* Brand area fill */}
              <Area
                type="monotone"
                dataKey={brandEntityId}
                stroke="none"
                fill={`url(#${gradientId})`}
                connectNulls
                tooltipType="none"
              />
              {/* Brand main line */}
              <Line
                type="monotone"
                dataKey={brandEntityId}
                stroke={strokeColor}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: strokeColor, stroke: "var(--card)", strokeWidth: 2 }}
                name={entityNames[brandEntityId] ?? brandName ?? "Brand"}
                connectNulls
              />
              {/* Competitor lines — thin and faded */}
              {sortedEntityIds.filter((id) => id !== brandEntityId).map((entityId, i) => (
                <Line
                  key={entityId}
                  type="monotone"
                  dataKey={entityId}
                  stroke={COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]}
                  strokeWidth={1}
                  strokeOpacity={0.35}
                  dot={false}
                  activeDot={{ r: 3 }}
                  name={entityNames[entityId] ?? entityId}
                  connectNulls
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 justify-center">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="inline-block w-3 h-[3px] rounded-full shrink-0" style={{ backgroundColor: strokeColor }} />
              <span className="font-medium text-foreground">{entityNames[brandEntityId] ?? brandName ?? "Brand"}</span>
            </div>
            {sortedEntityIds.filter((id) => id !== brandEntityId).map((entityId, i) => (
              <div key={entityId} className="flex items-center gap-1.5 text-xs">
                <span className="inline-block w-3 h-[3px] rounded-full shrink-0 opacity-50" style={{ backgroundColor: COMPETITOR_COLORS[i % COMPETITOR_COLORS.length] }} />
                <span className="text-muted-foreground">{entityNames[entityId] ?? entityId}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
