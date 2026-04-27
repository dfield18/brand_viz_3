"use client";

import { Info } from "lucide-react";
import type { CompetitionScope, CompetitorRow, WinLossData, FragmentationMetric } from "@/types/api";
import { subjectNoun, subjectNounPlural } from "@/lib/subjectNoun";

interface CompetitionSummaryCardsProps {
  scope: CompetitionScope;
  brandCompetitor: CompetitorRow;
  winLoss: WinLossData;
  fragmentation?: FragmentationMetric;
  brandName: string;
  category?: string | null;
}

/* ── Donut ring (same pattern as visibility tab) ───────────────────── */

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

/* ── Badge helpers ─────────────────────────────────────────────────── */

function getMentionShareBadge(pct: number): { text: string; color: string } {
  if (pct >= 30) return { text: "Strong share", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (pct >= 15) return { text: "Moderate share", color: "text-amber-700 bg-amber-50 border-amber-200" };
  return { text: "Low share", color: "text-orange-700 bg-orange-50 border-orange-200" };
}

function getFragmentationBadge(score: number, peerNounPlural: string): { text: string; color: string } {
  if (score >= 70) return { text: "Highly fragmented", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (score >= 40) return { text: "Moderately concentrated", color: "text-amber-700 bg-amber-50 border-amber-200" };
  return { text: `Dominated by few ${peerNounPlural}`, color: "text-orange-700 bg-orange-50 border-orange-200" };
}

function getWinRateBadge(rate: number): { text: string; color: string } {
  if (rate >= 70) return { text: "Dominant", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (rate >= 50) return { text: "Winning", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (rate >= 35) return { text: "Competitive", color: "text-amber-700 bg-amber-50 border-amber-200" };
  return { text: "Trailing", color: "text-red-700 bg-red-50 border-red-200" };
}

/* ── Main component ────────────────────────────────────────────────── */

interface CardConfig {
  label: string;
  tooltip: string;
  description: React.ReactNode;
  badge: { text: string; color: string };
  donutPct: number;
  donutColor: string;
  donutValue: string;
  scrollTo?: string;
}

export function CompetitionSummaryCards({
  scope,
  brandCompetitor,
  winLoss,
  fragmentation,
  brandName,
  category,
}: CompetitionSummaryCardsProps) {
  const noun = subjectNoun(brandName, category);
  const nounPlural = subjectNounPlural(brandName, category);
  // "Competitors Tracked" reads strangely for advocacy orgs / public
  // figures (they aren't strictly competing), but the dominant
  // alternative would require a much wider rename pass — keep the card
  // label and just swap the body noun. Politicians get "X public figures";
  // advocacy orgs get "X organizations"; commercial brands "X brands".

  // Compute overall win rate
  const totalWins = winLoss.byCompetitor.reduce((s, c) => s + c.wins, 0);
  const totalLosses = winLoss.byCompetitor.reduce((s, c) => s + c.losses, 0);
  const totalMatchups = totalWins + totalLosses;
  const winRate = totalMatchups > 0 ? Math.round((totalWins / totalMatchups) * 100) : 0;

  const cards: CardConfig[] = [
    {
      label: "COMPETITORS TRACKED",
      tooltip: `Total number of ${nounPlural} detected across all AI responses for ${brandName}'s industry.`,
      description: `Number of unique ${nounPlural} AI mentions when discussing ${brandName}'s industry`,
      badge: { text: `${scope.entitiesTracked} ${nounPlural}`, color: "text-blue-700 bg-blue-50 border-blue-200" },
      donutPct: Math.min(scope.entitiesTracked * 5, 100),
      donutColor: "var(--chart-1)",
      donutValue: String(scope.entitiesTracked),
      scrollTo: "brand-breakdown",
    },
    {
      label: `${brandName.toUpperCase()} SHARE OF VOICE`,
      tooltip: `${brandName}'s share of all entity mentions across AI responses. Higher means AI models mention ${brandName} more often relative to peer ${nounPlural}.`,
      description: `${brandName}'s share of all ${noun} mentions across AI responses`,
      badge: getMentionShareBadge(brandCompetitor.mentionShare),
      donutPct: brandCompetitor.mentionShare,
      donutColor: "var(--chart-3)",
      donutValue: `${Math.round(brandCompetitor.mentionShare)}%`,
      scrollTo: "visibility-trend",
    },
    {
      label: "MARKET FRAGMENTATION",
      tooltip: `How spread out AI mentions are across ${nounPlural}. Higher = more ${nounPlural} share the spotlight; lower = a few dominate. Not all mentions are explicit recommendations.`,
      description: `How spread out AI mentions are — not all mentions are explicit recommendations`,
      badge: getFragmentationBadge(fragmentation?.score ?? 0, nounPlural),
      donutPct: fragmentation?.score ?? 0,
      donutColor: "var(--chart-2)",
      donutValue: `${Math.round(fragmentation?.score ?? 0)}`,
      scrollTo: "visibility-sentiment",
    },
    {
      label: "WIN RATE",
      tooltip: `When ${brandName} and a competitor both appear in the same AI response, how often ${brandName} is ranked higher.`,
      description: `A "win" is when AI lists ${brandName} above a competitor in the same response`,
      badge: getWinRateBadge(winRate),
      donutPct: winRate,
      donutColor: "var(--chart-4)",
      donutValue: `${winRate}%`,
      scrollTo: "win-loss",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-xl bg-card px-5 py-5 shadow-kpi flex flex-col border-l-[3px] ${card.scrollTo ? "cursor-pointer hover:border-l-primary/60 hover:shadow-md transition-all" : ""}`}
          style={{ borderLeftColor: card.donutColor || "var(--border)" }}
          onClick={() => {
            if (card.scrollTo) {
              document.getElementById(card.scrollTo)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
              <DonutRing percentage={card.donutPct} color={card.donutColor} size={84} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold tabular-nums">{card.donutValue}</span>
              </div>
            </div>
          </div>

          {/* Badge */}
          <div className="flex justify-center mb-3">
            <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border text-center ${card.badge.color}`}>
              {card.badge.text}
            </span>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground text-center leading-relaxed mt-auto">
            {card.description}
          </p>
        </div>
      ))}
    </div>
  );
}
