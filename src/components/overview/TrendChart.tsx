"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendPoint } from "@/types/api";
import { EmptyState } from "@/components/EmptyState";

interface TrendChartProps {
  trend: TrendPoint[];
}

export function TrendChart({ trend }: TrendChartProps) {
  // Detect if data is monthly-spaced (show "Jan", "Feb") vs daily/weekly (show "MM/DD")
  const isMonthly = (() => {
    if (trend.length <= 1) return true;
    const dates = trend.map((d) => new Date(d.date + "T00:00:00").getTime());
    const avgGap = (dates[dates.length - 1] - dates[0]) / (dates.length - 1);
    return avgGap > 20 * 86_400_000;
  })();

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold mb-4">
        Trend
      </h2>
      {trend.length === 0 ? (
        <EmptyState message="No trend data available." />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={trend}
            margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              fontSize={11}
              tickFormatter={(d: string) => {
                if (isMonthly) {
                  const date = new Date(d + "T00:00:00");
                  return date.toLocaleDateString("en-US", { month: "short" });
                }
                const [, m, day] = d.split("-");
                return `${m}/${day}`;
              }}
            />
            <YAxis domain={[0, 100]} fontSize={12} />
            <Tooltip
              labelFormatter={(d) => {
                const date = new Date(String(d) + "T00:00:00");
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
              }}
            />
            <Legend verticalAlign="top" height={30} />
            <Line
              type="monotone"
              dataKey="visibility"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={false}
              name="Visibility"
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="controversy"
              stroke="var(--chart-5)"
              strokeWidth={2}
              dot={false}
              name="Controversy"
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="authority"
              stroke="var(--chart-2)"
              strokeWidth={2}
              dot={false}
              name="Authority"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
