"use client";

import { useState, useMemo, useCallback } from "react";
import { ExternalLink, Download, FileText } from "lucide-react";
import type { NarrativeExample } from "@/types/api";
import { useResponseDetail } from "@/lib/useResponseDetail";

interface NarrativeExamplesProps {
  examples: NarrativeExample[];
  brandSlug?: string;
  brandName?: string;
}

const SENTIMENT_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  POS: { bg: "bg-emerald-100 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-400", label: "Positive" },
  NEG: { bg: "bg-red-100 dark:bg-red-950/30", text: "text-red-700 dark:text-red-400", label: "Negative" },
  NEU: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400", label: "Neutral" },
};

const MODEL_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  perplexity: "Perplexity",
};

const INITIAL_COUNT = 3;

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function NarrativeExamples({ examples, brandSlug, brandName }: NarrativeExamplesProps) {
  const { openResponse } = useResponseDetail(brandSlug ?? "");
  const [modelFilter, setModelFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);

  // Unique models for filter options
  const models = useMemo(() => {
    const set = new Set(examples.map((e) => e.model).filter(Boolean));
    return [...set] as string[];
  }, [examples]);

  // Combine sentiments and themes into one filter list
  const tagOptions = useMemo(() => {
    const sentimentSet = new Set(examples.map((e) => e.sentiment));
    const themeSet = new Set(examples.flatMap((e) => e.themes));
    const options: { value: string; label: string; group: "sentiment" | "theme" }[] = [];
    for (const s of sentimentSet) {
      options.push({ value: `sentiment:${s}`, label: SENTIMENT_BADGE[s]?.label ?? s, group: "sentiment" });
    }
    for (const t of themeSet) {
      options.push({ value: `theme:${t}`, label: t, group: "theme" });
    }
    return options;
  }, [examples]);

  const filtered = useMemo(() => {
    return examples.filter((ex) => {
      if (modelFilter !== "all" && ex.model !== modelFilter) return false;
      if (tagFilter !== "all") {
        if (tagFilter.startsWith("sentiment:")) {
          if (ex.sentiment !== tagFilter.slice(10)) return false;
        } else if (tagFilter.startsWith("theme:")) {
          if (!ex.themes.includes(tagFilter.slice(6))) return false;
        }
      }
      return true;
    });
  }, [examples, modelFilter, tagFilter]);

  const exportCSV = useCallback(() => {
    const headers = ["Prompt", "Model", "Sentiment", "Narratives", "Excerpt"];
    const rows = filtered.map((ex) => [
      `"${ex.prompt.replace(/"/g, '""')}"`,
      ex.model ? (MODEL_LABELS[ex.model] ?? ex.model) : "",
      SENTIMENT_BADGE[ex.sentiment]?.label ?? ex.sentiment,
      `"${ex.themes.join(", ")}"`,
      `"${ex.excerpt.replace(/"/g, '""')}"`,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `narrative-examples${modelFilter !== "all" ? `-${modelFilter}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [filtered, modelFilter]);

  const exportPDF = useCallback(() => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const rows = filtered.map((ex) => {
      const badge = SENTIMENT_BADGE[ex.sentiment] ?? SENTIMENT_BADGE.NEU;
      return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(ex.prompt)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;font-size:13px;">${ex.model ? escapeHtml(MODEL_LABELS[ex.model] ?? ex.model) : ""}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(badge.label)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(ex.themes.join(", "))}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(ex.excerpt)}</td>
        </tr>`;
    }).join("");

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Explore AI Responses by Narrative</title>
      <style>body{font-family:system-ui,sans-serif;margin:40px;color:#1a1a1a}
      table{border-collapse:collapse;width:100%}th{text-align:left;padding:8px;border-bottom:2px solid #333;font-size:12px;text-transform:uppercase;letter-spacing:0.5px}
      @media print{body{margin:20px}}</style></head><body>
      <h1 style="font-size:18px;margin-bottom:4px">Explore AI Responses by Narrative</h1>
      <p style="font-size:13px;color:#666;margin-bottom:20px">${filtered.length} examples${modelFilter !== "all" ? ` — ${escapeHtml(MODEL_LABELS[modelFilter] ?? modelFilter)}` : ""}</p>
      <table><thead><tr><th>Prompt</th><th>Model</th><th>Sentiment</th><th>Narratives</th><th>Excerpt</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`);
    printWindow.document.close();
    printWindow.print();
  }, [filtered, modelFilter]);

  if (!examples || examples.length === 0) {
    return <p className="text-sm text-muted-foreground">No examples available.</p>;
  }

  const visible = showAll ? filtered : filtered.slice(0, INITIAL_COUNT);
  const hasMore = filtered.length > INITIAL_COUNT;

  return (
    <div className="space-y-4">
      {/* Header with export buttons */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Explore AI Responses by Narrative</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            onClick={exportPDF}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            Export PDF
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={tagFilter}
          onChange={(e) => { setTagFilter(e.target.value); setShowAll(false); }}
          className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card"
        >
          <option value="all">All Sentiments and Narratives</option>
          <optgroup label="Sentiment">
            {tagOptions.filter((o) => o.group === "sentiment").map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </optgroup>
          <optgroup label="Narrative">
            {tagOptions.filter((o) => o.group === "theme").map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </optgroup>
        </select>
        {models.length > 1 && (
          <select
            value={modelFilter}
            onChange={(e) => { setModelFilter(e.target.value); setShowAll(false); }}
            className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card"
          >
            <option value="all">All Models</option>
            {models.map((m) => (
              <option key={m} value={m}>{MODEL_LABELS[m] ?? m}</option>
            ))}
          </select>
        )}
        {(modelFilter !== "all" || tagFilter !== "all") && (
          <span className="text-[11px] text-muted-foreground self-center">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Examples */}
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">No examples match the selected filters.</p>
      ) : (
        visible.map((ex, i) => {
          const badge = SENTIMENT_BADGE[ex.sentiment] ?? SENTIMENT_BADGE.NEU;
          return (
            <div
              key={i}
              className={`rounded-lg border border-border bg-card p-4 space-y-2 ${brandSlug ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}`}
              onClick={brandSlug ? () => openResponse({ promptText: ex.prompt, model: ex.model, brandName }) : undefined}
            >
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-muted-foreground flex-1">
                  {ex.prompt}
                </p>
                {brandSlug && <ExternalLink className="h-3 w-3 text-muted-foreground/40 shrink-0" />}
                {ex.model && (
                  <span className="text-[10px] font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded shrink-0">
                    {MODEL_LABELS[ex.model] ?? ex.model}
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed">
                {ex.excerpt}
                {ex.excerpt.length >= 198 && "..."}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ex.themes.map((theme) => (
                  <span
                    key={theme}
                    className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs"
                  >
                    {theme}
                  </span>
                ))}
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${badge.bg} ${badge.text}`}
                >
                  {badge.label}
                </span>
              </div>
            </div>
          );
        })
      )}

      {/* Show more / less */}
      {hasMore && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
        >
          {showAll ? "Show less" : `Show all ${filtered.length} examples`}
        </button>
      )}
    </div>
  );
}
