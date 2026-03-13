"use client";

import { useState } from "react";
import type { OfficialSiteCitation, SourcesResponse } from "@/types/api";
import { VALID_MODELS, MODEL_LABELS, CLUSTER_LABELS } from "@/lib/constants";
import { ChevronRight, Crown, ExternalLink } from "lucide-react";
import { useCachedFetch } from "@/lib/useCachedFetch";

const MODEL_SHORT: Record<string, string> = {
  chatgpt: "GPT",
  gemini: "Gem",
  claude: "Claude",
  perplexity: "Pplx",
};

const MODEL_COLORS: Record<string, string> = {
  chatgpt: "bg-emerald-100 text-emerald-800",
  gemini: "bg-sky-100 text-sky-800",
  claude: "bg-orange-100 text-orange-800",
  perplexity: "bg-violet-100 text-violet-800",
  google: "bg-teal-100 text-teal-800",
};

function titleCase(s: string): string {
  return s
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function pagePath(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const path = u.pathname === "/" ? "" : u.pathname;
    return `${u.hostname}${path}`;
  } catch {
    return url;
  }
}

interface ApiResponse {
  hasData: boolean;
  sources?: SourcesResponse;
}

interface Props {
  officialSites: OfficialSiteCitation[];
  brandSlug: string;
  range: number;
  pageModel: string;
}

const selectClass = "text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0";

export default function OfficialSiteCitations({ officialSites: initialSites, brandSlug, range, pageModel }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [model, setModel] = useState(pageModel);
  const [cluster, setCluster] = useState("all");

  const needsFetch = model !== pageModel || cluster !== "all";
  const url = needsFetch
    ? `/api/sources?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}&cluster=${cluster}`
    : null;
  const { data: apiData, loading } = useCachedFetch<ApiResponse>(url);

  const officialSites = needsFetch && apiData?.sources?.officialSites
    ? apiData.sources.officialSites
    : needsFetch && apiData && !apiData.sources ? [] : initialSites;

  if (!loading && officialSites.length === 0) return null;

  function toggle(entityId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold mb-1">Official Website Citations</h2>
          <p className="text-xs text-muted-foreground">
            When AI links directly to a brand&apos;s own website as a source
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={cluster} onChange={(e) => setCluster(e.target.value)} className={selectClass}>
            {Object.entries(CLUSTER_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select value={model} onChange={(e) => setModel(e.target.value)} className={selectClass}>
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

      {!loading && (
        <div className="space-y-0 divide-y divide-border/50">
          {officialSites.map((site, i) => {
            const isOpen = expanded.has(site.entityId);
            const uniquePages = site.pages.length;

            return (
              <div key={site.entityId}>
                <button
                  type="button"
                  onClick={() => toggle(site.entityId)}
                  className="flex items-center gap-3 w-full py-3 text-left hover:bg-muted/30 transition-colors rounded-sm px-1 -mx-1"
                >
                  <span className="w-6 text-xs text-muted-foreground text-right tabular-nums shrink-0">
                    {i + 1}.
                  </span>
                  <ChevronRight
                    className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
                  />
                  <div className="flex items-center gap-1.5 min-w-0">
                    {site.isBrand && (
                      <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    )}
                    <span className={`text-sm truncate ${site.isBrand ? "font-semibold" : "font-medium"}`}>
                      {titleCase(site.entityId)}&apos;s website
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-auto">
                    {site.models.map((m) => (
                      <span
                        key={m}
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium leading-none ${MODEL_COLORS[m] || "bg-gray-100 text-gray-700"}`}
                      >
                        {MODEL_SHORT[m] || MODEL_LABELS[m] || m}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-12 text-right">
                    {site.citations} citations
                  </span>
                </button>

                {isOpen && (
                  <div className="pl-14 pb-3 space-y-1.5">
                    <p className="text-[11px] text-muted-foreground">
                      {uniquePages} unique page{uniquePages !== 1 ? "s" : ""} cited:
                    </p>
                    {site.pages.map((page) => (
                      <div key={page.url} className="flex items-start gap-1.5 text-xs">
                        <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                        <span className="text-muted-foreground break-all">
                          {pagePath(page.url)}
                        </span>
                        <span className="text-muted-foreground/70 shrink-0 whitespace-nowrap">
                          ({page.citations} citation{page.citations !== 1 ? "s" : ""})
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {page.models.map((m) => (
                            <span
                              key={m}
                              className={`inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium leading-none ${MODEL_COLORS[m] || "bg-gray-100 text-gray-700"}`}
                            >
                              {MODEL_SHORT[m] || MODEL_LABELS[m] || m}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
