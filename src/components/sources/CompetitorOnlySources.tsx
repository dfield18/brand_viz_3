"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { CompetitorCrossCitation } from "@/types/api";

import { titleCase } from "@/lib/utils";

interface Props {
  crossCitation: CompetitorCrossCitation[];
  brandSlug: string;
  brandName: string;
  onDomainClick?: (domain: string) => void;
  entityNames?: Record<string, string>;
}

function resolveEntity(id: string, names?: Record<string, string>): string {
  return names?.[id] ?? names?.[id.toLowerCase()] ?? titleCase(id);
}

// Muted, professional palette for stacked competitor segments
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
export default function CompetitorOnlySources({ crossCitation, brandSlug, brandName, entityNames }: Props) {
  const rows = useCompetitorOnlyRows(crossCitation, brandSlug);

  const { chartData, competitorKeys, colorMap } = useMemo(() => {
    const top = rows.slice(0, 15);
    const keySet = new Set<string>();
    for (const row of top) {
      for (const [id] of row.competitors) keySet.add(id);
    }
    const keys = [...keySet];

    const cMap: Record<string, string> = {};
    keys.forEach((k, i) => {
      cMap[k] = COMP_COLORS[i % COMP_COLORS.length];
    });

    const data = top.map((row) => {
      const entry: Record<string, string | number> = { domain: row.domain };
      for (const [id, count] of row.competitors) {
        entry[id] = count;
      }
      return entry;
    });

    return { chartData: data, competitorKeys: keys, colorMap: cMap };
  }, [rows]);

  if (rows.length === 0 || chartData.length === 0) return null;

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold mb-1">Sources Not Citing {brandName}</h2>
      <p className="text-xs text-muted-foreground mb-5">
        These sources are cited by AI when recommending competitors but not when mentioning {brandName} — potential opportunities to build presence
      </p>

      <h3 className="text-sm font-medium text-muted-foreground mb-3">
        Top {Math.min(rows.length, 15)} Sources by Competitor Citations
      </h3>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs text-muted-foreground">
        {competitorKeys.map((key) => (
          <span key={key} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: colorMap[key] }}
            />
            {resolveEntity(key, entityNames)}
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={Math.max(chartData.length * 36, 200)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
          barSize={20}
        >
          <XAxis
            type="number"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)" }}
          />
          <YAxis
            type="category"
            dataKey="domain"
            width={140}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)" }}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.3 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const items = payload.filter((p) => (p.value as number) > 0);
              return (
                <div className="rounded-lg border border-border bg-popover p-3 shadow-md text-xs space-y-1">
                  <p className="font-medium text-popover-foreground">{label}</p>
                  {items.map((p) => (
                    <p key={p.dataKey as string} className="text-muted-foreground flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-sm"
                        style={{ backgroundColor: p.color }}
                      />
                      {resolveEntity(p.dataKey as string, entityNames)}: <span className="font-medium text-foreground">{p.value}</span>
                    </p>
                  ))}
                </div>
              );
            }}
          />
          {competitorKeys.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              stackId="a"
              fill={colorMap[key]}
              radius={0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}

/** Table-only view — for the reference / deep dive section */
export function CompetitorOnlySourcesTable({ crossCitation, brandSlug, brandName, onDomainClick, entityNames }: Props) {
  const rows = useCompetitorOnlyRows(crossCitation, brandSlug);

  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold mb-1">Sources Not Citing {brandName} — Full List</h2>
      <p className="text-xs text-muted-foreground mb-5">
        All {rows.length} sources cited for competitors but not for {brandName}
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
