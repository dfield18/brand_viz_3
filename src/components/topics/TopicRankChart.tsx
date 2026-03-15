"use client";

import type { TopicRow } from "@/types/api";

interface Props {
  topics: TopicRow[];
}

export default function TopicRankChart({ topics }: Props) {
  const ranked = topics.filter((t) => t.avgRank !== null).sort((a, b) => a.avgRank! - b.avgRank!);

  if (ranked.length === 0) {
    return (
      <div className="rounded-xl bg-card p-6 shadow-section">
        <h3 className="text-sm font-semibold mb-4">Avg Rank by Topic</h3>
        <p className="text-sm text-muted-foreground">No rank data available.</p>
      </div>
    );
  }

  const maxRank = Math.max(...ranked.map((t) => t.avgRank!), 1);

  return (
    <div className="rounded-xl bg-card p-6 shadow-section">
      <h3 className="text-sm font-semibold mb-1">Avg Rank by Topic</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Average position when mentioned — lower is better
      </p>
      <div className="space-y-3">
        {ranked.map((t) => (
          <div key={t.topicKey} className="flex items-center gap-3">
            <span className="w-40 text-xs text-muted-foreground truncate shrink-0">
              {t.topicLabel}
            </span>
            <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
              <div
                className="h-full rounded bg-[var(--chart-2)]"
                style={{ width: `${(t.avgRank! / maxRank) * 100}%` }}
              />
            </div>
            <span className="w-12 text-right text-xs font-medium tabular-nums">
              {t.avgRank}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        Rank 1 = mentioned first in the response. Lower rank = higher prominence.
      </p>
    </div>
  );
}
