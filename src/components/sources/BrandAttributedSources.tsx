"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import type { BrandAttributedSource, SourcesResponse } from "@/types/api";
import { VALID_MODELS, MODEL_LABELS, CLUSTER_LABELS } from "@/lib/constants";
import { useCachedFetch } from "@/lib/useCachedFetch";

const CATEGORY_LABELS: Record<string, string> = {
  news: "News",
  government: "Government",
  academic: "Academic",
  industry: "Industry",
  brand_official: "Official Site",
  social: "Social Media",
  review: "Review",
  ecommerce: "E-commerce",
  reference: "Reference",
  other: "Other",
};

interface ApiResponse {
  hasData: boolean;
  sources?: SourcesResponse;
}

interface Props {
  sources: BrandAttributedSource[];
  brandName: string;
  brandSlug: string;
  range: number;
  pageModel: string;
}

const selectClass = "text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0";

export default function BrandAttributedSources({ sources: initialSources, brandName, brandSlug, range, pageModel }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [model, setModel] = useState(pageModel);
  const [cluster, setCluster] = useState("all");

  const needsFetch = model !== pageModel || cluster !== "all";
  const url = needsFetch
    ? `/api/sources?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}&cluster=${cluster}`
    : null;
  const { data: apiData, loading } = useCachedFetch<ApiResponse>(url);

  const sources = needsFetch && apiData?.sources?.brandAttributedSources
    ? apiData.sources.brandAttributedSources
    : needsFetch && apiData && !apiData.sources ? [] : initialSources;

  if (!loading && sources.length === 0) {
    return (
      <section className="rounded-xl bg-card p-6 shadow-section">
        <h2 className="text-base font-semibold">Sources That Shape {brandName}&apos;s AI Story</h2>
        <p className="text-xs text-muted-foreground mt-1">
          No sources were found near mentions of {brandName} for this selection.
        </p>
      </section>
    );
  }

  const toggle = (domain: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  };

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold">Sources That Shape {brandName}&apos;s AI Story</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Websites AI cites specifically when discussing {brandName}
            <br />
            These sources are directly influencing how AI presents {brandName}
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

      {!loading && <div className={`${sources.length > 10 ? "max-h-[440px] overflow-y-auto" : ""}`}>
        <table className="w-full text-xs">
          <thead className={sources.length > 10 ? "sticky top-0 bg-card z-10" : ""}>
            <tr className="border-b text-muted-foreground">
              <th className="text-left py-2 pr-1 font-medium w-6" />
              <th className="text-left py-2 pr-3 font-medium">Domain</th>
              <th className="text-left py-2 px-3 font-medium">Category</th>
              <th className="text-right py-2 px-3 font-medium">Citations</th>
              <th className="text-left py-2 pl-3 font-medium">Platforms</th>
            </tr>
          </thead>
          <tbody>
            {sources.flatMap((source, i) => {
              const isExpanded = expanded.has(source.domain);

              const rows = [
                <tr
                  key={source.domain}
                  className={`border-b border-border/50 last:border-0 cursor-pointer hover:bg-muted/30 transition-colors ${
                    i === 0 ? "bg-primary/5" : ""
                  }`}
                  onClick={() => toggle(source.domain)}
                >
                  <td className="py-2.5 pr-1">
                    {source.urls.length > 0 && (
                      isExpanded
                        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </td>
                  <td className="py-2.5 pr-3 font-medium text-foreground">
                    {source.domain}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="inline-flex items-center rounded-full bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {CATEGORY_LABELS[source.category ?? "other"] ?? source.category}
                    </span>
                  </td>
                  <td className="text-right py-2.5 px-3 tabular-nums font-medium">
                    {source.citations}
                  </td>
                  <td className="py-2.5 pl-3">
                    <div className="flex gap-1">
                      {source.models.map((m) => (
                        <span
                          key={m}
                          className="inline-flex items-center rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                        >
                          {MODEL_LABELS[m] ?? m}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>,
              ];

              if (isExpanded && source.urls.length > 0) {
                rows.push(
                  <tr key={`${source.domain}-urls`}>
                    <td colSpan={5} className="pb-3 pt-0">
                      <div className="ml-6 pl-3 border-l-2 border-border space-y-1.5">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-1">
                          URLs cited near {brandName}
                        </p>
                        {source.urls.map((url) => (
                          <div key={url} className="flex items-center gap-1.5 text-[11px]">
                            <ExternalLink className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:text-primary/80 truncate max-w-[600px] transition-colors"
                            >
                              {url}
                            </a>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              }

              return rows;
            })}
          </tbody>
        </table>
      </div>}

      {!loading && <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
        Attribution is based on proximity — a source is &quot;near brand&quot; if {brandName} is
        mentioned within ~300 characters of the URL in the response.
      </p>}
    </section>
  );
}
