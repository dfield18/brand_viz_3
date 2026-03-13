"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { NarrativeFrame } from "@/types/api";
import { EmptyState } from "@/components/EmptyState";

interface FrameDistributionChartProps {
  frames: NarrativeFrame[];
}

export function FrameDistributionChart({ frames }: FrameDistributionChartProps) {
  if (frames.length === 0) {
    return (
      <EmptyState message="No frame distribution data available in this date range." />
    );
  }

  const data = frames.map((f) => ({
    frame: f.frame,
    percentage: f.percentage,
    chatgpt: f.byModel.chatgpt,
    gemini: f.byModel.gemini,
    claude: f.byModel.claude,
    perplexity: f.byModel.perplexity,
  }));

  return (
    <div className="space-y-6">
      {/* Overall frame distribution */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
          Overall Distribution
        </h3>
        <ResponsiveContainer width="100%" height={frames.length * 44 + 20}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, "auto"]}
              tickFormatter={(v) => `${v}%`}
              fontSize={12}
            />
            <YAxis
              type="category"
              dataKey="frame"
              width={160}
              fontSize={12}
              tickLine={false}
            />
            <Tooltip formatter={(value) => [`${value}%`, "Share"]} />
            <Bar
              dataKey="percentage"
              fill="var(--chart-1)"
              radius={[0, 4, 4, 0]}
              barSize={22}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Per-model breakdown */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
          Breakdown by Model
        </h3>
        <ResponsiveContainer width="100%" height={frames.length * 52 + 40}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, "auto"]}
              tickFormatter={(v) => `${v}%`}
              fontSize={12}
            />
            <YAxis
              type="category"
              dataKey="frame"
              width={160}
              fontSize={12}
              tickLine={false}
            />
            <Tooltip formatter={(value) => [`${value}%`]} />
            <Legend verticalAlign="top" height={30} />
            <Bar dataKey="chatgpt" name="ChatGPT" fill="var(--chart-1)" barSize={8} />
            <Bar dataKey="gemini" name="Gemini" fill="var(--chart-2)" barSize={8} />
            <Bar dataKey="claude" name="Claude" fill="var(--chart-3)" barSize={8} />
            <Bar dataKey="perplexity" name="Perplexity" fill="var(--chart-4)" barSize={8} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
