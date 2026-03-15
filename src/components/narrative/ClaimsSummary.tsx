"use client";

import { useMemo } from "react";
import type { NarrativeClaim } from "@/types/api";
import { MODEL_LABELS } from "@/lib/constants";

interface ClaimsSummaryProps {
  strengths: NarrativeClaim[];
  weaknesses: NarrativeClaim[];
  weaknessesAreNeutral?: boolean;
}

export function ClaimsSummary({ strengths, weaknesses, weaknessesAreNeutral }: ClaimsSummaryProps) {
  const rows = useMemo(() => {
    const tagged = [
      ...strengths.map((c) => ({ ...c, type: "strength" as const })),
      ...weaknesses.map((c) => ({ ...c, type: weaknessesAreNeutral ? ("neutral" as const) : ("weakness" as const) })),
    ];
    return tagged.sort((a, b) => b.count - a.count);
  }, [strengths, weaknesses, weaknessesAreNeutral]);

  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold">Most Common Claims</h2>
      <p className="text-xs text-muted-foreground mt-1 mb-4">
        Claims AI models repeat most frequently about this brand
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Claim</th>
              <th className="pb-2 px-3 font-medium w-24">Type</th>
              <th className="pb-2 px-3 font-medium w-16 text-right">Count</th>
              <th className="pb-2 pl-3 font-medium w-24">Model</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border/50 last:border-0">
                <td className="py-2.5 pr-4 text-foreground leading-relaxed">
                  {row.text}
                </td>
                <td className="py-2.5 px-3">
                  <span
                    className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                      row.type === "strength"
                        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                        : row.type === "weakness"
                          ? "text-red-700 bg-red-50 border-red-200"
                          : "text-amber-700 bg-amber-50 border-amber-200"
                    }`}
                  >
                    {row.type === "strength" ? "Strength" : row.type === "weakness" ? "Weakness" : "Neutral"}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">
                  {row.count}
                </td>
                <td className="py-2.5 pl-3 text-muted-foreground text-xs">
                  {MODEL_LABELS[row.model ?? ""] ?? row.model ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
