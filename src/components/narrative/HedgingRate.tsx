"use client";

import {
  LineChart,
  Line,
  ResponsiveContainer,
  YAxis,
  Tooltip,
  XAxis,
} from "recharts";
import { EmptyState } from "@/components/EmptyState";

interface HedgingRateProps {
  rate: number;
  trend: { date: string; value: number }[];
}

export function HedgingRate({ rate, trend }: HedgingRateProps) {
  return (
    <div className="space-y-4">
      <p className="text-4xl font-semibold tabular-nums">{rate}%</p>

      {trend.length === 0 ? (
        <EmptyState message="No hedging trend data available for this model." />
      ) : trend.length === 1 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-sm text-muted-foreground">Only one data point. Run more analyses to see trends.</p>
        </div>
      ) : (
        <div>
          <p className="text-xs text-muted-foreground mb-2">
            Weekly trend ({trend.length} weeks)
          </p>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={trend} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <YAxis
                domain={[0, 100]}
                hide
              />
              <XAxis
                dataKey="date"
                hide
              />
              <Tooltip
                labelFormatter={(d) => {
                  const date = new Date(String(d) + "T00:00:00");
                  return date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                }}
                formatter={(value) => [`${value}%`, "Hedging Rate"]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--chart-3)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
