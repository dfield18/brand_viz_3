"use client";

import { useState, useMemo } from "react";
import type { PositionDistributionEntry } from "@/types/api";
import { EmptyState } from "@/components/EmptyState";
import { MODEL_LABELS } from "@/lib/constants";

interface PositionDistributionProps {
  data: PositionDistributionEntry[];
  /** Render without card wrapper */
  inline?: boolean;
  /** Externally controlled model filter — hides the dropdown when set */
  externalModel?: string;
}

const POSITION_BANDS = [
  { label: "Position #1", min: 1, max: 1, color: "hsl(217, 91%, 50%)" },
  { label: "Position #2", min: 2, max: 2, color: "hsl(217, 70%, 62%)" },
  { label: "Position #3", min: 3, max: 3, color: "hsl(217, 45%, 72%)" },
  { label: "Position #4–5", min: 4, max: 5, color: "hsl(218, 20%, 78%)" },
  { label: "Position #6+", min: 6, max: Infinity, color: "hsl(218, 11%, 85%)" },
] as const;

export function PositionDistribution({ data, inline, externalModel }: PositionDistributionProps) {
  const [internalModel, setInternalModel] = useState("all");
  const selectedModel = externalModel ?? internalModel;

  const models = useMemo(() => {
    const set = new Set(data.map((d) => d.model));
    set.delete("all");
    return [...set].sort();
  }, [data]);

  const filtered = useMemo(
    () => data.filter((d) => d.model === selectedModel),
    [data, selectedModel],
  );

  // Bucket into bands matching the time series chart
  const banded = useMemo(() => {
    const totalCount = filtered.reduce((s, d) => s + d.count, 0);
    return POSITION_BANDS.map((band) => {
      const count = filtered
        .filter((d) => d.position >= band.min && d.position <= band.max)
        .reduce((s, d) => s + d.count, 0);
      return {
        label: band.label,
        color: band.color,
        count,
        percentage: totalCount > 0 ? Math.round((count / totalCount) * 100) : 0,
      };
    }).filter((b) => b.count > 0 || b.label === "Position #1"); // always show #1
  }, [filtered]);

  const maxPct = useMemo(
    () => Math.max(...banded.map((d) => d.percentage), 1),
    [banded],
  );

  const Wrapper = inline ? "div" : "section";
  const headingClass = inline ? "text-sm text-muted-foreground" : "text-base font-semibold";

  if (data.length === 0) {
    return (
      <Wrapper className={inline ? "" : "rounded-xl border border-border bg-card p-6 shadow-section"}>
        <h2 className={headingClass}>Your Ranking Breakdown</h2>
        <div className="mt-4">
          <EmptyState message="No position data available yet." />
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper className={inline ? "" : "rounded-xl border border-border bg-card p-6 shadow-section"}>
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className={headingClass}>Your Ranking Breakdown</h2>
          <p className="text-xs text-muted-foreground mt-1">
            How often your brand lands in each ranking position when mentioned by AI — based on most recent results
          </p>
        </div>
        {!externalModel && <select
          value={selectedModel}
          onChange={(e) => setInternalModel(e.target.value)}
          className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card"
        >
          <option value="all">All AI Platforms</option>
          {models.map((m) => (
            <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
          ))}
        </select>}
      </div>
      <div className="space-y-3.5 mt-5">
        {banded.map((entry) => (
          <div key={entry.label} className="flex items-center gap-3">
            <span className="text-sm w-28 shrink-0 text-muted-foreground">
              {entry.label}
            </span>
            <div className="flex-1 h-7 rounded bg-muted/50 overflow-hidden">
              <div
                className="h-full rounded transition-all duration-300"
                style={{ width: `${(entry.percentage / maxPct) * 100}%`, backgroundColor: entry.color }}
              />
            </div>
            <span className="text-sm font-semibold tabular-nums w-10 text-right">
              {entry.percentage}%
            </span>
          </div>
        ))}
        {banded.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No position data for this model.
          </p>
        )}
      </div>
    </Wrapper>
  );
}
