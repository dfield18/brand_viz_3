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
import { MODEL_LABELS } from "@/lib/constants";

interface FrameTrendChartProps {
  frameTrend: Record<string, string | number>[];
}

const FRAME_COLORS = [
  "hsl(199, 89%, 48%)",  // blue
  "hsl(160, 60%, 45%)",  // green
  "hsl(24, 95%, 53%)",   // orange
  "hsl(263, 70%, 58%)",  // purple
  "hsl(340, 75%, 55%)",  // pink
  "hsl(45, 93%, 47%)",   // yellow
  "hsl(190, 70%, 50%)",  // cyan
  "hsl(0, 72%, 55%)",    // red
];

const MODEL_KEYS = ["chatgpt", "gemini", "claude", "perplexity", "google"] as const;

const MAX_VISIBLE_FRAMES = 4;

export function FrameTrendChart({ frameTrend }: FrameTrendChartProps) {
  const [selectedModel, setSelectedModel] = useState("all");
  const [highlightFrame, setHighlightFrame] = useState<string | null>(null);

  // Available models in the data
  const availableModels = useMemo(() => {
    const set = new Set(frameTrend.map((d) => String(d.model ?? "all")));
    return MODEL_KEYS.filter((m) => set.has(m));
  }, [frameTrend]);

  // Filter by selected model
  const filteredData = useMemo(() => {
    return frameTrend.filter((d) => (d.model ?? "all") === selectedModel);
  }, [frameTrend, selectedModel]);

  // Extract all frame names from the data (sorted by avg, top first)
  const frameNames = useMemo(() => {
    const names = new Set<string>();
    for (const entry of filteredData) {
      for (const key of Object.keys(entry)) {
        if (key !== "date" && key !== "model") names.add(key);
      }
    }
    // Sort by average value descending so the most prominent frames are first
    return [...names].sort((a, b) => {
      const avgA = filteredData.reduce((s, e) => s + (Number(e[a]) || 0), 0) / (filteredData.length || 1);
      const avgB = filteredData.reduce((s, e) => s + (Number(e[b]) || 0), 0) / (filteredData.length || 1);
      return avgB - avgA;
    });
  }, [filteredData]);

  const visibleFrames = frameNames.slice(0, MAX_VISIBLE_FRAMES);

  // Reset highlight if the selected frame is no longer visible
  const effectiveHighlight = highlightFrame && visibleFrames.includes(highlightFrame) ? highlightFrame : null;

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    frameNames.forEach((name, i) => {
      map[name] = FRAME_COLORS[i % FRAME_COLORS.length];
    });
    return map;
  }, [frameNames]);

  if (frameTrend.length < 2 || frameNames.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-base font-semibold">Narrative Frame Trend</h2>
          <p className="text-xs text-muted-foreground mt-1">
            How narrative frame emphasis changes over time
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
            % of responses with this narrative
          </p>
        </div>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0"
        >
          <option value="all">All Models</option>
          {availableModels.map((m) => (
            <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
          ))}
        </select>
      </div>

      {filteredData.length < 2 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">Not enough data points for this model.</p>
        </div>
      ) : (
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={320}>
            <LineChart
              data={filteredData}
              margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
            >
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
              />
              <YAxis
                domain={[0, (dataMax: number) => Math.ceil(dataMax / 5) * 5 + 5]}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
                width={44}
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
                formatter={(value: number | string | undefined, name: string | undefined) => [`${value ?? 0}%`, name ?? ""]}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />

              {visibleFrames.map((name) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={colorMap[name]}
                  strokeWidth={effectiveHighlight === name ? 3 : effectiveHighlight ? 1 : 2}
                  strokeOpacity={effectiveHighlight && effectiveHighlight !== name ? 0.25 : 1}
                  dot={false}
                  activeDot={{ r: 4 }}
                  name={name}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 justify-center">
            {visibleFrames.map((name) => (
              <button
                key={name}
                className={`flex items-center gap-1.5 text-xs transition-opacity ${effectiveHighlight && effectiveHighlight !== name ? "opacity-40" : ""}`}
                onClick={() => setHighlightFrame(effectiveHighlight === name ? null : name)}
              >
                <span className="inline-block w-3 h-[3px] rounded-full shrink-0" style={{ backgroundColor: colorMap[name] }} />
                <span className={effectiveHighlight === name ? "font-medium text-foreground" : "text-muted-foreground"}>{name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
