"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import type { WorstPerformingPrompt } from "@/types/api";

interface WorstPerformingPromptsProps {
  prompts: WorstPerformingPrompt[];
}

export function WorstPerformingPrompts({ prompts }: WorstPerformingPromptsProps) {
  const sorted = useMemo(
    () => [...prompts].sort((a, b) => {
      // Absent (null) first, then highest rank number first
      if (a.rank === null && b.rank !== null) return -1;
      if (a.rank !== null && b.rank === null) return 1;
      if (a.rank === null && b.rank === null) return 0;
      return b.rank! - a.rank!;
    }),
    [prompts],
  );

  if (prompts.length === 0) return null;

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
        <h2 className="text-base font-semibold">Opportunity Prompts</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Industry prompts where your brand ranks poorly or is absent
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <th className="pb-3 pr-4">Prompt</th>
              <th className="pb-3 px-4 text-center">Your Rank</th>
              <th className="pb-3 pl-4">Competitors Present Before Your Brand</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr
                key={i}
                className="border-b border-border/50 last:border-0"
              >
                <td className="py-3 pr-4 max-w-md">
                  <span className="font-medium">{p.prompt}</span>
                </td>
                <td className="py-3 px-4 text-center">
                  {p.rank === null ? (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Absent
                    </span>
                  ) : (
                    <span className="font-medium tabular-nums text-muted-foreground">
                      #{p.rank}
                    </span>
                  )}
                </td>
                <td className="py-3 pl-4 text-muted-foreground">
                  {p.competitors.length > 0
                    ? p.competitors.join(" · ")
                    : "\u2014"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
