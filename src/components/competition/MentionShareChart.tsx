"use client";

import type { CompetitorRow } from "@/types/api";

interface MentionShareChartProps {
  competitors: CompetitorRow[];
  brandEntityId: string;
}

export function MentionShareChart({ competitors, brandEntityId }: MentionShareChartProps) {
  if (competitors.length === 0) {
    return <p className="text-sm text-muted-foreground">No mention share data available.</p>;
  }

  const sorted = [...competitors].sort((a, b) => b.mentionShare - a.mentionShare);
  const maxShare = Math.max(...sorted.map((c) => c.mentionShare));

  return (
    <div className="space-y-3">
      {sorted.map((c) => (
        <div key={c.entityId} className="flex items-center gap-3">
          <span
            className={`text-sm w-32 shrink-0 truncate ${c.entityId === brandEntityId ? "font-semibold text-primary" : "text-muted-foreground"}`}
            title={c.name}
          >
            {c.name}
                      </span>
          <div className="flex-1 h-7 rounded bg-muted/50 overflow-hidden">
            <div
              className={`h-full rounded transition-all duration-300 ${c.entityId === brandEntityId ? "bg-primary" : "bg-[var(--chart-2)]"}`}
              style={{ width: maxShare > 0 ? `${(c.mentionShare / maxShare) * 100}%` : "0%" }}
            />
          </div>
          <span className="text-sm font-semibold tabular-nums w-14 text-right">
            {c.mentionShare.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}
