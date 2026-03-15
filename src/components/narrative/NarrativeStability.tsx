"use client";

import type { NarrativeFrame } from "@/types/api";

interface NarrativeStabilityProps {
  frames: NarrativeFrame[];
}

function getStabilityLabel(frames: NarrativeFrame[]): { label: string; color: string } {
  if (frames.length <= 1) return { label: "Stable", color: "text-emerald-600" };
  const top = frames[0].percentage;
  if (top >= 50) return { label: "Stable", color: "text-emerald-600" };
  if (top >= 30) return { label: "Moderate", color: "text-amber-500" };
  return { label: "Fragmented", color: "text-red-500" };
}

export function NarrativeStability({ frames }: NarrativeStabilityProps) {
  if (!frames || frames.length === 0) return null;

  const sorted = [...frames].sort((a, b) => b.percentage - a.percentage);
  const maxPct = sorted[0].percentage || 1;
  const { label, color } = getStabilityLabel(sorted);

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-base font-semibold">Narrative Stability</h2>
        <span className={`text-sm font-semibold ${color}`}>{label}</span>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        How concentrated the narrative is across themes
      </p>
      <div className="space-y-2">
        {sorted.map((frame) => (
          <div key={frame.frame} className="flex items-center gap-3">
            <span
              className="w-36 shrink-0 truncate text-sm text-muted-foreground"
              title={frame.frame}
            >
              {frame.frame}
            </span>
            <div className="flex-1 h-4 rounded-full bg-muted/40 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${(frame.percentage / maxPct) * 100}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {frame.percentage}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
