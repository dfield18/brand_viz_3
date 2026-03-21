"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useCachedFetch } from "@/lib/useCachedFetch";

interface CompetitorAlert {
  entityId: string;
  displayName: string;
  mentionRateChange: number;
  recentMentionRate: number;
  previousMentionRate: number;
  direction: "rising" | "falling" | "stable";
}

interface RecsApiResponse {
  hasData: boolean;
  competitorAlerts?: CompetitorAlert[];
  comparisonPeriodLabel?: string;
}

interface Props {
  brandSlug: string;
  model: string;
  range: number;
  brandCategory?: string | null;
}

export function CompetitorAlerts({ brandSlug, model, range, brandCategory }: Props) {
  const url = `/api/recommendations?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}`;
  const { data, loading } = useCachedFetch<RecsApiResponse>(url);

  if (loading) {
    return (
      <div className="rounded-xl bg-card p-5 shadow-section animate-pulse">
        <div className="h-4 w-48 bg-muted rounded mb-3" />
        <div className="h-16 bg-muted/40 rounded" />
      </div>
    );
  }

  const allAlerts = data?.competitorAlerts ?? [];
  const periodLabel = data?.comparisonPeriodLabel ?? "prior period";
  if (allAlerts.length === 0) return null;

  const rising = allAlerts.filter((a) => a.direction === "rising").sort((a, b) => b.mentionRateChange - a.mentionRateChange);
  const falling = allAlerts.filter((a) => a.direction === "falling").sort((a, b) => a.mentionRateChange - b.mentionRateChange);

  // Show top 3 movers; fall back to top entities by mention rate if no clear movers
  let movers = [...rising.slice(0, 2), ...falling.slice(0, 1)].slice(0, 3);
  if (movers.length === 0) {
    movers = allAlerts
      .filter((a) => a.recentMentionRate > 0)
      .sort((a, b) => b.recentMentionRate - a.recentMentionRate)
      .slice(0, 3);
  }
  if (movers.length === 0) return null;

  const isOrg = brandCategory === "political_advocacy";
  const entityWord = isOrg ? "organization" : "competitor";

  return (
    <section className="rounded-xl bg-card px-5 py-4 shadow-section">
      <h2 className="text-sm font-semibold">{isOrg ? "Movement" : "Competitor Movement"}</h2>
      <p className="text-xs text-muted-foreground mt-1 mb-3">
        How often each {entityWord} appears in AI answers to general industry questions — where no brand is named in the query
      </p>
      <div className="space-y-2.5">
        {movers.map((alert) => {
          const isRising = alert.direction === "rising";
          const isFalling = alert.direction === "falling";
          const isStable = alert.direction === "stable";
          return (
            <div key={alert.entityId} className="flex items-center gap-3">
              {isRising ? (
                <TrendingUp className={`h-3.5 w-3.5 ${isOrg ? "text-blue-500" : "text-red-500"} shrink-0`} />
              ) : isFalling ? (
                <TrendingDown className={`h-3.5 w-3.5 ${isOrg ? "text-muted-foreground" : "text-emerald-500"} shrink-0`} />
              ) : (
                <Minus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="text-sm font-medium truncate">{alert.displayName}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {alert.recentMentionRate}% <span className="text-muted-foreground/60">of AI answers mention</span>
              </span>
              {!isStable && (
                <span className={`text-xs tabular-nums ${isRising ? (isOrg ? "text-blue-600" : "text-red-600") : "text-emerald-600"}`}>
                  {isRising ? "+" : ""}{alert.mentionRateChange.toFixed(1)} pts <span className="text-muted-foreground/60">vs. {periodLabel}</span>
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
