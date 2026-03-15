"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { FrameDistribution } from "@/types/api";
import { EmptyState } from "@/components/EmptyState";

interface TopFramesChartProps {
  frames: FrameDistribution[];
}

const BAR_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function TopFramesChart({ frames }: TopFramesChartProps) {
  return (
    <div className="rounded-xl bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold mb-4">
        Narrative Frame Breakdown
      </h2>
      {frames.length === 0 ? (
        <EmptyState message="No frame data available for this model." />
      ) : (
        <ResponsiveContainer width="100%" height={frames.length * 48 + 20}>
          <BarChart
            data={frames}
            layout="vertical"
            margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
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
            <Tooltip
              formatter={(value) => [`${value}%`, "Share"]}
              cursor={{ fill: "var(--muted)", opacity: 0.3 }}
            />
            <Bar dataKey="percentage" radius={[0, 4, 4, 0]} barSize={24}>
              {frames.map((_, i) => (
                <Cell
                  key={i}
                  fill={BAR_COLORS[i % BAR_COLORS.length]}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
