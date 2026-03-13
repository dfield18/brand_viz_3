"use client";

import type { NarrativeFrame } from "@/types/api";

const TOP_N = 3;

interface TopFramesProps {
  frames: NarrativeFrame[];
}

export function TopFrames({ frames }: TopFramesProps) {
  if (!frames || frames.length === 0) return null;

  const sorted = [...frames].sort((a, b) => b.percentage - a.percentage);
  const maxPct = sorted[0].percentage || 1;

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold">Narrative Frames</h2>
      <p className="text-xs text-muted-foreground mt-1 mb-5">
        How AI models frame the brand — top frames highlighted
      </p>
      <div className="space-y-3">
        {sorted.map((frame, i) => {
          const isTop = i < TOP_N;
          return (
            <div key={frame.frame} className="flex items-center gap-3">
              <span
                className={`w-40 shrink-0 truncate text-sm ${
                  isTop ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
                title={frame.frame}
              >
                {frame.frame}
              </span>
              <div className="flex-1 h-5 rounded-full bg-muted/40 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isTop ? "bg-primary" : "bg-muted-foreground/20"
                  }`}
                  style={{ width: `${(frame.percentage / maxPct) * 100}%` }}
                />
              </div>
              <span
                className={`w-10 shrink-0 text-right text-sm tabular-nums ${
                  isTop ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                {frame.percentage}%
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
