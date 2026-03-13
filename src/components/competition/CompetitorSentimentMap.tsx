"use client";

import { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Label,
} from "recharts";
import type { CompetitorRow } from "@/types/api";

interface CompetitorSentimentMapProps {
  competitors: CompetitorRow[];
  brandEntityId: string;
}

const SENTIMENT_ORDER = ["Negative", "Conditional", "Neutral", "Positive", "Strong"] as const;
const SENTIMENT_Y: Record<string, number> = {
  Negative: 0,
  Conditional: 1,
  Neutral: 2,
  Positive: 3,
  Strong: 4,
};
const SENTIMENT_COLOR: Record<string, string> = {
  Strong: "hsl(162, 63%, 30%)",
  Positive: "hsl(168, 55%, 48%)",
  Neutral: "hsl(218, 11%, 72%)",
  Conditional: "hsl(38, 92%, 55%)",
  Negative: "hsl(0, 72%, 55%)",
};

export function CompetitorSentimentMap({ competitors, brandEntityId }: CompetitorSentimentMapProps) {
  const chartData = useMemo(() => {
    const raw = competitors
      .filter((c) => c.avgSentiment)
      .map((c) => ({
        name: c.name,
        entityId: c.entityId,
        isBrand: c.isBrand,
        x: c.mentionRate,
        y: SENTIMENT_Y[c.avgSentiment!] ?? 2,
        sentiment: c.avgSentiment!,
        mentionShare: c.mentionShare,
        mentionRate: c.mentionRate,
        yOffset: 0,
      }));

    // Detect overlapping points and assign vertical offsets
    // Points are "close" if same sentiment (same y) and mention rates within 5%
    for (let i = 0; i < raw.length; i++) {
      const cluster: number[] = [i];
      for (let j = i + 1; j < raw.length; j++) {
        if (raw[j].y === raw[i].y && Math.abs(raw[j].x - raw[i].x) < 5) {
          cluster.push(j);
        }
      }
      if (cluster.length > 1) {
        // Spread the cluster vertically: brand goes up, others go down
        const brandIdx = cluster.findIndex((idx) => raw[idx].isBrand);
        if (brandIdx >= 0) {
          // Brand shifts up, others shift down
          raw[cluster[brandIdx]].yOffset = -16;
          let downOffset = 16;
          for (const idx of cluster) {
            if (idx === cluster[brandIdx]) continue;
            if (raw[idx].yOffset !== 0) continue; // already offset
            raw[idx].yOffset = downOffset;
            downOffset += 16;
          }
        } else {
          // No brand in cluster: alternate up/down
          for (let k = 0; k < cluster.length; k++) {
            if (raw[cluster[k]].yOffset !== 0) continue;
            raw[cluster[k]].yOffset = k === 0 ? -12 : 12 * k;
          }
        }
      }
    }

    return raw;
  }, [competitors]);

  if (chartData.length === 0) {
    return <p className="text-sm text-muted-foreground">No sentiment data available for competitors.</p>;
  }

  const maxX = Math.max(...chartData.map((d) => d.x), 20);

  return (
    <div className="[&_.recharts-wrapper]:!outline-none [&_svg]:outline-none [&_.recharts-surface]:outline-none">
      {/* Sentiment legend */}
      <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
        <span className="font-medium">Sentiment:</span>
        {SENTIMENT_ORDER.map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: SENTIMENT_COLOR[s] }}
            />
            {s}
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={380}>
        <ScatterChart margin={{ top: 30, right: 120, bottom: 40, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, Math.ceil(maxX / 10) * 10]}
            fontSize={12}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
          >
            <Label value="Brand Recall (% of responses)" position="bottom" offset={16} fontSize={12} fontWeight={600} fill="var(--muted-foreground)" />
          </XAxis>
          <YAxis
            type="number"
            dataKey="y"
            domain={[-0.5, 4.5]}
            ticks={[0, 1, 2, 3, 4]}
            tickFormatter={(v) => SENTIMENT_ORDER[v] ?? ""}
            fontSize={12}
            tickLine={false}
            width={80}
          >
            <Label value="Avg. Sentiment" angle={-90} position="center" dx={-50} fontSize={12} fontWeight={600} fill="var(--muted-foreground)" />
          </YAxis>
          <Tooltip
            isAnimationActive={false}
            cursor={false}
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0].payload as (typeof chartData)[number];
              return (
                <div className="rounded-lg border border-border bg-popover p-3 shadow-md text-xs space-y-1">
                  <p className="font-medium text-popover-foreground">
                    {d.name}
                  </p>
                  <p className="text-muted-foreground">
                    Sentiment: <span className="font-medium" style={{ color: SENTIMENT_COLOR[d.sentiment] }}>{d.sentiment}</span>
                  </p>
                  <p className="text-muted-foreground">Brand Recall: {d.mentionRate}%</p>
                  <p className="text-muted-foreground">Share of Voice: {d.mentionShare}%</p>
                </div>
              );
            }}
          />
          <Scatter
            data={chartData}
            isAnimationActive={false}
            shape={((props: { cx: number; cy: number; payload: (typeof chartData)[number] }) => {
              const { cx, cy, payload } = props;
              const fill = SENTIMENT_COLOR[payload.sentiment] ?? "hsl(218, 11%, 72%)";
              const isBrand = payload.entityId === brandEntityId;
              const r = isBrand ? 9 : 7;
              const offsetY = payload.yOffset ?? 0;
              const adjustedCy = cy + offsetY;

              return (
                <g>
                  <circle
                    cx={cx}
                    cy={adjustedCy}
                    r={r}
                    fill={fill}
                    stroke={isBrand ? "var(--foreground)" : "none"}
                    strokeWidth={isBrand ? 2 : 0}
                  />
                  {/* Label background (halo) */}
                  <text
                    x={cx + r + 6}
                    y={adjustedCy + 4}
                    textAnchor="start"
                    fontSize={isBrand ? 12 : 11}
                    fontWeight={isBrand ? 600 : 400}
                    fill="var(--card)"
                    stroke="var(--card)"
                    strokeWidth={4}
                    paintOrder="stroke"
                  >
                    {payload.name}
                  </text>
                  {/* Label text */}
                  <text
                    x={cx + r + 6}
                    y={adjustedCy + 4}
                    textAnchor="start"
                    fontSize={isBrand ? 12 : 11}
                    fontWeight={isBrand ? 600 : 400}
                    fill="var(--foreground)"
                  >
                    {payload.name}
                  </text>
                </g>
              );
            }) as unknown as undefined}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
