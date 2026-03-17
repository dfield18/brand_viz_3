"use client";

import type { TopPromptWin } from "@/types/api";
import { Trophy } from "lucide-react";

interface TopPromptWinsProps {
  wins: TopPromptWin[];
}

const CLUSTER_LABELS: Record<string, string> = {
  direct: "Direct",
  related: "Related",
  comparative: "Comparative",
  network: "Network",
  industry: "Industry",
};

export function TopPromptWins({ wins }: TopPromptWinsProps) {
  if (wins.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No #1 rankings yet. Run more prompts to find wins.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <th className="pb-3 pr-4">Prompt</th>
            <th className="pb-3 px-4">Type</th>
            <th className="pb-3 pl-4 text-right">Rank</th>
          </tr>
        </thead>
        <tbody>
          {wins.map((win, i) => (
            <tr
              key={i}
              className="border-b border-border/50 last:border-0"
            >
              <td className="py-3 pr-4 max-w-md">
                <span className="font-medium">{win.prompt}</span>
              </td>
              <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                {CLUSTER_LABELS[win.cluster] ?? win.cluster}
              </td>
              <td className="py-3 pl-4 text-right">
                <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                  <Trophy className="h-3.5 w-3.5" />
                  #{win.rank}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
