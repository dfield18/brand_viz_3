"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const METRICS = [
  { key: "brandRecall", label: "Brand Recall" },
  { key: "shareOfVoice", label: "Share of Voice" },
  { key: "topResultRate", label: "Top Result" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

const MODEL_COLORS: Record<string, string> = {
  chatgpt: "hsl(160, 60%, 45%)",
  gemini: "hsl(199, 89%, 48%)",
  claude: "hsl(24, 95%, 53%)",
  perplexity: "hsl(263, 70%, 58%)",
  google: "hsl(4, 80%, 56%)",
};

const MODEL_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  perplexity: "Perplexity",
  google: "Google AIO",
};

export interface TrendPoint {
  date: string;
  model: string;
  brandRecall: number;
  shareOfVoice: number;
  topResultRate: number;
}

interface Props {
  brandName: string;
  points: TrendPoint[];
  scorecard: { brandRecall: number; shareOfVoice: number; topResultRate: number };
}

export function SampleChart({ brandName, points, scorecard }: Props) {
  const [metric, setMetric] = useState<MetricKey>("brandRecall");

  const models = useMemo(
    () => [...new Set(points.map((p) => p.model))].sort(),
    [points],
  );

  // Pivot: { date, chatgpt: value, gemini: value, ... }
  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const p of points) {
      if (!byDate.has(p.date)) byDate.set(p.date, { date: p.date });
      byDate.get(p.date)![p.model] = p[metric];
    }
    return [...byDate.values()].sort((a, b) =>
      (a.date as string).localeCompare(b.date as string),
    );
  }, [points, metric]);

  const kpis = [
    { label: "Brand Recall", key: "brandRecall" as MetricKey, value: scorecard.brandRecall },
    { label: "Share of Voice", key: "shareOfVoice" as MetricKey, value: scorecard.shareOfVoice },
    { label: "Top Result Rate", key: "topResultRate" as MetricKey, value: scorecard.topResultRate },
  ];

  return (
    <div>
      {/* KPI cards that double as metric selector */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {kpis.map((kpi) => (
          <button
            key={kpi.key}
            onClick={() => setMetric(kpi.key)}
            className={`rounded-lg border px-4 py-3 text-left transition-colors ${
              metric === kpi.key
                ? "border-foreground/20 bg-background"
                : "border-border/60 bg-background/50 opacity-60 hover:opacity-80"
            }`}
          >
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {kpi.label}
            </p>
            <p className="mt-1.5 text-xl font-bold text-foreground">
              {kpi.value}%
            </p>
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-lg border border-border/60 bg-background p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground">{brandName} &middot; 90 days</p>
          <div className="flex gap-3 text-[10px] text-muted-foreground">
            {models.map((m) => (
              <span key={m} className="flex items-center gap-1">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: MODEL_COLORS[m] ?? "#888" }}
                />
                {MODEL_LABELS[m] ?? m}
              </span>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={{ stroke: "#e4e4e7" }}
              tickLine={false}
              tickFormatter={(v: string) => {
                const [, m, d] = v.split("-");
                return `${parseInt(m)}/${parseInt(d)}`;
              }}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              domain={[0, "auto"]}
              tickFormatter={(v: number) => `${v}%`}
              width={40}
            />
            <Tooltip
              contentStyle={{
                fontSize: 11,
                borderRadius: 8,
                border: "1px solid #e4e4e7",
                background: "#fff",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}
              formatter={(value: unknown, name: unknown) => [
                `${value}%`,
                MODEL_LABELS[String(name)] ?? String(name),
              ]}
              labelFormatter={(v) => String(v)}
            />
            {models.map((m) => (
              <Line
                key={m}
                type="monotone"
                dataKey={m}
                stroke={MODEL_COLORS[m] ?? "#888"}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
