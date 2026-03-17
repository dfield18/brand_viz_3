"use client";

import { useState, useMemo } from "react";
import type { CompetitorCrossCitation, SourcesResponse, SourcePromptMatrixRow, SourceMatrixPrompt, SourceModelSplitRow } from "@/types/api";
import { VALID_MODELS, MODEL_LABELS, CLUSTER_LABELS } from "@/lib/constants";
import { useCachedFetch } from "@/lib/useCachedFetch";

interface ApiResponse {
  hasData: boolean;
  sources?: SourcesResponse;
}

interface TopDomainInfo {
  domain: string;
  citations: number;
}

interface Props {
  crossCitation: CompetitorCrossCitation[];
  topDomains?: TopDomainInfo[];
  brandSlug: string;
  range: number;
  pageModel: string;
  matrix?: SourcePromptMatrixRow[];
  prompts?: SourceMatrixPrompt[];
  modelSplit?: SourceModelSplitRow[];
  entityNames?: Record<string, string>;
}

type ViewMode = "brands" | "questions" | "platforms";

const INITIAL_ROWS = 8;
const selectClass = "text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0";

/* Consistent column widths across all three views */
const SOURCE_COL_W = "w-[200px] min-w-[200px]";
const DATA_COL_W = "w-[130px] min-w-[130px]";

import { titleCase } from "@/lib/utils";

function resolveEntity(id: string, names?: Record<string, string>): string {
  return names?.[id] ?? names?.[id.toLowerCase()] ?? titleCase(id);
}

const VIEW_DESCRIPTIONS: Record<ViewMode, string> = {
  brands: "Which websites AI cites when mentioning each brand — shows where competitors are getting their credibility from",
  questions: "Which websites AI cites when answering specific questions. Darker cells = more citations.",
  platforms: "How often each AI platform cites each source — see which platforms rely on which websites",
};

