"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Info, ExternalLink, ChevronUp, ChevronDown, ChevronRight, Trophy, AlertTriangle, Loader2 } from "lucide-react";
import type { ResultByQuestion, TopPromptWin, WorstPerformingPrompt } from "@/types/api";
import { MODEL_LABELS } from "@/lib/constants";
import { useResponseDetail } from "@/lib/useResponseDetail";
import { subjectNoun } from "@/lib/subjectNoun";

interface ResultsByQuestionProps {
  results: ResultByQuestion[];
  wins: TopPromptWin[];
  opportunities: WorstPerformingPrompt[];
  brandSlug?: string;
  brandName?: string;
  category?: string | null;
  /** Render without card wrapper */
  inline?: boolean;
  /** Externally controlled model filter — hides the dropdown when set */
  externalModel?: string;
  isOrg?: boolean;
}

type RowStatus = "win" | "competitive" | "missing";

const SENTIMENT_STYLES: Record<string, string> = {
  Strong: "text-emerald-700 font-semibold",
  Positive: "text-emerald-600",
  Neutral: "text-muted-foreground",
  Negative: "text-red-600",
};

const MODEL_DISPLAY_ORDER = ["chatgpt", "gemini", "claude", "perplexity", "google"];

const STATUS_BADGE: Record<RowStatus, { label: string; className: string }> = {
  win: { label: "Win", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400" },
  competitive: { label: "Competitive", className: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400" },
  missing: { label: "Missing", className: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400" },
};

function buildColumnTooltips(noun: string) {
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  return {
    aiVisibility: `Percentage of responses that mention the ${noun} for this question`,
    shareOfVoice: `${Noun}'s share of all entity mentions for this question`,
    firstPosition: `Percentage of responses where ${noun} is the #1 result`,
    avgPosition: `Average rank position when the ${noun} is mentioned`,
    avgSentiment: `How the ${noun} is presented: Strong, Positive, Neutral, or Negative`,
  };
}

type SortKey = "promptText" | "model" | "aiVisibility" | "shareOfVoice" | "firstPosition" | "avgPosition" | "avgSentiment" | "status";
type SortDir = "asc" | "desc";
type FilterMode = "all" | "wins" | "opportunities";

function SortIcon({ column, sortKey, sortDir }: { column: SortKey; sortKey: SortKey | null; sortDir: SortDir }) {
  if (sortKey !== column) return <ChevronDown className="h-3 w-3 text-muted-foreground/30" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3 w-3 text-foreground" />
    : <ChevronDown className="h-3 w-3 text-foreground" />;
}

function ColumnHeader({ label, sublabel, tooltip, column, onSort }: {
  label: string; sublabel: string; tooltip: string;
  column: SortKey;
  onSort: (key: SortKey) => void;
}) {
  return (
    <th className="px-3 cursor-pointer select-none text-center align-bottom pb-3 relative" onClick={() => onSort(column)}>
      <div className="font-medium">{label}</div>
      {sublabel && (
        <div className="text-[10px] text-muted-foreground font-normal normal-case tracking-normal mt-0.5">
          {sublabel}
        </div>
      )}
      <div className="absolute top-0 right-1 group" onClick={(e) => e.stopPropagation()}>
        <Info className="h-3 w-3 text-muted-foreground/40 cursor-default" />
        <div className="absolute right-0 top-full mt-1 z-50 hidden group-hover:block w-48 rounded-lg border border-border bg-popover p-2.5 text-xs text-popover-foreground shadow-md font-normal normal-case tracking-normal text-left">
          {tooltip}
        </div>
      </div>
    </th>
  );
}

function statusScore(s: RowStatus) {
  return s === "win" ? 2 : s === "competitive" ? 1 : 0;
}

function sentScore(s: string) {
  return s === "Strong" ? 2 : s === "Positive" ? 1 : s === "Neutral" ? 0 : -1;
}

interface PreviewResponse {
  model: string;
  responseText: string;
  date: string;
  prompt: { text: string; cluster: string | null; intent: string | null };
  analysis: unknown;
}

export function ResultsByQuestion({ results, wins, opportunities, brandSlug, brandName, category, inline, externalModel, isOrg }: ResultsByQuestionProps) {
  const [internalModel, setInternalModel] = useState("all");
  const selectedModel = externalModel ?? internalModel;
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filter, setFilter] = useState<FilterMode>("all");
  const { openResponse } = useResponseDetail(brandSlug ?? "");
  const noun = subjectNoun(brandName ?? "Brand", category);
  const columnTooltips = useMemo(() => buildColumnTooltips(noun), [noun]);

  // Expandable preview state
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, PreviewResponse[]>>({});
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);

  const handleRowClick = useCallback(async (promptText: string, rowModels: string[]) => {
    if (!brandSlug) return;

    // If only one model, go straight to full response
    if (rowModels.length === 1) {
      openResponse({ promptText, model: rowModels[0], brandName, scopeMode: "query_universe" });
      return;
    }

    // Toggle expand
    if (expandedPrompt === promptText) {
      setExpandedPrompt(null);
      return;
    }

    setExpandedPrompt(promptText);

    // Fetch previews if not cached
    if (!previewData[promptText]) {
      setPreviewLoading(promptText);
      try {
        const params = new URLSearchParams({ brandSlug, promptText, scopeMode: "query_universe" });
        const res = await fetch(`/api/response-detail?${params}`);
        if (res.ok) {
          const data = await res.json();
          setPreviewData((prev) => ({ ...prev, [promptText]: data.responses ?? [] }));
        }
      } finally {
        setPreviewLoading(null);
      }
    }
  }, [brandSlug, brandName, expandedPrompt, previewData, openResponse]);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(key === "avgPosition" ? "asc" : "desc");
    }
  }, [sortKey]);

  const models = useMemo(() => {
    const set = new Set(results.map((r) => r.model));
    return [...set].sort();
  }, [results]);

  // Build lookup sets from wins/opportunities
  const winPrompts = useMemo(() => new Set(wins.map((w) => w.prompt)), [wins]);
  const opportunityMap = useMemo(() => {
    const map = new Map<string, WorstPerformingPrompt>();
    for (const o of opportunities) map.set(o.prompt, o);
    return map;
  }, [opportunities]);

  // Build rows — one per prompt, averaging across all contributing models
  const rows = useMemo(() => {
    const filtered = selectedModel === "all" ? results : results.filter((r) => r.model === selectedModel);

    const byPrompt = new Map<string, {
      aiVis: number[]; sov: number[]; fp: number[]; ap: number[]; sent: string[];
      models: Set<string>;
    }>();
    for (const r of filtered) {
      if (!byPrompt.has(r.promptText)) {
        byPrompt.set(r.promptText, { aiVis: [], sov: [], fp: [], ap: [], sent: [], models: new Set() });
      }
      const b = byPrompt.get(r.promptText)!;
      b.aiVis.push(r.aiVisibility);
      b.sov.push(r.shareOfVoice);
      b.fp.push(r.firstPosition);
      if (r.avgPosition !== null) b.ap.push(r.avgPosition);
      b.sent.push(r.avgSentiment);
      b.models.add(r.model);
    }

    // Include opportunity prompts not already in results
    for (const o of opportunities) {
      if (!byPrompt.has(o.prompt)) {
        byPrompt.set(o.prompt, { aiVis: [0], sov: [0], fp: [0], ap: [], sent: [], models: new Set() });
      }
    }

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const avgF = (arr: number[]) => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null;

    const sentAvg = (arr: string[]) => {
      if (arr.length === 0) return "Neutral" as const;
      const scores: number[] = arr.map((s) => s === "Strong" ? 2 : s === "Positive" ? 1 : s === "Neutral" ? 0 : -1);
      const a = scores.reduce((x, y) => x + y, 0) / scores.length;
      if (a >= 1.5) return "Strong" as const;
      if (a >= 0.5) return "Positive" as const;
      if (a >= -0.5) return "Neutral" as const;
      return "Negative" as const;
    };

    const mapped = [...byPrompt.entries()].map(([promptText, b]) => {
      const aiVisibility = avg(b.aiVis);
      const opp = opportunityMap.get(promptText);
      let status: RowStatus;
      if (winPrompts.has(promptText)) {
        status = "win";
      } else if (opp && opp.rank === null) {
        status = "missing";
      } else if (opp) {
        status = "competitive";
      } else if (aiVisibility === 0) {
        status = "missing";
      } else {
        status = "competitive";
      }

      // Sort models in canonical display order
      const sortedModels = MODEL_DISPLAY_ORDER.filter((m) => b.models.has(m));

      return {
        promptText,
        models: sortedModels,
        aiVisibility,
        shareOfVoice: avg(b.sov),
        firstPosition: avg(b.fp),
        avgPosition: avgF(b.ap),
        avgSentiment: sentAvg(b.sent),
        status,
        competitors: opp?.competitors ?? [],
      };
    });

    // Apply filter
    let filteredRows = mapped;
    if (filter === "wins") filteredRows = mapped.filter((r) => r.status === "win");
    if (filter === "opportunities") filteredRows = mapped.filter((r) => r.status === "missing" || r.status === "competitive");

    // Sort
    if (!sortKey) {
      return filteredRows.sort((a, b) =>
        statusScore(b.status) - statusScore(a.status)
        || b.aiVisibility - a.aiVisibility
        || b.shareOfVoice - a.shareOfVoice
      );
    }

    const dir = sortDir === "asc" ? 1 : -1;
    return filteredRows.sort((a, b) => {
      if (sortKey === "promptText") return dir * a.promptText.localeCompare(b.promptText);
      if (sortKey === "model") return dir * (a.models.length - b.models.length);
      if (sortKey === "avgSentiment") return dir * (sentScore(a.avgSentiment) - sentScore(b.avgSentiment));
      if (sortKey === "status") return dir * (statusScore(a.status) - statusScore(b.status));
      const aVal = a[sortKey] ?? 999;
      const bVal = b[sortKey] ?? 999;
      return dir * ((aVal as number) - (bVal as number));
    });
  }, [results, selectedModel, sortKey, sortDir, filter, winPrompts, opportunityMap, opportunities]);

  // Compute "all" rows (unfiltered by filter mode) for accurate counts
  const allRows = useMemo(() => {
    const filtered = selectedModel === "all" ? results : results.filter((r) => r.model === selectedModel);

    const byPrompt = new Map<string, { aiVis: number[] }>();
    for (const r of filtered) {
      if (!byPrompt.has(r.promptText)) {
        byPrompt.set(r.promptText, { aiVis: [] });
      }
      byPrompt.get(r.promptText)!.aiVis.push(r.aiVisibility);
    }

    // Also include opportunity prompts not already in results
    for (const o of opportunities) {
      if (!byPrompt.has(o.prompt)) {
        byPrompt.set(o.prompt, { aiVis: [0] });
      }
    }

    return [...byPrompt.entries()].map(([promptText, b]) => {
      const aiVisibility = b.aiVis.length > 0 ? Math.round(b.aiVis.reduce((a, c) => a + c, 0) / b.aiVis.length) : 0;
      const opp = opportunityMap.get(promptText);
      let status: RowStatus;
      if (winPrompts.has(promptText)) {
        status = "win";
      } else if (opp && opp.rank === null) {
        status = "missing";
      } else if (opp) {
        status = "competitive";
      } else if (aiVisibility === 0) {
        status = "missing";
      } else {
        status = "competitive";
      }
      return { promptText, status };
    });
  }, [results, selectedModel, winPrompts, opportunityMap, opportunities]);

  const winCount = allRows.filter((r) => r.status === "win").length;
  const oppCount = allRows.filter((r) => r.status === "missing" || r.status === "competitive").length;

  if (results.length === 0 && opportunities.length === 0) return null;

  const Wrapper = inline ? "div" : "section";

  return (
    <Wrapper className={inline ? "" : "rounded-xl bg-card p-6 shadow-section"}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <h2 className={inline ? "text-sm font-medium text-foreground" : "text-base font-semibold"}>Performance by Question</h2>
          <p className="text-xs text-muted-foreground mt-1">
            How {brandName || `this ${noun}`} performs across different industry questions — none mention {brandName || `this ${noun}`} by name
          </p>
        </div>
        {!externalModel && (
          <select
            value={selectedModel}
            onChange={(e) => setInternalModel(e.target.value)}
            className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card"
          >
            <option value="all">All AI Platforms</option>
            {models.map((m) => (
              <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
            ))}
          </select>
        )}
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 mt-5 mb-5">
        <button
          onClick={() => setFilter("all")}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            filter === "all"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted"
          }`}
        >
          All
          <span className={`ml-1.5 text-xs tabular-nums ${filter === "all" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
            {allRows.length}
          </span>
        </button>
        <button
          onClick={() => setFilter("wins")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            filter === "wins"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted"
          }`}
        >
          <Trophy className="h-3.5 w-3.5" />
          Wins
          <span className={`text-xs tabular-nums ${filter === "wins" ? "text-white/70" : "text-muted-foreground"}`}>
            {winCount}
          </span>
        </button>
        <button
          onClick={() => setFilter("opportunities")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
            filter === "opportunities"
              ? "bg-amber-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground bg-muted/40 hover:bg-muted"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Opportunities
          <span className={`text-xs tabular-nums ${filter === "opportunities" ? "text-white/70" : "text-muted-foreground"}`}>
            {oppCount}
          </span>
        </button>
      </div>

      <div className="overflow-x-auto max-h-[680px] overflow-y-auto scrollbar-none">
        <table className="w-full text-[13px] min-w-[600px]">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border/60 text-[11px] text-muted-foreground uppercase tracking-wider">
              <th className="pb-3 pr-4 pl-1 text-left font-medium cursor-pointer select-none align-bottom" onClick={() => handleSort("promptText")}>
                <div className="inline-flex items-center gap-1">
                  Question
                  <SortIcon column="promptText" sortKey={sortKey} sortDir={sortDir} />
                </div>
              </th>
              <th className="pb-3 px-3 cursor-pointer select-none text-center align-bottom" onClick={() => handleSort("model")}>
                <div className="inline-flex items-center gap-1 justify-center">
                  <span className="font-medium">AI Platform</span>
                  <SortIcon column="model" sortKey={sortKey} sortDir={sortDir} />
                </div>
              </th>
              <th className="pb-3 px-3 cursor-pointer select-none text-center align-bottom" onClick={() => handleSort("status")}>
                <div className="inline-flex items-center gap-1 justify-center">
                  <span className="font-medium">Status</span>
                  <SortIcon column="status" sortKey={sortKey} sortDir={sortDir} />
                </div>
              </th>
              <ColumnHeader label="AI Visibility" sublabel="% mentioned" tooltip={columnTooltips.aiVisibility} column="aiVisibility" onSort={handleSort} />
              <ColumnHeader label="Share of Voice" sublabel={`% of ${noun} mentions`} tooltip={columnTooltips.shareOfVoice} column="shareOfVoice" onSort={handleSort} />
              <ColumnHeader label="Top Result Rate" sublabel={`% of time ${noun} is listed first`} tooltip={columnTooltips.firstPosition} column="firstPosition" onSort={handleSort} />
              <ColumnHeader label="Avg. Position" sublabel="position when shown" tooltip={columnTooltips.avgPosition} column="avgPosition" onSort={handleSort} />
              <ColumnHeader label="Avg. Sentiment" sublabel="" tooltip={columnTooltips.avgSentiment} column="avgSentiment" onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const badge = STATUS_BADGE[row.status];
              const isExpanded = expandedPrompt === row.promptText;
              const hasMultipleModels = row.models.length > 1;
              const previews = previewData[row.promptText] ?? [];
              const isLoadingPreviews = previewLoading === row.promptText;

              return (
                <React.Fragment key={row.promptText}>
                  <tr
                    className={`border-b border-border/30 ${isExpanded ? "border-b-0 bg-muted/10" : ""} ${idx % 2 === 1 && !isExpanded ? "bg-muted/15" : ""} ${brandSlug ? "cursor-pointer hover:bg-muted/30 transition-colors" : ""}`}
                    onClick={brandSlug ? () => handleRowClick(row.promptText, row.models) : undefined}
                  >
                    <td className="py-3 pr-4 pl-1 max-w-sm">
                      <div className="flex items-start gap-1.5">
                        {brandSlug && hasMultipleModels && (
                          <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform mt-0.5 ${isExpanded ? "rotate-90" : ""}`} />
                        )}
                        <span className="text-foreground leading-relaxed">{row.promptText}</span>
                        {brandSlug && !hasMultipleModels && <ExternalLink className="h-3 w-3 text-muted-foreground/40 shrink-0 mt-0.5" />}
                      </div>
                      {row.competitors.length > 0 && (
                        <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                          {isOrg ? "Other organizations" : "Competitors"}: {row.competitors.join(" · ")}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="flex flex-wrap justify-center gap-1">
                        {row.models.length > 0 ? row.models.map((m) => (
                          <span key={m} className="inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground whitespace-nowrap">
                            {MODEL_LABELS[m] ?? m}
                          </span>
                        )) : (
                          <span className="text-xs text-muted-foreground">&mdash;</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${badge.className}`}>
                        {row.status === "win" && <Trophy className="h-3 w-3" />}
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center tabular-nums">
                      {row.aiVisibility}%
                    </td>
                    <td className="py-3 px-3 text-center tabular-nums">
                      <span className={row.shareOfVoice >= 20 ? "text-amber-600 font-medium" : ""}>
                        {row.shareOfVoice}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center tabular-nums">
                      <span className={row.firstPosition >= 50 ? "text-amber-600 font-medium" : ""}>
                        {row.firstPosition}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center tabular-nums font-medium">
                      {row.avgPosition !== null ? `#${row.avgPosition}` : "\u2014"}
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <span className={SENTIMENT_STYLES[row.avgSentiment] ?? ""}>
                        {row.avgSentiment}
                      </span>
                    </td>
                  </tr>

                  {/* Expanded preview row */}
                  {isExpanded && (
                    <tr className="border-b border-border/30 bg-muted/10">
                      <td colSpan={8} className="px-6 pb-5 pt-1">
                        {isLoadingPreviews ? (
                          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading responses&hellip;
                          </div>
                        ) : previews.length === 0 ? (
                          <p className="py-4 text-sm text-muted-foreground text-center">
                            No response data available for this question.
                          </p>
                        ) : (
                          <div className="grid gap-3">
                            <p className="text-xs text-muted-foreground">Click a response to view the full answer:</p>
                            {previews.map((preview) => {
                              const snippet = preview.responseText.slice(0, 300).replace(/[*#_~`>]/g, "").replace(/^[-•]\s*/gm, "").replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 200);
                              return (
                                <button
                                  key={preview.model + preview.date}
                                  className="flex items-start gap-3 rounded-lg border border-border/60 bg-card p-3.5 text-left hover:border-primary/40 hover:bg-muted/30 transition-colors group"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openResponse({ promptText: row.promptText, model: preview.model, brandName, scopeMode: "query_universe" });
                                  }}
                                >
                                  <div className="shrink-0 mt-0.5">
                                    <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground whitespace-nowrap">
                                      {MODEL_LABELS[preview.model] ?? preview.model}
                                    </span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-foreground line-clamp-2">{snippet}{preview.responseText.length > 200 ? "\u2026" : ""}</p>
                                    <p className="text-[11px] text-muted-foreground mt-1">{preview.date}</p>
                                  </div>
                                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary shrink-0 mt-1 transition-colors" />
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                  {filter === "wins" ? "No #1 rankings yet." : filter === "opportunities" ? "No opportunity prompts found." : "No prompt data available."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Wrapper>
  );
}
