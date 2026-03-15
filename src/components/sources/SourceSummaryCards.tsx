"use client";

import { useMemo } from "react";
import { Info, TrendingUp } from "lucide-react";
import type { SourceSummary, SourcesScope, EmergingSource, TopDomainRow } from "@/types/api";

interface Props {
  scope: SourcesScope;
  summary: SourceSummary;
  emerging: EmergingSource[];
  topDomains: TopDomainRow[];
  range?: number;
}

/* ── Donut ring (same as visibility/narrative tabs) ─────────────────── */

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

function getCitationBadge(perResponse: number): { text: string; color: string } {
  if (perResponse >= 5) return { text: "Heavily cited", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (perResponse >= 2) return { text: "Well cited", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (perResponse >= 1) return { text: "Moderate citations", color: "text-amber-700 bg-amber-50 border-amber-200" };
  return { text: "Few citations", color: "text-orange-700 bg-orange-50 border-orange-200" };
}

function getDomainBadge(count: number): { text: string; color: string } {
  if (count >= 50) return { text: "Highly diverse", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (count >= 20) return { text: "Good diversity", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (count >= 10) return { text: "Moderate diversity", color: "text-amber-700 bg-amber-50 border-amber-200" };
  return { text: "Limited sources", color: "text-orange-700 bg-orange-50 border-orange-200" };
}

function getCoverageBadge(pct: number): { text: string; color: string } {
  if (pct >= 80) return { text: "High coverage", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (pct >= 50) return { text: "Moderate coverage", color: "text-amber-700 bg-amber-50 border-amber-200" };
  if (pct >= 25) return { text: "Low coverage", color: "text-orange-700 bg-orange-50 border-orange-200" };
  return { text: "Very low coverage", color: "text-red-700 bg-red-50 border-red-200" };
}

function getAuthorityBadge(count: number): { text: string; color: string } {
  if (count >= 5) return { text: "Strong authority base", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (count >= 2) return { text: "Some authority drivers", color: "text-amber-700 bg-amber-50 border-amber-200" };
  if (count >= 1) return { text: "Limited authority", color: "text-orange-700 bg-orange-50 border-orange-200" };
  return { text: "No authority drivers", color: "text-red-700 bg-red-50 border-red-200" };
}

function getEmergingBadge(growthRate: number): { text: string; color: string } {
  if (growthRate >= 200) return { text: "Rapid growth", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (growthRate >= 100) return { text: "Strong growth", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (growthRate >= 50) return { text: "Growing", color: "text-amber-700 bg-amber-50 border-amber-200" };
  return { text: "New source", color: "text-blue-700 bg-blue-50 border-blue-200" };
}

/* ── Main component ────────────────────────────────────────────────── */

const CATEGORY_LABELS: Record<string, string> = {
  reviews: "Reviews",
  news_media: "News & Media",
  video: "Video",
  ecommerce: "E-commerce",
  reference: "Reference",
  social_media: "Social Media",
  government: "Government",
  academic: "Academic",
  blog_forum: "Blog / Forum",
  brand_official: "Brand / Official",
  technology: "Technology",
  other: "Other",
};

interface CardConfig {
  label: string;
  tooltip: string;
  description: string;
  badge: { text: string; color: string };
  donutPct: number;
  donutColor: string;
  donutValue: string;
  visual?: "donut" | "arrow";
  scrollTarget?: string;
}

export default function SourceSummaryCards({ scope, summary, emerging, topDomains, range = 90 }: Props) {
  // Compute source type breakdown
  const typeBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const d of topDomains) {
      const cat = d.category || "other";
      counts[cat] = (counts[cat] ?? 0) + d.citations;
      total += d.citations;
    }
    if (total === 0) return [];
    return Object.entries(counts)
      .map(([category, citations]) => ({
        category,
        label: CATEGORY_LABELS[category] ?? category,
        citations,
        pct: Math.round((citations / total) * 1000) / 10,
      }))
      .sort((a, b) => b.citations - a.citations);
  }, [topDomains]);

  const topType = typeBreakdown[0];

  // Normalize citation density to 0-100 for donut (cap at 10 citations/response = 100%)
  const citationDensityPct = Math.min((summary.citationsPerResponse / 10) * 100, 100);
  // Normalize unique domains for donut (cap at 100 domains = 100%)
  const domainDiversityPct = Math.min((summary.uniqueDomains / 100) * 100, 100);

  const cards: CardConfig[] = [
    {
      label: "SOURCES PER RESPONSE",
      tooltip: "On average, how many source links AI platforms include in each response. More sources means AI is backing up its claims with references.",
      description: `How many links AI includes per answer`,
      badge: getCitationBadge(summary.citationsPerResponse),
      donutPct: citationDensityPct,
      donutColor: "var(--chart-1)",
      donutValue: String(summary.citationsPerResponse),
      scrollTarget: "top-cited",
    },
    {
      label: "UNIQUE WEBSITES CITED",
      tooltip: "How many different websites AI platforms reference. A higher number means AI draws from a wider variety of sources, not just a few sites.",
      description: `How many different websites AI draws from`,
      badge: getDomainBadge(summary.uniqueDomains),
      donutPct: domainDiversityPct,
      donutColor: "var(--chart-3)",
      donutValue: String(summary.uniqueDomains),
      scrollTarget: "domain-details",
    },
  ];

  // Add top source type card if data available
  if (topType) {
    cards.push({
      label: "MOST CITED SOURCE TYPE",
      tooltip: "The kind of website AI platforms reference most often (e.g., news sites, review sites, official brand pages). This shows what type of content AI trusts most in your industry.",
      description: `The category of website AI references most`,
      badge: { text: topType.label, color: "text-blue-700 bg-blue-50 border-blue-200" },
      donutPct: topType.pct,
      donutColor: "var(--chart-4)",
      donutValue: `${topType.pct}%`,
      scrollTarget: "source-types-over-time",
    });
  }

  // Add top emerging source card if data available
  const topEmerging = emerging.length > 0
    ? [...emerging].sort((a, b) => b.growthRate - a.growthRate)[0]
    : null;
  if (topEmerging) {
    const growthPct = Math.min(topEmerging.growthRate, 100);
    cards.push({
      label: "FASTEST GROWING SOURCE",
      tooltip: "The website that AI platforms are citing much more often than before. This could mean new content is gaining trust with AI, or that AI training data is shifting.",
      description: `${topEmerging.domain} is being cited much more often recently`,
      badge: getEmergingBadge(topEmerging.growthRate),
      donutPct: growthPct,
      donutColor: "hsl(160, 60%, 45%)",
      donutValue: `+${Math.round(topEmerging.growthRate)}%`,
      visual: "arrow",
      scrollTarget: "emerging-sources",
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
            <div className="relative group shrink-0">
              <Info className="h-3 w-3 text-muted-foreground/40 cursor-default" />
              <div className="absolute right-0 top-full mt-1.5 z-50 hidden group-hover:block w-52 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md">
                {card.tooltip}
              </div>
            </div>
          </div>

          {/* Visual */}
          <div className="flex items-center justify-center mb-4 h-[90px]">
            {card.visual === "arrow" ? (
              <div className="flex flex-col items-center gap-1">
                <TrendingUp className="h-8 w-8" style={{ color: card.donutColor }} />
                <span className="text-lg font-bold tabular-nums" style={{ color: card.donutColor }}>
                  {card.donutValue}
                </span>
              </div>
            ) : (
              <div className="relative">
                <DonutRing percentage={card.donutPct} color={card.donutColor} size={84} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold tabular-nums">{card.donutValue}</span>
                </div>
              </div>
            )}
          </div>

          {/* Badge */}
          <div className="flex justify-center mb-3">
            <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border text-center ${card.badge.color}`}>
              {card.badge.text}
            </span>
          </div>

          {/* Description */}
          <p className="text-[11px] text-muted-foreground text-center leading-relaxed mt-auto">
            {card.description}
          </p>
        </div>
      ))}
    </div>
  );
}
