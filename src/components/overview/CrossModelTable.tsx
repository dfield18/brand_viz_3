"use client";

import type { ModelComparison } from "@/types/api";
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
  if (value >= 70) return { text: "High", className: "text-emerald-600" };
  if (value >= 40) return { text: "Medium", className: "text-amber-600" };
  return { text: "Low", className: "text-red-500" };
}

/**
 * Sentiment label from split — shows the dominant category.
 * Matches the overview sentiment scorecard exactly.
 */
function getSentimentLabel(split?: { positive: number; neutral: number; negative: number }): { text: string; className: string } {
  if (!split) return { text: "—", className: "text-muted-foreground" };
  const { positive, neutral, negative } = split;
  const max = Math.max(positive, neutral, negative);
  const min = Math.min(positive, neutral, negative);
  // Near three-way tie — no category is clearly dominant
  if (max - min <= 10 && max < 45) return { text: "Mixed", className: "text-amber-600" };
  // Find dominant category
  if (positive >= neutral && positive >= negative) {
    return { text: `${positive}% Positive`, className: positive >= 40 ? "text-emerald-600" : "text-amber-600" };
  }
  if (negative >= neutral) {
    return { text: `${negative}% Negative`, className: "text-red-500" };
  }
  return { text: `${neutral}% Neutral`, className: "text-muted-foreground" };
}

interface MetricDef {
  label: string;
  key: keyof ModelComparison;
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
      render: (v, isBest) => (
        <span className={isBest ? "text-primary font-semibold" : ""}>{v}%</span>
      ),
    },
    {
      label: "Share of Voice",
      key: "shareOfVoice",
      render: (v, isBest) => (
        <span className={isBest ? "text-primary font-semibold" : ""}>
          {v === null || v === 0 ? "—" : `${v}%`}
        </span>
      ),
    },
    {
      label: "Top Result Rate",
      key: "topResultRate",
      render: (v, isBest) => (
        <span className={isBest ? "text-primary font-semibold" : ""}>
          {v === null || v === 0 ? "—" : `${v}%`}
        </span>
      ),
    },
    {
      label: "Avg Sentiment",
      key: "sentiment",
      render: (_v, _isBest, model) => {
        const m = models.find((mod) => mod.model === model);
        const { text, className } = getSentimentLabel(m?.sentimentSplit);
        return <span className={`text-sm font-medium ${className}`}>{text}</span>;
      },
    },
    {
      label: "Message Consistency",
      key: "narrativeStability",
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
      if (val === null || val === 0) continue;
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
      <div className="overflow-x-auto">
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
                  {metric.label}
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
