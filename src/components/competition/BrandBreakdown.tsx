"use client";

import { useState, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import type { CompetitorRow, CompetitionResponse, WinLossData, ModelSplitRow } from "@/types/api";
import { CompetitorRankDistribution } from "@/components/competition/CompetitorRankDistribution";
import { VALID_MODELS, MODEL_LABELS } from "@/lib/constants";
import { useCachedFetch } from "@/lib/useCachedFetch";

interface PromptOption {
  id: string;
  text: string;
}

interface BrandBreakdownProps {
  competitors: CompetitorRow[];
  brandSlug: string;
  brandName: string;
  range: number;
  pageModel: string;
  winLoss: WinLossData;
  modelSplit: ModelSplitRow[];
  rankDistribution?: Record<string, Record<number, number>>;
  brandEntityId?: string;
  prompts?: PromptOption[];
}

const SENTIMENT_ORDER: Record<string, number> = { Strong: 5, Positive: 4, Neutral: 3, Conditional: 2, Negative: 1 };

interface ApiResponse {
  hasData: boolean;
  competition?: CompetitionResponse;
}

const SENTIMENT_COLOR: Record<string, string> = {
  Strong: "text-emerald-600",
  Positive: "text-emerald-500",
  Neutral: "text-muted-foreground",
  Conditional: "text-amber-500",
  Negative: "text-red-500",
};

export function BrandBreakdown({
  competitors: initialCompetitors,
  brandSlug,
  brandName,
  range,
  pageModel,
  winLoss: initialWinLoss,
  modelSplit: initialModelSplit,
  rankDistribution: initialRankDistribution,
  brandEntityId,
  prompts = [],
}: BrandBreakdownProps) {
  const [model, setModel] = useState(pageModel);
  const [promptId, setPromptId] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const needsFetch = model !== pageModel || promptId !== "all";
  const url = needsFetch
    ? `/api/competition?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}${promptId !== "all" ? `&promptId=${promptId}` : ""}`
    : null;
  const { data: apiData, loading } = useCachedFetch<ApiResponse>(url);

  const competitors =
    needsFetch && apiData?.competition
      ? apiData.competition.competitors
      : initialCompetitors;

  const winLoss =
    needsFetch && apiData?.competition
      ? apiData.competition.winLoss
      : initialWinLoss;

  const modelSplit =
    needsFetch && apiData?.competition
      ? apiData.competition.modelSplit
      : initialModelSplit;

  const rankDistribution =
    needsFetch && apiData?.competition
      ? apiData.competition.rankDistribution
      : initialRankDistribution;

  const toggle = (entityId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  };

  // Multi-level sort: brand first, then visibility → share → top result → avg position (asc) → sentiment
  const sorted = useMemo(() => {
    return [...competitors].sort((a, b) => {
      if (a.isBrand && !b.isBrand) return -1;
      if (!a.isBrand && b.isBrand) return 1;

      // Brand Recall (desc)
      let cmp = b.mentionRate - a.mentionRate;
      if (cmp !== 0) return cmp;
      // Share of Voice (desc)
      cmp = b.mentionShare - a.mentionShare;
      if (cmp !== 0) return cmp;
      // Top Result Rate (desc)
      cmp = b.rank1Rate - a.rank1Rate;
      if (cmp !== 0) return cmp;
      // Avg Position (asc — lower is better)
      cmp = (a.avgRank ?? 999) - (b.avgRank ?? 999);
      if (cmp !== 0) return cmp;
      // Avg Sentiment (desc)
      cmp = (SENTIMENT_ORDER[b.avgSentiment ?? ""] ?? 0) - (SENTIMENT_ORDER[a.avgSentiment ?? ""] ?? 0);
      return cmp;
    });
  }, [competitors]);

  // Build win/loss lookup
  const wlMap = new Map(winLoss.byCompetitor.map((w) => [w.entityId, w]));

  // Build per-entity per-model lookup
  const modelDataMap = new Map<string, { model: string; label: string; row: CompetitorRow }[]>();
  for (const ms of modelSplit) {
    for (const c of ms.competitors) {
      const arr = modelDataMap.get(c.entityId) ?? [];
      arr.push({ model: ms.model, label: MODEL_LABELS[ms.model] ?? ms.model, row: c });
      modelDataMap.set(c.entityId, arr);
    }
  }

  const colCount = 6;

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold">Competitive Leaderboard</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Side-by-side comparison of {brandName} vs every competitor AI mentions
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {prompts.length > 0 && (
            <select
              value={promptId}
              onChange={(e) => setPromptId(e.target.value)}
              className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card max-w-[220px] truncate"
            >
              <option value="all">All Prompts</option>
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.text.length > 50 ? p.text.slice(0, 50) + "…" : p.text}
                </option>
              ))}
            </select>
          )}
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card"
          >
            <option value="all">All Models</option>
            {VALID_MODELS.map((m) => (
              <option key={m} value={m}>
                {MODEL_LABELS[m] ?? m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      )}

      {!loading && (
        <>
        <div className={`overflow-x-auto ${sorted.length > 6 ? "max-h-[392px] overflow-y-auto" : ""}`}>
          <table className="w-full text-sm" style={{ minWidth: 780 }}>
            <colgroup>
              <col style={{ width: "22%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "18%" }} />
            </colgroup>
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="pb-4 pr-6 text-left font-medium">Brand</th>
                <th className="pb-4 px-4 text-center font-medium">
                  <div>Brand Recall</div>
                  <div className="font-normal text-[10px] mt-0.5">How often brand appears</div>
                </th>
                <th className="pb-4 px-4 text-center font-medium">
                  <div>Share of Voice</div>
                  <div className="font-normal text-[10px] mt-0.5">Brand&apos;s share of mentions</div>
                </th>
                <th className="pb-4 px-4 text-center font-medium">
                  <div>Top Result Rate</div>
                  <div className="font-normal text-[10px] mt-0.5">First brand mentioned in response</div>
                </th>
                <th className="pb-4 px-4 text-center font-medium">
                  <div>Avg. Position</div>
                  <div className="font-normal text-[10px] mt-0.5">Avg. ranking when mentioned</div>
                </th>
                <th className="pb-4 pl-4 text-center font-medium">
                  <div>Avg. Sentiment</div>
                  <div className="font-normal text-[10px] mt-0.5">How AI presents brand</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((comp) => {
                const isExpanded = expanded.has(comp.entityId);
                const wl = wlMap.get(comp.entityId);
                const perModel = modelDataMap.get(comp.entityId) ?? [];

                return (
                  <ExpandableRow
                    key={comp.entityId}
                    comp={comp}
                    isExpanded={isExpanded}
                    onToggle={() => toggle(comp.entityId)}
                    wl={wl}
                    perModel={perModel}
                    colCount={colCount}
                    brandName={brandName}
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Rank Distribution */}
        {rankDistribution && brandEntityId && Object.keys(rankDistribution).length > 0 && (
          <div className="mt-6 pt-6 border-t border-border">
            <h3 className="text-sm font-normal text-muted-foreground mb-1">Position Distribution</h3>
            <p className="text-xs text-muted-foreground mb-4">
              How often each brand lands in the #1, #2, or #3 position across all AI responses
            </p>
            <CompetitorRankDistribution
              competitors={competitors}
              rankDistribution={rankDistribution}
              brandEntityId={brandEntityId}
            />
          </div>
        )}
        </>
      )}
    </section>
  );
}

/* ── Expandable row ─────────────────────────────────────────────────── */

function ExpandableRow({
  comp,
  isExpanded,
  onToggle,
  wl,
  perModel,
  colCount,
  brandName,
}: {
  comp: CompetitorRow;
  isExpanded: boolean;
  onToggle: () => void;
  wl?: { wins: number; losses: number; lossRate: number };
  perModel: { model: string; label: string; row: CompetitorRow }[];
  colCount: number;
  brandName: string;
}) {
  return (
    <>
      <tr
        className={`border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer ${comp.isBrand ? "bg-primary/5" : ""}`}
        onClick={onToggle}
      >
        {/* Brand */}
        <td className="py-4 pr-6">
          <div className="flex items-center gap-2">
            <ChevronRight
              className={`h-3.5 w-3.5 text-muted-foreground/50 shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
            />
            <span className="font-medium text-foreground">{comp.name}</span>
            {comp.isBrand && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                {brandName}
              </span>
            )}
          </div>
        </td>
        {/* Brand Recall */}
        <td className="py-4 px-4 text-center font-semibold tabular-nums">
          {Math.round(comp.mentionRate)}%
        </td>
        {/* Share of Voice */}
        <td className="py-4 px-4 text-center tabular-nums">
          {Number(comp.mentionShare.toFixed(1))}%
        </td>
        {/* Top Result Rate */}
        <td className={`py-4 px-4 text-center font-semibold tabular-nums ${comp.rank1Rate >= 50 ? "text-emerald-600" : comp.rank1Rate >= 20 ? "text-amber-600" : comp.rank1Rate > 0 ? "text-red-500" : ""}`}>
          {Number(comp.rank1Rate.toFixed(1))}%
        </td>
        {/* Avg. Position */}
        <td className="py-4 px-4 text-center font-semibold tabular-nums">
          {comp.avgRank !== null ? (
            <span className={comp.avgRank <= 2 ? "text-emerald-600" : comp.avgRank <= 4 ? "text-amber-600" : "text-red-500"}>
              #{comp.avgRank.toFixed(1)}
            </span>
          ) : (
            <span className="text-muted-foreground">&mdash;</span>
          )}
        </td>
        {/* Avg. Sentiment */}
        <td className="py-4 pl-4 text-center font-semibold">
          <span className={SENTIMENT_COLOR[comp.avgSentiment ?? ""] ?? "text-muted-foreground"}>
            {comp.avgSentiment ?? "\u2014"}
          </span>
        </td>
      </tr>

      {/* Expanded detail */}
      {isExpanded && (
        <tr className="bg-muted/20">
          <td colSpan={colCount} className="px-6 py-4">
            <div className="space-y-4">
              {/* Win/Loss vs brand (only for non-brand competitors) */}
              {!comp.isBrand && wl && (wl.wins + wl.losses) > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                    Head-to-Head vs {brandName}
                  </h4>
                  <div className="flex items-center gap-4">
                    <WinLossBar wins={wl.wins} losses={wl.losses} />
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {wl.wins}W &ndash; {wl.losses}L
                      {" · "}
                      {Math.round((wl.wins / (wl.wins + wl.losses)) * 100)}% win rate against {brandName}
                    </span>
                  </div>
                </div>
              )}

              {/* Per-model breakdown */}
              {perModel.length > 1 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                    By AI Platform
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground border-b border-border/50">
                          <th className="pb-2 pr-3 text-left font-medium">Platform</th>
                          <th className="pb-2 px-3 text-center font-medium">Brand Recall</th>
                          <th className="pb-2 px-3 text-center font-medium">SoV</th>
                          <th className="pb-2 px-3 text-center font-medium">Top Result</th>
                          <th className="pb-2 px-3 text-center font-medium">Avg. Pos.</th>
                          <th className="pb-2 pl-3 text-center font-medium">Sentiment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {perModel.map(({ model, label, row }) => (
                          <tr key={model} className="border-b border-border/30 last:border-0">
                            <td className="py-2 pr-3 text-muted-foreground">{label}</td>
                            <td className="py-2 px-3 text-center tabular-nums">{Math.round(row.mentionRate)}%</td>
                            <td className="py-2 px-3 text-center tabular-nums">{Number(row.mentionShare.toFixed(1))}%</td>
                            <td className="py-2 px-3 text-center tabular-nums">{Number(row.rank1Rate.toFixed(1))}%</td>
                            <td className="py-2 px-3 text-center tabular-nums">
                              {row.avgRank !== null ? `#${row.avgRank.toFixed(1)}` : "\u2014"}
                            </td>
                            <td className="py-2 pl-3 text-center">
                              <span className={SENTIMENT_COLOR[row.avgSentiment ?? ""] ?? "text-muted-foreground"}>
                                {row.avgSentiment ?? "\u2014"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Fallback if nothing to show */}
              {perModel.length <= 1 && (comp.isBrand || !wl || (wl.wins + wl.losses) === 0) && (
                <p className="text-xs text-muted-foreground">
                  {comp.appearances} appearances across responses
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ── Win/Loss mini bar ──────────────────────────────────────────────── */

function WinLossBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  if (total === 0) return null;
  const winPct = (wins / total) * 100;

  return (
    <div className="flex-1 h-5 rounded overflow-hidden flex max-w-xs">
      <div
        className="h-full bg-emerald-500 transition-all duration-300"
        style={{ width: `${winPct}%` }}
      />
      <div
        className="h-full bg-red-400 transition-all duration-300"
        style={{ width: `${100 - winPct}%` }}
      />
    </div>
  );
}
