"use client";

import { useMemo } from "react";
import { Info, TrendingUp, TrendingDown } from "lucide-react";
import type { NarrativeSentimentSplit, NarrativeFrame, SentimentTrendPoint, NarrativeDeltas } from "@/types/api";

interface NarrativeMetricCardsProps {
  sentimentSplit?: NarrativeSentimentSplit;
  trustRate?: number;
  weaknessRate?: number;
  polarization?: "Low" | "Moderate" | "High";
  frames?: NarrativeFrame[];
  hedgingRate?: number;
  sentimentTrend?: SentimentTrendPoint[];
  narrativeDeltas?: NarrativeDeltas | null;
}

/* ── Mini sparkline (matches visibility tab) ──────────────────────── */

function MiniSparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const w = 48;
  const h = 18;
  const pad = 2;
  const coords = points.map((v, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });
  const trending = points[points.length - 1] - points[0];
  const color = trending > 0.5 ? "rgb(16 185 129)" : trending < -0.5 ? "rgb(239 68 68)" : "rgb(156 163 175)";
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline points={coords.join(" ")} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Donut ring (same as visibility tab) ───────────────────────────── */

function DonutRing({
  percentage,
  color,
  size = 80,
  strokeWidth = 8,
}: {
  percentage: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
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

/* ── Sentiment stacked bar (compact) ───────────────────────────────── */

function SentimentBar({ split }: { split: NarrativeSentimentSplit }) {
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

/* ── Badge helpers ─────────────────────────────────────────────────── */

function getSentimentBadge(split: NarrativeSentimentSplit): { text: string; color: string } {
  if (split.positive >= 60) return { text: "Strongly positive", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (split.positive >= 40) return { text: "Mostly positive", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (split.negative >= 40) return { text: "Mostly negative", color: "text-red-700 bg-red-50 border-red-200" };
  return { text: "Mixed sentiment", color: "text-amber-700 bg-amber-50 border-amber-200" };
}

function getPolarizationBadge(level: string): { text: string; color: string } {
  if (level === "Low") return { text: "Consensus narrative", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (level === "Moderate") return { text: "Some disagreement", color: "text-amber-700 bg-amber-50 border-amber-200" };
  return { text: "Highly divided", color: "text-red-700 bg-red-50 border-red-200" };
}

function getConfidenceBadge(confidence: number): { text: string; color: string } {
  if (confidence >= 85) return { text: "Direct & confident", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (confidence >= 65) return { text: "Some hedging", color: "text-amber-700 bg-amber-50 border-amber-200" };
  return { text: "Heavily hedged", color: "text-red-700 bg-red-50 border-red-200" };
}

const CONFIDENCE_COLOR_CARD = (confidence: number) =>
  confidence >= 85 ? "hsl(160, 60%, 45%)" : confidence >= 65 ? "hsl(38, 92%, 50%)" : "hsl(0, 72%, 55%)";

const CONSISTENCY_PCT: Record<string, number> = { Low: 30, Moderate: 60, High: 85 };
const POLARIZATION_PCT: Record<string, number> = { Low: 20, Moderate: 55, High: 90 };
const POLARIZATION_COLOR: Record<string, string> = {
  Low: "hsl(160, 60%, 45%)",
  Moderate: "hsl(38, 92%, 50%)",
  High: "hsl(0, 72%, 55%)",
};

/* ── Main component ────────────────────────────────────────────────── */

export function NarrativeMetricCards({
  sentimentSplit,
  trustRate,
  weaknessRate,
  polarization,
  frames,
  hedgingRate,
  sentimentTrend,
  narrativeDeltas,
}: NarrativeMetricCardsProps) {
  // Sparkline: extract "all" model positive sentiment over time
  const sentimentSparkline = useMemo(() => {
    if (!sentimentTrend) return [];
    return sentimentTrend
      .filter((t) => t.model === "all")
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((t) => t.positive);
  }, [sentimentTrend]);

  // Find all frames tied for the top percentage
  const topFrames = (() => {
    if (!frames || frames.length === 0) return [];
    const maxPct = frames[0].percentage;
    return frames.filter((f) => f.percentage === maxPct);
  })();

  interface CardConfig {
    label: string;
    tooltip: string;
    description: string;
    badge: { text: string; color: string; pct?: number }[];
    donutPct: number;
    donutColor: string;
    donutValue: string;
    custom?: React.ReactNode;
    delta: number | null;
    deltaFormat: (v: number) => string;
    sparkData?: number[];
    scrollTarget?: string;
  }

  const cards: CardConfig[] = [];

  // 1. Dominant Narrative
  cards.push({
    label: topFrames.length > 1 ? "DOMINANT NARRATIVES" : "DOMINANT NARRATIVE",
    tooltip: "The most common narrative frame AI models use when discussing this brand.",
    description: topFrames.length > 1
      ? `${topFrames.length} frames tied at ${topFrames[0].percentage}% of responses`
      : topFrames.length === 1
        ? `"${topFrames[0].frame}" appears in ${topFrames[0].percentage}% of responses`
        : "No frame data",
    badge: topFrames.length > 0
      ? topFrames.map((f) => ({ text: f.frame, color: "text-blue-700 bg-blue-50 border-blue-200", pct: f.percentage }))
      : [{ text: "No data", color: "text-muted-foreground bg-muted/50 border-border" }],
    donutPct: topFrames[0]?.percentage ?? 0,
    donutColor: "var(--chart-1)",
    donutValue: topFrames.length > 0 ? `${topFrames[0].percentage}%` : "\u2014",
    delta: null,
    deltaFormat: () => "",
    scrollTarget: "narrative-frames",
  });

  // 2. Sentiment
  cards.push({
    label: "SENTIMENT",
    tooltip: "Breakdown of how AI models frame the brand \u2014 positive, neutral, or negative.",
    description: "Distribution of positive, neutral, and negative responses",
    badge: [sentimentSplit ? getSentimentBadge(sentimentSplit) : { text: "No data", color: "text-muted-foreground bg-muted/50 border-border" }],
    donutPct: sentimentSplit?.positive ?? 0,
    donutColor: "hsl(160, 60%, 45%)",
    donutValue: sentimentSplit ? `${sentimentSplit.positive}%` : "\u2014",
    custom: sentimentSplit ? (
      <div className="flex items-center justify-center mb-4 h-[88px]">
        <div className="w-full px-2 flex flex-col items-center justify-center gap-2">
          <span className="text-2xl font-bold tabular-nums">{sentimentSplit.positive}%</span>
          <SentimentBar split={sentimentSplit} />
        </div>
      </div>
    ) : undefined,
    delta: narrativeDeltas?.sentimentPositive ?? null,
    deltaFormat: (v) => `${v > 0 ? "+" : ""}${Math.round(v)} pts`,
    sparkData: sentimentSparkline,
    scrollTarget: "sentiment-trend",
  });

  // 3. Platform Consistency
  const consistencyPct = polarization ? CONSISTENCY_PCT[polarization] ?? 0 : 0;
  cards.push({
    label: "PLATFORM CONSISTENCY",
    tooltip: "Whether AI platforms tell a consistent story about the brand. Low consistency means different platforms describe the brand very differently.",
    description: "AI description consistency across different platforms",
    badge: [polarization ? getPolarizationBadge(polarization) : { text: "No data", color: "text-muted-foreground bg-muted/50 border-border" }],
    donutPct: consistencyPct,
    donutColor: polarization ? POLARIZATION_COLOR[polarization] ?? "hsl(218, 11%, 72%)" : "hsl(218, 11%, 72%)",
    donutValue: `${consistencyPct}%`,
    delta: null,
    deltaFormat: () => "",
    scrollTarget: "sentiment-by-model",
  });

  // 4. Model Confidence (inverted hedging rate)
  if (hedgingRate != null) {
    const confidence = 100 - hedgingRate;
    cards.push({
      label: "MODEL CONFIDENCE",
      tooltip: "Measures how directly AI recommends the brand. Higher confidence means AI gives clear endorsements rather than cautious language like \"it depends,\" \"some people prefer,\" or \"you might want to consider.\"",
      description: "How often AI gives a clear recommendation vs hedging with cautious language",
      badge: [getConfidenceBadge(confidence)],
      donutPct: confidence,
      donutColor: CONFIDENCE_COLOR_CARD(confidence),
      donutValue: `${confidence}%`,
      delta: narrativeDeltas?.confidence ?? null,
      deltaFormat: (v) => `${v > 0 ? "+" : ""}${Math.round(v)} pts`,
      scrollTarget: "strengths-weaknesses",
    });
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl bg-card px-5 py-5 shadow-kpi flex flex-col transition-all${card.scrollTarget ? " cursor-pointer hover:border-primary/40 hover:shadow-md" : ""}`}
          onClick={() => card.scrollTarget && document.getElementById(card.scrollTarget)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-semibold tracking-wide text-muted-foreground">
              {card.label}
            </span>
            <div className="relative group/tip shrink-0">
              <Info className="h-3 w-3 text-muted-foreground/40 cursor-default" />
              <div className="absolute right-0 top-full mt-1.5 z-50 hidden group-hover/tip:block w-52 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md">
                {card.tooltip}
              </div>
            </div>
          </div>

          {/* Donut or Custom Visual */}
          {card.custom ? (
            card.custom
          ) : (
            <div className="flex items-center justify-center mb-4 h-[90px]">
              <div className="relative">
                <DonutRing percentage={card.donutPct} color={card.donutColor} size={84} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`font-bold tabular-nums ${card.donutValue.length > 4 ? "text-xs" : "text-lg"}`}>{card.donutValue}</span>
                </div>
              </div>
            </div>
          )}

          {/* Badge(s) + Sparkline */}
          <div className="flex flex-wrap justify-center items-center gap-1.5 mb-3">
            {card.badge.slice(0, 2).map((b, i) => (
              <span key={i} className={`text-[11px] font-medium rounded-full border text-center px-2.5 py-0.5 ${b.color}`}>
                {b.text}
              </span>
            ))}
            {card.badge.length > 2 && (
              <div className="relative group">
                <span className="text-[11px] font-medium rounded-full border text-center px-2.5 py-0.5 text-muted-foreground bg-muted/50 border-border cursor-default inline-block">
                  +{card.badge.length - 2} more
                </span>
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-50 hidden group-hover:block w-48 rounded-lg border border-border bg-popover p-2.5 shadow-md">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Other narratives</p>
                  {card.badge.slice(2).map((b, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 py-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                        <span className="text-xs text-popover-foreground">{b.text}</span>
                      </div>
                      {b.pct != null && (
                        <span className="text-xs font-medium tabular-nums text-muted-foreground">{b.pct}%</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {card.sparkData && card.sparkData.length >= 2 && (
              <MiniSparkline points={card.sparkData} />
            )}
          </div>

          {/* Description */}
          <p className="text-[11px] text-muted-foreground text-center leading-relaxed mt-auto">
            {card.description}
          </p>

          {/* Delta footer */}
          {card.delta != null && card.delta !== 0 && (
            <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-center gap-1.5">
              {card.delta > 0 ? (
                <TrendingUp className="h-3 w-3 text-emerald-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-500" />
              )}
              <span className={`text-[11px] font-medium tabular-nums ${card.delta > 0 ? "text-emerald-600" : "text-red-600"}`}>
                {card.deltaFormat(card.delta)}
              </span>
              <span className="text-[10px] text-muted-foreground">vs prior month</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
