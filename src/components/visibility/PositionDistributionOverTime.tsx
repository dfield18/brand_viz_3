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
import type { PositionDistributionOverTimeEntry } from "@/types/api";
import { MODEL_LABELS } from "@/lib/constants";

interface PositionDistributionOverTimeProps {
  id?: string;
  data: PositionDistributionOverTimeEntry[];
  children?: React.ReactNode | ((selectedModel: string) => React.ReactNode);
}

const SERIES = [
  { key: "pos1", label: "Position #1", color: "hsl(217, 91%, 50%)" },
  { key: "pos2", label: "Position #2", color: "hsl(217, 70%, 62%)" },
  { key: "pos3", label: "Position #3", color: "hsl(217, 45%, 72%)" },
  { key: "pos4_5", label: "Position #4–5", color: "hsl(218, 20%, 78%)" },
  { key: "pos6plus", label: "Position #6+", color: "hsl(218, 11%, 85%)" },
] as const;

const MODEL_KEYS = ["chatgpt", "gemini", "claude", "perplexity", "google"] as const;

export function PositionDistributionOverTime({ id, data, children }: PositionDistributionOverTimeProps) {
  const [selectedModel, setSelectedModel] = useState("all");

  const models = useMemo(() => {
    const set = new Set(data.map((d) => d.model));
    return MODEL_KEYS.filter((m) => set.has(m));
  }, [data]);

  const chartData = useMemo(
    () => data.filter((d) => d.model === selectedModel),
    [data, selectedModel],
  );

  if (data.length === 0) {
    return null;
  }

  return (
    <section id={id} className={`rounded-xl border border-border bg-card p-6 shadow-section${id ? " scroll-mt-24" : ""}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-sm font-medium text-foreground">Position Distribution Over Time</h3>
          <p className="text-xs text-muted-foreground mt-1">
            How often your brand appears in each ranking position, and how it&apos;s trending
          </p>
        </div>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card"
        >
          <option value="all">All AI Platforms</option>
          {models.map((m) => (
            <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
          ))}
        </select>
      </div>

      {chartData.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No position data for this model and range.</p>
        </div>
      ) : (
        <div className="mt-6">
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
                labelFormatter={(d) => {
                  const date = new Date(String(d) + "T00:00:00");
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  });
                }}
                formatter={(value, name) => {
                  return [`${Math.round(Number(value))}%`, name];
                }}
                itemSorter={(item) => -(item.value as number)}
              />
              <Legend verticalAlign="top" height={36} />

              {SERIES.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stackId="pos"
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
      {children && (
        <div className="mt-8 pt-7 border-t border-border/50">
          {typeof children === "function" ? children(selectedModel) : children}
        </div>
      )}
    </section>
  );
}
