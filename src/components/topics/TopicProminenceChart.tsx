"use client";

import { useState } from "react";
import type { TopicProminenceRow } from "@/types/api";

interface Props {
  prominence: TopicProminenceRow[];
  brandName?: string;
}

export default function TopicProminenceChart({ prominence, brandName = "this brand" }: Props) {
  const [view, setView] = useState<"avg" | "share">("avg");

  if (prominence.length === 0) {
    return (
      <section className="rounded-xl bg-card p-6 shadow-section">
        <h2 className="text-base font-semibold mb-4">Prominence by Topic</h2>
        <p className="text-sm text-muted-foreground">No prominence data available.</p>
      </section>
    );
  }

  const sorted = view === "avg"
    ? [...prominence].sort((a, b) => b.avgProminence - a.avgProminence)
    : [...prominence].sort((a, b) => b.prominenceShare - a.prominenceShare);

  const maxVal = Math.max(
    ...sorted.map((t) => (view === "avg" ? t.avgProminence : t.prominenceShare)),
    1,
  );

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold">Prominence by Topic</h2>
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => setView("avg")}
            className={`px-2 py-1 rounded ${view === "avg" ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Avg Prominence
          </button>
          <button
            onClick={() => setView("share")}
            className={`px-2 py-1 rounded ${view === "share" ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Prominence Share
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {view === "avg"
          ? `Average prominence score when ${brandName} is mentioned in each topic`
          : `${brandName}'s share of total prominence within each topic`}
      </p>

      <div className="space-y-3">
        {sorted.map((t) => {
          const val = view === "avg" ? t.avgProminence : t.prominenceShare;
          return (
            <div
              key={t.topicKey}
              className="flex items-center gap-3"
              title={`${t.topicLabel}: ${val}${view === "share" ? "%" : ""} · ${t.nMentions} mentions`}
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
                {val.toFixed(1)}{view === "share" ? "%" : ""}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground mt-3">
        Prominence measures how central {brandName} is within responses, not just whether it appears.
        Based on {prominence.reduce((s, p) => s + p.nMentions, 0)} total mentions.
      </p>
    </section>
  );
}
