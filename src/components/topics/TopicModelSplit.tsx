"use client";

import { useState } from "react";
import type { TopicModelSplitRow } from "@/types/api";
import { MODEL_LABELS } from "@/lib/constants";

interface Props {
  modelSplit: TopicModelSplitRow[];
}

export default function TopicModelSplit({ modelSplit }: Props) {
  const [view, setView] = useState<"chart" | "table">("chart");

  if (modelSplit.length <= 1) return null;

  // Collect all unique topic keys across models
  const allTopicKeys = new Map<string, string>();
  for (const ms of modelSplit) {
    for (const t of ms.topics) {
      allTopicKeys.set(t.topicKey, t.topicLabel);
    }
  }
  const topicEntries = [...allTopicKeys.entries()];

  if (topicEntries.length === 0) return null;

  // Build lookup: model → topicKey → { mentionRate, avgRank }
  const lookup = new Map<string, Map<string, { mentionRate: number; avgRank: number | null }>>();
  for (const ms of modelSplit) {
    const topicMap = new Map<string, { mentionRate: number; avgRank: number | null }>();
    for (const t of ms.topics) {
      topicMap.set(t.topicKey, { mentionRate: t.mentionRate, avgRank: t.avgRank });
    }
    lookup.set(ms.model, topicMap);
  }

  return (
    <div className="rounded-xl border bg-card p-6 shadow-section">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold">Topic Performance by Model</h3>
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => setView("chart")}
            className={`px-2 py-1 rounded ${view === "chart" ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Chart
          </button>
          <button
            onClick={() => setView("table")}
            className={`px-2 py-1 rounded ${view === "table" ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Table
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        {view === "chart" ? "Mention rate per topic, grouped by model" : "Mention rate (%) / avg rank per model for each topic"}
      </p>

      {view === "chart" ? (
        <ChartView modelSplit={modelSplit} topicEntries={topicEntries} lookup={lookup} />
      ) : (
        <TableView modelSplit={modelSplit} topicEntries={topicEntries} lookup={lookup} />
      )}
    </div>
  );
}

function ChartView({
  modelSplit,
  topicEntries,
  lookup,
}: {
  modelSplit: TopicModelSplitRow[];
  topicEntries: [string, string][];
  lookup: Map<string, Map<string, { mentionRate: number; avgRank: number | null }>>;
}) {
  return (
    <div className="space-y-6">
      {modelSplit.map((ms) => {
        const modelData = lookup.get(ms.model);
        if (!modelData) return null;
        const sorted = topicEntries
          .map(([key, label]) => ({ key, label, ...(modelData.get(key) ?? { mentionRate: 0, avgRank: null }) }))
          .filter((t) => t.mentionRate > 0)
          .sort((a, b) => b.mentionRate - a.mentionRate);

        const maxRate = Math.max(...sorted.map((t) => t.mentionRate), 1);

        return (
          <div key={ms.model}>
            <h4 className="text-sm font-semibold mb-2">{MODEL_LABELS[ms.model] ?? ms.model}</h4>
            <div className="space-y-2">
              {sorted.map((t) => (
                <div key={t.key} className="flex items-center gap-3">
                  <span className="text-xs w-32 shrink-0 truncate text-muted-foreground" title={t.label}>
                    {t.label}
                  </span>
                  <div className="flex-1 h-4 rounded bg-muted/50 overflow-hidden">
                    <div
                      className="h-full rounded bg-primary"
                      style={{ width: `${(t.mentionRate / maxRate) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium tabular-nums w-12 text-right">
                    {t.mentionRate}%
                  </span>
                  {t.avgRank !== null && (
                    <span className="text-[11px] text-muted-foreground tabular-nums w-10 text-right">
                      #{t.avgRank}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TableView({
  modelSplit,
  topicEntries,
  lookup,
}: {
  modelSplit: TopicModelSplitRow[];
  topicEntries: [string, string][];
  lookup: Map<string, Map<string, { mentionRate: number; avgRank: number | null }>>;
}) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-2 pr-4 font-medium">Model</th>
              {topicEntries.map(([key, label]) => (
                <th key={key} className="text-center py-2 px-2 font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modelSplit.map((ms) => (
              <tr key={ms.model} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium whitespace-nowrap">
                  {MODEL_LABELS[ms.model] ?? ms.model}
                </td>
                {topicEntries.map(([key]) => {
                  const cell = lookup.get(ms.model)?.get(key);
                  if (!cell) {
                    return (
                      <td key={key} className="text-center py-2 px-2 text-muted-foreground">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={key} className="text-center py-2 px-2 tabular-nums">
                      <span className="font-medium">{cell.mentionRate}%</span>
                      <span className="text-muted-foreground">
                        {" / "}
                        {cell.avgRank !== null ? cell.avgRank : "—"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        Format: mention rate (%) / avg rank. Lower rank = mentioned earlier.
      </p>
    </>
  );
}
