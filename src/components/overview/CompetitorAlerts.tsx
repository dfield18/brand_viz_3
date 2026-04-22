"use client";

import { useMemo } from "react";
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

interface AlertsApiResponse {
  hasData: boolean;
  competitorAlerts?: CompetitorAlert[];
  comparisonPeriodLabel?: string;
  error?: string;
}

interface CompetitionApiResponse {
  hasData: boolean;
  competition?: {
    competitors: {
      entityId: string;
      name: string;
      isBrand: boolean;
      mentionRate: number;
    }[];
  };
}

interface Props {
  brandSlug: string;
  model: string;
  range: number;
  brandCategory?: string | null;
}

export function CompetitorAlerts({ brandSlug, model, range, brandCategory }: Props) {
  const url = `/api/competitor-alerts?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}`;
  const compUrl = `/api/competition?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}`;
  const { data, loading, error } = useCachedFetch<AlertsApiResponse>(url, { staleMs: 60_000 });
  const { data: compData } = useCachedFetch<CompetitionApiResponse>(compUrl);

  // Only show alerts for entities in the competition leaderboard
  const trackedEntityIds = useMemo(() => {
    if (!compData?.competition?.competitors) return null;
    return new Set(compData.competition.competitors.map((c) => c.entityId));
  }, [compData]);

  if (loading) {
    return (
      <div className="rounded-xl bg-card p-5 shadow-section animate-pulse">
        <div className="h-4 w-48 bg-muted rounded mb-3" />
        <div className="h-16 bg-muted/40 rounded" />
      </div>
    );
  }

  // Movement endpoint errored — but the /api/competition response is
  // computed independently and usually still works. If it has data,
  // render the leaderboard fallback below instead of collapsing to
  // "Movement data unavailable." Only fall through to the error card
  // if BOTH pipelines have nothing.
  const movementErrored = Boolean(error || data?.error);

  const rawAlerts = data?.competitorAlerts ?? [];
  // Filter to only entities shown in the Issue Landscape / Competitive
  // Leaderboard. If that filter eliminates everything (common on
  // brands whose movers haven't landed in the leaderboard yet, e.g.
  // Tesla's industry runs referencing competitors that weren't in
  // the top competition slice), fall back to the raw alert list so
  // the section stays useful instead of collapsing to a blank gap.
  const filteredAlerts = trackedEntityIds
    ? rawAlerts.filter((a) => trackedEntityIds.has(a.entityId))
    : rawAlerts;
  const allAlerts = filteredAlerts.length > 0 ? filteredAlerts : rawAlerts;
  const periodLabel = data?.comparisonPeriodLabel ?? "prior period";

  const isOrg = brandCategory === "political_advocacy";
  const entityWord = isOrg ? "organization" : "competitor";

  // Build a leaderboard fallback from /api/competition's already-fetched
  // data. The competition pipeline uses a more permissive detection path
  // than /api/competitor-alerts (which restricts to industry-cluster
  // snapshot deltas) and often has competitor mention rates for brands
  // where the movement pipeline produces zero rows — e.g. a free-run
  // brand with one snapshot whose industry runs mention Nike/Adidas but
  // didn't register as "movement" because there's no prior snapshot to
  // diff against. Rendered as stable entries so the section stays
  // populated with the actual competitive landscape.
  const leaderboardFallback: CompetitorAlert[] =
    compData?.competition?.competitors
      ?.filter((c) => !c.isBrand && c.mentionRate > 0)
      .sort((a, b) => b.mentionRate - a.mentionRate)
      .slice(0, 3)
      .map((c) => ({
        entityId: c.entityId,
        displayName: c.name,
        recentMentionRate: Math.round(c.mentionRate),
        previousMentionRate: 0,
        mentionRateChange: 0,
        direction: "stable" as const,
      })) ?? [];

  // True empty state — no movement data AND no leaderboard fallback.
  // Render a visible placeholder rather than returning null, because
  // the page nav links to this section and an invisible target
  // scrolls to nothing. Separate copy when the movement endpoint
  // actually errored vs. when it simply had nothing to report.
  if (allAlerts.length === 0 && leaderboardFallback.length === 0) {
    return (
      <section className="rounded-xl bg-card px-5 py-4 shadow-section">
        <h2 className="text-sm font-semibold">{isOrg ? "Movement" : "Competitor Movement"}</h2>
        {movementErrored ? (
          <p className="text-xs text-muted-foreground mt-2">
            Movement data unavailable right now. Retry in a minute or re-run prompts to refresh the competitive landscape.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-2">
            Not enough data yet. Run prompts to populate the competitive
            landscape, then re-check once a second snapshot lands so movement
            deltas can be computed.
          </p>
        )}
      </section>
    );
  }

  const rising = allAlerts.filter((a) => a.direction === "rising").sort((a, b) => b.mentionRateChange - a.mentionRateChange);
  const falling = allAlerts.filter((a) => a.direction === "falling").sort((a, b) => a.mentionRateChange - b.mentionRateChange);

  // Prefer real movers (rising/falling). If none, fall back in order:
  // 1. Stable alerts with a non-zero recent mention rate (single-snapshot
  //    case from the movement pipeline).
  // 2. Top competitors from the /api/competition leaderboard as stable
  //    entries (Umbro-style case: no movement rows at all).
  let movers = [...rising.slice(0, 2), ...falling.slice(0, 1)].slice(0, 3);
  if (movers.length === 0) {
    movers = allAlerts
      .filter((a) => a.recentMentionRate > 0)
      .sort((a, b) => b.recentMentionRate - a.recentMentionRate)
      .slice(0, 3);
  }
  if (movers.length === 0) {
    movers = leaderboardFallback;
  }
  if (movers.length === 0) {
    return (
      <section className="rounded-xl bg-card px-5 py-4 shadow-section">
        <h2 className="text-sm font-semibold">{isOrg ? "Movement" : "Competitor Movement"}</h2>
        <p className="text-xs text-muted-foreground mt-2">
          No {entityWord} activity detected in the current window.
        </p>
      </section>
    );
  }

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
                {alert.recentMentionRate}% <span className="text-muted-foreground/60">mentioned</span>
              </span>
              {!isStable ? (
                <span className={`text-xs tabular-nums ${isRising ? (isOrg ? "text-blue-600" : "text-red-600") : "text-emerald-600"}`}>
                  {isRising ? "+" : ""}{Math.round(alert.mentionRateChange)} percentage pts <span className="text-muted-foreground/60">vs. {periodLabel}</span>
                </span>
              ) : (
                <span className="text-xs tabular-nums text-muted-foreground/60">
                  no change vs. {periodLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
