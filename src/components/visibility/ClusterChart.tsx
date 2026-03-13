"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { ClusterMentions } from "@/types/api";

interface ClusterChartProps {
  clusters: ClusterMentions[];
}

const CLUSTER_LABELS: Record<string, { name: string; desc: string }> = {
  direct: { name: "Direct", desc: "Brand-specific queries" },
  related: { name: "Related", desc: "Topic & context queries" },
  comparative: { name: "Comparative", desc: "Brand vs brand queries" },
  network: { name: "Network", desc: "Peer & similar brands" },
  industry: { name: "Industry", desc: "Industry-wide searches" },
};

interface ChartDatum {
  cluster: string;
  desc: string;
  mentionRate: number;
}

// Defined outside the component to avoid re-creation on every render.
// Receives chart data via closure-free props from Recharts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomYTick({ x, y, payload, visibleTicksCount: _unused, ...rest }: any) {
  // Recharts passes the data item's fields via payload; look up desc from CLUSTER_LABELS
  void _unused;
  void rest;
  const meta = Object.values(CLUSTER_LABELS).find((l) => l.name === payload?.value);
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={-4} y={-6} textAnchor="end" fontSize={12} fill="var(--foreground)" fontWeight={500}>
        {payload?.value}
      </text>
      <text x={-4} y={8} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
        {meta?.desc ?? ""}
      </text>
    </g>
  );
}

export function ClusterChart({ clusters }: ClusterChartProps) {
  const allZero = clusters.every((c) => c.mentionRate === 0);

  const data: ChartDatum[] = useMemo(() => {
    return [...clusters]
      .sort((a, b) => b.mentionRate - a.mentionRate)
      .map((c) => {
        const meta = CLUSTER_LABELS[c.cluster];
        return {
          cluster: meta?.name ?? c.cluster,
          desc: meta?.desc ?? "",
          mentionRate: c.mentionRate,
        };
      });
  }, [clusters]);

  if (clusters.length === 0 || allZero) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-muted-foreground">
          No mentions detected in this model.
        </p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={data.length * 60 + 20}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
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
          dataKey="cluster"
          width={170}
          tick={<CustomYTick />}
          tickLine={false}
        />
        <Tooltip
          formatter={(value) => [`${value}%`, "Mention Rate"]}
          cursor={{ fill: "var(--muted)", opacity: 0.3 }}
        />
        <Bar
          dataKey="mentionRate"
          fill="var(--chart-1)"
          radius={[0, 4, 4, 0]}
          barSize={28}
        >
          <LabelList
            dataKey="mentionRate"
            position="right"
            formatter={(v) => `${v}%`}
            fontSize={12}
            fill="var(--muted-foreground)"
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
