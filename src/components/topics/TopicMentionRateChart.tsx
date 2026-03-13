"use client";

import type { TopicRow } from "@/types/api";

interface Props {
  topics: TopicRow[];
}

export default function TopicMentionRateChart({ topics }: Props) {
  if (topics.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-section">
        <h3 className="text-sm font-semibold mb-4">Topic Mention Rate</h3>
        <p className="text-sm text-muted-foreground">No topic data available.</p>
      </div>
    );
  }

  const maxRate = Math.max(
    ...topics.flatMap((t) => [t.mentionRate, t.categoryAvgMentionRate, t.leaderMentionRate]),
    1,
  );

  return (
    <div className="rounded-xl border bg-card p-6 shadow-section">
      <h3 className="text-sm font-semibold mb-1">Topic Mention Rate</h3>
      <p className="text-xs text-muted-foreground mb-2">
        How often your brand appears vs category average and leader
      </p>
      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground mb-4">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-[var(--chart-1)]" />
          Your Rate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-muted-foreground/30" />
          Category Avg
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-[var(--chart-4)]" />
          Leader
        </span>
      </div>

      <div className="space-y-4">
        {topics.map((t) => (
          <div key={t.topicKey}>
            <span className="text-xs text-muted-foreground mb-1.5 block truncate">
              {t.topicLabel}
            </span>
            {/* Your rate */}
            <div className="flex items-center gap-3 mb-1">
              <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
                <div
                  className="h-full rounded bg-[var(--chart-1)]"
                  style={{ width: `${(t.mentionRate / maxRate) * 100}%` }}
                  title={`Your rate: ${t.mentionRate}% (${t.mentionCount} mentions)`}
                />
              </div>
              <span className="w-12 text-right text-xs font-medium tabular-nums">
                {t.mentionRate}%
              </span>
            </div>
            {/* Category average */}
            <div className="flex items-center gap-3 mb-1">
              <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
                <div
                  className="h-full rounded bg-muted-foreground/30"
                  style={{ width: `${(t.categoryAvgMentionRate / maxRate) * 100}%` }}
                  title={`Category avg: ${t.categoryAvgMentionRate}%`}
                />
              </div>
              <span className="w-12 text-right text-[11px] text-muted-foreground tabular-nums">
                {t.categoryAvgMentionRate}%
              </span>
            </div>
            {/* Leader */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
                <div
                  className="h-full rounded bg-[var(--chart-4)]"
                  style={{ width: `${(t.leaderMentionRate / maxRate) * 100}%` }}
                  title={`Leader: ${t.leaderName} ${t.leaderMentionRate}%`}
                />
              </div>
              <span className="w-12 text-right text-[11px] text-muted-foreground tabular-nums">
                {t.leaderMentionRate}%
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        Topic mention rate = % of responses in that topic where the brand is mentioned.
      </p>
    </div>
  );
}
