"use client";

import type { NarrativeDescriptor } from "@/types/api";

interface TopDescriptorsProps {
  descriptors: NarrativeDescriptor[];
}

const POLARITY_BAR: Record<string, string> = {
  positive: "bg-emerald-500",
  negative: "bg-red-400",
  neutral: "bg-gray-300",
};

const POLARITY_TEXT: Record<string, string> = {
  positive: "text-emerald-600",
  negative: "text-red-500",
  neutral: "text-muted-foreground",
};

export function TopDescriptors({ descriptors }: TopDescriptorsProps) {
  if (!descriptors || descriptors.length === 0) return null;

  const items = descriptors.slice(0, 10);
  const maxCount = Math.max(...items.map((d) => d.count));

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold">Top Descriptors</h2>
      <p className="text-xs text-muted-foreground mt-1 mb-4">
        Adjectives AI models use most when describing this brand
      </p>

      {/* Polarity legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Positive
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-gray-300" />
          Neutral
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-400" />
          Negative
        </span>
      </div>

      <div className="space-y-2.5">
        {items.map((d) => (
          <div key={d.word} className="flex items-center gap-3">
            <span
              className={`text-sm w-28 shrink-0 truncate text-left font-medium ${POLARITY_TEXT[d.polarity] ?? "text-muted-foreground"}`}
              title={d.word}
            >
              {d.word}
            </span>
            <div className="flex-1 h-5 rounded bg-muted/40 overflow-hidden">
              <div
                className={`h-full rounded transition-all duration-300 ${POLARITY_BAR[d.polarity] ?? "bg-gray-300"}`}
                style={{ width: maxCount > 0 ? `${(d.count / maxCount) * 100}%` : "0%" }}
              />
            </div>
            <span className="text-xs text-muted-foreground tabular-nums w-8 text-right shrink-0">
              {d.count}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
