"use client";

import type { CoMentionPair } from "@/types/api";

interface CoMentionHeatmapProps {
  coMentions: CoMentionPair[];
  entityIds: string[];
  entityNames: Record<string, string>;
  brandEntityId: string;
}

function intensityClass(rate: number): string {
  if (rate >= 75) return "bg-primary/30";
  if (rate >= 50) return "bg-primary/20";
  if (rate >= 25) return "bg-primary/10";
  if (rate > 0) return "bg-primary/5";
  return "";
}

export function CoMentionHeatmap({
  coMentions,
  entityIds,
  entityNames,
  brandEntityId,
}: CoMentionHeatmapProps) {
  if (coMentions.length === 0) {
    return <p className="text-sm text-muted-foreground">No co-mention data available.</p>;
  }

  // Build lookup
  const lookup = new Map<string, number>();
  for (const cm of coMentions) {
    lookup.set(`${cm.entityA}|${cm.entityB}`, cm.coMentionRate);
    lookup.set(`${cm.entityB}|${cm.entityA}`, cm.coMentionRate);
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="p-2" />
            {entityIds.map((id) => (
              <th
                key={id}
                className={`px-3 py-2 text-center font-medium whitespace-nowrap ${id === brandEntityId ? "text-primary" : "text-muted-foreground"}`}
                title={entityNames[id]}
              >
                {entityNames[id]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entityIds.map((rowId) => (
            <tr key={rowId}>
              <td
                className={`p-2 font-medium whitespace-nowrap ${rowId === brandEntityId ? "text-primary" : "text-muted-foreground"}`}
              >
                {entityNames[rowId]}
              </td>
              {entityIds.map((colId) => {
                if (rowId === colId) {
                  return (
                    <td key={colId} className="px-3 py-2 text-center bg-muted/30 text-muted-foreground">
                      &mdash;
                    </td>
                  );
                }
                const rate = lookup.get(`${rowId}|${colId}`) ?? 0;
                return (
                  <td
                    key={colId}
                    className={`px-3 py-2 text-center tabular-nums ${intensityClass(rate)}`}
                    title={`${entityNames[rowId]} & ${entityNames[colId]}: ${rate}% co-mention rate`}
                  >
                    {rate > 0 ? `${rate}%` : "\u2014"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
        Shows how often AI mentions two brands in the same response. Higher percentages mean AI frequently discusses these brands together.
      </p>
    </div>
  );
}
