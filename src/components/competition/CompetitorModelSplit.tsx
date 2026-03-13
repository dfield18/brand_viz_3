"use client";

import { useState } from "react";
import type { ModelSplitRow } from "@/types/api";
import { MODEL_LABELS } from "@/lib/constants";

interface CompetitorModelSplitProps {
  modelSplit: ModelSplitRow[];
  brandEntityId: string;
}

export function CompetitorModelSplit({ modelSplit, brandEntityId }: CompetitorModelSplitProps) {
  const [view, setView] = useState<"chart" | "table">("chart");

  if (modelSplit.length <= 1) {
    return null;
  }

  // Collect all entity IDs across models
  const entitySet = new Set<string>();
  const entityNameMap: Record<string, string> = {};
  for (const row of modelSplit) {
    for (const c of row.competitors) {
      entitySet.add(c.entityId);
      entityNameMap[c.entityId] = c.name;
    }
  }
  const entityIds = [...entitySet];
  entityIds.sort((a, b) => {
    if (a === brandEntityId) return -1;
    if (b === brandEntityId) return 1;
    return (entityNameMap[a] ?? a).localeCompare(entityNameMap[b] ?? b);
  });

  return (
    <div>
      {/* View toggle */}
      <div className="flex items-center gap-1.5 text-xs mb-4">
        <button
          onClick={() => setView("chart")}
          className={`px-2 py-1 rounded ${view === "chart" ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Visual
        </button>
        <button
          onClick={() => setView("table")}
          className={`px-2 py-1 rounded ${view === "table" ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Detail Table
        </button>
      </div>

      {view === "chart" ? (
        <ChartView modelSplit={modelSplit} brandEntityId={brandEntityId} />
      ) : (
        <TableView modelSplit={modelSplit} entityIds={entityIds} entityNameMap={entityNameMap} brandEntityId={brandEntityId} />
      )}
    </div>
  );
}

function ChartView({ modelSplit, brandEntityId }: { modelSplit: ModelSplitRow[]; brandEntityId: string }) {
  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground -mt-2">
        Bars show each brand&apos;s share of voice — the percentage of responses where the AI platform mentions that brand. Longer bars mean more visibility.
      </p>
      {modelSplit.map((row) => {
        const sorted = [...row.competitors]
          .filter((c) => c.appearances > 0)
          .sort((a, b) => b.mentionShare - a.mentionShare);
        const maxShare = sorted.length > 0 ? Math.max(...sorted.map((c) => c.mentionShare)) : 0;

        return (
          <div key={row.model}>
            <h3 className="text-sm font-semibold mb-2">{MODEL_LABELS[row.model] ?? row.model}</h3>
            <div className="space-y-2 max-h-[180px] overflow-y-auto">
              {sorted.map((c) => (
                <div key={c.entityId} className="flex items-center gap-3">
                  <span
                    className={`text-xs w-28 shrink-0 truncate ${c.entityId === brandEntityId ? "font-semibold text-primary" : "text-muted-foreground"}`}
                    title={c.name}
                  >
                    {c.name}
                                      </span>
                  <div className="flex-1 h-5 rounded bg-muted/50 overflow-hidden">
                    <div
                      className={`h-full rounded transition-all duration-300 ${c.entityId === brandEntityId ? "bg-primary" : "bg-[var(--chart-2)]"}`}
                      style={{ width: maxShare > 0 ? `${(c.mentionShare / maxShare) * 100}%` : "0%" }}
                    />
                  </div>
                  <span className="text-xs font-semibold tabular-nums w-16 text-right">
                    {c.mentionShare.toFixed(1)}%
                  </span>
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
  entityIds,
  entityNameMap,
  brandEntityId,
}: {
  modelSplit: ModelSplitRow[];
  entityIds: string[];
  entityNameMap: Record<string, string>;
  brandEntityId: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2 pr-3 text-left font-medium text-muted-foreground min-w-[100px]">
              AI Platform
            </th>
            {entityIds.map((id) => (
              <th
                key={id}
                className={`py-2 px-3 text-center font-medium ${id === brandEntityId ? "text-primary" : "text-muted-foreground"}`}
              >
                <span className="truncate block max-w-[90px]" title={entityNameMap[id] ?? id}>
                  {entityNameMap[id] ?? id}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modelSplit.map((row) => {
            const competitorMap = new Map(row.competitors.map((c) => [c.entityId, c]));
            return (
              <tr key={row.model} className="border-b border-border/30 hover:bg-muted/20">
                <td className="py-2.5 pr-3 font-medium text-sm">
                  {MODEL_LABELS[row.model] ?? row.model}
                </td>
                {entityIds.map((id) => {
                  const c = competitorMap.get(id);
                  if (!c || c.appearances === 0) {
                    return (
                      <td key={id} className="py-2.5 px-3 text-center text-muted-foreground/40">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={id} className="py-2.5 px-3 text-center">
                      <div className="tabular-nums">
                        <span className="font-semibold">{c.mentionRate}%</span>
                        <span className="text-muted-foreground ml-1">
                          / {c.avgRank !== null ? c.avgRank.toFixed(1) : "—"}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-3">
        Each cell shows <span className="font-medium text-foreground">how often mentioned</span> (%) / <span className="font-medium text-foreground">average position</span> (lower is better — 1 means recommended first).
      </p>
    </div>
  );
}
