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
  ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { CompetitiveSentimentTrendPoint, CompetitionResponse } from "@/types/api";
import { VALID_MODELS, MODEL_LABELS } from "@/lib/constants";
import { useCachedFetch } from "@/lib/useCachedFetch";

const COMPETITOR_COLORS = ["var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

interface CompetitiveSentimentTrendProps {
  trend: CompetitiveSentimentTrendPoint[];
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

export function CompetitiveSentimentTrend({
  trend: initialTrend,
  entityNames: initialEntityNames,
  brandEntityId,
  brandSlug,
  brandName,
  range,
  pageModel,
}: CompetitiveSentimentTrendProps) {
  const [model, setModel] = useState(pageModel);

  const url =
    model !== pageModel
      ? `/api/competition?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}`
      : null;
  const { data: apiData, loading } = useCachedFetch<ApiResponse>(url);

  const trend =
    model !== pageModel && apiData?.competition?.sentimentTrend
      ? apiData.competition.sentimentTrend
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

  const entityIds = useMemo(() => {
    if (trend.length === 0) return [];
    const allIds = new Set<string>();
    for (const point of trend) {
      for (const id of Object.keys(point.sentiment)) allIds.add(id);
    }
    return [...allIds];
  }, [trend]);

  const sortedEntityIds = useMemo(() => {
    return [...entityIds].sort((a, b) => {
      if (a === brandEntityId) return -1;
      if (b === brandEntityId) return 1;
      return 0;
    });
  }, [entityIds, brandEntityId]);

  const chartData = useMemo(() => {
    return trend.map((point) => ({
      date: point.date,
      ...point.sentiment,
    }));
  }, [trend]);

  // Hero stat: current brand sentiment + delta
  const { currentValue, delta } = useMemo(() => {
    if (chartData.length === 0 || !brandEntityId) return { currentValue: null, delta: null };
    const last = chartData[chartData.length - 1] as Record<string, unknown>;
    const first = chartData[0] as Record<string, unknown>;
    const cur = typeof last[brandEntityId] === "number" ? (last[brandEntityId] as number) : null;
    const prev = typeof first[brandEntityId] === "number" ? (first[brandEntityId] as number) : null;
    const d = cur !== null && prev !== null ? +(cur - prev).toFixed(1) : null;
    return { currentValue: cur, delta: d };
  }, [chartData, brandEntityId]);

  // Auto-scale Y
  const yDomain = useMemo(() => {
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

  const strokeColor = "hsl(160, 60%, 45%)";

  function sentimentLabel(value: number): string {
    if (value >= 60) return "Strongly Positive";
    if (value >= 40) return "Mostly Positive";
    if (value >= 20) return "Mixed";
    return "Low Positive";
  }

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-4">
        <h2 className="text-base font-semibold">How AI Sentiment Is Changing</h2>
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

      {/* Hero stat */}
      {currentValue !== null && (
        <div className="flex items-baseline gap-2.5 mt-1">
          <span className="text-3xl font-bold tabular-nums">{Math.round(currentValue)}%</span>
          <span className="text-xs text-muted-foreground">{sentimentLabel(currentValue)}</span>
          {delta !== null && delta !== 0 && (
            <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${delta > 0 ? "text-emerald-600" : "text-red-500"}`}>
              {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {delta > 0 ? "+" : ""}{delta} pts since {chartData.length > 0 ? new Date(String((chartData[0] as Record<string, unknown>).date) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "start"}
            </span>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-1">
        Whether AI platforms are becoming more positive or negative about {brandName ?? "the brand"} vs competitors
      </p>
      <p className="text-[11px] text-muted-foreground/70 mt-0.5">
        Y-axis shows % of AI responses with positive sentiment toward each entity
      </p>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      )}

      {!loading && trend.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Not enough data to show sentiment trends yet.
          </p>
        </div>
      )}

      {!loading && trend.length === 1 && (
        <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">Only one data point available. Run more analyses over time to see trends.</p>
        </div>
      )}

      {!loading && trend.length >= 2 && (
        <div className="mt-6">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 20, bottom: 5, left: 5 }}
            >
              <defs>
                <linearGradient id="compSentGradient" x1="0" y1="0" x2="0" y2="1">
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
                domain={yDomain}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
                width={48}
              />
              <ReferenceLine
                y={50}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                strokeOpacity={0.4}
                label={{
                  value: "Neutral",
                  position: "right",
                  fontSize: 10,
                  fill: "var(--muted-foreground)",
                }}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const date = new Date(String(label) + "T00:00:00");
                  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                  const items = payload
                    .filter((entry) => entry.value != null)
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
                    <div className="rounded-lg bg-card px-3 py-2.5 shadow-md text-xs">
                      <p className="font-medium text-foreground mb-1.5">{dateStr}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Sentiment</p>
                      {items.map((item, i) => (
                        <div key={i} className={`flex items-center justify-between gap-4 ${item.isBrand ? "py-1 mb-0.5" : "py-0.5"}`}>
                          <div className="flex items-center gap-1.5">
                            <span className={`${item.isBrand ? "w-2.5 h-2.5" : "w-2 h-2"} rounded-full shrink-0`} style={{ backgroundColor: item.color }} />
                            <span className={item.isBrand ? "text-foreground text-sm font-semibold" : "text-foreground"}>{item.name}</span>
                          </div>
                          <span className={item.isBrand ? "font-bold tabular-nums text-sm" : "font-medium tabular-nums"}>
                            {item.value}% <span className="text-muted-foreground font-normal">({sentimentLabel(item.value)})</span>
                          </span>
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
                fill="url(#compSentGradient)"
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
              {/* Competitor lines */}
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
        </div>
      )}
    </section>
  );
}
