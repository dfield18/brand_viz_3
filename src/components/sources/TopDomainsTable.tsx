"use client";

import { useState } from "react";
import { ChevronRight, ExternalLink, Loader2, Info } from "lucide-react";
import type { TopDomainRow, DomainDetailResponse, SourcesResponse } from "@/types/api";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { useResponseDetail } from "@/lib/useResponseDetail";
import { VALID_MODELS, MODEL_LABELS, CLUSTER_LABELS } from "@/lib/constants";

const CATEGORY_LABELS: Record<string, string> = {
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
  reviews: "bg-sky-100 text-sky-700",
  news_media: "bg-indigo-100 text-indigo-700",
  video: "bg-slate-200 text-slate-800",
  ecommerce: "bg-orange-100 text-orange-700",
  reference: "bg-violet-100 text-violet-700",
  advocacy: "bg-emerald-100 text-emerald-700",
  social_media: "bg-pink-100 text-pink-700",
  government: "bg-teal-100 text-teal-700",
  academic: "bg-indigo-100 text-indigo-700",
  blog_forum: "bg-lime-100 text-lime-700",
  brand_official: "bg-yellow-100 text-yellow-700",
  technology: "bg-cyan-100 text-cyan-700",
  other: "bg-gray-100 text-gray-600",
};

type SortKey = "citations" | "responses" | "avgRankWhenCited" | "rank1RateWhenCited";

interface ApiResponse {
  hasData: boolean;
  sources?: SourcesResponse;
}

interface Props {
  topDomains: TopDomainRow[];
  brandSlug: string;
  model: string;
  range: number;
  pageModel: string;
  brandName?: string;
}

const COL_COUNT = 8; // domain + type + 4 metrics + first/last seen

/** Format "2026-03-06" → "Mar 6" */
function shortDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Round to 1 decimal place */
function r1(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return (Math.round(v * 10) / 10).toFixed(1);
}

const selectClass = "text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0";

