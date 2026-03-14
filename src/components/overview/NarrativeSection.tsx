"use client";

import { useState } from "react";
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
import { FrameDistribution } from "@/types/api";
import { EmptyState } from "@/components/EmptyState";

interface NarrativeSectionProps {
  frames: FrameDistribution[];
  brandName?: string;
}

const MODEL_CONFIG = [
  { key: "chatgpt", name: "ChatGPT", color: "hsl(160, 60%, 45%)" },
  { key: "gemini", name: "Gemini", color: "hsl(199, 89%, 48%)" },
  { key: "claude", name: "Claude", color: "hsl(24, 95%, 53%)" },
  { key: "perplexity", name: "Perplexity", color: "hsl(263, 70%, 58%)" },
  { key: "google", name: "Google AI Overview", color: "hsl(4, 80%, 56%)" },
] as const;

const BAR_COLORS = [
  "var(--chart-3)",
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function NarrativeSection({ frames, brandName = "this brand" }: NarrativeSectionProps) {
  const [selectedModel, setSelectedModel] = useState<string>("all");

  if (frames.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-section">
        <h2 className="text-sm font-semibold mb-2">Narrative Frame Breakdown</h2>
        <EmptyState message="No frame data available for this model." />
      </div>
    );
  }

  const data = frames.map((f) => ({
    frame: f.frame,
    pct: f.percentage,
    chatgpt: f.byModel?.chatgpt ?? 0,
    gemini: f.byModel?.gemini ?? 0,
    claude: f.byModel?.claude ?? 0,
    perplexity: f.byModel?.perplexity ?? 0,
    google: f.byModel?.google ?? 0,
  }));

  const hasByModel = frames.some((f) => f.byModel && Object.values(f.byModel).some((v) => v > 0));
  const activeModels = hasByModel
    ? MODEL_CONFIG.filter((m) => data.some((d) => d[m.key] > 0))
    : [];

  const radarDataKey = selectedModel === "all" ? "pct" : selectedModel;
  const radarColor = selectedModel === "all"
    ? "var(--chart-3)"
    : MODEL_CONFIG.find((m) => m.key === selectedModel)?.color ?? "var(--chart-3)";
  const radarLabel = selectedModel === "all"
    ? "All Models"
    : MODEL_CONFIG.find((m) => m.key === selectedModel)?.name ?? selectedModel;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-base font-semibold">Narrative Frame Breakdown</h2>
        {hasByModel && activeModels.length > 0 && (
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="text-xs border border-border rounded-md px-2 py-1 bg-card text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="all">All Models</option>
            {activeModels.map((m) => (
              <option key={m.key} value={m.key}>{m.name}</option>
            ))}
          </select>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-5">
        How AI models frame {brandName}
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-[5fr_4fr] gap-6">
        {/* Bar chart */}
        <div className="flex flex-col">
          <div className="mb-3">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Overall Distribution
            </h3>
          </div>
          <div className="flex-1 flex items-center">
            <div className="w-full">
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
                    formatter={(value) => [`${value}%`, "Share"]}
                    cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="pct" radius={[0, 4, 4, 0]} barSize={18}>
                    {data.map((_, i) => (
                      <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Radar chart with model dropdown */}
        <div className="flex flex-col">
          <div className="mb-1">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Frame Profile
            </h3>
          </div>
          <p className="text-[11px] text-muted-foreground mb-2">
            Larger area toward a frame means stronger emphasis
          </p>
          <div className="flex-1 flex items-center">
            <div className="w-full">
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart cx="50%" cy="50%" outerRadius="60%" data={data}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis
                    dataKey="frame"
                    fontSize={10}
                    tick={{ fill: "var(--muted-foreground)" }}
                  />
                  <PolarRadiusAxis domain={[0, "auto"]} tick={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number | string | undefined) => [`${value ?? 0}%`, radarLabel]}
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
        </div>
      </div>
    </div>
  );
}
