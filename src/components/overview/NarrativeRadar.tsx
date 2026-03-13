"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { FrameDistribution } from "@/types/api";
import { EmptyState } from "@/components/EmptyState";

interface NarrativeRadarProps {
  frames: FrameDistribution[];
}

export function NarrativeRadar({ frames }: NarrativeRadarProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold mb-4">Narrative Profile</h2>
      {frames.length === 0 ? (
        <EmptyState message="No frame data available for this model." />
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart
            cx="50%"
            cy="50%"
            outerRadius="70%"
            data={frames}
          >
            <PolarGrid stroke="var(--border)" />
            <PolarAngleAxis
              dataKey="frame"
              fontSize={11}
              tick={{ fill: "var(--muted-foreground)" }}
            />
            <PolarRadiusAxis
              domain={[0, 100]}
              tick={false}
              axisLine={false}
            />
            <Tooltip formatter={(value) => [`${value}%`, "Strength"]} />
            <Radar
              dataKey="percentage"
              stroke="var(--chart-3)"
              fill="var(--chart-3)"
              fillOpacity={0.25}
              strokeWidth={2}
            />
          </RadarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
