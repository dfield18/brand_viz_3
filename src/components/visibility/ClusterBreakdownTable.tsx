"use client";

import type { ClusterBreakdownRow } from "@/types/api";

const CLUSTER_LABELS: Record<string, { name: string; desc: string }> = {
  brand: { name: "Direct Questions", desc: "Questions that name the organization" },
  industry: { name: "Issue Area", desc: "Broad questions about the issue space" },
};

interface ClusterBreakdownTableProps {
  rows: ClusterBreakdownRow[];
}

export function ClusterBreakdownTable({ rows }: ClusterBreakdownTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <th className="pb-3 pr-4">Query Type</th>
            <th className="pb-3 px-4 text-right">Mention Rate</th>
            <th className="pb-3 px-4 text-right">Avg Position</th>
            <th className="pb-3 pl-4 text-right">Mentioned First</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const label = CLUSTER_LABELS[row.cluster] ?? {
              name: row.cluster,
              desc: "",
            };
            return (
              <tr
                key={row.cluster}
                className="border-b border-border/50 last:border-0"
              >
                <td className="py-3 pr-4">
                  <span className="font-medium">{label.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {label.desc}
                  </span>
                </td>
                <td className="py-3 px-4 text-right tabular-nums font-medium">
                  {row.mentionRate}%
                </td>
                <td className="py-3 px-4 text-right tabular-nums font-medium">
                  {row.avgRank !== null ? row.avgRank.toFixed(2) : "\u2014"}
                </td>
                <td className="py-3 pl-4 text-right tabular-nums font-medium">
                  {row.firstMentionPct !== null
                    ? `${row.firstMentionPct}%`
                    : "\u2014"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
