"use client";

import type { ModelComparison } from "@/types/api";
import { EmptyState } from "@/components/EmptyState";

interface CrossModelTableProps {
  models: ModelComparison[];
}

const MODEL_LABELS: Record<string, string> = {
  chatgpt: "CHATGPT",
  gemini: "GEMINI",
  claude: "CLAUDE",
  perplexity: "PERPLEXITY",
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
 * Sentiment label from legitimacy score (0–100).
 * Thresholds match the narrative tab's getSentimentBadge:
 *   >=60 → Strongly positive, >=40 → Mostly positive,
 *   <=30 → Mostly negative, else → Mixed
 */
function getSentimentLabel(score: number): { text: string; className: string } {
  if (score >= 60) return { text: "Strongly positive", className: "text-emerald-600" };
  if (score >= 40) return { text: "Mostly positive", className: "text-emerald-600" };
  if (score <= 30) return { text: "Mostly negative", className: "text-red-500" };
  return { text: "Mixed", className: "text-amber-600" };
}

interface MetricDef {
  label: string;
  key: keyof ModelComparison;
  render: (value: number | null, isBest: boolean) => React.ReactNode;
  lowerIsBetter?: boolean;
}

export function CrossModelTable({ models }: CrossModelTableProps) {
  if (models.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-section">
        <h2 className="text-base font-semibold mb-4">Cross-LLM Comparison</h2>
        <EmptyState message="Select multiple models or use 'All' to see cross-model comparison." />
      </div>
    );
  }

  const metrics: MetricDef[] = [
    {
      label: "Visibility",
      key: "visibility",
      render: (v, isBest) => (
        <span className={isBest ? "text-primary font-semibold" : ""}>{v}</span>
      ),
    },
    {
      label: "Mention Rate",
      key: "mentionRate",
      render: (v, isBest) => (
        <span className={isBest ? "text-primary font-semibold" : ""}>{v}%</span>
      ),
    },
    {
      label: "Avg Sentiment",
      key: "sentiment",
      render: (v) => {
        const { text, className } = getSentimentLabel(v ?? 0);
        return <span className={`text-xs font-medium ${className}`}>{text}</span>;
      },
    },
    {
      label: "Avg Rank",
      key: "avgRank",
      render: (v, isBest) => (
        <span className={isBest ? "text-primary font-semibold" : ""}>
          {v === null || v === 0 ? "—" : v}
        </span>
      ),
      lowerIsBetter: true,
    },
{
      label: "Narrative Stability",
      key: "narrativeStability",
      render: (v) => {
        const { text, className } = getStabilityLabel(v ?? 0);
        return <span className={`text-xs font-medium ${className}`}>{text}</span>;
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
    <div className="rounded-xl border border-border bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold mb-4">Cross-LLM Comparison</h2>
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
                <td className="py-3 pr-4 font-medium">
                  {MODEL_LABELS[m.model] ?? m.model.toUpperCase()}
                </td>
                {metrics.map((metric) => {
                  const isBest = best[metric.key] === m.model && models.length > 1;
                  return (
                    <td
                      key={metric.key}
                      className="py-3 px-4 text-center tabular-nums"
                    >
                      {metric.render(m[metric.key] as number | null, isBest)}
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
