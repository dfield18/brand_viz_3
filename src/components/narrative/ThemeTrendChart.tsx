"use client";

import { useMemo } from "react";
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
import type { NarrativeDriftPoint } from "@/types/api";

interface ThemeTrendChartProps {
  drift: NarrativeDriftPoint[];
}

const THEME_COLORS = [
  "hsl(160, 60%, 45%)",  // emerald
  "hsl(220, 70%, 55%)",  // blue
  "hsl(38, 92%, 50%)",   // amber
  "hsl(280, 60%, 55%)",  // purple
];

export function ThemeTrendChart({ drift }: ThemeTrendChartProps) {
  // Find top 4 themes by average pct across all weeks
  const { chartData, topThemes } = useMemo(() => {
    const themeStats = new Map<string, { label: string; sum: number; count: number }>();

    for (const point of drift) {
      for (const t of point.topThemes) {
        const entry = themeStats.get(t.key) ?? { label: t.label, sum: 0, count: 0 };
        entry.sum += t.pct;
        entry.count++;
        themeStats.set(t.key, entry);
      }
    }

    const ranked = [...themeStats.entries()]
      .map(([key, { label, sum, count }]) => ({ key, label, avg: sum / count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 4);

    const topKeys = new Set(ranked.map((t) => t.key));

    // Pivot: one row per date with theme pct columns
    const rows = drift.map((point) => {
      const row: Record<string, number | string> = { date: point.date };
      for (const t of point.topThemes) {
        if (topKeys.has(t.key)) {
          row[t.key] = t.pct;
        }
      }
      // Fill missing themes with 0
      for (const t of ranked) {
        if (!(t.key in row)) row[t.key] = 0;
      }
      return row;
    });

    return { chartData: rows, topThemes: ranked };
  }, [drift]);

  if (drift.length < 2 || topThemes.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold">Theme Trend</h2>
      <p className="text-xs text-muted-foreground mt-1 mb-4">
        How narrative theme prevalence shifts over time
      </p>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            fontSize={11}
            tickLine={false}
            tickFormatter={(d: string) => {
              const [, m, day] = d.split("-");
              return `${m}/${day}`;
            }}
          />
          <YAxis
            domain={[0, 100]}
            fontSize={12}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
            width={48}
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
              if (value === null || value === undefined) return ["\u2014", name];
              return [`${value}%`, name];
            }}
          />
          <Legend verticalAlign="top" height={36} />

          {topThemes.map((theme, i) => (
            <Line
              key={theme.key}
              type="monotone"
              dataKey={theme.key}
              stroke={THEME_COLORS[i % THEME_COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              name={theme.label}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
