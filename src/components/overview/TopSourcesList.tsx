"use client";

import { useMemo, useState } from "react";
import type { SourcesResponse, TopDomainRow } from "@/types/api";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { MODEL_LABELS } from "@/lib/constants";

const CATEGORY_LABELS: Record<string, string> = {
  reviews: "Reviews",
  news_media: "News",
  video: "Video",
  ecommerce: "E-commerce",
  reference: "Reference",
  social_media: "Social",
  government: "Gov",
  academic: "Academic",
  blog_forum: "Blog",
  brand_official: "Official",
  technology: "Tech",
  other: "Other",
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  reviews: "product & service ratings",
  news_media: "journalism & media outlets",
  video: "video platforms",
  ecommerce: "online retailers",
  reference: "encyclopedias & data portals",
  social_media: "forums & discussion sites",
  government: "government agency sites",
  academic: "research & journals",
  blog_forum: "blogs & indie publishers",
  brand_official: "brand's own website",
  technology: "developer tools & platforms",
  other: "uncategorized sites",
};

const CATEGORY_BADGE_COLORS: Record<string, string> = {
  reviews: "bg-sky-100 text-sky-700",
  news_media: "bg-indigo-100 text-indigo-700",
  video: "bg-slate-200 text-slate-800",
  ecommerce: "bg-orange-100 text-orange-700",
  reference: "bg-violet-100 text-violet-700",
  social_media: "bg-pink-100 text-pink-700",
  government: "bg-teal-100 text-teal-700",
  academic: "bg-indigo-100 text-indigo-700",
  blog_forum: "bg-lime-100 text-lime-700",
  brand_official: "bg-yellow-100 text-yellow-700",
  technology: "bg-cyan-100 text-cyan-700",
  other: "bg-gray-100 text-gray-600",
};

const DONUT_COLORS: Record<string, string> = {
  reviews: "hsl(200, 70%, 55%)",
  news_media: "hsl(230, 60%, 55%)",
  video: "hsl(0, 65%, 55%)",
  ecommerce: "hsl(155, 60%, 45%)",
  reference: "hsl(270, 55%, 55%)",
  social_media: "hsl(330, 60%, 55%)",
  government: "hsl(210, 15%, 50%)",
  academic: "hsl(240, 50%, 55%)",
  blog_forum: "hsl(25, 70%, 55%)",
  brand_official: "hsl(190, 60%, 50%)",
  technology: "hsl(170, 50%, 45%)",
  other: "hsl(0, 0%, 65%)",
};

/* ─── Mini Donut ──────────────────────────────────────────────────── */

