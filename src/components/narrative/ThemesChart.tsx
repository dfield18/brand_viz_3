"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { NarrativeTheme, NarrativeFrame, NarrativeResponse } from "@/types/api";
import { VALID_MODELS, MODEL_LABELS } from "@/lib/constants";
import { useCachedFetch } from "@/lib/useCachedFetch";

interface ThemesChartProps {
  themes: NarrativeTheme[];
  frames?: NarrativeFrame[];
  brandSlug: string;
  range: number;
  pageModel: string;
}

interface NarrativeApiResponse {
  hasData: boolean;
  narrative?: NarrativeResponse;
}

function barColor(pct: number): string {
  if (pct >= 20) return "bg-emerald-500";
  if (pct >= 10) return "bg-blue-500";
  if (pct >= 5) return "bg-amber-400";
  return "bg-gray-300";
}

function textColor(pct: number): string {
  if (pct >= 20) return "text-emerald-600";
  if (pct >= 10) return "text-blue-600";
  if (pct >= 5) return "text-amber-600";
  return "text-muted-foreground";
}

function ThemeRow({ theme, maxPct }: { theme: NarrativeTheme; maxPct: number }) {
  const [open, setOpen] = useState(false);
  const hasPrompts = theme.prompts && theme.prompts.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => hasPrompts && setOpen(!open)}
        className={`w-full flex items-center gap-3 ${hasPrompts ? "cursor-pointer" : "cursor-default"}`}
      >
        <span className="text-sm text-muted-foreground w-40 shrink-0 truncate text-left" title={theme.label}>
          {theme.label}
        </span>
        <div className="flex-1 h-7 rounded bg-muted/50 overflow-hidden">
          <div
            className={`h-full rounded transition-all duration-300 ${barColor(theme.pct)}`}
            style={{ width: maxPct > 0 ? `${(theme.pct / maxPct) * 100}%` : "0%" }}
          />
        </div>
        <span className={`text-sm font-semibold tabular-nums w-12 text-right ${textColor(theme.pct)}`}>
          {theme.pct}%
        </span>
        {hasPrompts && (
          <ChevronDown
            className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {open && hasPrompts && (
        <div className="ml-[calc(10rem+0.75rem)] mr-12 mt-1.5 mb-1 rounded-lg border border-border bg-muted/30 px-3 py-2 space-y-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
            Prompts where &ldquo;{theme.label}&rdquo; narrative appears ({theme.prompts!.length})
          </p>
          {theme.prompts!.map((prompt, i) => (
            <div key={i} className="flex items-start justify-between gap-3">
              <p className="text-xs text-foreground leading-relaxed min-w-0">
                {prompt.text}
              </p>
              <span className="text-xs font-medium text-muted-foreground tabular-nums shrink-0">
                {prompt.pct}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ThemesChart({ themes: initialThemes, frames: initialFrames, brandSlug, range, pageModel }: ThemesChartProps) {
  const [model, setModel] = useState(pageModel);

  // Fetch own data when model differs from page model
  const url = model !== pageModel
    ? `/api/narrative?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}`
    : null;
  const { data: apiData, loading } = useCachedFetch<NarrativeApiResponse>(url);

  const themes = model !== pageModel && apiData?.narrative?.themes
    ? apiData.narrative.themes
    : initialThemes;

  const frames = model !== pageModel && apiData?.narrative?.frames
    ? apiData.narrative.frames
    : initialFrames;

  const noData = model !== pageModel && apiData && (!apiData.hasData || !apiData.narrative?.themes?.length);

  const maxPct = themes.length > 0 ? Math.max(...themes.map((t) => t.pct)) : 0;

  const topFrame = frames && frames.length > 0
    ? [...frames].sort((a, b) => b.percentage - a.percentage)[0]
    : null;

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-base font-semibold">How AI Describes This Brand</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Narratives AI models associate with this brand, based on topics identified in AI responses.
          </p>
          {topFrame && (
            <p className="text-xs text-muted-foreground mt-1">
              Dominant frame: <span className="font-medium text-foreground">&ldquo;{topFrame.frame}&rdquo;</span> ({topFrame.percentage}% of responses)
            </p>
          )}
        </div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0"
        >
          <option value="all">All Models</option>
          {VALID_MODELS.map((m) => (
            <option key={m} value={m}>{MODEL_LABELS[m] ?? m} Only</option>
          ))}
        </select>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground py-4">Loading...</p>
      )}

      {!loading && noData && (
        <p className="text-sm text-muted-foreground">No narrative data for {MODEL_LABELS[model] ?? model}.</p>
      )}

      {!loading && themes.length > 0 && (
        <div className="space-y-3 mt-4">
          {themes.map((theme) => (
            <ThemeRow key={theme.key} theme={theme} maxPct={maxPct} />
          ))}
        </div>
      )}
    </section>
  );
}