export default function CompetitorSourceComparison({
  crossCitation: initialCrossCitation,
  topDomains: initialTopDomains,
  brandSlug,
  range,
  pageModel,
  matrix: initialMatrix,
  prompts: initialPrompts,
  modelSplit: initialModelSplit,
  entityNames,
}: Props) {
  const brandName = resolveEntity(brandSlug, entityNames);

  // Build a function that expands {brand} and {competitor} placeholders in prompt text
  const expandPromptText = useMemo(() => {
    // Get non-brand competitor names from crossCitation entity IDs
    const compNames: string[] = [];
    const seen = new Set<string>();
    for (const row of initialCrossCitation) {
      for (const id of Object.keys(row.entityCounts)) {
        if (id !== brandSlug && !seen.has(id)) {
          seen.add(id);
          compNames.push(resolveEntity(id, entityNames));
        }
      }
    }
    const competitorLabel = compNames.length <= 3
      ? compNames.join(", ")
      : `${compNames.slice(0, 2).join(", ")} & others`;

    return (text: string) =>
      text
        .replace(/\{brand\}/gi, brandName)
        .replace(/\{competitor\}/gi, competitorLabel)
        .replace(/\{industry\}/gi, "the industry");
  }, [initialCrossCitation, brandSlug, brandName]);
  const [view, setView] = useState<ViewMode>("brands");
  const [model, setModel] = useState(pageModel);
  const [cluster, setCluster] = useState("all");
  const [hoveredCell, setHoveredCell] = useState<{ domain: string; col: string } | null>(null);

  const needsFetch = model !== pageModel || cluster !== "all";
  const url = needsFetch
    ? `/api/sources?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}&cluster=${cluster}`
    : null;
  const { data: apiData, loading } = useCachedFetch<ApiResponse>(url);

  // ── Brand view data ──────────────────────────
  const crossCitation = needsFetch && apiData?.sources?.crossCitation
    ? apiData.sources.crossCitation
    : needsFetch && apiData && !apiData.sources ? [] : initialCrossCitation;

  const topDomains = needsFetch && apiData?.sources?.topDomains
    ? apiData.sources.topDomains
    : needsFetch && apiData && !apiData.sources ? [] : (initialTopDomains ?? []);

  const totalByDomain = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of topDomains) map.set(d.domain, d.citations);
    return map;
  }, [topDomains]);

  const entityIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of crossCitation) {
      for (const id of Object.keys(row.entityCounts)) ids.add(id);
    }
    return [...ids].sort((a, b) => {
      if (a === brandSlug) return -1;
      if (b === brandSlug) return 1;
      return a.localeCompare(b);
    });
  }, [crossCitation, brandSlug]);

  const sortedBrand = useMemo(() => {
    return [...crossCitation]
      .filter((row) => Object.values(row.entityCounts).some((v) => v > 0))
      .sort((a, b) => {
        const totalA = Object.values(a.entityCounts).reduce((s, v) => s + v, 0);
        const totalB = Object.values(b.entityCounts).reduce((s, v) => s + v, 0);
        return totalB - totalA;
      });
  }, [crossCitation]);

  const otherByDomain = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of sortedBrand) {
      const attributed = Object.values(row.entityCounts).reduce((s, v) => s + v, 0);
      const total = totalByDomain.get(row.domain) ?? attributed;
      const other = Math.max(0, total - attributed);
      if (other > 0) map.set(row.domain, other);
    }
    return map;
  }, [sortedBrand, totalByDomain]);

  const hasOther = otherByDomain.size > 0;

  const maxCountBrand = useMemo(() => {
    let max = 0;
    for (const row of sortedBrand) {
      for (const count of Object.values(row.entityCounts)) {
        if (count > max) max = count;
      }
      const other = otherByDomain.get(row.domain) ?? 0;
      if (other > max) max = other;
    }
    return max || 1;
  }, [sortedBrand, otherByDomain]);

  // ── Question view data ───────────────────────
  const matrix = needsFetch && apiData?.sources?.sourcePromptMatrix
    ? apiData.sources.sourcePromptMatrix
    : needsFetch && apiData && !apiData.sources ? [] : (initialMatrix ?? []);
  const prompts = needsFetch && apiData?.sources?.matrixPrompts
    ? apiData.sources.matrixPrompts
    : needsFetch && apiData && !apiData.sources ? [] : (initialPrompts ?? []);

  // Deduplicate prompts by text — multiple promptIds can share the same text
  const { activePrompts, promptIdGroups } = useMemo(() => {
    // Map promptId → promptText
    const textById = new Map<string, string>();
    for (const p of prompts) textById.set(p.promptId, p.promptText);

    // Group promptIds by normalized text
    const textToIds = new Map<string, string[]>();
    for (const p of prompts) {
      const normalized = p.promptText.trim().toLowerCase();
      if (!textToIds.has(normalized)) textToIds.set(normalized, []);
      textToIds.get(normalized)!.push(p.promptId);
    }

    // Total citations per text group across all matrix rows
    const textTotals = new Map<string, number>();
    for (const row of matrix) {
      for (const [pid, count] of Object.entries(row.prompts)) {
        const text = textById.get(pid);
        if (!text) continue;
        const normalized = text.trim().toLowerCase();
        textTotals.set(normalized, (textTotals.get(normalized) ?? 0) + count);
      }
    }

    // Build deduped list — one entry per unique text, using first promptId as canonical
    const seen = new Set<string>();
    const deduped: typeof prompts = [];
    const groups = new Map<string, string[]>(); // canonical promptId → all promptIds with same text
    for (const p of prompts) {
      const normalized = p.promptText.trim().toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      const total = textTotals.get(normalized) ?? 0;
      if (total > 0) {
        deduped.push(p);
        groups.set(p.promptId, textToIds.get(normalized) ?? [p.promptId]);
      }
    }

    deduped.sort((a, b) => {
      const na = a.promptText.trim().toLowerCase();
      const nb = b.promptText.trim().toLowerCase();
      return (textTotals.get(nb) ?? 0) - (textTotals.get(na) ?? 0);
    });

    return { activePrompts: deduped, promptIdGroups: groups };
  }, [matrix, prompts]);

  const maxCountQuestion = useMemo(() => {
    let max = 0;
    for (const row of matrix) {
      for (const p of activePrompts) {
        const ids = promptIdGroups.get(p.promptId) ?? [p.promptId];
        const count = ids.reduce((s, id) => s + (row.prompts[id] ?? 0), 0);
        if (count > max) max = count;
      }
    }
    return max || 1;
  }, [matrix, activePrompts, promptIdGroups]);

  // ── Platform view data ───────────────────────
  const modelSplit = needsFetch && apiData?.sources?.modelSplit
    ? apiData.sources.modelSplit
    : needsFetch && apiData && !apiData.sources ? [] : (initialModelSplit ?? []);

  // Pivot modelSplit (rows=models, cols=domains) → rows=domains, cols=models
  const { platformModels, platformByDomain, maxCountPlatform } = useMemo(() => {
    const models = modelSplit.map((ms) => ms.model);
    const domainMap = new Map<string, Map<string, number>>();
    let max = 0;

    for (const ms of modelSplit) {
      for (const d of ms.domains) {
        if (!domainMap.has(d.domain)) domainMap.set(d.domain, new Map());
        domainMap.get(d.domain)!.set(ms.model, d.citations);
        if (d.citations > max) max = d.citations;
      }
    }

    return { platformModels: models, platformByDomain: domainMap, maxCountPlatform: max || 1 };
  }, [modelSplit]);

  // ── Shared domain list (use brand view rows as the canonical source order) ──
  const domainOrder = useMemo(() => sortedBrand.map((r) => r.domain), [sortedBrand]);

  const matrixByDomain = useMemo(() => {
    const map = new Map<string, SourcePromptMatrixRow>();
    for (const row of matrix) map.set(row.domain, row);
    return map;
  }, [matrix]);

  // Build ordered domain list for platform view (use brand order, then add any extras)
  const platformDomainRows = useMemo(() => {
    const shown = new Set<string>();
    const result: string[] = [];
    for (const d of domainOrder) {
      if (platformByDomain.has(d)) {
        result.push(d);
        shown.add(d);
      }
    }
    for (const d of platformByDomain.keys()) {
      if (!shown.has(d)) result.push(d);
    }
    return result;
  }, [domainOrder, platformByDomain]);

  const hasQuestionData = matrix.length > 0 && activePrompts.length > 0;
  const hasBrandData = sortedBrand.length > 0 && entityIds.length > 0;
  const hasPlatformData = modelSplit.length > 1 && platformByDomain.size > 0;

  if (!loading && !hasBrandData && !hasQuestionData && !hasPlatformData) return null;

  const hasMore = domainOrder.length > INITIAL_ROWS;

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold mb-1">Source Citation Matrix</h2>
          <p className="text-xs text-muted-foreground">
            {VIEW_DESCRIPTIONS[view]}
            {view !== "brands" && hasMore && <> Scroll to see all sources.</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={cluster} onChange={(e) => setCluster(e.target.value)} className={selectClass}>
            {Object.entries(CLUSTER_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          {view !== "platforms" && (
            <select value={model} onChange={(e) => setModel(e.target.value)} className={selectClass}>
              <option value="all">All AI Platforms</option>
              {VALID_MODELS.map((m) => (
                <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* View toggle — positioned above the Source column */}
      <div className="mb-3">
        <div className="inline-flex rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setView("brands")}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${view === "brands" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
          >
            By Brand
          </button>
          <button
            type="button"
            onClick={() => setView("questions")}
            disabled={!hasQuestionData}
            className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-border ${view === "questions" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            By Question
          </button>
          <button
            type="button"
            onClick={() => setView("platforms")}
            disabled={!hasPlatformData}
            className={`px-3 py-1.5 text-sm font-medium transition-colors border-l border-border ${view === "platforms" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            By Platform
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      )}

      {/* ── Brand View ────────────────────── */}
      {!loading && view === "brands" && hasBrandData && (
        <div className={`overflow-x-auto ${hasMore ? "max-h-[400px] overflow-y-auto" : ""}`}>
          <table className="text-xs border-collapse table-fixed">
            <thead className={hasMore ? "sticky top-0 bg-card z-10" : ""}>
              <tr className="border-b border-border">
                <th className={`py-2.5 pr-4 text-left font-medium text-muted-foreground ${SOURCE_COL_W}`}>
                  Source
                </th>
                {entityIds.map((id) => (
                  <th
                    key={id}
                    className={`py-2.5 px-3 text-center font-medium text-xs whitespace-nowrap ${DATA_COL_W} ${id === brandSlug ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {id === brandSlug ? `${resolveEntity(id, entityNames)} (You)` : resolveEntity(id, entityNames)}
                  </th>
                ))}
                {hasOther && (
                  <th className={`py-2.5 px-3 text-center font-medium text-xs whitespace-nowrap text-muted-foreground ${DATA_COL_W}`}>
                    Other
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedBrand.map((row, i) => (
                <tr
                  key={row.domain}
                  className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${i % 2 === 1 ? "bg-muted/10" : ""}`}
                >
                  <td className={`py-2.5 pr-4 font-medium truncate ${SOURCE_COL_W}`} title={row.domain}>
                    {row.domain}
                  </td>
                  {entityIds.map((id) => {
                    const count = row.entityCounts[id] ?? 0;
                    const intensity = count > 0 ? 0.15 + (count / maxCountBrand) * 0.85 : 0;
                    return (
                      <td key={id} className="py-2.5 px-3 text-center">
                        {count > 0 ? (
                          <span
                            className="inline-block rounded-md px-2.5 py-1 tabular-nums font-semibold text-[11px] min-w-[36px]"
                            style={{
                              backgroundColor: `rgba(16, 185, 129, ${intensity})`,
                              color: intensity > 0.5 ? "white" : "rgb(16, 185, 129)",
                            }}
                          >
                            {count}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/30">&mdash;</span>
                        )}
                      </td>
                    );
                  })}
                  {hasOther && (() => {
                    const count = otherByDomain.get(row.domain) ?? 0;
                    const intensity = count > 0 ? 0.15 + (count / maxCountBrand) * 0.85 : 0;
                    return (
                      <td className="py-2.5 px-3 text-center">
                        {count > 0 ? (
                          <span
                            className="inline-block rounded-md px-2.5 py-1 tabular-nums font-semibold text-[11px] min-w-[36px]"
                            style={{
                              backgroundColor: `rgba(148, 163, 184, ${intensity})`,
                              color: intensity > 0.5 ? "white" : "rgb(148, 163, 184)",
                            }}
                          >
                            {count}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/30">&mdash;</span>
                        )}
                      </td>
                    );
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Question View ─────────────────── */}
      {!loading && view === "questions" && hasQuestionData && (
        <div className="overflow-x-auto">
          <div className={hasMore ? "max-h-[440px] overflow-y-auto" : ""}>
            <table className="text-xs border-collapse table-fixed">
              <thead className="sticky top-0 z-20 bg-card">
                <tr className="border-b border-border">
                  <th className={`text-left py-2.5 pr-4 font-medium text-muted-foreground sticky left-0 bg-card z-30 ${SOURCE_COL_W}`}>
                    Source
                  </th>
                  {activePrompts.map((p) => {
                    const fullText = expandPromptText(p.promptText);
                    const shortLabel = fullText.length > 35 ? fullText.slice(0, 32) + "..." : fullText;
                    return (
                      <th
                        key={p.promptId}
                        className={`py-2.5 px-3 font-medium text-muted-foreground text-left bg-card ${DATA_COL_W}`}
                        title={fullText}
                      >
                        <span className="text-[10px] leading-snug line-clamp-2">{shortLabel}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const shownDomains = new Set<string>();
                  const rows: SourcePromptMatrixRow[] = [];
                  for (const domain of domainOrder) {
                    const matrixRow = matrixByDomain.get(domain);
                    if (matrixRow) {
                      rows.push(matrixRow);
                      shownDomains.add(domain);
                    }
                  }
                  for (const row of matrix) {
                    if (!shownDomains.has(row.domain)) rows.push(row);
                  }
                  return rows;
                })().map((row, i) => (
                  <tr key={row.domain} className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                    <td className={`py-2.5 pr-4 font-medium truncate sticky left-0 bg-card z-10 ${SOURCE_COL_W}`} title={row.domain}>
                      {row.domain}
                    </td>
                    {activePrompts.map((p) => {
                      const ids = promptIdGroups.get(p.promptId) ?? [p.promptId];
                      const count = ids.reduce((s, id) => s + (row.prompts[id] ?? 0), 0);
                      const isHovered = hoveredCell?.domain === row.domain && hoveredCell?.col === p.promptId;
                      const opacity = count > 0 ? 0.15 + (count / maxCountQuestion) * 0.85 : 0;

                      return (
                        <td
                          key={p.promptId}
                          className="py-2.5 px-3 text-center relative"
                          onMouseEnter={() => setHoveredCell({ domain: row.domain, col: p.promptId })}
                          onMouseLeave={() => setHoveredCell(null)}
                        >
                          {count > 0 ? (
                            <span
                              className="inline-block rounded-md px-2.5 py-1 tabular-nums font-semibold text-[11px] min-w-[36px]"
                              style={{
                                backgroundColor: `rgba(16, 185, 129, ${opacity})`,
                                color: opacity > 0.5 ? "white" : "rgb(16, 185, 129)",
                              }}
                            >
                              {count}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">&mdash;</span>
                          )}
                          {isHovered && count > 0 && (
                            <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-2 bg-popover border rounded-lg shadow-lg p-2.5 w-72 text-left pointer-events-none">
                              <p className="text-[11px] font-semibold mb-1">{row.domain}</p>
                              <p className="text-[10px] text-muted-foreground leading-relaxed">{expandPromptText(p.promptText)}</p>
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
        </div>
      )}

      {/* ── Platform View ─────────────────── */}
      {!loading && view === "platforms" && hasPlatformData && (
        <div className={`overflow-x-auto ${platformDomainRows.length > INITIAL_ROWS ? "max-h-[400px] overflow-y-auto" : ""}`}>
          <table className="text-xs border-collapse table-fixed">
            <thead className={platformDomainRows.length > INITIAL_ROWS ? "sticky top-0 bg-card z-10" : ""}>
              <tr className="border-b border-border">
                <th className={`py-2.5 pr-4 text-left font-medium text-muted-foreground ${SOURCE_COL_W}`}>
                  Source
                </th>
                {platformModels.map((m) => (
                  <th
                    key={m}
                    className={`py-2.5 px-3 text-center font-medium text-xs whitespace-nowrap text-muted-foreground ${DATA_COL_W}`}
                  >
                    {MODEL_LABELS[m] ?? titleCase(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {platformDomainRows.map((domain, i) => {
                const domainData = platformByDomain.get(domain);
                return (
                  <tr
                    key={domain}
                    className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${i % 2 === 1 ? "bg-muted/10" : ""}`}
                  >
                    <td className={`py-2.5 pr-4 font-medium truncate ${SOURCE_COL_W}`} title={domain}>
                      {domain}
                    </td>
                    {platformModels.map((m) => {
                      const count = domainData?.get(m) ?? 0;
                      const intensity = count > 0 ? 0.15 + (count / maxCountPlatform) * 0.85 : 0;
                      return (
                        <td key={m} className="py-2.5 px-3 text-center">
                          {count > 0 ? (
                            <span
                              className="inline-block rounded-md px-2.5 py-1 tabular-nums font-semibold text-[11px] min-w-[36px]"
                              style={{
                                backgroundColor: `rgba(16, 185, 129, ${intensity})`,
                                color: intensity > 0.5 ? "white" : "rgb(16, 185, 129)",
                              }}
                            >
                              {count}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">&mdash;</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
