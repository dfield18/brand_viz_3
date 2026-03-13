"use client";

import type { ReactNode } from "react";
import { Info, TrendingUp, TrendingDown } from "lucide-react";
import type { KpiDeltas } from "@/types/api";

interface SummaryCardsDonutProps {
  overallMentionRate: number;
  shareOfVoice: number;
  avgRankScore: number;
  firstMentionRate: number;
  kpiDeltas: KpiDeltas | null;
  brandName?: string;
}

interface DonutCardConfig {
  label: string;
  value: string;
  percentage: number;
  color: string;
  badge: { text: string; color: string };
  description: ReactNode;
  tooltip: string;
  delta: number | null;
  invertDelta?: boolean;
  deltaFormat: (v: number) => string;
}

function DonutRing({ percentage, color, size = 80, strokeWidth = 8 }: { percentage: number; color: string; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;
  const center = size / 2;

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-muted/30"
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
        className="transition-all duration-500"
      />
    </svg>
  );
}

function PositionScale({ avgRank }: { avgRank: number }) {
  const rounded = Math.round(avgRank);
  const positions = [1, 2, 3, 4, 5];

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-3xl font-bold tabular-nums">
        {avgRank.toFixed(1)}
      </span>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground mr-0.5">Best</span>
        {positions.map((pos) => (
          <div
            key={pos}
            className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-medium ${
              pos === rounded
                ? "bg-foreground text-background"
                : "bg-muted/50 text-muted-foreground"
            }`}
          >
            {pos}
          </div>
        ))}
        <span className="text-[10px] text-muted-foreground ml-0.5">Worst</span>
      </div>
    </div>
  );
}

function getVisibilityBadge(rate: number): { text: string; color: string } {
  if (rate >= 80) return { text: "High", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (rate >= 50) return { text: "Moderate", color: "text-amber-700 bg-amber-50 border-amber-200" };
  if (rate >= 25) return { text: "Low", color: "text-orange-700 bg-orange-50 border-orange-200" };
  return { text: "Very Low", color: "text-red-700 bg-red-50 border-red-200" };
}

function getSovBadge(sov: number): { text: string; color: string } {
  if (sov >= 30) return { text: "Strong", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (sov >= 15) return { text: "Moderate", color: "text-amber-700 bg-amber-50 border-amber-200" };
  return { text: "Low", color: "text-orange-700 bg-orange-50 border-orange-200" };
}

function getTopResultBadge(rate: number): { text: string; color: string } {
  if (rate >= 50) return { text: "Strong", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (rate >= 25) return { text: "Moderate", color: "text-amber-700 bg-amber-50 border-amber-200" };
  return { text: "Weak", color: "text-orange-700 bg-orange-50 border-orange-200" };
}

function getPositionBadge(rank: number): { text: string; color: string } {
  if (rank <= 1.5) return { text: "Leading", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (rank <= 2.5) return { text: "Competitive", color: "text-amber-700 bg-amber-50 border-amber-200" };
  if (rank <= 3.5) return { text: "Mid-Pack", color: "text-orange-700 bg-orange-50 border-orange-200" };
  return { text: "Trailing", color: "text-red-700 bg-red-50 border-red-200" };
}

export function SummaryCardsDonut({
  overallMentionRate,
  shareOfVoice,
  avgRankScore,
  firstMentionRate,
  kpiDeltas,
  brandName = "Brand",
}: SummaryCardsDonutProps) {
  const visibilityBadge = getVisibilityBadge(overallMentionRate);
  const sovBadge = getSovBadge(shareOfVoice);
  const topResultBadge = getTopResultBadge(firstMentionRate);
  const positionBadge = getPositionBadge(avgRankScore);

  const cards: (DonutCardConfig & { isPosition?: boolean })[] = [
    {
      label: "BRAND RECALL",
      value: `${Math.round(overallMentionRate)}%`,
      percentage: overallMentionRate,
      color: "var(--chart-1)",
      badge: visibilityBadge,
      description: `% of AI answers that mention ${brandName}`,
      tooltip: "Based on general industry questions — prompts that don't mention the brand by name — so results reflect organic AI awareness.",
      delta: kpiDeltas?.mentionRate ?? null,
      deltaFormat: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} pts vs prior month`,
    },
    {
      label: "SHARE OF VOICE",
      value: `${Number(shareOfVoice.toFixed(1))}%`,
      percentage: shareOfVoice,
      color: "var(--chart-3)",
      badge: sovBadge,
      description: `% of all AI brand mentions captured by ${brandName}`,
      tooltip: "Based on general industry questions — prompts that don't mention the brand by name — so results reflect organic AI awareness.",
      delta: kpiDeltas?.shareOfVoice ?? null,
      deltaFormat: (v) => `${v > 0 ? "+" : ""}${v} pts vs prior month`,
    },
    {
      label: "TOP RESULT RATE",
      value: `${Number(firstMentionRate.toFixed(1))}%`,
      percentage: firstMentionRate,
      color: "var(--chart-2)",
      badge: topResultBadge,
      description: `% of responses where ${brandName} is the first recommendation`,
      tooltip: "Based on general industry questions — prompts that don't mention the brand by name — so results reflect organic AI awareness.",
      delta: kpiDeltas?.firstMentionRate ?? null,
      deltaFormat: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} pts vs prior month`,
    },
    {
      label: "AVG. POSITION",
      value: avgRankScore ? avgRankScore.toFixed(1) : "\u2014",
      percentage: avgRankScore ? Math.max(0, 100 - (avgRankScore - 1) * 25) : 0,
      color: "var(--chart-2)",
      badge: positionBadge,
      description: `Where ${brandName} typically ranks among competitors`,
      tooltip: "Based on general industry questions — prompts that don't mention the brand by name. Lower is better — 1st means mentioned before competitors.",
      isPosition: true,
      delta: kpiDeltas?.avgRank ?? null,
      invertDelta: true,
      deltaFormat: (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)} pos vs prior month`,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-border bg-card px-5 py-5 shadow-kpi flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-semibold tracking-wide text-muted-foreground">
              {card.label}
            </span>
            <div className="relative group shrink-0">
              <Info className="h-3 w-3 text-muted-foreground/40 cursor-default" />
              <div className="absolute right-0 top-full mt-1.5 z-50 hidden group-hover:block w-52 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md">
                {card.tooltip}
              </div>
            </div>
          </div>

          {/* Donut / Position Scale */}
          <div className="flex items-center justify-center mb-4 h-[90px]">
            {card.isPosition ? (
              <PositionScale avgRank={avgRankScore || 0} />
            ) : (
              <div className="relative">
                <DonutRing percentage={card.percentage} color={card.color} size={84} strokeWidth={8} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold tabular-nums">{card.value}</span>
                </div>
              </div>
            )}
          </div>

          {/* Badge */}
          <div className="flex justify-center mb-3">
            <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${card.badge.color}`}>
              {card.badge.text}
            </span>
          </div>

          {/* Description */}
          <p className="text-[11px] text-muted-foreground text-center leading-relaxed mt-auto">
            {card.description}
          </p>

          {/* WoW Delta */}
          {card.delta !== null && card.delta !== 0 && (() => {
            const isPositive = card.delta! > 0;
            return (
              <div className="flex items-center justify-center gap-1 mt-3 pt-3 border-t border-border/50">
                {isPositive ? (
                  <TrendingUp className="h-3 w-3 text-emerald-600" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <span className={`text-[11px] font-medium tabular-nums ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
                  {card.deltaFormat(card.delta!)}
                </span>
              </div>
            );
          })()}
        </div>
      ))}
    </div>
  );
}
