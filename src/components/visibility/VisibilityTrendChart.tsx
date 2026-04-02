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
import type { VisibilityTrendPoint } from "@/types/api";
import { MODEL_LABELS } from "@/lib/constants";

interface VisibilityTrendChartProps {
  trend: VisibilityTrendPoint[];
  prompts?: string[];
  /** Lock to a single metric — hides the toggle */
  fixedMetric?: MetricMode;
  brandName?: string;
  /** Hide description text for a cleaner look */
  compact?: boolean;
}

const MODEL_KEYS = ["chatgpt", "gemini", "claude", "perplexity", "google"] as const;

type MetricMode = "visibility" | "topResult" | "sov";

export function VisibilityTrendChart({ trend, prompts: promptsProp = [], fixedMetric, brandName, compact }: VisibilityTrendChartProps) {
  const [focusModel, setFocusModel] = useState("all");
  const [focusPrompt, setFocusPrompt] = useState("all");
  const [metric, setMetric] = useState<MetricMode>(fixedMetric ?? "visibility");
  const effectiveMetric = fixedMetric ?? metric;

  // Derive prompts from trend data when not explicitly passed
  const prompts = useMemo(() => {
    if (promptsProp.length > 0) return promptsProp;
    const set = new Set<string>();
    for (const t of trend) {
      if (t.prompt && t.prompt !== "all") set.add(t.prompt);
    }
    return [...set].sort();
  }, [promptsProp, trend]);

  // Filter trend by selected prompt, then pivot
  const filteredTrend = useMemo(() => {
    const promptFilter = focusPrompt === "all" ? "all" : focusPrompt;
    return trend.filter((t) => (t.prompt ?? "all") === promptFilter);
  }, [trend, focusPrompt]);

  // Pivot: one row per date with columns for all+mentionRate, chatgpt+mentionRate, etc.
  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | null>>();
    for (const t of filteredTrend) {
      if (!byDate.has(t.date)) byDate.set(t.date, {});
      const row = byDate.get(t.date)!;
      const prefix = t.model === "all" ? "" : `${t.model}_`;
      row[`${prefix}mentionRate`] = t.mentionRate;
      row[`${prefix}firstMentionPct`] = t.firstMentionPct;
      row[`${prefix}sovPct`] = t.sovPct;
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, row]) => ({ date, ...row }));
  }, [filteredTrend]);

  const availableModels = useMemo(() => {
    const set = new Set(filteredTrend.map((t) => t.model));
    return MODEL_KEYS.filter((m) => set.has(m));
  }, [filteredTrend]);

  // Current value + delta vs ~30 days prior
  const { currentValue, delta } = useMemo(() => {
    if (chartData.length === 0) return { currentValue: null, delta: null };
    const mainKey = effectiveMetric === "visibility" ? "mentionRate" : effectiveMetric === "topResult" ? "firstMentionPct" : "sovPct";
    const activeKey = focusModel === "all" ? mainKey : `${focusModel}_${mainKey}`;
    const last = chartData[chartData.length - 1] as Record<string, unknown>;
    const cur = typeof last[activeKey] === "number" ? (last[activeKey] as number) : null;
    // Find the data point closest to 30 days before the most recent
    const lastDate = new Date(chartData[chartData.length - 1].date + "T00:00:00").getTime();
    const targetDate = lastDate - 30 * 86_400_000;
    let closest = chartData[0];
    let closestDist = Infinity;
    for (const row of chartData) {
      const rowDate = new Date(row.date + "T00:00:00").getTime();
      const dist = Math.abs(rowDate - targetDate);
      if (dist < closestDist) { closestDist = dist; closest = row; }
    }
    // Only compare if the closest point is a different data point than the last
    const priorRow = closest as Record<string, unknown>;
    const prev = closest !== chartData[chartData.length - 1] && typeof priorRow[activeKey] === "number"
      ? (priorRow[activeKey] as number) : null;
    const d = cur !== null && prev !== null ? +(cur - prev).toFixed(1) : null;
    return { currentValue: cur, delta: d };
  }, [chartData, effectiveMetric, focusModel]);

  // Auto-scale Y-axis: pad 10% below min and above max, clamped to 0–100
  const yDomain = useMemo(() => {
    const mainKey = effectiveMetric === "visibility" ? "mentionRate" : effectiveMetric === "topResult" ? "firstMentionPct" : "sovPct";
    const vals: number[] = [];
    for (const row of chartData) {
      const r = row as Record<string, unknown>;
      // Collect all values for this metric across all model columns
      for (const [k, v] of Object.entries(r)) {
        if (typeof v === "number" && k.includes(mainKey)) vals.push(v);
      }
    }
    if (vals.length === 0) return [0, 100] as [number, number];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const padding = Math.max((max - min) * 0.15, 5);
    const lo = Math.max(0, Math.floor((min - padding) / 5) * 5);
    const hi = Math.min(100, Math.ceil((max + padding) / 5) * 5);
    return [lo, hi] as [number, number];
  }, [chartData, effectiveMetric]);

  // Detect if data is monthly-spaced (show "Jan", "Feb") vs daily/weekly (show "MM/DD")
  const isMonthly = useMemo(() => {
    if (chartData.length <= 1) return true;
    const dates = chartData.map((d) => new Date(d.date + "T00:00:00").getTime());
    const avgGap = (dates[dates.length - 1] - dates[0]) / (dates.length - 1);
    return avgGap > 20 * 86_400_000; // >20 days apart → monthly
  }, [chartData]);

  if (trend.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Not enough data points for a trend. Run prompts over multiple periods to see trends.
        </p>
      </div>
    );
  }

  const mainDataKey = effectiveMetric === "visibility" ? "mentionRate" : effectiveMetric === "topResult" ? "firstMentionPct" : "sovPct";
  const activeDataKey = focusModel === "all" ? mainDataKey : `${focusModel}_${mainDataKey}`;
  const strokeColor = effectiveMetric === "visibility" ? "var(--chart-1)" : effectiveMetric === "topResult" ? "var(--chart-2)" : "var(--chart-3)";
  const gradientId = effectiveMetric === "visibility" ? "visGradient" : effectiveMetric === "topResult" ? "trGradient" : "sovGradient";

  return (
    <div>
      {/* Header row: title + toggle + hero stat + dropdowns */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            {!compact && (
              <h2 className="text-sm text-muted-foreground font-medium">
                {effectiveMetric === "visibility" ? <>{brandName ? <><strong className="text-foreground">{brandName}</strong>&apos;s</> : "Brand"} Recall Over Time</> : effectiveMetric === "topResult" ? <>{brandName ? <><strong className="text-foreground">{brandName}</strong>&apos;s</> : "Brand"} Top Result Rate Over Time</> : <>{brandName ? <><strong className="text-foreground">{brandName}</strong>&apos;s</> : "Brand"} Share of Voice Over Time</>}
              </h2>
            )}
            {!fixedMetric && (
              <div className="flex items-center rounded-full bg-muted p-0.5">
                <button
                  onClick={() => setMetric("visibility")}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                    metric === "visibility"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Brand Recall
                </button>
                <button
                  onClick={() => setMetric("sov")}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                    metric === "sov"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Share of Voice
                </button>
                <button
                  onClick={() => setMetric("topResult")}
                  className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                    metric === "topResult"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Top Result
                </button>
              </div>
            )}
          </div>
          {/* Hero value + delta */}
          <div className={`flex items-baseline gap-2.5 ${compact ? "mt-1" : "mt-2"}`}>
            {currentValue !== null && (
              <span className={`font-bold tabular-nums ${compact ? "text-xl" : "text-3xl"}`}>{Math.round(currentValue)}%</span>
            )}
            {delta !== null && delta !== 0 && (
              <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${delta > 0 ? "text-emerald-600" : "text-red-500"}`}>
                {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {delta > 0 ? "+" : ""}{delta}% vs prior month
              </span>
            )}
          </div>
          {!compact && (
            <>
              <p className="text-sm text-muted-foreground mt-2 mb-1">
                {effectiveMetric === "visibility"
                  ? "How often AI platforms mention the brand in response to general industry questions — where the brand is not explicitly named in the query"
                  : effectiveMetric === "topResult"
                  ? "How often the brand appears as the #1 recommendation in AI responses"
                  : "The brand's share of all entity mentions across AI responses"}
              </p>
              <p className="text-[11px] text-muted-foreground/50 italic mb-2">
                Note: historical data points are estimated from the latest available response per model and question as of each date.
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {prompts.length > 0 && (
            <select
              value={focusPrompt}
              onChange={(e) => setFocusPrompt(e.target.value)}
              className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card max-w-[220px] truncate"
            >
              <option value="all">All Questions</option>
              {prompts.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
          {!compact && (
            <select
              value={focusModel}
              onChange={(e) => setFocusModel(e.target.value)}
              className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card"
            >
              <option value="all">All AI Platforms</option>
              {availableModels.map((m) => (
                <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No trend data for this range.</p>
        </div>
      ) : chartData.length === 1 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">Only one data point available. Run more analyses over time to see trends.</p>
        </div>
      ) : (
      <>
      <ResponsiveContainer width="100%" height={320}>
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
            fontSize={13}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(d: string) => {
              if (isMonthly) {
                const date = new Date(d + "T00:00:00");
                return date.toLocaleDateString("en-US", { month: "short" });
              }
              const [, m, day] = d.split("-");
              return `${m}/${day}`;
            }}
            padding={{ left: 20 }}
          />
          <YAxis
            domain={yDomain}
            fontSize={13}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            tickFormatter={(v) => `${v}%`}
            width={48}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              const date = new Date(String(label) + "T00:00:00");
              const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

              const mainNames = new Set(["Brand Recall", "Top Result Rate", "Share of Voice", "All Models"]);
              const rawKeyNames = new Set(["mentionRate", "firstMentionPct", "sovPct"]);
              const items = payload
                .filter((entry) => entry.value != null && !rawKeyNames.has(String(entry.name ?? "")))
                .map((entry) => ({
                  name: String(entry.name ?? ""),
                  value: Number(entry.value),
                  color: String(entry.color ?? "#888"),
                  isMain: mainNames.has(String(entry.name ?? "")),
                }))
                .sort((a, b) => {
                  if (a.isMain && !b.isMain) return -1;
                  if (!a.isMain && b.isMain) return 1;
                  return a.name.localeCompare(b.name);
                });

              return (
                <div className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-md text-xs">
                  <p className="font-medium text-foreground mb-1.5">{dateStr}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">
                    {effectiveMetric === "visibility" ? "Brand Recall" : effectiveMetric === "topResult" ? "Top Result Rate" : "Share of Voice"}
                  </p>
                  {items.map((item, i) => (
                    <div key={i} className={`flex items-center justify-between gap-4 ${item.isMain ? "py-1 mb-0.5" : "py-0.5"}`}>
                      <div className="flex items-center gap-1.5">
                        <span className={`${item.isMain ? "w-2.5 h-2.5" : "w-2 h-2"} rounded-full shrink-0`} style={{ backgroundColor: item.color }} />
                        <span className={item.isMain ? "text-foreground text-sm font-semibold" : "text-foreground"}>{item.name}</span>
                      </div>
                      <span className={item.isMain ? "font-bold tabular-nums text-sm" : "font-medium tabular-nums"}>{item.value}%</span>
                    </div>
                  ))}
                </div>
              );
            }}
          />

          {/* Main area fill — hidden from tooltip */}
          <Area
            type="monotone"
            dataKey={activeDataKey}
            stroke="none"
            fill={`url(#${gradientId})`}
            connectNulls
            tooltipType="none"
          />

          {focusModel === "all" ? (
            <>
              <Line
                type="monotone"
                dataKey={mainDataKey}
                stroke={strokeColor}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: strokeColor, stroke: "var(--card)", strokeWidth: 2 }}
                name={effectiveMetric === "visibility" ? "Brand Recall" : effectiveMetric === "topResult" ? "Top Result Rate" : "Share of Voice"}
                connectNulls
              />
              {availableModels.map((m) => (
                <Line
                  key={`${m}_line`}
                  type="monotone"
                  dataKey={`${m}_${mainDataKey}`}
                  stroke={strokeColor}
                  strokeWidth={1}
                  strokeOpacity={0.25}
                  dot={false}
                  activeDot={{ r: 3 }}
                  name={`${MODEL_LABELS[m] ?? m}`}
                  connectNulls
                  legendType="none"
                />
              ))}
            </>
          ) : (
            <>
              <Line
                type="monotone"
                dataKey={`${focusModel}_${mainDataKey}`}
                stroke={strokeColor}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: strokeColor, stroke: "var(--card)", strokeWidth: 2 }}
                name={MODEL_LABELS[focusModel] ?? focusModel}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey={mainDataKey}
                stroke={strokeColor}
                strokeWidth={1}
                strokeOpacity={0.2}
                strokeDasharray="4 3"
                dot={false}
                activeDot={{ r: 3 }}
                name="All Models"
                connectNulls
              />
            </>
          )}
        </AreaChart>
      </ResponsiveContainer>

      </>
      )}

    </div>
  );
}
