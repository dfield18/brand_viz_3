"use client";

import type { ReactNode } from "react";
import { Info, TrendingUp, TrendingDown } from "lucide-react";
import type { KpiDeltas } from "@/types/api";

interface OverviewScorecardProps {
  overallMentionRate: number;
  kpiDeltas: KpiDeltas | null;
  brandName?: string;
  /** Industry label used in the Mention Rate description (e.g. "athletic
   *  apparel", "electric vehicles"). Falls back to "industry" when null/
   *  empty so the copy still reads naturally. */
  industry?: string | null;
  /** Category tag from classifyBrandCategory ("commercial" or
   *  "political_advocacy"). Picks the right word in the Mention Rate
   *  description — "brand" vs "politician" vs "organization" —
   *  instead of calling Donald Trump a brand. */
  category?: string | null;
  dominantFrames: { name: string; percentage: number }[];
  sentimentSplit: { positive: number; neutral: number; negative: number } | null;
  topSourceType?: { category: string; count: number; totalSources: number } | null;
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


function getVisibilityBadge(rate: number): { text: string; color: string } {
  if (rate >= 80) return { text: "High", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (rate >= 50) return { text: "Moderate", color: "text-amber-700 bg-amber-50 border-amber-200" };
  if (rate >= 25) return { text: "Low", color: "text-orange-700 bg-orange-50 border-orange-200" };
  return { text: "Very Low", color: "text-red-700 bg-red-50 border-red-200" };
}

function getSentimentBadge(split: { positive: number; neutral: number; negative: number }): { text: string; color: string } {
  if (split.positive >= 60) return { text: "Strongly positive", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (split.positive >= 40) return { text: "Mostly positive", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (split.negative >= 40) return { text: "Mostly negative", color: "text-red-700 bg-red-50 border-red-200" };
  if (split.neutral >= 50) return { text: "Mostly neutral", color: "text-gray-600 bg-gray-50 border-gray-200" };
  return { text: "Mixed sentiment", color: "text-amber-700 bg-amber-50 border-amber-200" };
}

function SentimentBar({ split }: { split: { positive: number; neutral: number; negative: number } }) {
  return (
    <div className="w-full space-y-1.5">
      <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-muted/50">
        {split.positive > 0 && (
          <div className="bg-emerald-500 transition-all duration-300" style={{ width: `${split.positive}%` }} />
        )}
        {split.neutral > 0 && (
          <div className="bg-gray-400 transition-all duration-300" style={{ width: `${split.neutral}%` }} />
        )}
        {split.negative > 0 && (
          <div className="bg-red-400 transition-all duration-300" style={{ width: `${split.negative}%` }} />
        )}
      </div>
      <div className="flex justify-between text-[10px] px-0.5">
        <div className="flex flex-col items-center">
          <span className="text-emerald-600 font-medium">{split.positive}%</span>
          <span className="text-muted-foreground">Positive</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-gray-400 font-medium">{split.neutral}%</span>
          <span className="text-muted-foreground">Neutral</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-red-500 font-medium">{split.negative}%</span>
          <span className="text-muted-foreground">Negative</span>
        </div>
      </div>
    </div>
  );
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
  isNarrative?: boolean;
  isSentiment?: boolean;
  sentimentData?: { positive: number; neutral: number; negative: number };
  sentimentLabel?: string;
  narrativeFrames?: { name: string; percentage: number }[];
  scrollTarget?: string;
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  news_media: "News & Media",
  reviews: "Reviews",
  ecommerce: "E-Commerce",
  reference: "Reference (encyclopedias, data portals)",
  video: "Video",
  social_media: "Social Media",
  blog_forum: "Blogs & Forums",
  brand_official: "Brand Official",
  academic: "Academic",
  government: "Government",
  technology: "Technology",
  other: "Other",
};

export function OverviewScorecard({
  overallMentionRate,
  kpiDeltas,
  brandName = "Brand",
  industry,
  dominantFrames,
  sentimentSplit,
  topSourceType,
}: OverviewScorecardProps) {
  const topFrame = dominantFrames[0] ?? null;
  const industryLabel = industry?.trim() || "industry";
  const cards: CardConfig[] = [
    {
      label: "BRAND RECALL",
      value: `${Math.round(overallMentionRate)}%`,
      percentage: overallMentionRate,
      color: "var(--chart-1)",
      badge: getVisibilityBadge(overallMentionRate),
      description: `% of broad ${industryLabel} prompts where AI mentions ${brandName}`,
      tooltip: "We ask AI generic questions about the industry without naming any brand. This measures how often AI brings up the brand on its own.",
      delta: kpiDeltas?.mentionRate ?? null,
      deltaFormat: (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} pts vs prior month`,
    },
    {
      label: dominantFrames.length > 1 ? "TOP MESSAGES" : "TOP MESSAGE",
      value: topFrame ? `${topFrame.percentage}%` : "\u2014",
      percentage: topFrame?.percentage ?? 0,
      color: "hsl(263, 70%, 55%)",
      badge: topFrame
        ? { text: topFrame.name, color: "text-violet-700 bg-violet-50 border-violet-200" }
        : { text: "No data", color: "text-muted-foreground bg-muted/50 border-border" },
      description: dominantFrames.length > 1
        ? `${dominantFrames.length} themes tied at ${topFrame?.percentage}% of responses`
        : "The most common way AI describes this brand",
      tooltip: "The most common angle or perspective AI uses when talking about this brand, based on analysis of AI responses.",
      isNarrative: true,
      narrativeFrames: dominantFrames.length > 0 ? dominantFrames : undefined,
      delta: null,
      deltaFormat: () => "",
      scrollTarget: "narrative-section",
    },
    (() => {
      const dominant = sentimentSplit
        ? (sentimentSplit.positive >= sentimentSplit.neutral && sentimentSplit.positive >= sentimentSplit.negative
            ? { pct: sentimentSplit.positive, label: "Positive" }
            : sentimentSplit.negative >= sentimentSplit.neutral
              ? { pct: sentimentSplit.negative, label: "Negative" }
              : { pct: sentimentSplit.neutral, label: "Neutral" })
        : null;
      return {
      label: "SENTIMENT",
      value: dominant ? `${dominant.pct}%` : "\u2014",
      percentage: dominant?.pct ?? 0,
      color: "hsl(160, 60%, 45%)",
      badge: sentimentSplit
        ? getSentimentBadge(sentimentSplit)
        : { text: "No data", color: "text-muted-foreground bg-muted/50 border-border" },
      description: dominant ? `${dominant.pct}% of AI responses are ${dominant.label.toLowerCase()} in tone` : "How positive or negative AI is about you",
      tooltip: "Whether AI describes this brand in a positive, neutral, or negative way across all responses.",
      isSentiment: true,
      sentimentData: sentimentSplit ?? undefined,
      sentimentLabel: dominant?.label,
      delta: null,
      deltaFormat: () => "",
      scrollTarget: "narrative-section",
    };
    })(),
    (() => {
      const sourcePct = topSourceType ? Math.round((topSourceType.count / topSourceType.totalSources) * 100) : 0;
      const sourceLabel = topSourceType ? (SOURCE_TYPE_LABELS[topSourceType.category] ?? topSourceType.category) : null;
      return {
        label: "MOST CITED SOURCE TYPE",
        value: topSourceType ? `${sourcePct}%` : "\u2014",
        percentage: sourcePct,
        color: "var(--chart-4)",
        badge: sourceLabel
          ? { text: sourceLabel, color: "text-blue-700 bg-blue-50 border-blue-200" }
          : { text: "No data", color: "text-muted-foreground bg-muted/50 border-border" },
        description: "The most common type of source AI cites",
        tooltip: "The category of sources (e.g., News, Reviews, Reference) most frequently cited by AI when discussing this brand.",
        delta: null,
        deltaFormat: () => "",
        scrollTarget: "sources-trend",
      };
    })(),
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
            {card.isSentiment && card.sentimentData ? (
              <div className="w-full px-2 flex flex-col items-center justify-center gap-2">
                <span className="text-2xl font-bold tabular-nums">{card.value} {card.sentimentLabel}</span>
                <SentimentBar split={card.sentimentData} />
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
          <div className="flex flex-col items-center gap-1.5 mb-3">
            {card.isNarrative && card.narrativeFrames && card.narrativeFrames.length > 1 ? (
              <div className="relative group flex flex-col items-center gap-1">
                {card.narrativeFrames.slice(0, 2).map((f) => (
                  <span key={f.name} className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border text-center leading-snug ${card.badge.color}`}>
                    {f.name}
                  </span>
                ))}
                {card.narrativeFrames.length > 2 && (
                  <span className="text-[10px] text-muted-foreground">+{card.narrativeFrames.length - 2} more</span>
                )}
                {/* Hover tooltip with all frames */}
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-50 hidden group-hover:block w-56 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md">
                  <p className="font-medium mb-1.5">Tied narratives ({card.narrativeFrames[0].percentage}% each):</p>
                  <ul className="space-y-1">
                    {card.narrativeFrames.map((f) => (
                      <li key={f.name} className="text-muted-foreground">{f.name}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border text-center leading-snug ${card.badge.color} ${card.isNarrative ? "" : ""}`}>
                {card.badge.text}
              </span>
            )}
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground text-center leading-relaxed mt-auto">
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
