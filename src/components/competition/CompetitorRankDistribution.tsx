"use client";

import type { CompetitorRow } from "@/types/api";

interface CompetitorRankDistributionProps {
  competitors: CompetitorRow[];
  rankDistribution: Record<string, Record<number, number>>;
  brandEntityId: string;
}

const RANK_COLORS: Record<string, string> = {
  "1": "bg-indigo-500",
  "2": "bg-sky-400",
  "3": "bg-slate-400",
  other: "bg-slate-200 dark:bg-slate-600",
};

const RANK_LABELS: Record<string, string> = {
  "1": "Rank 1",
  "2": "Rank 2",
  "3": "Rank 3",
  other: "Rank 4+",
};

export function CompetitorRankDistribution({
  competitors,
  rankDistribution,
  brandEntityId,
}: CompetitorRankDistributionProps) {
  // Sort by total appearances desc
  const sorted = [...competitors].sort((a, b) => b.appearances - a.appearances);

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground">No rank distribution data available.</p>;
  }

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {Object.entries(RANK_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className={`h-2.5 w-2.5 rounded-sm ${RANK_COLORS[key]}`} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Bars */}
      <div className="space-y-3">
        {sorted.map((c) => {
          const dist = rankDistribution[c.entityId] ?? {};
          const total = Object.values(dist).reduce((s, v) => s + v, 0);
          if (total === 0) return null;

          const rank1 = dist[1] ?? 0;
          const rank2 = dist[2] ?? 0;
          const rank3 = dist[3] ?? 0;
          const rankOther = total - rank1 - rank2 - rank3;

          const segments = [
            { key: "1", count: rank1, color: RANK_COLORS["1"] },
            { key: "2", count: rank2, color: RANK_COLORS["2"] },
            { key: "3", count: rank3, color: RANK_COLORS["3"] },
            { key: "other", count: rankOther, color: RANK_COLORS.other },
          ].filter((s) => s.count > 0);

          return (
            <div key={c.entityId} className="flex items-center gap-3">
              <span
                className={`text-sm w-32 shrink-0 truncate ${c.entityId === brandEntityId ? "font-semibold text-primary" : "text-muted-foreground"}`}
                title={c.name}
              >
                {c.name}
                              </span>
              <div className="flex-1 h-7 rounded bg-muted/50 overflow-hidden flex">
                {segments.map((seg) => {
                  const pct = (seg.count / total) * 100;
                  return (
                    <div
                      key={seg.key}
                      className={`h-full ${seg.color} transition-all duration-300 flex items-center justify-center`}
                      style={{ width: `${pct}%` }}
                      title={`${RANK_LABELS[seg.key]}: ${Math.round(pct)}%`}
                    >
                      {pct >= 15 && (
                        <span className={`text-[10px] font-medium drop-shadow-sm ${seg.key === "other" ? "text-slate-600 dark:text-slate-200 drop-shadow-none" : "text-white"}`}>
                          {Math.round(pct)}%
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <span className="text-[11px] tabular-nums w-20 text-right text-muted-foreground">
                {total} responses
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
