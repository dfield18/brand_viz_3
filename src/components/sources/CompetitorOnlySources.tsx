"use client";

import { useMemo } from "react";
import type { CompetitorCrossCitation } from "@/types/api";

import { titleCase } from "@/lib/utils";

interface Props {
  crossCitation: CompetitorCrossCitation[];
  brandSlug: string;
  brandName: string;
  onDomainClick?: (domain: string) => void;
  entityNames?: Record<string, string>;
  isOrg?: boolean;
}

function resolveEntity(id: string, names?: Record<string, string>): string {
  return names?.[id] ?? names?.[id.toLowerCase()] ?? titleCase(id);
}

// Muted, professional palette for competitor pills
const COMP_COLORS = [
  "hsl(231, 48%, 56%)", // indigo
  "hsl(199, 69%, 55%)", // sky
  "hsl(215, 16%, 62%)", // slate
  "hsl(172, 42%, 48%)", // teal
  "hsl(262, 40%, 58%)", // violet
  "hsl(24, 60%, 55%)",  // amber
  "hsl(340, 50%, 56%)", // rose
  "hsl(142, 40%, 48%)", // green
];

function useCompetitorOnlyRows(crossCitation: CompetitorCrossCitation[], brandSlug: string) {
  return useMemo(() => {
    return crossCitation
      .filter((row) => {
        const brandCount = row.entityCounts[brandSlug] ?? 0;
        const otherTotal = Object.entries(row.entityCounts)
          .filter(([id]) => id !== brandSlug)
          .reduce((s, [, v]) => s + v, 0);
        return brandCount === 0 && otherTotal > 0;
      })
      .map((row) => {
        const competitors = Object.entries(row.entityCounts)
          .filter(([id]) => id !== brandSlug)
          .sort((a, b) => b[1] - a[1]);
        const total = competitors.reduce((s, [, v]) => s + v, 0);
        return { domain: row.domain, competitors, total };
      })
      .sort((a, b) => b.total - a.total);
  }, [crossCitation, brandSlug]);
}

/** Chart-only view — stays in Source Overview */
export default function CompetitorOnlySources({ crossCitation, brandSlug, brandName, entityNames, isOrg }: Props) {
  const rows = useCompetitorOnlyRows(crossCitation, brandSlug);

  const top = rows.slice(0, 15);

  // Build a stable color map for competitors
  const colorMap = useMemo(() => {
    const keySet = new Set<string>();
    for (const row of top) {
      for (const [id] of row.competitors) keySet.add(id);
    }
    const cMap: Record<string, string> = {};
    [...keySet].forEach((k, i) => {
      cMap[k] = COMP_COLORS[i % COMP_COLORS.length];
    });
    return cMap;
  }, [top]);

  if (rows.length === 0) return null;

  const maxTotal = Math.max(...top.map((r) => r.total), 1);

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold mb-1">Sources Not Citing {brandName}</h2>
      <p className="text-xs text-muted-foreground mb-5">
        These websites are cited by AI when talking about {isOrg ? "other organizations" : "competitors"}, but never when mentioning {brandName}. Getting featured on these sites could improve {brandName}&apos;s AI visibility.
      </p>

      <div className="space-y-3">
        {top.map((row, i) => {
          const barPct = (row.total / maxTotal) * 100;

          return (
            <div key={row.domain} className="group">
              {/* Row: rank, domain, bar, count */}
              <div className="flex items-center gap-3">
                <span className="w-5 text-xs text-muted-foreground text-right tabular-nums shrink-0 font-medium">
                  {i + 1}
                </span>
                <span className="w-36 text-[13px] font-medium truncate shrink-0" title={row.domain}>
                  {row.domain}
                </span>
                <div className="flex-1 min-w-0">
                  <div
                    className="h-6 rounded bg-primary/15 transition-all duration-300"
                    style={{ width: `${Math.max(barPct, 4)}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-20 text-right">
                  {row.total} citation{row.total !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Competitor pills */}
              <div className="flex items-center gap-1.5 ml-8 mt-1.5 flex-wrap">
                <span className="text-[10px] text-muted-foreground/70 mr-0.5">Cited for:</span>
                {row.competitors.slice(0, 5).map(([entityId, count]) => (
                  <span
                    key={entityId}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                    style={{ backgroundColor: colorMap[entityId] }}
                  >
                    {resolveEntity(entityId, entityNames)}
                    <span className="opacity-80">×{count}</span>
                  </span>
                ))}
                {row.competitors.length > 5 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{row.competitors.length - 5} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {rows.length > 15 && (
        <p className="text-[11px] text-muted-foreground mt-4 text-center">
          Showing top 15 of {rows.length} sources — see full list below
        </p>
      )}
    </section>
  );
}

/** Table-only view — for the reference / deep dive section */
export function CompetitorOnlySourcesTable({ crossCitation, brandSlug, brandName, onDomainClick, entityNames, isOrg }: Props) {
  const rows = useCompetitorOnlyRows(crossCitation, brandSlug);

  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold mb-1">Sources Not Citing {brandName} — Full List</h2>
      <p className="text-xs text-muted-foreground mb-5">
        All {rows.length} sources cited for {isOrg ? "other organizations" : "competitors"} but not for {brandName}
      </p>

      <div className={`space-y-1.5 ${rows.length > 10 ? "max-h-[400px] overflow-y-auto" : ""}`}>
        {rows.map((row, i) => (
          <div
            key={row.domain}
            className="flex items-center gap-3 py-1.5 border-b border-border/50 last:border-0"
          >
            <span className="w-5 text-xs text-muted-foreground text-right tabular-nums shrink-0">
              {i + 1}.
            </span>
            <button
              type="button"
              onClick={() => onDomainClick?.(row.domain)}
              className="w-40 text-xs font-medium truncate hover:text-foreground hover:underline underline-offset-2 transition-colors text-left shrink-0"
              title={row.domain}
            >
              {row.domain}
            </button>
            <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
              {row.competitors.slice(0, 4).map(([entityId, count]) => (
                <span
                  key={entityId}
                  className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  {resolveEntity(entityId, entityNames)}
                  <span className="text-foreground tabular-nums">{count}</span>
                </span>
              ))}
              {row.competitors.length > 4 && (
                <span className="text-[10px] text-muted-foreground">
                  +{row.competitors.length - 4} more
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-auto whitespace-nowrap">
              {row.total} citations
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
