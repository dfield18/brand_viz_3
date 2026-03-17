"use client";

import { useMemo } from "react";
import { AlertTriangle, Trophy, TrendingDown } from "lucide-react";
import type { CompetitorRow, WinLossData, CompetitionResponse } from "@/types/api";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { titleCase } from "@/lib/utils";

interface CompetitionApiResponse {
  hasData: boolean;
  competition?: CompetitionResponse;
}

interface Props {
  brandSlug: string;
  model: string;
  range: number;
}

export function CompetitorSnapshot({ brandSlug, model, range }: Props) {
  const url = `/api/competition?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}`;
  const { data: apiData, loading } = useCachedFetch<CompetitionApiResponse>(url);

  const { brand, topCompetitors, threat } = useMemo(() => {
    if (!apiData?.competition) return { brand: null, topCompetitors: [], threat: null };

    const competitors = apiData.competition.competitors;
    const winLoss = apiData.competition.winLoss;
    const brandRow = competitors.find((c) => c.isBrand) ?? null;
    const nonBrand = competitors.filter((c) => !c.isBrand);

    // Top 3 competitors by mention share
    const top = [...nonBrand]
      .sort((a, b) => b.mentionShare - a.mentionShare)
      .slice(0, 3);

    // Biggest threat (same logic as BiggestThreat component)
    const wlMap = new Map(winLoss.byCompetitor.map((w) => [w.entityId, w]));
    let best: { name: string; lossRate: number; mentionRate: number; score: number } | null = null;
    for (const c of nonBrand) {
      const wl = wlMap.get(c.entityId);
      const lossRate = wl ? wl.lossRate : 0;
      const score = lossRate * 0.6 + c.mentionRate * 0.4;
      if (!best || score > best.score) {
        best = { name: c.name, lossRate, mentionRate: c.mentionRate, score };
      }
    }

    return { brand: brandRow, topCompetitors: top, threat: best?.score ? best : null };
  }, [apiData]);

  if (loading) {
    return (
      <div className="rounded-xl bg-card p-6 shadow-section animate-pulse">
        <div className="h-4 w-56 bg-muted rounded mb-4" />
        <div className="h-24 bg-muted/40 rounded" />
      </div>
    );
  }

  if (!apiData?.hasData || !apiData.competition || (!brand && topCompetitors.length === 0)) {
    return null;
  }

  // Build the ranking: brand + top competitors sorted by mention share
  const ranking = [
    ...(brand ? [brand] : []),
    ...topCompetitors,
  ].sort((a, b) => b.mentionShare - a.mentionShare);

  const maxShare = Math.max(...ranking.map((r) => r.mentionShare), 1);

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold">Competitive Landscape</h2>
          <p className="text-xs text-muted-foreground mt-1">
            How your brand stacks up against top competitors in AI responses
          </p>
        </div>
      </div>

      {/* Ranking bars */}
      <div className="space-y-2.5">
        {ranking.map((row, i) => {
          const barWidth = Math.max(4, (row.mentionShare / maxShare) * 100);
          return (
            <div key={row.entityId} className="flex items-center gap-3">
              <span className="w-5 text-xs text-muted-foreground text-right tabular-nums shrink-0">
                {i + 1}.
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-sm truncate ${row.isBrand ? "font-semibold text-primary" : "font-medium"}`}>
                    {row.name}
                    {row.isBrand && <span className="text-xs font-normal text-muted-foreground ml-1">(You)</span>}
                  </span>
                  {row.avgRank !== null && (
                    <span className="relative group text-[10px] text-muted-foreground shrink-0 cursor-default">
                      Avg #{row.avgRank.toFixed(1)}
                      <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 hidden group-hover:block w-48 rounded-lg bg-card px-3 py-2 text-[11px] font-normal text-muted-foreground leading-relaxed shadow-md z-20 text-left whitespace-normal">
                        Average ranking position in AI responses. #1 means the brand is typically mentioned first.
                      </span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${row.isBrand ? "bg-primary" : "bg-sky-300"}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground w-10 text-right shrink-0">
                    {Number(row.mentionShare).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Threat callout */}
      {threat && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{threat.name}</span> is your biggest competitive threat
              {" — "}when both brands appear in the same AI response, {threat.name} is ranked higher <span className="font-semibold text-foreground">{Number(threat.lossRate).toFixed(1)}%</span> of the time
              and appears in <span className="font-semibold text-foreground">{Number(threat.mentionRate).toFixed(1)}%</span> of all AI responses
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
