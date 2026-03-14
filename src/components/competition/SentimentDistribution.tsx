"use client";

import { useMemo } from "react";
import type { CompetitorRow } from "@/types/api";

interface SentimentDistributionProps {
  competitors: CompetitorRow[];
}

const SENTIMENT_ORDER = ["Strong", "Positive", "Neutral", "Conditional", "Negative"] as const;

const SENTIMENT_CONFIG: Record<string, { color: string; label: string }> = {
  Strong:      { color: "hsl(162, 63%, 30%)", label: "Strong" },
  Positive:    { color: "hsl(168, 55%, 48%)", label: "Positive" },
  Neutral:     { color: "hsl(218, 11%, 72%)", label: "Neutral" },
  Conditional: { color: "hsl(38, 92%, 55%)",  label: "Conditional" },
  Negative:    { color: "hsl(0, 72%, 55%)",   label: "Negative" },
};

export function SentimentDistribution({ competitors }: SentimentDistributionProps) {
  const sorted = useMemo(
    () => [...competitors]
      .filter((c) => c.avgSentiment)
      .sort((a, b) => b.mentionRate - a.mentionRate),
    [competitors],
  );

  if (sorted.length === 0) {
    return <p className="text-sm text-muted-foreground">No sentiment data available.</p>;
  }

  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {SENTIMENT_ORDER.map((key) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: SENTIMENT_CONFIG[key].color }} />
            <span>{SENTIMENT_CONFIG[key].label}</span>
          </div>
        ))}
      </div>

      {/* Per-brand stacked bars — show 5, scroll for rest */}
      <div className={`mt-3 ${sorted.length > 5 ? "max-h-[248px] overflow-y-auto" : ""}`}>
        <div className="space-y-2">
          {sorted.map((c) => {
            const dist = c.sentimentDist;
            const total = dist ? Object.values(dist).reduce((s, v) => s + v, 0) : 0;

            const segments = total > 0
              ? SENTIMENT_ORDER
                  .map((key) => ({
                    key,
                    count: dist?.[key] ?? 0,
                    pct: ((dist?.[key] ?? 0) / total) * 100,
                    color: SENTIMENT_CONFIG[key].color,
                  }))
                  .filter((s) => s.count > 0)
              : [];

            return (
              <div key={c.entityId} className="flex items-center gap-4">
                <span
                  className={`text-sm w-40 shrink-0 truncate ${c.isBrand ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                  title={c.name}
                >
                  {c.name}
                </span>
                <div className="flex-1 h-7 rounded overflow-hidden flex bg-muted/30 mr-4">
                  {segments.map((seg) => {
                    const pctRound = Math.round(seg.pct);
                    return (
                      <div
                        key={seg.key}
                        className="h-full transition-all duration-300 flex items-center justify-center"
                        style={{ width: `${seg.pct}%`, backgroundColor: seg.color, minWidth: seg.pct > 0 ? 2 : 0 }}
                        title={`${SENTIMENT_CONFIG[seg.key].label}: ${pctRound}%`}
                      >
                        {seg.pct >= 14 && (
                          <span className="text-[10px] font-semibold text-white drop-shadow-sm">
                            {segments.length === 1 ? `${SENTIMENT_CONFIG[seg.key].label} ${pctRound}%` : `${pctRound}%`}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
