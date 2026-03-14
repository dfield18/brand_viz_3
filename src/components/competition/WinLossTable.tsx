"use client";

import type { WinLossData } from "@/types/api";

interface WinLossTableProps {
  winLoss: WinLossData;
}

const INITIAL_ROWS = 5;

export function WinLossTable({ winLoss }: WinLossTableProps) {
  const { byCompetitor } = winLoss;

  if (byCompetitor.length === 0) {
    return <p className="text-sm text-muted-foreground">No win/loss data available.</p>;
  }

  const sorted = [...byCompetitor].sort((a, b) => b.wins - a.wins);

  return (
    <div className="space-y-6">
      {/* Summary table */}
      <div className={`overflow-x-auto ${sorted.length > INITIAL_ROWS ? "max-h-[280px] overflow-y-auto" : ""}`}>
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[25%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <th className="py-2 pr-4 bg-card sticky top-0 z-10">Competitor</th>
              <th className="py-2 px-4 text-right bg-card sticky top-0 z-10">Wins</th>
              <th className="py-2 px-4 text-right bg-card sticky top-0 z-10">Losses</th>
              <th className="py-2 px-4 text-right bg-card sticky top-0 z-10">Win Rate</th>
              <th className="py-2 pl-4 bg-card sticky top-0 z-10">W/L Bar</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => {
              const total = c.wins + c.losses;
              const winPct = total > 0 ? (c.wins / total) * 100 : 50;
              return (
                <tr key={c.entityId} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="py-2.5 pr-4 font-medium">{c.name}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-emerald-600">{c.wins}</td>
                  <td className="py-2.5 px-4 text-right tabular-nums text-red-500">{c.losses}</td>
                  <td className={`py-2.5 px-4 text-right tabular-nums font-medium ${total > 0 ? (Math.round((c.wins / total) * 100) > 50 ? "text-emerald-600" : Math.round((c.wins / total) * 100) === 50 ? "text-amber-600" : "text-red-500") : ""}`}>{total > 0 ? Math.round((c.wins / total) * 100) : 0}%</td>
                  <td className="py-2.5 pl-4">
                    <div className="flex h-3 rounded overflow-hidden bg-muted/50">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${winPct}%` }}
                      />
                      <div
                        className="h-full bg-red-400 transition-all duration-300"
                        style={{ width: `${100 - winPct}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}
