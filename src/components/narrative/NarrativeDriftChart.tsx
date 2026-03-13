"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  YAxis,
  XAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { NarrativeDriftPoint } from "@/types/api";

interface NarrativeDriftChartProps {
  drift: NarrativeDriftPoint[];
  title?: string;
  description?: string;
}

export function NarrativeDriftChart({ drift, title, description }: NarrativeDriftChartProps) {
  const [selectedTheme, setSelectedTheme] = useState("overall");

  // Collect all theme names from themeDrift data
  const themeNames = useMemo(() => {
    const names = new Set<string>();
    for (const d of drift) {
      if (d.themeDrift) {
        for (const key of Object.keys(d.themeDrift)) names.add(key);
      }
    }
    return [...names].sort();
  }, [drift]);

  const chartData = useMemo(() => {
    return drift.map((d) => ({
      date: d.date,
      drift: d.drift,
      ...(d.themeDrift ?? {}),
    }));
  }, [drift]);

  if (!drift || drift.length === 0) {
    return <p className="text-sm text-muted-foreground">No drift data available.</p>;
  }

  const dataKey = selectedTheme === "overall" ? "drift" : selectedTheme;
  const label = selectedTheme === "overall" ? "Overall" : selectedTheme;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
            Higher = bigger change in what AI says (0 = no change, 1 = complete shift)
          </p>
        </div>
        <select
          value={selectedTheme}
          onChange={(e) => setSelectedTheme(e.target.value)}
          className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0 ml-4"
        >
          <option value="overall">All Narratives</option>
          {themeNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
          <XAxis
            dataKey="date"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(d) => {
              const date = new Date(String(d) + "T00:00:00");
              return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            }}
          />
          <YAxis
            domain={[0, 1]}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => v.toFixed(2)}
            width={44}
          />
          <Tooltip
            labelFormatter={(d) => {
              const date = new Date(String(d) + "T00:00:00");
              return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            }}
            formatter={(value) => [Number(value).toFixed(3), `${label} Shift Score`]}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke="var(--chart-2)"
            strokeWidth={2.5}
            dot={{ r: 2.5, fill: "var(--card)", stroke: "var(--chart-2)", strokeWidth: 2 }}
            activeDot={{ r: 4, fill: "var(--chart-2)", stroke: "var(--card)", strokeWidth: 2 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Emerging / Declining theme pills per bucket */}
      {selectedTheme === "overall" && drift.some((d) => d.emerging.length > 0 || d.declining.length > 0) && (
        <div className="mt-6 pt-5 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground mb-3">Recent narrative shifts</p>
          <div className="space-y-3">
            {drift
              .filter((d) => d.emerging.length > 0 || d.declining.length > 0)
              .slice(-4)
              .map((d) => (
                <div key={d.date} className="flex flex-wrap items-center gap-2.5 text-xs">
                  <span className="text-muted-foreground font-medium w-20 shrink-0">
                    {new Date(d.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  {d.emerging.map((eLabel) => (
                    <span
                      key={`e-${eLabel}`}
                      className="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-2.5 py-0.5 border border-emerald-200 dark:border-emerald-800"
                    >
                      &uarr; {eLabel}
                    </span>
                  ))}
                  {d.declining.map((dLabel) => (
                    <span
                      key={`d-${dLabel}`}
                      className="inline-flex items-center rounded-full bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 px-2.5 py-0.5 border border-red-200 dark:border-red-800"
                    >
                      &darr; {dLabel}
                    </span>
                  ))}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
