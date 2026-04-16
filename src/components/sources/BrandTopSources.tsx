"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { BrandAttributedSource } from "@/types/api";
import { MODEL_LABELS } from "@/lib/constants";

const CATEGORY_LABELS_MAP: Record<string, string> = {
  reviews: "Reviews",
  news_media: "News & Media",
  video: "Video",
  ecommerce: "E-commerce",
  reference: "Reference",
  advocacy: "Advocacy / Nonprofit",
  social_media: "Social Media",
  government: "Government",
  academic: "Academic",
  blog_forum: "Blog / Forum",
  brand_official: "Brand / Official",
  technology: "Technology",
  other: "Other",
};

const CATEGORY_COLORS: Record<string, string> = {
  reviews: "#38bdf8",
  news_media: "#818cf8",
  video: "#fb7185",
  ecommerce: "#f97316",
  reference: "#a78bfa",
  advocacy: "#34d399",
  social_media: "#f472b6",
  government: "#14b8a6",
  academic: "#6366f1",
  blog_forum: "#84cc16",
  brand_official: "#eab308",
  technology: "#06b6d4",
  other: "#cbd5e1",
};

const MODEL_SHORT: Record<string, string> = {
  chatgpt: "GPT",
  gemini: "Gem",
  claude: "Claude",
  perplexity: "Pplx",
};

const MODEL_BADGE_COLORS: Record<string, string> = {
  chatgpt: "bg-emerald-100 text-emerald-800",
  gemini: "bg-sky-100 text-sky-800",
  claude: "bg-orange-100 text-orange-800",
  perplexity: "bg-violet-100 text-violet-800",
  google: "bg-teal-100 text-teal-800",
};

interface Props {
  sources: BrandAttributedSource[];
  brandName: string;
  onDomainClick?: (domain: string) => void;
}

export default function BrandTopSources({ sources, brandName, onDomainClick }: Props) {
  const rows = useMemo(() => {
    return [...sources]
      .sort((a, b) => b.citations - a.citations)
      .slice(0, 15);
  }, [sources]);

  // Compute category breakdown for donut
  const { pieData } = useMemo(() => {
    const categoryTotals = new Map<string, number>();
    let total = 0;
    for (const s of sources) {
      const cat = s.category || "other";
      categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + s.citations);
      total += s.citations;
    }

    const rawSlices = [...categoryTotals.entries()]
      .map(([cat, count]) => ({
        name: CATEGORY_LABELS_MAP[cat] || cat,
        value: count,
        key: cat,
        pct: total > 0 ? (count / total) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    let otherValue = 0;
    const slices: typeof rawSlices = [];
    for (const slice of rawSlices) {
      if (slice.pct < 5 || slice.key === "other") {
        otherValue += slice.value;
      } else {
        slices.push({ ...slice, pct: Math.round(slice.pct) });
      }
    }
    if (otherValue > 0) {
      slices.push({
        name: "Other",
        value: otherValue,
        key: "other",
        pct: total > 0 ? Math.round((otherValue / total) * 100) : 0,
      });
    }

    return { pieData: slices, totalCitations: total };
  }, [sources]);

  if (rows.length === 0) return null;

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="mb-5">
        <h2 className="text-base font-semibold mb-1">Top Cited Sources for {brandName}</h2>
        <p className="text-xs text-muted-foreground">
          The websites AI references most often in responses that mention {brandName}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: Ranked domain list */}
        <div className={`space-y-1.5 ${rows.length > 10 ? "max-h-[400px] overflow-y-auto" : ""}`}>
          {rows.map((d, i) => {
            const shownModels = d.models.slice(0, 3);
            const extraCount = d.models.length - shownModels.length;

            return (
              <div
                key={d.domain}
                className="flex items-center gap-2 py-1.5 border-b border-border/50 last:border-0"
              >
                <span className="w-6 text-xs text-muted-foreground text-right tabular-nums shrink-0">
                  {i + 1}.
                </span>
                <button
                  type="button"
                  onClick={() => onDomainClick?.(d.domain)}
                  className="w-36 text-xs font-medium truncate hover:text-foreground hover:underline underline-offset-2 transition-colors text-left shrink-0"
                  title={d.domain}
                >
                  {d.domain}
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  {shownModels.map((m) => (
                    <span
                      key={m}
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${MODEL_BADGE_COLORS[m] || "bg-gray-100 text-gray-700"}`}
                    >
                      {MODEL_SHORT[m] || MODEL_LABELS[m] || m}
                    </span>
                  ))}
                  {extraCount > 0 && (
                    <span className="inline-flex items-center rounded bg-gray-100 text-gray-500 px-1.5 py-0.5 text-[10px] font-medium leading-none">
                      +{extraCount}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0 ml-auto text-right whitespace-nowrap mr-4">
                  {d.citations} citations
                </span>
              </div>
            );
          })}
        </div>

        {/* Right: Source Type donut chart */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Source Types</h3>
          <div className="flex items-center justify-center">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                  stroke="none"
                >
                  {pieData.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={CATEGORY_COLORS[entry.key] || CATEGORY_COLORS.other}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [`${value} citations`, name]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-2">
            {pieData.map((entry) => (
              <div key={entry.key} className="flex items-center gap-1.5 text-xs">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: CATEGORY_COLORS[entry.key] || CATEGORY_COLORS.other }}
                />
                <span className="text-muted-foreground">
                  {entry.name} {entry.pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
