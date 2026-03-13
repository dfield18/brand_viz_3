"use client";

import type { ModelBreakdownRow } from "@/types/api";
import { MODEL_LABELS } from "@/lib/constants";

interface ModelBreakdownTableProps {
  rows: ModelBreakdownRow[];
}

// Color coding: green for good values, light red for bad
function metricColor(value: number | null, thresholds: { good: number; bad: number }, invert = false) {
  if (value === null) return "";
  const isGood = invert ? value <= thresholds.good : value >= thresholds.good;
  const isBad = invert ? value >= thresholds.bad : value <= thresholds.bad;
  if (isGood) return "text-emerald-600";
  if (isBad) return "text-red-400";
  return "";
}

export function ModelBreakdownTable({ rows }: ModelBreakdownTableProps) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <th className="pb-3 pr-4">Model</th>
            <th className="pb-3 px-4 text-center">Mention Rate</th>
            <th className="pb-3 px-4 text-center">Avg Position</th>
            <th className="pb-3 pl-4 text-center">Mentioned First</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.model}
              className="border-b border-border/50 last:border-0"
            >
              <td className="py-3 pr-4">
                <span className="font-medium">
                  {MODEL_LABELS[row.model] ?? row.model}
                </span>
                {row.totalRuns === 0 && (
                  <span className="block text-xs text-muted-foreground">
                    No runs yet
                  </span>
                )}
              </td>
              <td className={`py-3 px-4 text-center tabular-nums font-medium ${metricColor(row.mentionRate, { good: 70, bad: 40 })}`}>
                {row.mentionRate !== null ? `${row.mentionRate}%` : "\u2014"}
              </td>
              <td className={`py-3 px-4 text-center tabular-nums font-medium ${metricColor(row.avgRank, { good: 1.5, bad: 3.0 }, true)}`}>
                {row.avgRank !== null ? row.avgRank.toFixed(2) : "\u2014"}
              </td>
              <td className={`py-3 pl-4 text-center tabular-nums font-medium ${metricColor(row.firstMentionPct, { good: 40, bad: 15 })}`}>
                {row.firstMentionPct !== null
                  ? `${row.firstMentionPct}%`
                  : "\u2014"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
