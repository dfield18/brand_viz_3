"use client";

import type { VisibilityRankingEntry } from "@/types/api";
import { EmptyState } from "@/components/EmptyState";
import { subjectNoun } from "@/lib/subjectNoun";

interface AIVisibilityRankingProps {
  ranking: VisibilityRankingEntry[];
  brandName?: string;
  category?: string | null;
}

export function AIVisibilityRanking({ ranking, brandName, category }: AIVisibilityRankingProps) {
  const noun = subjectNoun(brandName ?? "Brand", category);
  if (ranking.length === 0) {
    return (
      <section className="rounded-xl bg-card p-6 shadow-section">
        <h2 className="text-base font-semibold">AI Visibility Ranking</h2>
        <div className="mt-4">
          <EmptyState message="No visibility ranking data available yet." />
        </div>
      </section>
    );
  }

  const maxScore = Math.max(...ranking.map((r) => r.score));

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold">AI Visibility Ranking</h2>
      <p className="text-xs text-muted-foreground mt-1 mb-5">
        % of industry responses recommending or mentioning each {noun}
      </p>
      <div className="space-y-2.5">
        {ranking.map((entry) => (
          <div key={entry.entityId} className="flex items-center gap-3">
            <span
              className={`text-sm w-32 shrink-0 truncate ${entry.isBrand ? "font-semibold text-primary" : "text-muted-foreground"}`}
              title={entry.name}
            >
              {entry.name}
            </span>
            <div className="flex-1 h-7 rounded bg-muted/50 overflow-hidden">
              <div
                className={`h-full rounded transition-all duration-300 ${entry.isBrand ? "bg-primary" : "bg-[var(--chart-2)]"}`}
                style={{ width: maxScore > 0 ? `${(entry.score / maxScore) * 100}%` : "0%" }}
              />
            </div>
            <span className="text-sm font-semibold tabular-nums w-10 text-right">
              {entry.score}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
