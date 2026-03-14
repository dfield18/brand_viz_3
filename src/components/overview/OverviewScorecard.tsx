"use client";

interface Props {
  visibilityScore: number;
  sentimentScore: number;
  dominantFrame: { name: string; percentage: number } | null;
  topSourceType: { category: string; count: number; totalSources: number } | null;
}

function DonutRing({ percentage, color, size = 56, strokeWidth = 6 }: { percentage: number; color: string; size?: number; strokeWidth?: number }) {
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

function getVisibilityColor(score: number): string {
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-blue-600";
  if (score >= 25) return "text-amber-600";
  return "text-red-500";
}

function getSentimentColor(score: number): string {
  if (score >= 70) return "text-emerald-600";
  if (score >= 50) return "text-blue-600";
  if (score >= 30) return "text-amber-600";
  return "text-red-500";
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

export function OverviewScorecard({ visibilityScore, sentimentScore, dominantFrame, topSourceType }: Props) {
  const sourcePct = topSourceType ? Math.round((topSourceType.count / topSourceType.totalSources) * 100) : 0;
  const sourceLabel = topSourceType ? (SOURCE_LABELS[topSourceType.category] ?? topSourceType.category) : null;
  const sourceBarColor = topSourceType ? (SOURCE_COLORS[topSourceType.category] ?? "bg-gray-400") : "";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* AI Visibility */}
      <div
        className="rounded-xl border border-border bg-card px-4 py-4 shadow-kpi cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => document.getElementById("key-insights")?.scrollIntoView({ behavior: "smooth", block: "start" })}
      >
        <p className="text-[11px] font-medium text-muted-foreground mb-3">AI Visibility</p>
        <div className="flex items-center gap-3">
          <div className="relative">
            <DonutRing percentage={visibilityScore} color="var(--chart-1)" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold tabular-nums">{visibilityScore}</span>
            </div>
          </div>
          <span className={`text-xs font-medium ${getVisibilityColor(visibilityScore)}`}>
            /100
          </span>
        </div>
      </div>

      {/* Sentiment */}
      <div
        className="rounded-xl border border-border bg-card px-4 py-4 shadow-kpi cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => document.getElementById("narrative-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
      >
        <p className="text-[11px] font-medium text-muted-foreground mb-3">Sentiment</p>
        <div className="flex items-center gap-3">
          <div className="relative">
            <DonutRing
              percentage={sentimentScore}
              color={sentimentScore >= 50 ? "var(--chart-4)" : "var(--destructive)"}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-bold tabular-nums">{sentimentScore}</span>
            </div>
          </div>
          <span className={`text-xs font-medium ${getSentimentColor(sentimentScore)}`}>
            /100
          </span>
        </div>
      </div>

      {/* Dominant Narrative */}
      <div
        className="rounded-xl border border-border bg-card px-4 py-4 shadow-kpi cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => document.getElementById("narrative-section")?.scrollIntoView({ behavior: "smooth", block: "start" })}
      >
        <p className="text-[11px] font-medium text-muted-foreground mb-3">Top Narrative</p>
        <p className="text-sm font-semibold leading-tight line-clamp-2">
          {dominantFrame?.name ?? "\u2014"}
        </p>
        {dominantFrame && (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${dominantFrame.percentage}%` }} />
            </div>
            <span className="text-[11px] font-medium tabular-nums text-violet-600">{dominantFrame.percentage}%</span>
          </div>
        )}
      </div>

      {/* Top Source */}
      <div
        className="rounded-xl border border-border bg-card px-4 py-4 shadow-kpi cursor-pointer hover:border-primary/40 transition-colors"
        onClick={() => document.getElementById("sources-trend")?.scrollIntoView({ behavior: "smooth", block: "start" })}
      >
        <p className="text-[11px] font-medium text-muted-foreground mb-3">Top Source</p>
        <p className="text-sm font-semibold leading-tight">
          {sourceLabel ?? "\u2014"}
        </p>
        {topSourceType && (
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${sourceBarColor} transition-all`} style={{ width: `${sourcePct}%` }} />
            </div>
            <span className="text-[11px] font-medium tabular-nums text-muted-foreground">{sourcePct}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