export default function TopDomainsTable({ topDomains: initialTopDomains, brandSlug, model, range, pageModel, brandName = "this entity" }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("citations");
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const [filterModel, setFilterModel] = useState(pageModel);
  const [cluster, setCluster] = useState("all");

  const needsFetch = filterModel !== pageModel || cluster !== "all";
  const fetchUrl = needsFetch
    ? `/api/sources?brandSlug=${encodeURIComponent(brandSlug)}&model=${filterModel}&range=${range}&cluster=${cluster}`
    : null;
  const { data: apiData, loading } = useCachedFetch<ApiResponse>(fetchUrl);

  const topDomains = needsFetch && apiData?.sources?.topDomains
    ? apiData.sources.topDomains
    : needsFetch && apiData && !apiData.sources ? [] : initialTopDomains;

  if (!loading && topDomains.length === 0) {
    return (
      <div className="rounded-xl bg-card p-6 shadow-section">
        <h3 className="text-sm font-semibold mb-4">All Sources</h3>
        <p className="text-sm text-muted-foreground">No source data available for this selection.</p>
      </div>
    );
  }

  const sorted = [...topDomains].sort((a, b) => {
    const av = a[sortKey] ?? 999;
    const bv = b[sortKey] ?? 999;
    return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  }

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortAsc ? " ↑" : " ↓") : "";

  const columns: { key: SortKey; label: string; tooltip: string }[] = [
    { key: "citations", label: "Citations", tooltip: "The total number of times AI referenced this website across all responses." },
    { key: "responses", label: "Responses", tooltip: "How many unique AI responses included a link to this website. One response can have multiple citations." },
    { key: "avgRankWhenCited", label: "Avg Rank", tooltip: `${brandName}'s average ranking position in AI responses that cite this source. Lower is better — 1.0 means always listed first.` },
    { key: "rank1RateWhenCited", label: "Top Result Rate", tooltip: `The percentage of times ${brandName} appears as the #1 recommendation in AI responses that cite this source.` },
  ];

  return (
    <div className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold mb-1">All Sources</h3>
          <p className="text-xs text-muted-foreground">
            Every website AI cites, with details on how each source impacts {brandName}&apos;s visibility
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={cluster} onChange={(e) => setCluster(e.target.value)} className={selectClass}>
            {Object.entries(CLUSTER_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={filterModel} onChange={(e) => setFilterModel(e.target.value)} className={selectClass}>
            <option value="all">All AI Platforms</option>
            {VALID_MODELS.map((m) => (
              <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
            ))}
          </select>
        </div>
      </div>
      {loading && (
        <div className="flex items-center justify-center py-8">
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      )}

      {!loading && <div className={`overflow-x-auto ${sorted.length > 10 ? "max-h-[396px] overflow-y-auto" : ""}`}>
        <table className="w-full text-xs">
          <thead className={sorted.length > 10 ? "sticky top-0 bg-card z-10" : ""}>
            <tr className="border-b text-muted-foreground">
              <th className="py-2 pr-4 font-medium w-5" />
              <th className="text-left py-2 pr-4 font-medium">Domain</th>
              <th className="text-left py-2 pr-2 font-medium">
                <span className="relative group inline-flex items-center gap-1">
                  Type
                  <Info className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                  <span className="absolute top-full left-0 mt-1.5 hidden group-hover:block w-48 rounded-lg bg-card px-3 py-2 text-[11px] font-normal text-muted-foreground leading-relaxed shadow-md z-20 text-left whitespace-normal">
                    The category of the website (e.g. News, Reviews, E-commerce) based on its primary content type.
                  </span>
                </span>
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="text-right py-2 px-2 font-medium cursor-pointer hover:text-foreground select-none"
                  onClick={() => handleSort(col.key)}
                >
                  <span className="relative group inline-flex items-center gap-1 justify-end">
                    {col.label}{arrow(col.key)}
                    <Info className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                    <span className="absolute top-full right-0 mt-1.5 hidden group-hover:block w-52 rounded-lg bg-card px-3 py-2 text-[11px] font-normal text-muted-foreground leading-relaxed shadow-md z-20 text-left whitespace-normal">
                      {col.tooltip}
                    </span>
                  </span>
                </th>
              ))}
              <th className="text-right py-2 px-2 font-medium">
                <span className="relative group inline-flex items-center gap-1 justify-end">
                  First Seen
                  <Info className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                  <span className="absolute top-full right-0 mt-1.5 hidden group-hover:block w-44 rounded-lg bg-card px-3 py-2 text-[11px] font-normal text-muted-foreground leading-relaxed shadow-md z-20 text-left whitespace-normal">
                    The earliest date this source appeared in an AI response.
                  </span>
                </span>
              </th>
              <th className="text-right py-2 px-2 font-medium">
                <span className="relative group inline-flex items-center gap-1 justify-end">
                  Last Seen
                  <Info className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                  <span className="absolute top-full right-0 mt-1.5 hidden group-hover:block w-44 rounded-lg bg-card px-3 py-2 text-[11px] font-normal text-muted-foreground leading-relaxed shadow-md z-20 text-left whitespace-normal">
                    The most recent date this source appeared in an AI response.
                  </span>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => {
              const isExpanded = expandedDomain === d.domain;
              return (
                <DomainRow
                  key={d.domain}
                  domain={d}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedDomain(isExpanded ? null : d.domain)}
                  brandSlug={brandSlug}
                  model={model}
                  range={range}
                  colCount={COL_COUNT}
                />
              );
            })}
          </tbody>
        </table>
      </div>}
    </div>
  );
}

