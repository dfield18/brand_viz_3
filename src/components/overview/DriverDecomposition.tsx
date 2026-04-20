"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, ChevronDown } from "lucide-react";
import { useCachedFetch } from "@/lib/useCachedFetch";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

interface Driver {
  dimension: string;
  segment: string;
  contribution: number;
  pctOfDelta: number;
  sampleSize: number;
  direction: "positive" | "negative" | "neutral";
}

interface DecompositionResult {
  kpi: string;
  kpiLabel: string;
  totalDelta: number;
  periodCurrent: string;
  periodPrevious: string;
  drivers: Driver[];
  confidence: "High" | "Medium" | "Low";
  caveats: string[];
  narrative: string;
}

interface ApiResponse {
  hasData: boolean;
  reason?: string;
  hint?: string;
  decompositions?: DecompositionResult[];
  periodCurrent?: string;
  periodPrevious?: string;
  currentRunCount?: number;
  previousRunCount?: number;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const KPI_OPTIONS = [
  { value: "mentionRate", label: "Brand Recall" },
  { value: "firstMentionRate", label: "Top Result Rate" },
  { value: "shareOfVoice", label: "Share of Voice" },
];

const KPI_TITLE_LABELS: Record<string, string> = {
  mentionRate: "Brand Recall",
  firstMentionRate: "Top Result Rate",
  avgProminence: "AI Prominence",
  avgRank: "Average Position",
  shareOfVoice: "Share of Voice",
};

type DimensionTab = "model" | "topic" | "model_topic";

const DIMENSION_TABS: { key: DimensionTab; label: string; description: string }[] = [
  { key: "model", label: "By AI Platform", description: "Which AI platforms (ChatGPT, Gemini, etc.) drove the change" },
  { key: "topic", label: "By Topic", description: "Which conversation topics drove the change" },
  { key: "model_topic", label: "By Platform × Topic", description: "Which AI platform + topic combinations drove the change" },
];

const SEGMENT_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  perplexity: "Perplexity",
  brand_reputation: "Brand Reputation",
  sustainability: "Sustainability",
  competitive_comparison: "Competitive",
  product_quality: "Product Quality",
  market_position: "Market Position",
  customer_experience: "Customer Experience",
  innovation: "Innovation",
  pricing_value: "Pricing & Value",
  industry_trends: "Industry Trends",
  social_impact: "Social Impact",
  use_cases: "Use Cases",
  brand_discovery: "Brand Discovery",
  trust_reliability: "Trust & Reliability",
  seasonal_contextual: "Seasonal",
  brand: "Direct Questions",
  industry: "Issue Area",
  other: "Other",
};

/** Render the "Comparing X vs Y" footer line under the breakdown.
 *  Periods come from the API as ISO dates (e.g. "2026-04-16") — one for
 *  the latest snapshot, one for the snapshot closest to ~30 days
 *  earlier. Format them as "Month Day, Year" and label both sides so
 *  users see it's a month-over-month read, not an arbitrary date diff. */
function getComparisonLabel(periodCurrent?: string, periodPrevious?: string): string {
  if (!periodCurrent || !periodPrevious) return "vs prior period";
  const formatDate = (iso: string) => {
    // Parse as UTC to match the ISO string's intent
    const d = new Date(iso + "T00:00:00Z");
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  };
  return `latest snapshot (${formatDate(periodCurrent)}) to snapshot from ~30 days earlier (${formatDate(periodPrevious)})`;
}

const CONFIDENCE_STYLE: Record<string, { bg: string; text: string }> = {
  High: { bg: "bg-emerald-100 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-400" },
  Medium: { bg: "bg-amber-100 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-400" },
  Low: { bg: "bg-red-100 dark:bg-red-950/30", text: "text-red-700 dark:text-red-400" },
};

function formatSegmentLabel(segment: string, dimension: string): string {
  if (dimension === "model_topic" && segment.includes("|")) {
    const [model, topic] = segment.split("|");
    const modelLabel = SEGMENT_LABELS[model] ?? model;
    const topicLabel = SEGMENT_LABELS[topic] ?? topic;
    return `${modelLabel} · ${topicLabel}`;
  }
  return SEGMENT_LABELS[segment] ?? segment;
}

/* -------------------------------------------------------------------------- */
/* Sub-chart for one dimension                                                 */
/* -------------------------------------------------------------------------- */

