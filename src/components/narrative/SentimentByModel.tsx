"use client";

import { useMemo } from "react";
import type { SentimentTrendPoint, ModelComparison } from "@/types/api";
import { MODEL_LABELS } from "@/lib/constants";

interface SentimentByModelProps {
  trend: SentimentTrendPoint[];
  brandName?: string;
  /** When provided, use these pre-computed per-model sentiment values (% positive) to match the overview tab exactly. */
  modelComparison?: ModelComparison[];
}

function barColor(score: number): string {
  if (score >= 60) return "bg-emerald-500";
  if (score >= 40) return "bg-emerald-400";
  if (score <= 15) return "bg-red-400";
  return "bg-amber-400";
}

function scoreLabel(score: number, split?: { positive: number; neutral: number; negative: number }): string {
  if (split) {
    if (split.positive >= 60) return "Strongly positive";
    if (split.positive >= 40) return "Mostly positive";
    if (split.negative >= 40) return "Mostly negative";
    if (split.neutral >= 50) return "Mostly neutral";
    return "Mixed";
  }
  if (score >= 60) return "Strongly positive";
  if (score >= 40) return "Mostly positive";
  if (score <= 10 && score > 0) return "Mostly negative";
  return "Mixed";
}

export function SentimentByModel({ trend, brandName = "the Brand", modelComparison }: SentimentByModelProps) {
  const modelScores = useMemo(() => {
    // Prefer modelComparison (from overview API) for consistency with overview tab
    if (modelComparison && modelComparison.length > 0) {
      return modelComparison
        .map((mc) => ({
          model: mc.model,
          label: MODEL_LABELS[mc.model] ?? mc.model,
          score: mc.sentiment,
          split: mc.sentimentSplit,
        }))
        .sort((a, b) => b.score - a.score);
    }

    // Fallback: derive from trend data
    const buckets = new Map<string, { sum: number; count: number }>();
    for (const t of trend) {
      if (t.model === "all") continue;
      const entry = buckets.get(t.model) ?? { sum: 0, count: 0 };
      entry.sum += t.positive;
      entry.count++;
      buckets.set(t.model, entry);
    }
    return [...buckets.entries()]
      .map(([model, { sum, count }]) => ({
        model,
        label: MODEL_LABELS[model] ?? model,
        score: Math.round(sum / count),
        split: undefined as { positive: number; neutral: number; negative: number } | undefined,
      }))
      .sort((a, b) => b.score - a.score);
  }, [trend, modelComparison]);

  if (modelScores.length === 0) return null;

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold">How Each AI Platform Sees {brandName}</h2>
      <p className="text-xs text-muted-foreground mt-1 mb-4">
        Whether ChatGPT, Gemini, Claude, and Perplexity describe the brand positively or negatively
      </p>

      <div className="space-y-3">
        {modelScores.map(({ model, label, score, split }) => (
          <div key={model} className="flex items-center gap-3">
            <span className="text-sm w-24 shrink-0 truncate text-left text-muted-foreground">
              {label}
            </span>
            <div className="flex-1 h-7 rounded bg-muted/40 overflow-hidden relative">
              <div
                className={`h-full rounded transition-all duration-300 flex items-center ${barColor(score)}`}
                style={{ width: `${score}%` }}
              >
                {score >= 30 && (
                  <span className="text-[11px] font-semibold text-white drop-shadow-sm ml-auto mr-2 tabular-nums">{score}%</span>
                )}
              </div>
              {score < 30 && (
                <span className="absolute top-0 bottom-0 flex items-center text-[11px] font-semibold text-muted-foreground tabular-nums" style={{ left: `${score + 1}%`, paddingLeft: 4 }}>{score}%</span>
              )}
            </div>
            <div className="shrink-0 text-right w-24">
              <span className="text-[11px] text-muted-foreground">{scoreLabel(score, split)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