function DomainRow({
  domain: d,
  isExpanded,
  onToggle,
  brandSlug,
  model,
  range,
  colCount,
}: {
  domain: TopDomainRow;
  isExpanded: boolean;
  onToggle: () => void;
  brandSlug: string;
  model: string;
  range: number;
  colCount: number;
}) {
  return (
    <>
      <tr
        className={`border-b last:border-0 cursor-pointer transition-colors ${isExpanded ? "bg-muted/40" : "hover:bg-muted/30"}`}
        onClick={onToggle}
      >
        <td className="py-2 pr-1">
          <ChevronRight
            className={`h-3 w-3 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
          />
        </td>
        <td className="py-2 pr-4">
          <span className="font-medium truncate max-w-[200px] block" title={d.domain}>
            {d.domain.replace(/^www\./, "")}
          </span>
        </td>
        <td className="py-2 pr-2">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none ${CATEGORY_COLORS[d.category ?? "other"] || CATEGORY_COLORS.other}`}>
            {CATEGORY_LABELS[d.category ?? "other"] || "Other"}
          </span>
        </td>
        <td className="text-right py-2 px-2 tabular-nums">{d.citations}</td>
        <td className="text-right py-2 px-2 tabular-nums">{d.responses}</td>
        <td className={`text-right py-2 px-2 tabular-nums ${d.avgRankWhenCited !== null ? (d.avgRankWhenCited <= 2 ? "text-emerald-600 font-medium" : d.avgRankWhenCited <= 4 ? "text-amber-600" : "text-red-500") : ""}`}>
          {d.avgRankWhenCited !== null ? r1(d.avgRankWhenCited) : "—"}
        </td>
        <td className={`text-right py-2 px-2 tabular-nums ${(d.rank1RateWhenCited ?? 0) >= 50 ? "text-emerald-600 font-medium" : (d.rank1RateWhenCited ?? 0) >= 20 ? "text-amber-600" : (d.rank1RateWhenCited ?? 0) > 0 ? "text-red-500" : ""}`}>
          {d.rank1RateWhenCited ?? 0}%
        </td>
        <td className="text-right py-2 px-2 text-muted-foreground">{shortDate(d.firstSeen)}</td>
        <td className="text-right py-2 px-2 text-muted-foreground">{shortDate(d.lastSeen)}</td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={colCount} className="p-0">
            <DomainExamples
              domain={d.domain}
              brandSlug={brandSlug}
              model={model}
              range={range}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function DomainExamples({
  domain,
  brandSlug,
  model,
  range,
}: {
  domain: string;
  brandSlug: string;
  model: string;
  range: number;
}) {
  const url = `/api/sources/domain-detail?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}&domain=${encodeURIComponent(domain)}`;
  const { data, loading, error } = useCachedFetch<DomainDetailResponse>(url);
  const { openResponse } = useResponseDetail(brandSlug);

  return (
    <div className="bg-muted/20 border-t px-6 py-4">
      {loading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="ml-2 text-xs text-muted-foreground">Loading examples...</span>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 py-4 text-center">{error}</p>
      )}

      {data && data.examples.length === 0 && (
        <p className="text-xs text-muted-foreground py-4 text-center">No citation examples found.</p>
      )}

      {data && data.examples.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground mb-2">
            {data.totalOccurrences} total occurrence{data.totalOccurrences !== 1 ? "s" : ""}
          </p>
          {data.examples.map((ex, i) => (
            <div
              key={i}
              className="rounded-lg bg-card p-3 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                openResponse({ promptText: ex.promptText, model: ex.model });
              }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-medium bg-muted px-1.5 py-0.5 rounded">
                  {MODEL_LABELS[ex.model] ?? ex.model}
                </span>
                {ex.entityId && (
                  <span className="text-[10px] text-muted-foreground">
                    Entity: {ex.entityId}
                  </span>
                )}
                {ex.brandRank !== null && (
                  <div className="flex gap-3 text-[10px] text-muted-foreground">
                    <span>Rank: <span className="font-medium">#{ex.brandRank}</span></span>
                  </div>
                )}
                <ExternalLink className="h-3 w-3 text-muted-foreground/40 ml-auto shrink-0" />
              </div>
              <p className="text-xs text-muted-foreground">{ex.promptText}</p>
              <p className="text-xs font-mono bg-muted/50 rounded p-2 whitespace-pre-wrap break-words leading-relaxed">
                {ex.responseExcerpt}
              </p>
              <p className="text-[10px] text-muted-foreground font-mono break-all">
                {ex.normalizedUrl}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
