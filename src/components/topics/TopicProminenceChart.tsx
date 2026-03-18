"use client";

import type { TopicProminenceRow } from "@/types/api";

interface Props {
  prominence: TopicProminenceRow[];
  brandName?: string;
}

export default function TopicProminenceChart({ prominence, brandName = "this brand" }: Props) {
  if (prominence.length === 0) {
    return (
      <section className="rounded-xl bg-card p-6 shadow-section">
        <h2 className="text-base font-semibold mb-4">Mention Share by Topic</h2>
        <p className="text-sm text-muted-foreground">No mention share data available.</p>
      </section>
    );
  }

  const sorted = [...prominence].sort((a, b) => b.mentionShare - a.mentionShare);

  const maxVal = Math.max(
    ...sorted.map((t) => t.mentionShare),
    1,
  );

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold">Mention Share by Topic</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {`${brandName}'s share of entity mentions within each topic`}
      </p>

      <div className="space-y-3">
        {sorted.map((t) => {
          const val = t.mentionShare;
          return (
            <div
              key={t.topicKey}
              className="flex items-center gap-3"
              title={`${t.topicLabel}: ${val}% · ${t.nMentions} mentions`}
            >
              <span className="w-40 text-xs text-muted-foreground truncate shrink-0">
                {t.topicLabel}
              </span>
              <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
                <div
                  className="h-full rounded bg-primary"
                  style={{ width: `${(val / maxVal) * 100}%` }}
                />
              </div>
              <span className="w-14 text-right text-xs font-medium tabular-nums">
                {val.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground mt-3">
        Mention share measures {brandName}&apos;s share of entity mentions within each topic.
        Based on {prominence.reduce((s, p) => s + p.nMentions, 0)} total mentions.
      </p>
    </section>
  );
}
