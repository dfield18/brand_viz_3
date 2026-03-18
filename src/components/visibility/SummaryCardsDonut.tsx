"use client";

import type { ReactNode } from "react";
import { Info, TrendingUp, TrendingDown } from "lucide-react";
import type { KpiDeltas } from "@/types/api";

type MetricTab = "visibility" | "sov" | "topResult";

interface SummaryCardsDonutProps {
  overallMentionRate: number;
  shareOfVoice: number;
  avgRankScore: number;
  firstMentionRate: number;
  kpiDeltas: KpiDeltas | null;
  brandName?: string;
  onCardClick?: (metric: MetricTab) => void;
  activeMetric?: MetricTab;
  sparklines?: { visibility: number[]; sov: number[]; topResult: number[] };
  topSourceType?: { category: string; count: number; totalSources: number } | null;
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
  metricKey?: MetricTab;
  sparkKey?: "visibility" | "sov" | "topResult";
  scrollTarget?: string;
}

function MiniSparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min;
  const w = 48;
  const h = 18;
  const pad = 2;
  const trending = points[points.length - 1] - points[0];
  const isFlat = range < 1 && Math.abs(trending) <= 0.5;

  if (isFlat) {
    // Flat trend: show a dashed line with "Even" label
    const midY = h / 2;
    return (
      <span className="flex items-center gap-1.5">
        <svg width={w} height={h} className="shrink-0">
          <line x1={pad} y1={midY} x2={w - pad} y2={midY} stroke="rgb(156 163 175)" strokeWidth={2} strokeLinecap="round" strokeDasharray="5 4" />
        </svg>
        <span className="text-[10px] text-muted-foreground font-medium">Even</span>
      </span>
    );
  }

  const coords = points.map((v, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / (range || 1)) * (h - pad * 2);
    return `${x},${y}`;
  });
  const color = trending > 0.5 ? "rgb(16 185 129)" : trending < -0.5 ? "rgb(239 68 68)" : "rgb(156 163 175)";
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline points={coords.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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

const SOURCE_TYPE_LABELS: Record<string, string> = {
  news_media: "News & Media",
  reviews: "Reviews",
  ecommerce: "E-Commerce",
  reference: "Reference",
  video: "Video",
  social_media: "Social Media",
  blog_forum: "Blogs & Forums",
  brand_official: "Brand Official",
  academic: "Academic",
  government: "Government",
  technology: "Technology",
  other: "Other",
};

export function SummaryCardsDonut({
  overallMentionRate,
  shareOfVoice,
  avgRankScore,
  firstMentionRate,
  kpiDeltas,
  brandName = "Brand",
  onCardClick,
  activeMetric,
  sparklines,
  topSourceType,
}: SummaryCardsDonutProps) {
  const visibilityBadge = getVisibilityBadge(overallMentionRate);
  const sovBadge = getSovBadge(shareOfVoice);
  const topResultBadge = getTopResultBadge(firstMentionRate);
  const sourcePct = topSourceType ? Math.round((topSourceType.count / topSourceType.totalSources) * 100) : 0;
  const sourceLabel = topSourceType ? (SOURCE_TYPE_LABELS[topSourceType.category] ?? topSourceType.category) : null;

  const cards: DonutCardConfig[] = [
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
      metricKey: "visibility",
      sparkKey: "visibility",
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
      metricKey: "sov",
      sparkKey: "sov",
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
      metricKey: "topResult",
      sparkKey: "topResult",
    },
    {
      label: "MOST CITED SOURCE TYPE",
      value: topSourceType ? `${sourcePct}%` : "\u2014",
      percentage: sourcePct,
      color: "var(--chart-4)",
      badge: sourceLabel
        ? { text: sourceLabel, color: "text-blue-700 bg-blue-50 border-blue-200" }
        : { text: "No data", color: "text-muted-foreground bg-muted/50 border-border" },
      description: "The category of website AI references most",
      tooltip: "The kind of website AI platforms reference most often (e.g., news sites, review sites, official brand pages). This shows what type of content AI trusts most in this space.",
      delta: null,
      deltaFormat: () => "",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card) => {
        const isActive = card.metricKey && activeMetric === card.metricKey;
        const isClickable = (!!card.metricKey && !!onCardClick) || !!card.scrollTarget;
        const sparkData = card.sparkKey && sparklines?.[card.sparkKey];
        return (
        <div
          key={card.label}
          className={`rounded-xl bg-card px-5 py-5 shadow-kpi flex flex-col transition-colors border-l-[3px] ${isActive ? "ring-1 ring-primary/20" : ""} ${isClickable ? "cursor-pointer hover:border-l-primary/60" : ""}`}
          style={{ borderLeftColor: card.color || "var(--border)" }}
          onClick={() => {
            if (card.metricKey && onCardClick) {
              onCardClick(card.metricKey);
            } else if (card.scrollTarget) {
              document.getElementById(card.scrollTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }
          }}
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

          {/* Donut */}
          <div className="flex items-center justify-center mb-4 h-[90px]">
            <div className="relative">
              <DonutRing percentage={card.percentage} color={card.color} size={84} strokeWidth={8} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold tabular-nums">{card.value}</span>
              </div>
            </div>
          </div>

          {/* Badge + Sparkline */}
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${card.badge.color}`}>
              {card.badge.text}
            </span>
            {sparkData && sparkData.length >= 2 && (
              <div className="flex items-center gap-1">
                <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">Trend</span>
                <MiniSparkline points={sparkData} />
              </div>
            )}
          </div>

          {/* Description */}
          <p className="text-[11px] text-muted-foreground text-center leading-relaxed mt-auto">
            {card.description}
          </p>

          {/* WoW Delta */}
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
        );
      })}
    </div>
  );
}
