"use client";

import { useState, useRef } from "react";
import { Trophy, AlertTriangle, ExternalLink } from "lucide-react";
import type { TopPromptWin, WorstPerformingPrompt } from "@/types/api";
import { useResponseDetail } from "@/lib/useResponseDetail";

interface PromptWinsAndOpportunitiesProps {
  wins: TopPromptWin[];
  opportunities: WorstPerformingPrompt[];
  brandSlug?: string;
  brandName?: string;
  isOrg?: boolean;
}

const CLUSTER_LABELS: Record<string, string> = {
  brand: "Brand",
  industry: "Industry",
};

export function PromptWinsAndOpportunities({ wins, opportunities, brandSlug, brandName, isOrg }: PromptWinsAndOpportunitiesProps) {
  const [tab, setTab] = useState<"wins" | "opportunities">("wins");
  const { openResponse } = useResponseDetail(brandSlug ?? "");
  const scrollRef = useRef<HTMLDivElement>(null);

  const switchTab = (t: "wins" | "opportunities") => {
    setTab(t);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const sortedOpportunities = [...opportunities].sort((a, b) => {
    if (a.rank === null && b.rank !== null) return -1;
    if (a.rank !== null && b.rank === null) return 1;
    if (a.rank === null && b.rank === null) return 0;
    return b.rank! - a.rank!;
  });

  if (wins.length === 0 && opportunities.length === 0) return null;

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold mb-4">Prompt Wins & Opportunities</h2>
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => switchTab("wins")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === "wins"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <Trophy className="h-3.5 w-3.5" />
          Wins
          <span className={`ml-1 text-xs tabular-nums ${tab === "wins" ? "text-background/70" : "text-muted-foreground"}`}>
            {wins.length}
          </span>
        </button>
        <button
          onClick={() => switchTab("opportunities")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === "opportunities"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Opportunities
          <span className={`ml-1 text-xs tabular-nums ${tab === "opportunities" ? "text-background/70" : "text-muted-foreground"}`}>
            {opportunities.length}
          </span>
        </button>
      </div>

      <p className="text-xs text-muted-foreground mb-4">
        {tab === "wins"
          ? `Prompts where ${brandName || "this brand"} ranks #1`
          : `Industry prompts where ${brandName || "this brand"} ranks poorly or is absent`}
      </p>

      <div ref={scrollRef} className="overflow-x-auto max-h-[340px] overflow-y-auto">
        {tab === "wins" ? (
          wins.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No #1 rankings yet. Run more prompts to find {brandName ? `${brandName}'s` : "the brand's"} wins.
            </p>
          ) : (
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-[68%]" />
                <col className="w-[18%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <th className="pb-3 pr-4">Prompt</th>
                  <th className="pb-3 px-4">Type</th>
                  <th className="pb-3 pl-4">Rank</th>
                </tr>
              </thead>
              <tbody>
                {wins.map((win, i) => (
                  <tr
                    key={i}
                    className={`border-b border-border/50 last:border-0 ${brandSlug ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
                    onClick={brandSlug ? () => openResponse({ promptText: win.prompt, brandName, scopeMode: "query_universe" }) : undefined}
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium truncate">{win.prompt}</span>
                        {brandSlug && <ExternalLink className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                      {CLUSTER_LABELS[win.cluster] ?? win.cluster}
                    </td>
                    <td className="py-3 pl-4">
                      <span className="inline-flex items-center gap-1 text-amber-600 font-semibold">
                        <Trophy className="h-3.5 w-3.5" />
                        #{win.rank}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          opportunities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No opportunity prompts found.
            </p>
          ) : (
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-[55%]" />
                <col className="w-[15%]" />
                <col className="w-[30%]" />
              </colgroup>
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <th className="pb-3 pr-4">Prompt</th>
                  <th className="pb-3 px-4 text-center">{brandName || "Brand"} Rank</th>
                  <th className="pb-3 pl-4">{isOrg ? "Organizations" : "Competitors"} Mentioned Before {brandName || "This Brand"}</th>
                </tr>
              </thead>
              <tbody>
                {sortedOpportunities.map((p, i) => (
                  <tr
                    key={i}
                    className={`border-b border-border/50 last:border-0 ${brandSlug ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
                    onClick={brandSlug ? () => openResponse({ promptText: p.prompt, brandName, scopeMode: "query_universe" }) : undefined}
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium truncate">{p.prompt}</span>
                        {brandSlug && <ExternalLink className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
                      </div>
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
                    <td className="py-3 pl-4 text-muted-foreground truncate">
                      {p.competitors.length > 0 ? p.competitors.join(" · ") : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </section>
  );
}