function SourceTypeDonut({ topDomains }: { topDomains: TopDomainRow[] }) {
  const breakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    let total = 0;
    for (const d of topDomains) {
      const cat = d.category || "other";
      counts[cat] = (counts[cat] ?? 0) + d.citations;
      total += d.citations;
    }
    if (total === 0) return { slices: [], total: 0 };
    const slices = Object.entries(counts)
      .map(([category, citations]) => ({
        category,
        label: CATEGORY_LABELS[category] ?? category,
        citations,
        pct: Math.round((citations / total) * 1000) / 10,
        color: DONUT_COLORS[category] ?? DONUT_COLORS.other,
      }))
      .sort((a, b) => b.citations - a.citations);
    return { slices, total };
  }, [topDomains]);

  const [hovered, setHovered] = useState<string | null>(null);

  const size = 150;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Precompute cumulative offsets immutably to avoid render-time mutation
  const sliceOffsets = useMemo(() => {
    return breakdown.slices.reduce<{ dashLength: number; rotation: number }[]>((acc, slice) => {
      const prevOffset = acc.length > 0
        ? acc.reduce((sum, s) => sum + s.dashLength, 0)
        : 0;
      const dashLength = (slice.pct / 100) * circumference;
      const rotation = (prevOffset / circumference) * 360 - 90;
      acc.push({ dashLength, rotation });
      return acc;
    }, []);
  }, [breakdown.slices, circumference]);

  if (breakdown.slices.length === 0) return null;

  const hoveredSlice = hovered ? breakdown.slices.find((s) => s.category === hovered) : null;

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-medium text-muted-foreground mb-2">Source Types</p>
      <div className="relative">
        <svg width={size} height={size}>
          {breakdown.slices.map((slice, i) => {
            const { dashLength, rotation } = sliceOffsets[i];
            const isHovered = hovered === slice.category;
            return (
              <circle
                key={slice.category}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                strokeOpacity={hovered && !isHovered ? 0.35 : 1}
                strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                strokeDashoffset={0}
                transform={`rotate(${rotation} ${center} ${center})`}
                className="cursor-pointer transition-all duration-150"
                onMouseEnter={() => setHovered(slice.category)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {hoveredSlice ? (
            <>
              <span className="text-base font-bold">{Math.round(hoveredSlice.pct)}%</span>
              <span className="text-[10px] font-medium text-foreground">{hoveredSlice.label}</span>
              <span className="text-[8px] text-muted-foreground/70 leading-tight text-center px-1">{CATEGORY_DESCRIPTIONS[hoveredSlice.category] ?? ""}</span>
              <span className="text-[9px] text-muted-foreground">{hoveredSlice.citations} citations</span>
            </>
          ) : (
            <>
              <span className="text-lg font-bold">{breakdown.total}</span>
              <span className="text-[10px] text-muted-foreground">citations</span>
            </>
          )}
        </div>
      </div>
      <div className="mt-2.5 space-y-1 mx-auto" style={{ maxWidth: 220 }}>
        {breakdown.slices.slice(0, 5).map((b) => (
          <div
            key={b.category}
            className={`flex items-center gap-1.5 rounded px-1 -mx-1 transition-colors cursor-default ${hovered === b.category ? "bg-muted/60" : ""}`}
            onMouseEnter={() => setHovered(b.category)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
            <span className="text-[11px] text-muted-foreground flex-1 min-w-0">
              <span className="truncate">{b.label}</span>
              {CATEGORY_DESCRIPTIONS[b.category] && (
                <span className="text-[9px] text-muted-foreground/60"> ({CATEGORY_DESCRIPTIONS[b.category]})</span>
              )}
            </span>
            <span className="text-[11px] font-medium tabular-nums shrink-0">{Math.round(b.pct)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface SourcesApiResponse {
  hasData: boolean;
  sources?: SourcesResponse;
}

interface Props {
  brandSlug: string;
  model: string;
  range: number;
}

const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All Models" },
  { value: "chatgpt", label: "ChatGPT" },
  { value: "gemini", label: "Gemini" },
  { value: "claude", label: "Claude" },
  { value: "perplexity", label: "Perplexity" },
  { value: "google", label: "Google" },
];

export function TopSourcesList({ brandSlug, model, range }: Props) {
  const [localModel, setLocalModel] = useState(model);
  const url = `/api/sources?brandSlug=${encodeURIComponent(brandSlug)}&model=${localModel}&range=${range}`;
  const { data: apiData, loading } = useCachedFetch<SourcesApiResponse>(url);

  if (loading) {
    return (
      <div className="rounded-xl bg-card p-6 shadow-section animate-pulse">
        <div className="h-4 w-48 bg-muted rounded mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-3 w-4 bg-muted rounded" />
              <div className="h-3 flex-1 bg-muted/60 rounded" />
              <div className="h-3 w-12 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!apiData?.hasData || !apiData.sources?.topDomains || apiData.sources.topDomains.length === 0) {
    return null;
  }

  const top5 = [...apiData.sources.topDomains]
    .sort((a, b) => b.citations - a.citations)
    .slice(0, 5);

  const maxCitations = top5[0]?.citations ?? 1;

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold">Top Sources AI Relies On</h2>
          <p className="text-xs text-muted-foreground mt-1">
            The most-cited websites when AI discusses your industry
          </p>
        </div>
        <select
          value={localModel}
          onChange={(e) => setLocalModel(e.target.value)}
          className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0"
        >
          {MODEL_OPTIONS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="flex gap-6">
        {/* Left: top source bars (55%) */}
        <div className="min-w-0 space-y-4" style={{ flex: "0 1 55%" }}>
          {top5.map((d, i) => {
            const barWidth = Math.max(4, (d.citations / maxCitations) * 100);
            const cat = d.category ?? "other";
            return (
              <div key={d.domain} className="flex items-center gap-3">
                <span className="w-5 text-xs text-muted-foreground text-right tabular-nums shrink-0">
                  {i + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm font-medium truncate">{d.domain}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none shrink-0 ${CATEGORY_BADGE_COLORS[cat] || CATEGORY_BADGE_COLORS.other}`}
                      title={CATEGORY_DESCRIPTIONS[cat] || ""}
                    >
                      {CATEGORY_LABELS[cat] || "Other"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-chart-2"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className="text-[11px] tabular-nums text-muted-foreground w-16 text-right shrink-0">
                      {d.citations} citations
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {apiData.sources.topDomains.length > 5 && (
            <p className="text-[11px] text-muted-foreground mt-3">
              +{apiData.sources.topDomains.length - 5} more sources — see the Sources tab for details
            </p>
          )}
        </div>

        {/* Right: source type donut (45%) */}
        <div className="hidden sm:block" style={{ flex: "0 1 45%" }}>
          <SourceTypeDonut topDomains={apiData.sources.topDomains} />
        </div>
      </div>
    </section>
  );
}
