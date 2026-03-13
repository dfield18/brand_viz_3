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

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-base font-semibold">Narrative Frame Breakdown</h2>
          <p className="text-xs text-muted-foreground mt-1">
            How AI models frame {brandName}, and how each model&apos;s framing differs
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
          <ResponsiveContainer width="100%" height={frames.length * 38 + 20}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 16, bottom: 0, left: 0 }}
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
                width={130}
                fontSize={11}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const d = payload[0]?.payload as { frame: string; [key: string]: unknown } | undefined;
                  if (!d) return null;
                  const value = payload[0]?.value;
                  return (
                    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-xs">
                      <p className="font-medium text-foreground mb-0.5">{d.frame}</p>
                      <p className="text-muted-foreground">{value}% of responses</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey={barDataKey} radius={[0, 4, 4, 0]} barSize={18}>
                {data.map((_, i) => (
                  <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                ))}
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
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart cx="50%" cy="50%" outerRadius="60%" data={data}>
              <PolarGrid stroke="var(--border)" />
              <PolarAngleAxis
                dataKey="frame"
                fontSize={10}
                tick={{ fill: "var(--muted-foreground)" }}
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
                    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-xs">
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
      <p className="text-[11px] text-muted-foreground mt-6 leading-relaxed">
        AI responses are classified into narrative frames (e.g., &quot;Reliability,&quot; &quot;Innovation&quot;) using keyword and theme analysis. Percentages show how frequently each frame appears in responses from the selected model.
      </p>
    </section>
  );
}
