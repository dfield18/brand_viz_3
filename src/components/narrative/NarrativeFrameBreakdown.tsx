"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import type { NarrativeFrame } from "@/types/api";

interface Props {
  frames: NarrativeFrame[];
  brandName?: string;
}

const BAR_COLORS = [
  "var(--chart-3)",
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const MODEL_CONFIG = [
  { key: "chatgpt", name: "ChatGPT", color: "hsl(160, 60%, 45%)" },
  { key: "gemini", name: "Gemini", color: "hsl(199, 89%, 48%)" },
  { key: "claude", name: "Claude", color: "hsl(24, 95%, 53%)" },
  { key: "perplexity", name: "Perplexity", color: "hsl(263, 70%, 58%)" },
  { key: "google", name: "Google AI Overview", color: "hsl(4, 80%, 56%)" },
] as const;

function wrapLabel(text: string, maxChars = 18): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current && (current + " " + word).length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function RadarTickLabel(props: {
  x?: number; y?: number; payload?: { value: string };
  cx?: number; cy?: number;
}) {
  const { x = 0, y = 0, payload, cx = 0, cy = 0 } = props;
  const label = payload?.value ?? "";
  const lines = wrapLabel(label, 14);
  const dx = x - cx;
  const dy = y - cy;
  const anchor = dx > 5 ? "start" : dx < -5 ? "end" : "middle";
  // Push labels outward from center to avoid overlapping the chart
  const nudgeX = dx > 5 ? 6 : dx < -5 ? -6 : 0;
  const nudgeY = dy > 5 ? 6 : dy < -5 ? -6 : 0;

  return (
    <g transform={`translate(${x + nudgeX},${y + nudgeY})`}>
      {lines.map((line, i) => (
        <text
          key={i}
          x={0}
          y={i * 12}
          dy={y < cy ? -((lines.length - 1) * 12) + 4 : 4}
          textAnchor={anchor}
          fontSize={10}
          fill="var(--muted-foreground)"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

/** Custom Y-axis tick for bar chart — wraps long labels into multiple lines */
function BarYAxisTick(props: {
  x?: number; y?: number; payload?: { value: string };
}) {
  const { x = 0, y = 0, payload } = props;
  const label = payload?.value ?? "";
  const lines = wrapLabel(label, 16);
  return (
    <g transform={`translate(${x},${y})`}>
      {lines.map((line, i) => (
        <text
          key={i}
          x={-4}
          y={0}
          dy={i * 13 - ((lines.length - 1) * 13) / 2}
          textAnchor="end"
          fontSize={11}
          fill="var(--muted-foreground)"
        >
          {line}
        </text>
      ))}
    </g>
  );
}

export function NarrativeFrameBreakdown({ frames, brandName = "this brand" }: Props) {
  const [selectedModel, setSelectedModel] = useState<string>("all");

  if (frames.length === 0) return null;

  const data = frames.map((f) => ({
    frame: f.frame,
    percentage: f.percentage,
    chatgpt: f.byModel.chatgpt ?? 0,
    gemini: f.byModel.gemini ?? 0,
    claude: f.byModel.claude ?? 0,
    perplexity: f.byModel.perplexity ?? 0,
    google: f.byModel.google ?? 0,
  }));

  // Only show models that have data
  const activeModels = MODEL_CONFIG.filter((m) =>
    data.some((d) => d[m.key] > 0),
  );

  // Compute data based on selection
  const barDataKey = selectedModel === "all" ? "percentage" : selectedModel;
  const radarDataKey = barDataKey;
  const radarColor = selectedModel === "all"
    ? "var(--chart-3)"
    : MODEL_CONFIG.find((m) => m.key === selectedModel)?.color ?? "var(--chart-3)";
  const radarLabel = selectedModel === "all"
    ? "All Models"
    : MODEL_CONFIG.find((m) => m.key === selectedModel)?.name ?? selectedModel;

  // Scale bar/radar size based on frame count
  const rowHeight = frames.length <= 3 ? 64 : frames.length <= 5 ? 50 : 38;
  const barSize = frames.length <= 3 ? 28 : frames.length <= 5 ? 22 : 18;
  const barChartHeight = Math.max(frames.length * rowHeight + 20, 220);
  const radarHeight = Math.max(barChartHeight, 240);

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-base font-semibold">How AI Describes You</h2>
          <p className="text-xs text-muted-foreground mt-1">
            The key themes and stories AI tells about {brandName}
          </p>
        </div>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0"
        >
          <option value="all">All Models</option>
          {activeModels.map((m) => (
            <option key={m.key} value={m.key}>{m.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[5fr_4fr] gap-6 items-start mt-8">
        {/* Left: Overall horizontal bar chart */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
            Overall Distribution
          </h3>
          <ResponsiveContainer width="100%" height={barChartHeight}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, "auto"]}
                tickFormatter={(v) => `${v}%`}
                fontSize={11}
                height={20}
              />
              <YAxis
                type="category"
                dataKey="frame"
                width={150}
                tickLine={false}
                tick={(props: object) => <BarYAxisTick {...props as Parameters<typeof BarYAxisTick>[0]} />}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const d = payload[0]?.payload as { frame: string; [key: string]: unknown } | undefined;
                  if (!d) return null;
                  const value = payload[0]?.value;
                  return (
                    <div className="rounded-lg bg-card px-3 py-2 shadow-md text-xs">
                      <p className="font-medium text-foreground mb-0.5">{d.frame}</p>
                      <p className="text-muted-foreground">{value}% of responses</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey={barDataKey} radius={[0, 4, 4, 0]} barSize={barSize}>
                {data.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
                <LabelList
                  dataKey={barDataKey}
                  position="right"
                  formatter={(v: unknown) => `${v ?? 0}%`}
                  style={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Right: Radar chart */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-1 uppercase tracking-wide">
            Frame Profile
          </h3>
          <p className="text-[11px] text-muted-foreground mb-3">
            Larger area = more AI responses use this narrative
          </p>
          <ResponsiveContainer width="100%" height={radarHeight}>
            <RadarChart cx="50%" cy="50%" outerRadius="42%" data={data}>
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis
                dataKey="frame"
                tick={(props: object) => <RadarTickLabel {...props as Parameters<typeof RadarTickLabel>[0]} />}
              />
              <PolarRadiusAxis
                domain={[0, "auto"]}
                tick={false}
                axisLine={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const d = payload[0]?.payload as { frame: string; [key: string]: unknown } | undefined;
                  if (!d) return null;
                  const value = payload[0]?.value;
                  return (
                    <div className="rounded-lg bg-card px-3 py-2 shadow-md text-xs">
                      <p className="font-medium text-foreground mb-0.5">{d.frame}</p>
                      <p className="text-muted-foreground">{radarLabel}: {value ?? 0}%</p>
                    </div>
                  );
                }}
              />
              <Radar
                dataKey={radarDataKey}
                name={radarLabel}
                stroke={radarColor}
                fill={radarColor}
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        Each bar represents a recurring theme in how AI describes you (e.g., &quot;Reliability,&quot; &quot;Innovation&quot;). Percentages show how often each theme appears in AI responses from the selected platform.
      </p>
    </section>
  );
}
