"use client";

import { useState, useMemo } from "react";
import { TrendingUp, ChevronRight, ExternalLink } from "lucide-react";
import type { EmergingSource, SourcesResponse } from "@/types/api";
import { useResponseDetail } from "@/lib/useResponseDetail";
import { VALID_MODELS, MODEL_LABELS, CLUSTER_LABELS } from "@/lib/constants";
import { useCachedFetch } from "@/lib/useCachedFetch";

const INITIAL_ROWS = 8;

interface ApiResponse {
  hasData: boolean;
  sources?: SourcesResponse;
}

interface Props {
  emerging: EmergingSource[];
  brandSlug: string;
  range: number;
  pageModel: string;
}

const selectClass = "text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0";

export default function EmergingSourcesList({ emerging: initialEmerging, brandSlug, range, pageModel }: Props) {
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [model, setModel] = useState(pageModel);
  const [cluster, setCluster] = useState("all");
  const { openResponse } = useResponseDetail(brandSlug ?? "");

  const needsFetch = model !== pageModel || cluster !== "all";
  const url = needsFetch
    ? `/api/sources?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}&cluster=${cluster}`
    : null;
  const { data: apiData, loading } = useCachedFetch<ApiResponse>(url);

  const emerging = needsFetch && apiData?.sources?.emerging
    ? apiData.sources.emerging
    : needsFetch && apiData && !apiData.sources
    ? []
    : initialEmerging;

  // Sort by growth rate desc, tiebreak by citation count desc.
  // If all sources are new (previousCitations === 0), sort by citation count instead.
  const sorted = useMemo(() => {
    const allNew = emerging.every((e) => e.previousCitations === 0);
    return [...emerging].sort((a, b) => {
      if (allNew) return b.currentCitations - a.currentCitations;
      const cmp = b.growthRate - a.growthRate;
      if (cmp !== 0) return cmp;
      return b.currentCitations - a.currentCitations;
    });
  }, [emerging]);

  if (!loading && emerging.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-section">
        <h3 className="text-sm font-semibold mb-4">Emerging Sources</h3>
        <p className="text-sm text-muted-foreground">
          No emerging sources detected for this selection.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold mb-1">Emerging Sources</h3>
          <p className="text-xs text-muted-foreground">
            Websites that AI is citing significantly more often than before
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

      {!loading && <div className={`grid grid-cols-1 md:grid-cols-2 gap-2 ${sorted.length > INITIAL_ROWS ? "max-h-[480px] overflow-y-auto" : ""}`}>
        {sorted.map((e) => {
          const isExpanded = expandedDomain === e.domain;
          const hasPrompts = e.prompts && e.prompts.length > 0;

          return (
            <div key={e.domain} className="rounded-lg border overflow-hidden">
              {/* Source row */}
              <button
                type="button"
                onClick={() => setExpandedDomain(isExpanded ? null : e.domain)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-950/30 transition-colors text-left"
              >
                <ChevronRight
                  className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                />
                <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-sm font-medium flex-1 truncate">{e.domain}</span>
                <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold shrink-0">
                  {e.previousCitations === 0 ? "New" : `+${e.growthRate}%`}
                </span>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {e.previousCitations} &rarr; {e.currentCitations} citations
                </span>
                {hasPrompts && (
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                    {e.prompts!.length} prompt{e.prompts!.length !== 1 ? "s" : ""}
                  </span>
                )}
              </button>

              {/* Expanded prompt list */}
              {isExpanded && hasPrompts && (
                <div className="border-t bg-card">
                  <div className="px-4 py-2 space-y-1">
                    {e.prompts!.map((p) => {
                      const isPromptExpanded = expandedPrompt === p.promptId;

                      return (
                        <div key={p.promptId} className="rounded-md border border-border/50">
                          <button
                            type="button"
                            onClick={() => setExpandedPrompt(isPromptExpanded ? null : p.promptId)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
                          >
                            <ChevronRight
                              className={`h-3 w-3 text-muted-foreground shrink-0 transition-transform ${isPromptExpanded ? "rotate-90" : ""}`}
                            />
                            <span className="text-xs text-foreground flex-1 truncate">
                              {p.promptText}
                            </span>
                            <span className="text-[10px] font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded shrink-0">
                              {MODEL_LABELS[p.model] ?? p.model}
                            </span>
                          </button>

                          {isPromptExpanded && (
                            <div className="px-3 pb-3 pt-1 border-t border-border/30 space-y-2">
                              <p className="text-xs leading-relaxed">{p.promptText}</p>
                              <div className="text-[11px] text-muted-foreground font-mono break-all">
                                URL: {p.url}
                              </div>
                              {brandSlug && (
                                <button
                                  onClick={() => openResponse({ promptText: p.promptText, model: p.model })}
                                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  View full response
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Expanded but no prompts */}
              {isExpanded && !hasPrompts && (
                <div className="border-t bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">No prompt details available for this source.</p>
                </div>
              )}
            </div>
          );
        })}
      </div>}
    </div>
  );
}
