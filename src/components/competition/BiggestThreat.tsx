"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import type { CompetitorRow, WinLossData } from "@/types/api";

interface BiggestThreatProps {
  competitors: CompetitorRow[];
  winLoss: WinLossData;
  brandName: string;
}

export function BiggestThreat({ competitors, winLoss, brandName }: BiggestThreatProps) {
  const threat = useMemo(() => {
    // Score each non-brand competitor: weight loss rate (how often they beat the brand) + their visibility
    const nonBrand = competitors.filter((c) => !c.isBrand);
    if (nonBrand.length === 0) return null;

    const wlMap = new Map(winLoss.byCompetitor.map((w) => [w.entityId, w]));

    let best: {
      name: string;
      entityId: string;
      lossRate: number;
      wins: number;
      losses: number;
      mentionRate: number;
      avgRank: number | null;
      avgSentiment?: string;
      score: number;
    } | null = null;

    for (const c of nonBrand) {
      const wl = wlMap.get(c.entityId);
      const lossRate = wl ? wl.lossRate : 0;
      const wins = wl ? wl.wins : 0;
      const losses = wl ? wl.losses : 0;
      // Composite threat score: 60% how often they beat the brand + 40% their visibility
      const score = lossRate * 0.6 + c.mentionRate * 0.4;
      if (!best || score > best.score) {
        best = {
          name: c.name,
          entityId: c.entityId,
          lossRate,
          wins,
          losses,
          mentionRate: c.mentionRate,
          avgRank: c.avgRank,
          avgSentiment: c.avgSentiment,
          score,
        };
      }
    }

    return best;
  }, [competitors, winLoss]);

  if (!threat || threat.score === 0) return null;

  const totalMatchups = threat.wins + threat.losses;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20 p-5 flex items-start gap-4">
      <div className="shrink-0 mt-0.5">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">
          {brandName}&apos;s Top AI Competitor: {threat.name}
        </h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {threat.name} beats {brandName} in{" "}
          <span className="font-semibold text-foreground">{threat.lossRate}%</span> of
          head-to-head matchups
          {totalMatchups > 0 && (
            <span> ({threat.losses} of {totalMatchups})</span>
          )}
          {" · "}Appears in{" "}
          <span className="font-semibold text-foreground">{threat.mentionRate}%</span> of
          AI responses
          {threat.avgRank !== null && (
            <>
              {" · "}Avg. position{" "}
              <span className="font-semibold text-foreground">#{threat.avgRank.toFixed(1)}</span>
            </>
          )}
          {threat.avgSentiment && (
            <>
              {" · "}Sentiment:{" "}
              <span className="font-semibold text-foreground">{threat.avgSentiment}</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
