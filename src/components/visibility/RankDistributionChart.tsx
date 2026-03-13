"use client";

import type { RankDistributionRow } from "@/types/api";

interface RankDistributionChartProps {
  data: RankDistributionRow[];
}

export function RankDistributionChart({ data }: RankDistributionChartProps) {
  if (!data || data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No rank data available.</p>
    );
  }

  const maxPct = Math.max(...data.map((d) => d.percentage));

  return (
    <div className="space-y-3">
      {data.map((row) => (
        <div key={row.rank} className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground w-16 shrink-0">
            Rank #{row.rank}
          </span>
          <div className="flex-1 h-7 rounded bg-muted/50 overflow-hidden">
            <div
              className="h-full rounded bg-primary transition-all duration-300"
              style={{ width: maxPct > 0 ? `${(row.percentage / maxPct) * 100}%` : "0%" }}
            />
          </div>
          <span className="text-sm font-semibold tabular-nums w-12 text-right">
            {row.percentage}%
          </span>
        </div>
      ))}
    </div>
  );
}
