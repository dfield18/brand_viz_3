"use client";

import type { CompetitiveOpportunity } from "@/types/api";
import { MODEL_LABELS } from "@/lib/constants";

interface CompetitiveOpportunitiesProps {
  opportunities: CompetitiveOpportunity[];
  brandName: string;
}

function impactBadge(score: number) {
  if (score >= 70) return { label: "High", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" };
  if (score >= 40) return { label: "Medium", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" };
  return { label: "Low", cls: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" };
}

const INITIAL_ROWS = 5;

export function CompetitiveOpportunities({ opportunities, brandName }: CompetitiveOpportunitiesProps) {
  if (opportunities.length === 0) {
    return <p className="text-sm text-muted-foreground">No competitive opportunities found.</p>;
  }

  const sorted = [...opportunities].sort((a, b) => b.impactScore - a.impactScore);

  return (
    <div className={`overflow-x-auto ${sorted.length > INITIAL_ROWS ? "max-h-[320px] overflow-y-auto" : ""}`}>
      <table className="w-full text-sm table-fixed">
        <colgroup>
          <col className="w-[40%]" />
          <col className="w-[15%]" />
          <col className="w-[15%]" />
          <col className="w-[15%]" />
          <col className="w-[15%]" />
        </colgroup>
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <th className="py-2 pr-4 bg-card sticky top-0 z-10">Question</th>
            <th className="py-2 px-4 text-center bg-card sticky top-0 z-10">{brandName}</th>
            <th className="py-2 px-4 text-center bg-card sticky top-0 z-10">Top Competitor</th>
            <th className="py-2 px-4 text-center bg-card sticky top-0 z-10">Platform</th>
            <th className="py-2 px-4 text-center bg-card sticky top-0 z-10">Impact</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((opp, i) => {
            const badge = impactBadge(opp.impactScore);
            return (
              <tr
                key={i}
                className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${i % 2 === 1 ? "bg-muted/20" : ""}`}
              >
                <td className="py-2.5 pr-4 text-foreground">{opp.promptText}</td>
                <td className="py-2.5 px-4 text-center tabular-nums">
                  {opp.brandRank ? (
                    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">#{opp.brandRank}</span>
                  ) : (
                    <span className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Absent</span>
                  )}
                </td>
                <td className="py-2.5 px-4 text-center">
                  <div className="text-foreground font-medium">{opp.topCompetitor}</div>
                  <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 mt-0.5">#{opp.topCompetitorRank}</span>
                </td>
                <td className="py-2.5 px-4 text-center text-muted-foreground">
                  {MODEL_LABELS[opp.model] ?? opp.model}
                </td>
                <td className="py-2.5 px-4 text-center">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
                    {badge.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
