"use client";

import type { ModelComparison } from "@/types/api";
import { CircleHelp } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

interface CrossModelTableProps {
  models: ModelComparison[];
  brandName?: string;
}

const MODEL_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  perplexity: "Perplexity",
  google: "Google AI Overview",
};

/**
 * Narrative stability label (0–100).
 * Matches the overview KPI card's stabilityLabel thresholds.
 */
function getStabilityLabel(value: number): { text: string; className: string } {
  if (value >= 70) return { text: "Consistent", className: "text-emerald-600" };
  if (value >= 40) return { text: "Variable", className: "text-amber-600" };
  return { text: "Volatile", className: "text-red-500" };
}

/**
 * Sentiment label from split — shows the dominant category.
 * Matches the overview sentiment scorecard exactly.
 */
function getSentimentLabel(split?: { positive: number; neutral: number; negative: number }): { text: string; className: string } {
  if (!split) return { text: "—", className: "text-muted-foreground" };
  const { positive, neutral, negative } = split;
  if (positive >= 60) return { text: "Strongly positive", className: "text-emerald-600" };
  if (positive >= 40) return { text: "Mostly positive", className: "text-emerald-600" };
  if (negative >= 40) return { text: "Mostly negative", className: "text-red-500" };
  if (neutral >= 50) return { text: "Mostly neutral", className: "text-muted-foreground" };
  return { text: "Mixed", className: "text-amber-600" };
}

interface MetricDef {
  label: string;
  key: keyof ModelComparison;
  tooltip: string;
  render: (value: number | null, isBest: boolean, model: string) => React.ReactNode;
  lowerIsBetter?: boolean;
}

export function CrossModelTable({ models, brandName = "Brand" }: CrossModelTableProps) {
  if (models.length === 0) {
    return (
      <div className="rounded-xl bg-card p-6 shadow-section">
        <h2 className="text-sm font-semibold mb-4">How Each AI Platform Sees {brandName}</h2>
        <EmptyState message="Select multiple models or use 'All' to compare across AI platforms." />
      </div>
    );
  }

  const metrics: MetricDef[] = [
    {
      label: "Brand Recall",
      key: "mentionRate",
      tooltip: "How often this platform mentions the brand in response to broad industry questions where no brand is named.",
      render: (v, isBest) => (
        <span className={isBest ? "text-primary font-semibold" : ""}>{v}%</span>
      ),
    },
    {
      label: "Share of Voice",
      key: "shareOfVoice",
      tooltip: "The brand's share of all entity mentions — how much of the conversation this brand owns on each platform.",
      render: (v, isBest) => (
        <span className={isBest ? "text-primary font-semibold" : ""}>
          {v === null ? "—" : `${v}%`}
        </span>
      ),
    },
    {
      label: "Top Result Rate",
      key: "topResultRate",
      tooltip: "How often this platform lists the brand as the #1 recommendation in its response.",
      render: (v, isBest) => (
        <span className={isBest ? "text-primary font-semibold" : ""}>
          {v === null ? "—" : `${v}%`}
        </span>
      ),
    },
    {
      label: "Overall Tone",
      key: "sentiment",
      tooltip: "Whether this platform describes the brand in a positive, neutral, or negative way.",
      render: (_v, _isBest, model) => {
        const m = models.find((mod) => mod.model === model);
        const { text, className } = getSentimentLabel(m?.sentimentSplit);
        return <span className={`text-sm font-medium ${className}`}>{text}</span>;
      },
    },
    {
      label: "How Consistent",
      key: "narrativeStability",
      tooltip: "Whether this platform tells the same story about the brand each time, or changes its message.",
      render: (v) => {
        const { text, className } = getStabilityLabel(v ?? 0);
        return <span className={`text-sm font-medium ${className}`}>{text}</span>;
      },
    },
  ];

  // Find best value per metric to highlight
  const best: Record<string, string> = {};
  for (const m of metrics) {
    let bestVal: number | null = null;
    let bestModel = "";
    for (const mod of models) {
      const val = mod[m.key] as number | null;
      if (val === null) continue;
      if (bestVal === null || (m.lowerIsBetter ? val < bestVal : val > bestVal)) {
        bestVal = val;
        bestModel = mod.model;
      }
    }
    best[m.key] = bestModel;
  }

  return (
    <div className="rounded-xl bg-card p-6 shadow-section">
      <h2 className="text-sm font-semibold mb-4">How Each AI Platform Sees {brandName}</h2>
      <div className="overflow-x-auto scrollbar-none">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-medium tracking-wide text-muted-foreground uppercase py-3 pr-4">
                Model
              </th>
              {metrics.map((metric) => (
                <th
                  key={metric.key}
                  className="text-center text-xs font-medium tracking-wide text-muted-foreground uppercase py-3 px-4"
                >
                  <span className="relative group cursor-default inline-flex items-center gap-1 justify-center">
                    {metric.label}
                    <CircleHelp className="h-3 w-3 text-muted-foreground/40" />
                    <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1.5 hidden group-hover:block w-52 rounded-lg border border-border bg-popover p-2.5 text-[11px] font-normal normal-case tracking-normal text-popover-foreground leading-relaxed shadow-md z-20 text-left whitespace-normal">
                      {metric.tooltip}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.model} className="border-b border-border last:border-b-0">
                <td className="py-3 pr-4 text-sm text-muted-foreground">
                  {MODEL_LABELS[m.model] ?? m.model.toUpperCase()}
                </td>
                {metrics.map((metric) => {
                  const isBest = best[metric.key] === m.model && models.length > 1;
                  return (
                    <td
                      key={metric.key}
                      className="py-3 px-4 text-center tabular-nums"
                    >
                      {metric.render(m[metric.key] as number | null, isBest, m.model)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
