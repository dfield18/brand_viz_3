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
} from "recharts";
import type { PositionDistributionOverTimeEntry } from "@/types/api";
import { MODEL_LABELS } from "@/lib/constants";

interface PositionDistributionOverTimeProps {
  id?: string;
  data: PositionDistributionOverTimeEntry[];
  children?: React.ReactNode | ((selectedModel: string) => React.ReactNode);
  brandName?: string;
}

const SERIES = [
  { key: "pos1", label: "#1", color: "hsl(160, 60%, 45%)" },       // green — best
  { key: "pos2_3", label: "2–3", color: "hsl(217, 91%, 55%)" },    // blue
  { key: "pos4_5", label: "4–5", color: "hsl(38, 92%, 50%)" },     // amber
  { key: "pos6plus", label: "6+", color: "hsl(0, 72%, 55%)" },     // red — worst
] as const;

const MODEL_KEYS = ["chatgpt", "gemini", "claude", "perplexity", "google"] as const;

/** Build a plain-English summary from the latest data point. */
function buildSummary(
  latest: PositionDistributionOverTimeEntry | undefined,
  first: PositionDistributionOverTimeEntry | undefined,
  brandName: string,
): string | null {
  if (!latest) return null;

  // Find the dominant band
  const bands = [
    { label: "the #1 recommendation", pct: latest.pos1 },
    { label: "ranked 2nd–3rd", pct: latest.pos2_3 },
    { label: "ranked 4th–5th", pct: latest.pos4_5 },
    { label: "ranked 6th or lower", pct: latest.pos6plus },
  ];
  const dominant = bands.reduce((a, b) => (b.pct > a.pct ? b : a));

  let summary = `${brandName} is most often ${dominant.label} (${Math.round(dominant.pct)}% of responses).`;

  // Add a trend note if we have enough history
  if (first && first !== latest) {
    const latestPos1 = latest.pos1;
    const latestPos2_3 = latest.pos2_3;
    const firstPos1 = first.pos1;
    const firstPos2_3 = first.pos2_3;
    const pos1Delta = latestPos1 - firstPos1;
    const pos2_3Delta = latestPos2_3 - firstPos2_3;
    const topDelta = (latestPos1 + latestPos2_3) - (firstPos1 + firstPos2_3);

    if (Math.abs(topDelta) >= 8) {
      // Describe which positions actually changed
      const hasPos1 = latestPos1 > 0 || firstPos1 > 0;
      const hasPos2_3 = latestPos2_3 > 0 || firstPos2_3 > 0;
      const posLabel = hasPos1 && hasPos2_3 ? "Top-3 (positions #1–#3)"
        : hasPos1 ? "#1 position"
        : "Positions #2–#3";
      if (topDelta > 0) {
        summary += ` ${posLabel} appearances are up ${Math.round(topDelta)} pts over this period.`;
      } else {
        summary += ` ${posLabel} appearances are down ${Math.round(Math.abs(topDelta))} pts over this period.`;
      }
    } else if (Math.abs(pos1Delta) >= 5) {
      if (pos1Delta > 0) {
        summary += ` #1 rankings are trending up.`;
      } else {
        summary += ` #1 rankings have declined.`;
      }
    }
  }

  if (latest.pos1 === 0) {
    summary += ` It has not been the top recommendation in this period.`;
  }

  return summary;
}

export function PositionDistributionOverTime({ id, data, children, brandName = "this brand" }: PositionDistributionOverTimeProps) {
  const [selectedModel, setSelectedModel] = useState("all");

  const models = useMemo(() => {
    const set = new Set(data.map((d) => d.model));
    return MODEL_KEYS.filter((m) => set.has(m));
  }, [data]);

  const chartData = useMemo(
    () => data.filter((d) => d.model === selectedModel),
    [data, selectedModel],
  );

  const summary = useMemo(() => {
    if (chartData.length === 0) return null;
    const sorted = [...chartData].sort((a, b) => a.date.localeCompare(b.date));
    return buildSummary(sorted[sorted.length - 1], sorted[0], brandName);
  }, [chartData, brandName]);

  if (data.length === 0) {
    return null;
  }

  return (
    <section id={id} className={`rounded-xl bg-card p-6 shadow-section${id ? " scroll-mt-24" : ""}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-base font-semibold">Where AI Ranks {brandName} Over Time</h3>
          <p className="text-sm text-muted-foreground mt-1">
            When AI recommends brands in this space, where does {brandName} appear in the list? Position #1 means AI mentions {brandName} first. Lower positions mean competitors are being recommended ahead of {brandName}.
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

      {/* Plain-English summary */}
      {summary && (
        <p className="text-sm text-muted-foreground leading-relaxed mt-3 mb-1">
          {summary}
        </p>
      )}

      {chartData.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">No position data for this model and range.</p>
        </div>
      ) : (
        <div className="mt-5">
          {/* Color-coded legend */}
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 mb-4">
            {SERIES.map((s) => (
              <div key={s.key} className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>

          <ResponsiveContainer width="95%" height={320} style={{ marginLeft: "auto" }}>
            <AreaChart
              data={chartData}
              margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
              stackOffset="expand"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" strokeOpacity={0.5} />
              <XAxis
                dataKey="date"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(d: string) => {
                  const [, m, day] = d.split("-");
                  return `${m}/${day}`;
                }}
              />
              <YAxis
                domain={[0, 1]}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${Math.round(v * 100)}%`}
                width={56}
                label={{
                  value: "% of responses",
                  angle: -90,
                  position: "insideLeft",
                  offset: 14,
                  style: { fontSize: 13, fill: "var(--muted-foreground)", textAnchor: "middle" },
                }}
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
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />

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
                  fillOpacity={0.85}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>

          <p className="text-[10px] text-muted-foreground/60 text-center mt-2">
            Green = #1 recommendation &middot; Blue = 2nd–3rd &middot; Amber = 4th–5th &middot; Red = 6th or lower
          </p>
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
