"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { SentimentTrendPoint, NarrativeResponse } from "@/types/api";
import { VALID_MODELS, MODEL_LABELS } from "@/lib/constants";
import { useCachedFetch } from "@/lib/useCachedFetch";

interface SentimentTrendChartProps {
  trend: SentimentTrendPoint[];
  brandSlug: string;
  range: number;
  pageModel: string;
}

interface NarrativeApiResponse {
  hasData: boolean;
  narrative?: NarrativeResponse;
}

const MODEL_KEYS = ["chatgpt", "gemini", "claude", "perplexity", "google"] as const;

const MODEL_LINE_COLORS: Record<string, string> = {
  chatgpt: "hsl(160, 60%, 45%)",
  gemini: "hsl(199, 89%, 48%)",
  claude: "hsl(24, 95%, 53%)",
  perplexity: "hsl(263, 70%, 58%)",
  google: "hsl(4, 80%, 56%)",
};

export function SentimentTrendChart({ trend: initialTrend, brandSlug, range, pageModel }: SentimentTrendChartProps) {
  const [focusModel, setFocusModel] = useState("all");

  // Self-fetch when page-level model changes to get fresh trend data
  const fetchUrl = focusModel !== pageModel && focusModel !== "all"
    ? `/api/narrative?brandSlug=${encodeURIComponent(brandSlug)}&model=${focusModel}&range=${range}`
    : null;
  const { data: apiData } = useCachedFetch<NarrativeApiResponse>(fetchUrl);

  const trend = fetchUrl && apiData?.narrative?.sentimentTrend
    ? apiData.narrative.sentimentTrend
    : initialTrend;

  // Pivot: one row per date → { date, positive, chatgpt_positive, ... }
  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | null>>();
    for (const t of trend) {
      if (!byDate.has(t.date)) byDate.set(t.date, {});
      const row = byDate.get(t.date)!;
      const prefix = t.model === "all" ? "" : `${t.model}_`;
      row[`${prefix}positive`] = t.positive;
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, row]) => ({ date, ...row }));
  }, [trend]);

  const availableModels = useMemo(() => {
    const set = new Set(trend.map((t) => t.model));
    return MODEL_KEYS.filter((m) => set.has(m));
  }, [trend]);

  if (trend.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-base font-semibold">How AI Sentiment Is Changing</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Whether AI is becoming more positive or negative about the brand over time
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
            Y-axis shows % of AI responses with positive sentiment
          </p>
        </div>
        <select
          value={focusModel}
          onChange={(e) => setFocusModel(e.target.value)}
          className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0"
        >
          <option value="all">All Models</option>
          {(availableModels.length > 0 ? availableModels : VALID_MODELS).map((m) => (
            <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
          ))}
        </select>
      </div>

      {chartData.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No trend data for this range.</p>
        </div>
      ) : (
      <div className="mt-4">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
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
            domain={[0, 100]}
            fontSize={12}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
            width={48}
          />
          <Tooltip
            labelFormatter={(d) => {
              const date = new Date(String(d) + "T00:00:00");
              return date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
            }}
            formatter={(value, name) => {
              if (value === null || value === undefined) return ["\u2014", name];
              return [`${value}%`, name];
            }}
          />

          {focusModel === "all" ? (
            <>
              {/* Primary: "all" positive sentiment */}
              <Line
                type="monotone"
                dataKey="positive"
                stroke="hsl(160, 60%, 45%)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
                name="Avg. Positive Sentiment"
                connectNulls
              />

              {/* Per-model — thin, muted */}
              {availableModels.map((m) => (
                <Line
                  key={`${m}_pos`}
                  type="monotone"
                  dataKey={`${m}_positive`}
                  stroke={MODEL_LINE_COLORS[m] ?? "hsl(160, 60%, 45%)"}
                  strokeWidth={1}
                  strokeOpacity={0.35}
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
              {/* Single model: show selected model as primary */}
              <Line
                type="monotone"
                dataKey={`${focusModel}_positive`}
                stroke="hsl(160, 60%, 45%)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
                name={`${MODEL_LABELS[focusModel] ?? focusModel} Sentiment`}
                connectNulls
              />

              {/* "All" as muted background reference */}
              <Line
                type="monotone"
                dataKey="positive"
                stroke="hsl(160, 60%, 45%)"
                strokeWidth={1}
                strokeOpacity={0.25}
                strokeDasharray="4 3"
                dot={false}
                activeDot={{ r: 3 }}
                name="All Models"
                connectNulls
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      {focusModel === "all" ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 justify-center">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="inline-block w-3 h-[3px] rounded-full shrink-0" style={{ backgroundColor: "hsl(160, 60%, 45%)" }} />
            <span className="font-medium text-foreground">All Models</span>
          </div>
          {availableModels.map((m) => (
            <div key={m} className="flex items-center gap-1.5 text-xs">
              <span className="inline-block w-3 h-[3px] rounded-full shrink-0 opacity-50" style={{ backgroundColor: MODEL_LINE_COLORS[m] ?? "hsl(160, 60%, 45%)" }} />
              <span className="text-muted-foreground">{MODEL_LABELS[m] ?? m}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 justify-center">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="inline-block w-3 h-[3px] rounded-full shrink-0" style={{ backgroundColor: "hsl(160, 60%, 45%)" }} />
            <span className="font-medium text-foreground">{MODEL_LABELS[focusModel] ?? focusModel}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <svg width={12} height={3} className="shrink-0 opacity-50">
              <line x1="0" y1="1.5" x2="12" y2="1.5" stroke="hsl(160, 60%, 45%)" strokeWidth="1.5" strokeDasharray="3 2" />
            </svg>
            <span className="text-muted-foreground">All Models</span>
          </div>
        </div>
      )}
      </div>
      )}
    </section>
  );
}
