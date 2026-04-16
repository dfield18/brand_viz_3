"use client";

import { useState, useMemo } from "react";
import type { SourcePromptMatrixRow, SourceMatrixPrompt, SourcesResponse } from "@/types/api";
import { titleCase } from "@/lib/utils";
import { VALID_MODELS, MODEL_LABELS, CLUSTER_LABELS } from "@/lib/constants";
import { useCachedFetch } from "@/lib/useCachedFetch";

interface ApiResponse {
  hasData: boolean;
  sources?: SourcesResponse;
}

interface Props {
  matrix: SourcePromptMatrixRow[];
  prompts: SourceMatrixPrompt[];
  brandSlug: string;
  range: number;
  pageModel: string;
}

const selectClass = "text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0";

export default function SourcePromptMatrix({ matrix: initialMatrix, prompts: initialPrompts, brandSlug, range, pageModel }: Props) {
  const brandName = titleCase(brandSlug);
  const [hoveredCell, setHoveredCell] = useState<{ domain: string; promptId: string } | null>(null);
  const [model, setModel] = useState(pageModel);
  const [cluster, setCluster] = useState("all");

  const needsFetch = model !== pageModel || cluster !== "all";
  const url = needsFetch
    ? `/api/sources?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}&cluster=${cluster}`
    : null;
  const { data: apiData, loading } = useCachedFetch<ApiResponse>(url);

  const matrix = useMemo(() => {
    if (needsFetch && apiData?.sources?.sourcePromptMatrix) return apiData.sources.sourcePromptMatrix;
    if (needsFetch && apiData && !apiData.sources) return [];
    return initialMatrix;
  }, [needsFetch, apiData, initialMatrix]);

  const prompts = useMemo(() => {
    if (needsFetch && apiData?.sources?.matrixPrompts) return apiData.sources.matrixPrompts;
    if (needsFetch && apiData && !apiData.sources) return [];
    return initialPrompts;
  }, [needsFetch, apiData, initialPrompts]);

  // Only include prompts that have at least one citation across the matrix
  const activePrompts = useMemo(() => {
    const promptCounts = new Map<string, number>();
    for (const row of matrix) {
      for (const [pid, count] of Object.entries(row.prompts)) {
        promptCounts.set(pid, (promptCounts.get(pid) ?? 0) + count);
      }
    }
    return prompts
      .filter((p) => (promptCounts.get(p.promptId) ?? 0) > 0)
      .sort((a, b) => (promptCounts.get(b.promptId) ?? 0) - (promptCounts.get(a.promptId) ?? 0));
  }, [matrix, prompts]);

  // Find max citation count for color scaling
  const maxCount = useMemo(() => {
    let max = 0;
    for (const row of matrix) {
      for (const count of Object.values(row.prompts)) {
        if (count > max) max = count;
      }
    }
    return max || 1;
  }, [matrix]);

  const INITIAL_ROWS = 10;
  const hasMore = matrix.length > INITIAL_ROWS;

  if (!loading && (matrix.length === 0 || activePrompts.length === 0)) return null;

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold mb-1">Which Sources Appear for Which Questions</h2>
          <p className="text-xs text-muted-foreground">
            Shows which websites AI cites when answering specific questions. Darker cells = more citations.
            {hasMore && <> Showing top {INITIAL_ROWS} sources — scroll down to see all {matrix.length}.</>}
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

      {!loading && <div className="overflow-x-auto">
        <div className={hasMore ? "max-h-[440px] overflow-y-auto" : ""}>
          <table className="text-xs border-collapse">
            <thead className="sticky top-0 z-20 bg-card">
              <tr>
                <th className="text-left py-2 pr-3 font-medium text-muted-foreground sticky left-0 bg-card z-30 min-w-[160px]">
                  Domain
                </th>
                {activePrompts.map((p) => {
                  const fullText = p.promptText.replace(/\{brand\}/gi, brandName);
                  const shortLabel = fullText.split(/\s+/).slice(0, 5).join(" ");
                  return (
                    <th
                      key={p.promptId}
                      className="py-2 px-2 font-medium text-muted-foreground text-left min-w-[120px] max-w-[140px] bg-card"
                      title={fullText}
                    >
                      <span className="text-[10px] leading-tight line-clamp-2">{shortLabel}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => (
                <tr key={row.domain} className="border-t border-border/30">
                  <td className="py-1.5 pr-3 font-medium truncate max-w-[200px] sticky left-0 bg-card z-10" title={row.domain}>
                    {row.domain}
                  </td>
                  {activePrompts.map((p) => {
                    const count = row.prompts[p.promptId] ?? 0;
                    const isHovered = hoveredCell?.domain === row.domain && hoveredCell?.promptId === p.promptId;
                    const opacity = count > 0 ? 0.15 + (count / maxCount) * 0.85 : 0;

                    return (
                      <td
                        key={p.promptId}
                        className="py-1.5 px-1 text-center relative"
                        onMouseEnter={() => setHoveredCell({ domain: row.domain, promptId: p.promptId })}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        <div
                          className="w-7 h-7 rounded-sm mx-auto flex items-center justify-center text-[10px] font-semibold tabular-nums"
                          style={{
                            backgroundColor: count > 0 ? `rgba(16, 185, 129, ${opacity})` : "transparent",
                            color: count > 0 ? (opacity > 0.5 ? "white" : "rgb(16, 185, 129)") : "transparent",
                            border: count === 0 ? "1px solid hsl(var(--border))" : "none",
                          }}
                        >
                          {count > 0 ? count : ""}
                        </div>
                        {isHovered && count > 0 && (
                          <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 bg-popover border rounded-lg shadow-lg p-2.5 w-64 text-left pointer-events-none">
                            <p className="text-[11px] font-semibold mb-1">{row.domain}</p>
                            <p className="text-[10px] text-muted-foreground leading-relaxed">{p.promptText.replace(/\{brand\}/gi, brandName)}</p>
                            <p className="text-[10px] font-medium text-emerald-600 mt-1">{count} citation{count !== 1 ? "s" : ""}</p>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>}

    </section>
  );
}
