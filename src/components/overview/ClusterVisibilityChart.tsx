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
import type { ClusterVisibility } from "@/types/api";
import { EmptyState } from "@/components/EmptyState";

interface ClusterVisibilityChartProps {
  clusters: ClusterVisibility[];
}

const CLUSTER_LABELS: Record<string, string> = {
  direct: "Direct",
  related: "Related",
  comparative: "Comparative",
  network: "Network",
  industry: "Industry",
};

const CLUSTER_DESCRIPTIONS: Record<string, string> = {
  direct: "The brand is explicitly named as a primary answer to the user's question.",
  related: "The brand is mentioned in context, but not as the primary answer.",
  comparative: "The brand is discussed in contrast to competitors.",
  network: "The brand appears as part of a broader ecosystem or association network.",
  industry: "The brand is mentioned in broad industry-level queries not targeting any specific brand.",
};

export function ClusterVisibilityChart({ clusters }: ClusterVisibilityChartProps) {
  const data = clusters.map((c) => ({
    cluster: CLUSTER_LABELS[c.cluster] ?? c.cluster,
    "Mention Rate": c.mentionRate,
  }));

  return (
    <div className="rounded-xl bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold mb-4">Visibility by Prompt Cluster</h2>
      {clusters.length === 0 ? (
        <EmptyState message="No cluster data available." />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="cluster" fontSize={12} tickLine={false} />
              <YAxis
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                fontSize={12}
              />
              <Tooltip formatter={(value) => [`${value}%`]} />
              <Legend verticalAlign="top" height={30} iconType="circle" iconSize={8} />
              <Bar
                dataKey="Mention Rate"
                fill="var(--chart-1)"
                radius={[4, 4, 0, 0]}
                barSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-3 italic">
            Visibility reflects prominence and specificity across standardized prompts.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2">
            {clusters.map((c) => (
              <div key={c.cluster} className="flex gap-2 text-xs">
                <span className="font-medium text-foreground shrink-0">
                  {CLUSTER_LABELS[c.cluster] ?? c.cluster}:
                </span>
                <span className="text-muted-foreground">
                  {CLUSTER_DESCRIPTIONS[c.cluster] ?? ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
