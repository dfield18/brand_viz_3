"use client";

import type { ProminenceShareRow } from "@/types/api";

interface ProminenceShareChartProps {
  prominenceShare: ProminenceShareRow[];
  brandEntityId: string;
}

export function ProminenceShareChart({ prominenceShare, brandEntityId }: ProminenceShareChartProps) {
  if (prominenceShare.length === 0) {
    return <p className="text-sm text-muted-foreground">No prominence data available.</p>;
  }

  const sorted = [...prominenceShare].sort((a, b) => b.prominenceShare - a.prominenceShare);
  const maxShare = Math.max(...sorted.map((c) => c.prominenceShare));

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
              className={`h-full rounded transition-all duration-300 ${c.entityId === brandEntityId ? "bg-primary" : "bg-[var(--chart-4)]"}`}
              style={{ width: maxShare > 0 ? `${(c.prominenceShare / maxShare) * 100}%` : "0%" }}
            />
          </div>
          <span className="text-sm font-semibold tabular-nums w-14 text-right">
            {c.prominenceShare.toFixed(1)}%
          </span>
        </div>
      ))}
      <p className="text-xs text-muted-foreground italic leading-relaxed">
        Prominence measures how featured a brand is when mentioned — factoring in position (mentioned first vs last), depth of coverage (how much text is devoted to it), and structural emphasis (headings, bullet points, recommendations). Higher prominence means a brand is discussed more substantively, not just name-dropped. Prominence share = entity&apos;s total prominence / all tracked entities&apos; prominence.
      </p>
    </div>
  );
}
