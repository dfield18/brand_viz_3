"use client";

import { useState, useMemo } from "react";
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
import type { TopicTrendPoint, TopicRow } from "@/types/api";

const TOPIC_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const selectClass =
  "rounded-md border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring";

interface Props {
  trend: TopicTrendPoint[];
  topics: TopicRow[];
}

export default function TopicTrendChart({ trend, topics }: Props) {
  // Default: top 3 topics by mention rate
  const topTopicKeys = useMemo(
    () => topics.slice(0, 3).map((t) => t.topicKey),
    [topics],
  );

  const [selectedTopics, setSelectedTopics] = useState<string[]>(topTopicKeys);

  const topicLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of topics) map[t.topicKey] = t.topicLabel;
    return map;
  }, [topics]);

  const allTopicKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const point of trend) {
      for (const k of Object.keys(point.values)) keys.add(k);
    }
    return [...keys];
  }, [trend]);

  // Flatten for Recharts
  const data = useMemo(
    () =>
      trend.map((point) => ({
        date: point.date,
        sampleSize: point.sampleSize,
        ...point.values,
      })),
    [trend],
  );

  if (trend.length < 2) {
    return (
      <section className="rounded-xl border border-border bg-card p-6 shadow-section">
        <h2 className="text-base font-semibold mb-4">Topic Trend</h2>
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Not enough data points for a trend. Run prompts over multiple periods.
          </p>
        </div>
      </section>
    );
  }

  const toggleTopic = (key: string) => {
    setSelectedTopics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold">Topic Trend</h2>
      <p className="text-xs text-muted-foreground mt-1 mb-4">
        Mention rate for selected topics over time
      </p>

      {/* Topic toggles */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {allTopicKeys.map((key) => {
          const active = selectedTopics.includes(key);
          return (
            <button
              key={key}
              onClick={() => toggleTopic(key)}
              className={`${selectClass} ${active ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {topicLabelMap[key] ?? key}
            </button>
          );
        })}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
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
            domain={[0, "auto"]}
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
              if (value === null || value === undefined) return ["\u2014", String(name)];
              return [`${value}%`, topicLabelMap[String(name)] ?? String(name)];
            }}
          />
          <Legend
            verticalAlign="top"
            height={36}
            formatter={(value: string) => topicLabelMap[value] ?? value}
          />
          {selectedTopics.map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={TOPIC_COLORS[i % TOPIC_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <p className="text-[11px] text-muted-foreground mt-3">
        Each point shows the topic mention rate (%) on that date.
      </p>
    </section>
  );
}
