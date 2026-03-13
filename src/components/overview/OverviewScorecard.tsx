"use client";

import { Info } from "lucide-react";

interface Props {
  visibilityScore: number;
  sentimentScore: number;
  dominantFrame: { name: string; percentage: number } | null;
  topSourceType: { category: string; count: number; totalSources: number } | null;
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

function getVisibilityBadge(score: number): { text: string; color: string } {
  if (score >= 75) return { text: "Excellent", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (score >= 50) return { text: "Good", color: "text-blue-700 bg-blue-50 border-blue-200" };
  if (score >= 25) return { text: "Fair", color: "text-amber-700 bg-amber-50 border-amber-200" };
  return { text: "Low", color: "text-red-700 bg-red-50 border-red-200" };
}

function getSentimentBadge(score: number): { text: string; color: string } {
  if (score >= 70) return { text: "Very Positive", color: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (score >= 50) return { text: "Positive", color: "text-blue-700 bg-blue-50 border-blue-200" };
  if (score >= 30) return { text: "Mixed", color: "text-amber-700 bg-amber-50 border-amber-200" };
  return { text: "Negative", color: "text-red-700 bg-red-50 border-red-200" };
}


const SOURCE_LABELS: Record<string, string> = {
  news_media: "News Media",
  reviews: "Reviews",
  ecommerce: "E-Commerce",
  reference: "Reference",
  video: "Video",
  social_media: "Social Media",
  blog_forum: "Blogs & Forums",
  brand_official: "Brand Official",
  academic: "Academic",
  government: "Government",
  other: "Other",
};

const SOURCE_COLORS: Record<string, string> = {
  news_media: "bg-blue-500",
  reviews: "bg-amber-500",
  ecommerce: "bg-emerald-500",
  reference: "bg-slate-400",
  video: "bg-rose-400",
  social_media: "bg-violet-500",
  blog_forum: "bg-orange-400",
  brand_official: "bg-cyan-500",
  academic: "bg-indigo-500",
  government: "bg-teal-500",
  other: "bg-gray-400",
};

interface CardConfig {
  label: string;
  tooltip: string;
  badge: { text: string; color: string };
  description: string;
  render: () => React.ReactNode;
}

export function OverviewScorecard({ visibilityScore, sentimentScore, dominantFrame, topSourceType }: Props) {
  const cards: CardConfig[] = [
    {
      label: "AI VISIBILITY SCORE",
      tooltip: "A composite score (0–100) combining brand recall, share of voice, ranking position, and top-result rate across AI platforms.",
      badge: getVisibilityBadge(visibilityScore),
      description: "Overall AI presence across all platforms",
      render: () => (
        <div className="relative">
          <DonutRing percentage={visibilityScore} color="var(--chart-1)" size={84} strokeWidth={8} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold tabular-nums">{visibilityScore}</span>
          </div>
        </div>
      ),
    },
    {
      label: "SENTIMENT SCORE",
      tooltip: "Net sentiment across AI responses — the percentage of positive responses minus negative, normalized to 0–100.",
      badge: getSentimentBadge(sentimentScore),
      description: "How positively AI models talk about you",
      render: () => (
        <div className="relative">
          <DonutRing
            percentage={sentimentScore}
            color={sentimentScore >= 50 ? "var(--chart-4)" : "var(--destructive)"}
            size={84}
            strokeWidth={8}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold tabular-nums">{sentimentScore}</span>
          </div>
        </div>
      ),
    },
    {
      label: "DOMINANT NARRATIVE",
      tooltip: "The narrative frame AI models most frequently use when discussing your brand. The percentage reflects how often this frame appears.",
      badge: dominantFrame
        ? { text: `${dominantFrame.percentage}%`, color: "text-violet-700 bg-violet-50 border-violet-200" }
        : { text: "N/A", color: "text-muted-foreground bg-muted border-border" },
      description: "Primary story AI tells about your brand",
      render: () => (
        <div className="flex flex-col items-center gap-1.5 px-2">
          <span className="text-base font-bold text-center leading-tight line-clamp-2">
            {dominantFrame?.name ?? "\u2014"}
          </span>
          {dominantFrame && (
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-violet-500 transition-all"
                style={{ width: `${dominantFrame.percentage}%` }}
              />
            </div>
          )}
        </div>
      ),
    },
    {
      label: "TOP SOURCE TYPE",
      tooltip: "The category of sources most frequently cited alongside your brand in AI responses.",
      badge: topSourceType
        ? { text: `${Math.round((topSourceType.count / topSourceType.totalSources) * 100)}%`, color: "text-blue-700 bg-blue-50 border-blue-200" }
        : { text: "N/A", color: "text-muted-foreground bg-muted border-border" },
      description: "Most common source category citing your brand",
      render: () => {
        if (!topSourceType) {
          return <span className="text-base font-bold">{"\u2014"}</span>;
        }
        const label = SOURCE_LABELS[topSourceType.category] ?? topSourceType.category;
        const barColor = SOURCE_COLORS[topSourceType.category] ?? "bg-gray-400";
        const pct = Math.round((topSourceType.count / topSourceType.totalSources) * 100);
        return (
          <div className="flex flex-col items-center gap-1.5 px-2">
            <span className="text-base font-bold text-center leading-tight">
              {label}
            </span>
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${barColor} transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {pct}% of citations
            </span>
          </div>
        );
      },
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

          {/* Visual */}
          <div className="flex items-center justify-center mb-4 h-[90px]">
            {card.render()}
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
        </div>
      ))}
    </div>
  );
}
