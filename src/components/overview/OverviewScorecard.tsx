"use client";

import type { ReactNode } from "react";
import { Info, TrendingUp, TrendingDown } from "lucide-react";
import type { KpiDeltas } from "@/types/api";

interface OverviewScorecardProps {
  overallMentionRate: number;
  avgRankScore: number;
  firstMentionRate: number;
  kpiDeltas: KpiDeltas | null;
  brandName?: string;
  dominantFrame: { name: string; percentage: number } | null;
}

function DonutRing({ percentage, color, size = 80, strokeWidth = 8 }: { percentage: number; color: string; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percentage, 100) / 100) * circumference;
  const center = size / 2;

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/30" />
      <circle
        cx={center} cy={center} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`} className="transition-all duration-500"
      />
    </svg>
  );
}

function PositionScale({ avgRank }: { avgRank: number }) {
  const rounded = Math.round(avgRank);
  const positions = [1, 2, 3, 4, 5];

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-3xl font-bold tabular-nums">{avgRank.toFixed(1)}</span>
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground mr-0.5">Best</span>
        {positions.map((pos) => (
          <div
            key={pos}
            className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-medium ${
              pos === rounded ? "bg-foreground text-background" : "bg-muted/50 text-muted-foreground"
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

interface CardConfig {
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
  isPosition?: boolean;
  isNarrative?: boolean;
  narrativeName?: string;
  scrollTarget?: string;
}

export function OverviewScorecard({
  overallMentionRate,
  avgRankScore,
  firstMentionRate,
  kpiDeltas,
  brandName = "Brand",
  dominantFrame,
}: OverviewScorecardProps) {
  const cards: CardConfig[] = [
    {
      label: "BRAND RECALL",
      value: `${Math.round(overallMentionRate)}%`,
      percentage: overallMentionRate,
      color: "var(--chart-1)",
      badge: getVisibilityBadge(overallMentionRate),
      description: `% of AI answers that mention ${brandName}`,
      tooltip: "Based on general industry questions — prompts that don't mention the brand by name — so results reflect organic AI awareness.",
      delta: kpiDeltas?.mentionRate ?? null,
      deltaFormat: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} pts vs prior month`,
    },
    {
      label: "DOMINANT NARRATIVE",
      value: dominantFrame ? `${dominantFrame.percentage}%` : "\u2014",
      percentage: dominantFrame?.percentage ?? 0,
      color: "hsl(263, 70%, 55%)",
      badge: dominantFrame
        ? { text: dominantFrame.name, color: "text-violet-700 bg-violet-50 border-violet-200" }
        : { text: "No data", color: "text-muted-foreground bg-muted/50 border-border" },
      description: "The main theme AI uses to describe you",
      tooltip: "The most common narrative frame AI models use when discussing this brand, based on structured analysis of AI responses.",
      isNarrative: true,
      narrativeName: dominantFrame?.name ?? null as unknown as string,
      delta: null,
      deltaFormat: () => "",
      scrollTarget: "narrative-section",
    },
    {
      label: "TOP RESULT RATE",
      value: `${Number(firstMentionRate.toFixed(1))}%`,
      percentage: firstMentionRate,
      color: "var(--chart-2)",
      badge: getTopResultBadge(firstMentionRate),
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
      badge: getPositionBadge(avgRankScore),
      description: <>{`Where ${brandName} typically ranks among competitors`}<br /><span className="text-muted-foreground/60">Only counted when {brandName} is mentioned</span></>,
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
          className={`rounded-xl bg-card px-5 py-5 shadow-kpi flex flex-col transition-colors border-l-[3px] ${card.scrollTarget ? "cursor-pointer hover:border-l-primary/60" : ""}`}
          style={{ borderLeftColor: card.color || "var(--border)" }}
          onClick={() => card.scrollTarget && document.getElementById(card.scrollTarget)?.scrollIntoView({ behavior: "smooth", block: "start" })}
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

          {/* Visual */}
          <div className="flex items-center justify-center mb-4 h-[90px]">
            {card.isPosition ? (
              <PositionScale avgRank={avgRankScore || 0} />
            ) : card.isNarrative ? (
              <div className="relative">
                <DonutRing percentage={card.percentage} color={card.color} size={84} strokeWidth={8} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold tabular-nums">{card.value}</span>
                </div>
              </div>
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
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${card.badge.color} ${card.isNarrative ? "max-w-full truncate" : ""}`}>
              {card.badge.text}
            </span>
          </div>

          {/* Description */}
          <p className="text-[11px] text-muted-foreground text-center leading-relaxed mt-auto">
            {card.description}
          </p>

          {/* Delta */}
          {card.delta !== null && card.delta !== 0 && (() => {
            const isGood = card.invertDelta ? card.delta! < 0 : card.delta! > 0;
            return (
              <div className="flex items-center justify-center gap-1 mt-3 pt-3 border-t border-border/50">
                {isGood ? (
                  <TrendingUp className="h-3 w-3 text-emerald-600" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-red-500" />
                )}
                <span className={`text-[11px] font-medium tabular-nums ${isGood ? "text-emerald-600" : "text-red-500"}`}>
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
