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
}

interface Props {
  brandSlug: string;
  model: string;
  range: number;
}

export function CompetitorAlerts({ brandSlug, model, range }: Props) {
  const url = `/api/recommendations?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}`;
  const { data, loading } = useCachedFetch<RecsApiResponse>(url);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 shadow-section animate-pulse">
        <div className="h-4 w-48 bg-muted rounded mb-3" />
        <div className="h-16 bg-muted/40 rounded" />
      </div>
    );
  }

  const alerts = data?.competitorAlerts?.filter((a) => a.direction !== "stable") ?? [];
  if (alerts.length === 0) return null;

  const rising = alerts.filter((a) => a.direction === "rising").sort((a, b) => b.mentionRateChange - a.mentionRateChange);
  const falling = alerts.filter((a) => a.direction === "falling").sort((a, b) => a.mentionRateChange - b.mentionRateChange);

  // Show top 3 movers
  const movers = [...rising.slice(0, 2), ...falling.slice(0, 1)].slice(0, 3);

  return (
    <section className="rounded-xl border border-border bg-card px-5 py-4 shadow-section">
      <h2 className="text-sm font-semibold mb-3">Competitor Movement</h2>
      <div className="space-y-2">
        {movers.map((alert) => {
          const isRising = alert.direction === "rising";
          return (
            <div key={alert.entityId} className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {isRising ? (
                  <TrendingUp className="h-3.5 w-3.5 text-red-500 shrink-0" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                )}
                <span className="text-sm font-medium truncate">{alert.displayName}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs font-medium tabular-nums ${isRising ? "text-red-600" : "text-emerald-600"}`}>
                  {isRising ? "+" : ""}{alert.mentionRateChange.toFixed(1)} pts
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {alert.recentMentionRate}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {rising.length > 0 && (
        <p className="text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border/50">
          {rising.length} competitor{rising.length > 1 ? "s" : ""} gaining traction in AI responses
        </p>
      )}
    </section>
  );
}
