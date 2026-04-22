"use client";

import { Eye, PieChart, Award, Trophy, Info, TrendingUp, TrendingDown } from "lucide-react";
import type { KpiDeltas } from "@/types/api";
import { subjectNoun } from "@/lib/subjectNoun";

interface SummaryStatsProps {
  overallMentionRate: number;
  shareOfVoice: number;
  avgRankScore: number;
  firstMentionRate: number;
  totalRuns: number;
  totalMentions: number;
  kpiDeltas: KpiDeltas | null;
  brandName?: string;
  category?: string | null;
}

interface CardConfig {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtitle: string;
  tooltip: React.ReactNode;
  iconColor: string;
  delta: number | null;
  invertDelta?: boolean; // true = lower is better (avg rank)
  deltaFormat: (v: number) => string;
}

export function SummaryStats({
  overallMentionRate,
  shareOfVoice,
  avgRankScore,
  firstMentionRate,
  totalRuns,
  totalMentions,
  kpiDeltas,
  brandName = "Brand",
  category,
}: SummaryStatsProps) {
  const noun = subjectNoun(brandName, category);

  const cards: CardConfig[] = [
    {
      Icon: Eye,
      label: "Mention Rate",
      value: `${overallMentionRate.toFixed(1)}%`,
      subtitle: `${totalMentions} mentions across ${totalRuns} prompts`,
      tooltip: `Percentage of prompts where the ${noun} was mentioned at all in the AI response, regardless of prominence.`,
      iconColor: "text-chart-1",
      delta: kpiDeltas?.mentionRate ?? null,
      deltaFormat: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}pp`,
    },
    {
      Icon: PieChart,
      label: "Share of Voice",
      value: `${shareOfVoice}%`,
      subtitle: `${noun === "brand" ? "Brand's" : `${noun.charAt(0).toUpperCase()}${noun.slice(1)}'s`} share of entity mentions`,
      tooltip: `Percentage of all entity mentions across AI responses that belong to this ${noun}. Higher values mean the ${noun} dominates the conversation.`,
      iconColor: "text-chart-3",
      delta: kpiDeltas?.shareOfVoice ?? null,
      deltaFormat: (v) => `${v > 0 ? "+" : ""}${v}pp`,
    },
    {
      Icon: Award,
      label: "Avg Position",
      value: avgRankScore ? avgRankScore.toFixed(2) : "\u2014",
      subtitle: "1st = mentioned before competitors",
      tooltip: `Average rank position when the ${noun} is mentioned. Lower is better \u2014 1st means the ${noun} is named before any competitors.`,
      iconColor: "text-chart-2",
      delta: kpiDeltas?.avgRank ?? null,
      invertDelta: true,
      deltaFormat: (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}`,
    },
    {
      Icon: Trophy,
      label: "Top Result Rate",
      value: `${firstMentionRate}%`,
      subtitle: `Prompts where ${noun} is the #1 result`,
      tooltip: `Percentage of industry prompts where the ${noun} is the first entity mentioned in the AI response, indicating top-of-mind positioning.`,
      iconColor: "text-chart-4",
      delta: kpiDeltas?.firstMentionRate ?? null,
      deltaFormat: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}pp`,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => {
        const isPositive = card.delta !== null && card.delta !== 0
          ? card.invertDelta ? card.delta < 0 : card.delta > 0
          : null;

        return (
          <div
            key={card.label}
            className="rounded-lg bg-card px-3 py-4 shadow-kpi"
          >
            <div className="flex items-center gap-1.5 mb-3">
              <card.Icon className={`h-3 w-3 shrink-0 ${card.iconColor}`} />
              <span className="text-[11px] font-medium text-muted-foreground truncate">
                {card.label}
              </span>
              <div className="relative group ml-auto shrink-0">
                <Info className="h-3 w-3 text-muted-foreground/40 cursor-default" />
                <div className="absolute right-0 top-full mt-1.5 z-50 hidden group-hover:block w-56 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md">
                  {card.tooltip}
                </div>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-xl font-bold tabular-nums leading-none">
                {card.value}
              </p>
              {card.delta !== null && card.delta !== 0 && (
                <span
                  className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${
                    isPositive ? "text-emerald-600" : "text-red-500"
                  }`}
                  title="Week-over-week change"
                >
                  {isPositive ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {card.deltaFormat(card.delta)} WoW
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              {card.subtitle}
            </p>
          </div>
        );
      })}
    </div>
  );
}