function DimensionChart({ drivers, dimension, kpi, brandName }: { drivers: Driver[]; dimension: DimensionTab; kpi: string; brandName?: string }) {
  // For avgRank, lower is better, so negative contribution = helped
  const isInverse = kpi === "avgRank";
  const chartData = useMemo(() => {
    return drivers
      .filter((d) => d.dimension === dimension && d.direction !== "neutral")
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 8)
      .map((d) => ({
        name: formatSegmentLabel(d.segment, d.dimension),
        contribution: d.contribution,
        pctOfDelta: d.pctOfDelta,
        sampleSize: d.sampleSize,
        impactLabel: isInverse ? (d.contribution <= 0 ? "Helped" : "Hurt") : (d.contribution >= 0 ? "Helped" : "Hurt"),
      }));
  }, [drivers, dimension, isInverse]);

  if (chartData.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-muted-foreground">No significant changes found in this breakdown.</p>
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 44 + 32)}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
          <XAxis
            type="number"
            fontSize={11}
            tickLine={false}
            tickFormatter={(v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1))}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={dimension === "model_topic" ? 200 : 140}
            fontSize={dimension === "model_topic" ? 11 : 12}
            tickLine={false}
          />
          <ReferenceLine x={0} stroke="var(--border)" strokeWidth={1.5} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.15 }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const d = payload[0]?.payload as { name: string; contribution: number; pctOfDelta: number; impactLabel: string } | undefined;
              if (!d) return null;
              const isPositive = isInverse ? d.contribution <= 0 : d.contribution >= 0;
              return (
                <div className="rounded-lg bg-card shadow-lg px-4 py-3 min-w-[180px]">
                  <p className="text-sm font-semibold mb-2">{d.name}</p>
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-2.5 h-2.5 rounded-sm ${isPositive ? "bg-emerald-500" : "bg-red-500"}`} />
                    <span className="text-xs text-muted-foreground">{d.impactLabel} {brandName ? `${brandName}'s` : "the"} score</span>
                  </div>
                  <p className={`text-lg font-bold tabular-nums ${isPositive ? "text-emerald-600" : "text-red-500"}`}>
                    {isPositive ? "+" : ""}{d.contribution.toFixed(1)}
                    <span className="text-xs font-normal text-muted-foreground ml-1">Δ%</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {Math.abs(Math.round(d.pctOfDelta))}% of total change
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="contribution" radius={[0, 4, 4, 0]} barSize={22}>
            {chartData.map((d, i) => (
              <Cell
                key={i}
                fill={(isInverse ? d.contribution <= 0 : d.contribution >= 0) ? "hsl(160, 50%, 60%)" : "hsl(0, 60%, 70%)"}
                fillOpacity={0.6}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Main component                                                              */
/* -------------------------------------------------------------------------- */

interface Props {
  brandSlug: string;
  model: string;
  range: number;
  /** Lock to a single KPI — hides the dropdown selector */
  fixedKpi?: string;
  brandName?: string;
  /** Render without card wrapper (for embedding inside another card) */
  inline?: boolean;
  /** Strip header, description, and footer for a minimal look */
  compact?: boolean;
}

export function DriverDecomposition({ brandSlug, model, range, fixedKpi, brandName, inline, compact }: Props) {
  const [internalKpi, setInternalKpi] = useState(fixedKpi ?? "mentionRate");
  const selectedKpi = fixedKpi ?? internalKpi;
  const [activeTab, setActiveTab] = useState<DimensionTab>("model");

  const url = `/api/overview/drivers?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}`;
  const { data: apiData, loading } = useCachedFetch<ApiResponse>(url);

  const decomp = useMemo(() => {
    if (!apiData?.decompositions) return null;
    return apiData.decompositions.find((d) => d.kpi === selectedKpi) ?? null;
  }, [apiData, selectedKpi]);

  if (loading) {
    const skeleton = (
      <>
        <div className="h-5 w-56 bg-muted rounded mb-4" />
        <div className="h-48 bg-muted/50 rounded" />
      </>
    );
    return inline ? (
      <div className="animate-pulse">{skeleton}</div>
    ) : (
      <section className="rounded-xl bg-card p-6 shadow-section animate-pulse">{skeleton}</section>
    );
  }

  if (!apiData?.hasData) {
    const noDataContent = (
      <>
        <h2 className="text-base font-semibold mb-2">What&apos;s Driving {fixedKpi && KPI_TITLE_LABELS[fixedKpi] ? <>{KPI_TITLE_LABELS[fixedKpi]} </> : ""}Changes</h2>
        <p className="text-xs text-muted-foreground">
          Not enough historical data to compare periods. Run prompts over multiple periods to see what&apos;s driving changes.
        </p>
      </>
    );
    return inline ? (
      <div>{noDataContent}</div>
    ) : (
      <section className="rounded-xl bg-card p-6 shadow-section">{noDataContent}</section>
    );
  }

  if (!decomp) {
    return null;
  }

  const isFlat = Math.abs(decomp.totalDelta) < 0.1;
  const confStyle = CONFIDENCE_STYLE[decomp.confidence] ?? CONFIDENCE_STYLE.Low;

  // For avgRank, lower is better (rank 1 > rank 5), so a negative delta is an improvement
  const isInverseKpi = selectedKpi === "avgRank";
  const isImprovement = isInverseKpi ? decomp.totalDelta < -0.05 : decomp.totalDelta > 0.05;
  const isDecline = isInverseKpi ? decomp.totalDelta > 0.05 : decomp.totalDelta < -0.05;
  const deltaColor = isImprovement ? "text-emerald-600" : isDecline ? "text-red-500" : "text-muted-foreground";

  const content = (
    <>
      {/* Header: title + delta inline, KPI selector top-right */}
      {!compact && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold">What&apos;s Driving {fixedKpi && KPI_TITLE_LABELS[fixedKpi] ? <>{KPI_TITLE_LABELS[fixedKpi]} </> : ""}Changes</h2>
            <div className="flex items-center gap-2">
              {isImprovement ? (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
              ) : isDecline ? (
                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              ) : null}
              <span className={`text-sm font-bold tabular-nums ${deltaColor}`}>
                {decomp.totalDelta > 0 ? "+" : ""}{decomp.totalDelta.toFixed(1)}{selectedKpi === "avgRank" ? " pos" : "%"}
              </span>
              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${confStyle.bg} ${confStyle.text}`}>
                {decomp.confidence}
              </span>
            </div>
          </div>
          {!fixedKpi && (
            <select
              value={selectedKpi}
              onChange={(e) => setInternalKpi(e.target.value)}
              className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-card shrink-0"
            >
              {KPI_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {!compact && (
        <p className="text-xs text-muted-foreground -mt-1 mb-4">
          Shows which AI platforms and topics are responsible for recent changes in {brandName ? `${brandName}'s` : "the"} score. Longer bars = bigger impact.
        </p>
      )}

      {/* Compact: just a label + delta */}
      {compact && (
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">What&apos;s driving this change</p>
            <div className="flex items-center gap-1.5">
              {isImprovement ? (
                <TrendingUp className="h-3 w-3 text-emerald-600" />
              ) : isDecline ? (
                <TrendingDown className="h-3 w-3 text-red-500" />
              ) : null}
              <span className={`text-xs font-bold tabular-nums ${deltaColor}`}>
                {decomp.totalDelta > 0 ? "+" : ""}{decomp.totalDelta.toFixed(1)}%
              </span>
              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${confStyle.bg} ${confStyle.text}`}>
                {decomp.confidence}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">This breaks down the overall {KPI_TITLE_LABELS[selectedKpi] ?? selectedKpi} change ({decomp.totalDelta > 0 ? "+" : ""}{decomp.totalDelta.toFixed(1)}%) into the segments that drove it. Each bar shows how much a segment contributed to the total — longer bars had a bigger impact.</p>
        </div>
      )}

      {/* Dimension tabs + chart */}
      {!isFlat ? (
        <div>
          <div className="flex items-center gap-1 mb-3 border-b border-border">
            {DIMENSION_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <DimensionChart drivers={decomp.drivers} dimension={activeTab} kpi={selectedKpi} brandName={brandName} />
          <p className="text-[11px] text-muted-foreground mt-3">Comparing {getComparisonLabel(apiData?.periodCurrent, apiData?.periodPrevious)}.</p>
        </div>
      ) : (
        <div className="text-center py-6">
          <p className="text-sm text-muted-foreground">{brandName ? `${brandName}'s` : "The"} score held steady — no significant changes to break down.</p>
        </div>
      )}

      {/* Footer: summary toggle + methodology — hidden in compact mode */}
      {!compact && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
          <details className="group">
            <summary className="text-[11px] font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-1">
                <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                View summary
              </span>
            </summary>
            <p className="text-xs leading-relaxed text-muted-foreground mt-2">{decomp.narrative}</p>
          </details>
          <span className="text-[11px] text-muted-foreground shrink-0 ml-4">
            {apiData.currentRunCount} vs {apiData.previousRunCount} responses &middot; correlational
          </span>
        </div>
      )}
    </>
  );

  return inline ? (
    <div>{content}</div>
  ) : (
    <section className="rounded-xl bg-card p-6 shadow-section">{content}</section>
  );
}
