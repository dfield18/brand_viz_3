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
  brandName?: string;
}

/** Color scale: #1 is strongest, fades as rank increases, Not Mentioned is gray */
function positionColor(position: number): string {
  if (position === 0) return "hsl(218, 11%, 88%)";  // Not Mentioned — light gray
  if (position === 1) return "hsl(217, 91%, 50%)";  // #1 — vivid blue
  if (position <= 3) return "hsl(217, 70%, 62%)";   // #2-3
  if (position <= 5) return "hsl(217, 45%, 72%)";   // #4-5
  return "hsl(218, 25%, 80%)";                       // 6+
}

function positionLabel(position: number): string {
  if (position === 0) return "Not Mentioned";
  return `#${position}`;
}

/** Transform API data into sorted rows: exact positions first (ascending), Not Mentioned last */
export function buildPositionRows(
  filtered: PositionDistributionEntry[],
): { label: string; position: number; count: number; percentage: number; color: string }[] {
  const totalCount = filtered.reduce((s, d) => s + d.count, 0);
  const rows = filtered.map((d) => ({
    label: positionLabel(d.position),
    position: d.position,
    count: d.count,
    percentage: totalCount > 0 ? Math.round((d.count / totalCount) * 100) : 0,
    color: positionColor(d.position),
  }));
  // Sort: ranked positions ascending (1, 2, 3...), Not Mentioned (0) last
  rows.sort((a, b) => {
    if (a.position === 0) return 1;
    if (b.position === 0) return -1;
    return a.position - b.position;
  });
  return rows;
}

export function PositionDistribution({ data, inline, externalModel, brandName = "This Entity" }: PositionDistributionProps) {
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

  const rows = useMemo(() => buildPositionRows(filtered), [filtered]);

  const maxPct = useMemo(
    () => Math.max(...rows.map((d) => d.percentage), 1),
    [rows],
  );

  const Wrapper = inline ? "div" : "section";
  const headingClass = inline ? "text-sm text-muted-foreground" : "text-base font-semibold";

  if (data.length === 0) {
    return (
      <Wrapper className={inline ? "" : "rounded-xl bg-card p-6 shadow-section"}>
        <h2 className={headingClass}>{brandName}&apos;s Ranking Breakdown</h2>
        <div className="mt-4">
          <EmptyState message="No position data available yet." />
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper className={inline ? "" : "rounded-xl bg-card p-6 shadow-section"}>
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className={headingClass}>{brandName}&apos;s Ranking Breakdown</h2>
          <p className="text-xs text-muted-foreground mt-1">
            How often {brandName} lands in each ranking position across all industry AI responses — based on the most recent data
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
        {rows.map((entry) => (
          <div key={entry.label} className="flex items-center gap-3">
            <span className="text-sm w-28 shrink-0 text-muted-foreground">
              {entry.label}
            </span>
            <div className="flex-1 h-7 rounded overflow-hidden">
              <div
                className="h-full rounded transition-all duration-300"
                style={{ width: `${(entry.percentage / maxPct) * 100}%`, backgroundColor: entry.color }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">
              {entry.count}
            </span>
            <span className="text-sm font-semibold tabular-nums w-10 text-right">
              {entry.percentage}%
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No position data for this model.
          </p>
        )}
      </div>
    </Wrapper>
  );
}
