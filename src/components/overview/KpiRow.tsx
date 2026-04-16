"use client";

import { KpiCard } from "@/types/api";
import { Eye, Percent, Award, AlertTriangle, Shield, TrendingUp, TrendingDown, Info } from "lucide-react";

interface KpiRowProps {
  kpis: KpiCard[];
}

type Sentiment = "good" | "neutral" | "poor";

function rateSentiment(value: number, good: number, poor: number): Sentiment {
  if (value >= good) return "good";
  if (value >= poor) return "neutral";
  return "poor";
}

function invertedSentiment(value: number, good: number, poor: number): Sentiment {
  if (value <= good) return "good";
  if (value <= poor) return "neutral";
  return "poor";
}

interface CardMeta {
  Icon: React.ComponentType<{ className?: string }>;
  subtitle: string;
  tooltip: string;
  border: string;
  iconBg: string;
  iconColor: string;
  sentiment: (kpi: KpiCard) => Sentiment | null;
}

const CARD_META: Record<string, CardMeta> = {
  "Visibility Score": {
    Icon: Eye,
    subtitle: "Brand mention strength",
    tooltip: "Average brand mention strength (0\u2013100) across all prompts, scored by how prominently the brand is discussed in AI responses.",
    border: "border-l-chart-1",
    iconBg: "bg-chart-1/10",
    iconColor: "text-chart-1",
    sentiment: (kpi) => rateSentiment(kpi.value, 60, 30),
  },
  "Mention Rate": {
    Icon: Percent,
    subtitle: "Across relevant prompts",
    tooltip: "Percentage of prompts where the brand was mentioned at all in the AI response, regardless of prominence.",
    border: "border-l-chart-3",
    iconBg: "bg-chart-3/10",
    iconColor: "text-chart-3",
    sentiment: (kpi) => rateSentiment(kpi.value, 70, 30),
  },
  "Dominant Narrative Frame": {
    Icon: Award,
    subtitle: "",
    tooltip: "The most prominent narrative frame AI models use when discussing this brand. The bar shows its average strength relative to other frames.",
    border: "border-l-chart-2",
    iconBg: "bg-chart-2/10",
    iconColor: "text-chart-2",
    sentiment: (kpi) => kpi.barPct != null ? rateSentiment(kpi.barPct, 70, 40) : null,
  },
  "Controversy Index": {
    Icon: AlertTriangle,
    subtitle: "Sentiment polarization",
    tooltip: "Level of controversy or polarization (0\u2013100) detected in AI responses about the brand. Higher values indicate more divisive or contentious framing.",
    border: "border-l-chart-4",
    iconBg: "bg-chart-4/10",
    iconColor: "text-chart-4",
    sentiment: (kpi) => invertedSentiment(kpi.value, 30, 60),
  },
  "Narrative Stability": {
    Icon: Shield,
    subtitle: "Frame consistency",
    tooltip: "How consistently AI models frame the brand across different prompts. High = stable and predictable narrative; Medium = some variation; Low = shifting or inconsistent framing.",
    border: "border-l-chart-5",
    iconBg: "bg-chart-5/10",
    iconColor: "text-chart-5",
    sentiment: (kpi) => rateSentiment(kpi.value, 70, 40),
  },
};

function stabilityLabel(value: number): string {
  if (value >= 70) return "High";
  if (value >= 40) return "Medium";
  return "Low";
}

function formatValue(value: number, unit: KpiCard["unit"], label: string): string {
  if (label === "Narrative Stability") return stabilityLabel(value);
  if (unit === "%") return `${value}%`;
  if (unit === "count") return value.toLocaleString();
  return String(value);
}

const HIDDEN_CARDS = new Set(["Controversy Index"]);

export function KpiRow({ kpis }: KpiRowProps) {
  const filtered = kpis.filter((k) => !HIDDEN_CARDS.has(k.label));
  if (filtered.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {filtered.map((kpi) => {
        const meta = CARD_META[kpi.label];
        const Icon = meta?.Icon;

        return (
          <div
            key={kpi.label}
            className="rounded-lg bg-card px-3 py-4 shadow-kpi"
          >
            <div className="flex items-center gap-1.5 mb-3">
              {Icon && (
                <Icon className={`h-3 w-3 shrink-0 ${meta.iconColor}`} />
              )}
              <span className="text-[11px] font-medium text-muted-foreground truncate">
                {kpi.label}
              </span>
              {meta?.tooltip && (
                <div className="relative group ml-auto shrink-0">
                  <Info className="h-3 w-3 text-muted-foreground/40 cursor-default" />
                  <div className="absolute right-0 top-full mt-1.5 z-50 hidden group-hover:block w-56 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md">
                    {meta.tooltip}
                  </div>
                </div>
              )}
            </div>
            <p className={`font-bold leading-tight ${kpi.displayText ? "text-sm" : "text-xl tabular-nums leading-none"}`}>
              {kpi.displayText ?? formatValue(kpi.value, kpi.unit, kpi.label)}
            </p>
            {kpi.barPct != null && (
              <div className="mt-2">
                <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${kpi.barPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{kpi.barPct}%</p>
              </div>
            )}
            {kpi.barPct == null && (
              <div className="mt-2 flex items-center gap-1.5">
                {kpi.delta !== 0 && (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
                      kpi.delta >= 0 ? "text-emerald-600" : "text-red-500"
                    }`}
                  >
                    {kpi.delta >= 0 ? (
                      <TrendingUp className="h-2.5 w-2.5" />
                    ) : (
                      <TrendingDown className="h-2.5 w-2.5" />
                    )}
                    {kpi.delta >= 0 ? "+" : ""}
                    {kpi.delta}
                    {kpi.unit === "%" ? "pp" : ""}
                    <span className="text-muted-foreground ml-0.5">(30d)</span>
                  </span>
                )}
                {meta?.subtitle && (
                  <p className="text-[10px] text-muted-foreground">
                    {meta.subtitle}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
