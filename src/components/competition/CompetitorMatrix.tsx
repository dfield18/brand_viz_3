"use client";

import { useState, useMemo } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import type { PromptMatrixRow } from "@/types/api";
import { MODEL_LABELS } from "@/lib/constants";
import { useResponseDetail } from "@/lib/useResponseDetail";

interface CompetitorMatrixProps {
  matrix: PromptMatrixRow[];
  entityIds: string[];
  entityNames: Record<string, string>;
  brandEntityId: string;
  brandSlug: string;
  brandName: string;
}

function rankColor(rank: number | null): string {
  if (rank === null) return "";
  if (rank === 1) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (rank === 2) return "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300";
  if (rank === 3) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
}

const selectClass = "text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card";

export function CompetitorMatrix({
  matrix,
  entityIds,
  entityNames,
  brandEntityId,
  brandSlug,
  brandName,
}: CompetitorMatrixProps) {
  const { openResponse } = useResponseDetail(brandSlug);
  const [promptFilter, setPromptFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Build unique prompts for the dropdown
  const prompts = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of matrix) {
      if (!seen.has(row.promptId)) {
        seen.set(row.promptId, row.promptText);
      }
    }
    return [...seen.entries()].map(([id, text]) => ({ id, text }));
  }, [matrix]);

  const filtered = useMemo(() => {
    return matrix.filter((row) => {
      if (promptFilter !== "all" && row.promptId !== promptFilter) return false;
      if (search && !row.promptText.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [matrix, promptFilter, search]);

  const hasFilters = promptFilter !== "all" || search !== "";

  if (matrix.length === 0) {
    return <p className="text-sm text-muted-foreground">No prompt matrix data available.</p>;
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <select value={promptFilter} onChange={(e) => setPromptFilter(e.target.value)} className={`${selectClass} max-w-xs truncate`}>
          <option value="all">All Prompts</option>
          {prompts.map((p) => (
            <option key={p.id} value={p.id}>{p.text.length > 60 ? p.text.slice(0, 60) + "…" : p.text}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search prompts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card w-44"
        />
        <span className="text-xs text-muted-foreground">
          {filtered.length} of {matrix.length} prompts
        </span>
        {hasFilters && (
          <button
            onClick={() => { setPromptFilter("all"); setSearch(""); }}
            className="text-xs text-primary hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="py-2 pr-3 text-left font-medium text-muted-foreground min-w-[200px] sticky left-0 bg-card z-10">
                Prompt
              </th>
              {entityIds.map((id) => (
                <th
                  key={id}
                  className={`py-2 px-2 text-center font-medium min-w-[60px] ${id === brandEntityId ? "text-primary" : "text-muted-foreground"}`}
                  title={entityNames[id] ?? id}
                >
                  <span className="truncate block max-w-[80px]">{entityNames[id] ?? id}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const rowKey = `${row.promptId}-${row.model}`;
              const isExpanded = expandedRow === rowKey;

              return (
                <MatrixRow
                  key={rowKey}
                  row={row}
                  entityIds={entityIds}
                  entityNames={entityNames}
                  brandEntityId={brandEntityId}
                  isExpanded={isExpanded}
                  onToggle={() => setExpandedRow(isExpanded ? null : rowKey)}
                  onViewResponse={() => openResponse({ promptText: row.promptText, model: row.model, brandName })}
                />
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No prompts match the current filters.</p>
        )}
        {filtered.length > 0 && (
          <p className="text-xs text-muted-foreground italic mt-2">
            Click a row to preview the prompt, then view the full AI response.
          </p>
        )}
      </div>
    </div>
  );
}

/* ── Matrix Row ────────────────────────────────────────────────────── */

function MatrixRow({
  row,
  entityIds,
  entityNames,
  brandEntityId,
  isExpanded,
  onToggle,
  onViewResponse,
}: {
  row: PromptMatrixRow;
  entityIds: string[];
  entityNames: Record<string, string>;
  brandEntityId: string;
  isExpanded: boolean;
  onToggle: () => void;
  onViewResponse: () => void;
}) {
  const colCount = 1 + entityIds.length;

  return (
    <>
      <tr
        className="border-b border-border/30 hover:bg-muted/20 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="py-2 pr-3 text-foreground sticky left-0 bg-card z-10">
          <div className="flex items-start gap-1.5">
            <ChevronRight
              className={`h-3.5 w-3.5 text-muted-foreground/50 shrink-0 mt-0.5 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}
            />
            <span className="line-clamp-2 leading-tight">{row.promptText}</span>
          </div>
        </td>
        {entityIds.map((id) => {
          const cell = row.entities[id];
          if (!cell) {
            return (
              <td key={id} className="py-2 px-2 text-center text-muted-foreground/40">
                —
              </td>
            );
          }
          return (
            <td key={id} className="py-2 px-2 text-center">
              <span
                className={`inline-block rounded px-1.5 py-0.5 tabular-nums font-medium ${rankColor(cell.rank)}`}
                title={`Rank ${cell.rank ?? "—"}`}
              >
                {cell.rank ?? "—"}
              </span>
            </td>
          );
        })}
      </tr>

      {isExpanded && (
        <tr className="bg-muted/20">
          <td colSpan={colCount} className="px-6 py-4">
            <div className="space-y-3">
              {/* Prompt preview */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1">Prompt</h4>
                <p className="text-sm text-foreground leading-relaxed">{row.promptText}</p>
              </div>

              {/* Metadata */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {row.cluster && <span>Category: <span className="font-medium text-foreground">{row.cluster}</span></span>}
                {row.intent && <span>Type: <span className="font-medium text-foreground">{row.intent}</span></span>}
                {row.model && <span>Model: <span className="font-medium text-foreground">{MODEL_LABELS[row.model] ?? row.model}</span></span>}
              </div>

              {/* Entity rankings */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Rankings</h4>
                <div className="flex flex-wrap gap-2">
                  {entityIds
                    .filter((id) => row.entities[id] && row.entities[id].rank !== null)
                    .sort((a, b) => (row.entities[a].rank ?? 99) - (row.entities[b].rank ?? 99))
                    .map((id) => {
                      const cell = row.entities[id];
                      return (
                        <span
                          key={id}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${rankColor(cell.rank)} ${id === brandEntityId ? "ring-1 ring-primary" : ""}`}
                        >
                          #{cell.rank} {entityNames[id] ?? id}
                        </span>
                      );
                    })}
                </div>
              </div>

              {/* View full response */}
              <button
                onClick={(e) => { e.stopPropagation(); onViewResponse(); }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors mt-1"
              >
                <ExternalLink className="h-3 w-3" />
                View full response
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
