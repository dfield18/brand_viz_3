"use client";

import type { TopicImportanceRow } from "@/types/api";

interface Props {
  importance: TopicImportanceRow[];
}

export default function TopicImportanceChart({ importance }: Props) {
  if (importance.length === 0) {
    return (
      <section className="rounded-xl bg-card p-6 shadow-section">
        <h2 className="text-base font-semibold mb-4">Topic Importance</h2>
        <p className="text-sm text-muted-foreground">No topic importance data available.</p>
      </section>
    );
  }

  const maxRate = Math.max(...importance.map((t) => t.importanceRate), 1);

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold mb-1">Topic Importance</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Share of prompts in each topic — how much of the category surface each topic covers
      </p>
      <div className="space-y-3">
        {importance.map((t) => (
          <div
            key={t.topicKey}
            className="flex items-center gap-3"
            title={`${t.topicLabel}: ${t.importanceRate}% (${t.nPrompts} of ${t.nResponses} prompts)`}
          >
            <span className="w-40 text-xs text-muted-foreground truncate shrink-0">
              {t.topicLabel}
            </span>
            <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
              <div
                className="h-full rounded bg-[var(--chart-3)]"
                style={{ width: `${(t.importanceRate / maxRate) * 100}%` }}
              />
            </div>
            <span className="w-12 text-right text-xs font-medium tabular-nums">
              {t.importanceRate}%
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        Based on {importance[0]?.nResponses ?? 0} total responses.
      </p>
    </section>
  );
}
