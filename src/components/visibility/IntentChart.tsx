"use client";

import { IntentSplit } from "@/types/api";

interface IntentChartProps {
  intentSplit: IntentSplit[];
}

const INTENT_LABELS: Record<string, string> = {
  "high-intent": "High-Intent",
  informational: "Informational",
};

const INTENT_COLORS: Record<string, string> = {
  "high-intent": "var(--chart-1)",
  informational: "var(--chart-4)",
};

export function IntentChart({ intentSplit }: IntentChartProps) {
  if (intentSplit.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-sm text-muted-foreground">
          No intent data available.
        </p>
      </div>
    );
  }

  const total = intentSplit.reduce((s, i) => s + i.percentage, 0);

  return (
    <div className="space-y-4">
      {/* Stacked bar */}
      <div className="flex h-8 w-full overflow-hidden rounded-lg">
        {intentSplit.map((item) => {
          const width = total > 0 ? (item.percentage / total) * 100 : 50;
          return (
            <div
              key={item.intent}
              className="flex items-center justify-center text-xs font-medium text-white transition-all"
              style={{
                width: `${width}%`,
                backgroundColor: INTENT_COLORS[item.intent] ?? "var(--chart-4)",
                minWidth: item.percentage > 0 ? "40px" : "0",
              }}
            >
              {item.percentage > 0 && `${item.percentage}%`}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6">
        {intentSplit.map((item) => (
          <div key={item.intent} className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: INTENT_COLORS[item.intent] ?? "var(--chart-4)" }}
            />
            <span className="text-xs text-muted-foreground">
              {INTENT_LABELS[item.intent] ?? item.intent}
            </span>
            <span className="text-xs font-medium">{item.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
