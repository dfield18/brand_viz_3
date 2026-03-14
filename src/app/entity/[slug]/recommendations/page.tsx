"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { VALID_MODELS, MODEL_LABELS } from "@/lib/constants";
import { OnThisPage, type PageSection } from "@/components/OnThisPage";
import { useBrandName } from "@/lib/useBrandName";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Target,
  Zap,
  Shield,
  Eye,
} from "lucide-react";

/* ─── API Response Types ────────────────────────────────────────────── */

interface ApiResponse {
  hasData: boolean;
  brandName: string;
  promptOpportunitySummary: string;

  promptOpportunities: {
    promptText: string;
    cluster: string;
    brandRank: number | null;
    topCompetitors: { entityId: string; displayName: string; rank: number }[];
    suggestion: string;
  }[];

  platformPlaybooks: {
    model: string;
    avgBrandRank: number | null;
    mentionRate: number;
    topSourceCategories: { category: string; count: number }[];
    platformTip: string;
    specificGaps: {
      promptText: string;
      brandRankOnModel: number;
      crossModelAvg: number;
    }[];
  }[];

  negativeNarratives: {
    weaknesses: {
      weakness: string;
      count: number;
      suggestion: string;
      responses: { promptText: string; model: string; responsePreview: string; fullResponse: string }[];
    }[];
    negativeThemes: { theme: string; negativeCount: number; mixedCount: number; positiveCount: number }[];
    narrativeSummary: string;
  };

  competitorNarrativeGaps: {
    entityId: string;
    displayName: string;
    promptsWhereCompetitorOutranks: number;
    outranksPercent: number;
    gaps: {
      promptText: string;
      competitorRank: number;
      brandRank: number | null;
      models: string[];
    }[];
  }[];

  competitorAlerts: {
    entityId: string;
    displayName: string;
    mentionRateChange: number;
    recentMentionRate: number;
    previousMentionRate: number;
    direction: "rising" | "falling" | "stable";
  }[];

  sourceGapOpportunities: {
    domain: string;
    category: string | null;
    competitorsCited: string[];
    totalCitations: number;
    suggestion: string;
  }[];

  topicCoverageGaps: {
    topicKey: string;
    mentionRate: number;
    avgRank: number | null;
    competitorLeaders: { entityId: string; displayName: string; rank1Count: number }[];
    suggestion: string;
  }[];

  decliningMetrics: {
    metric: string;
    recentValue: number;
    previousValue: number;
    change: number;
    direction: "improving" | "declining" | "stable";
    model?: string;
    previousPeriod: string;
    recentPeriod: string;
  }[];
}

/* ─── Helpers ───────────────────────────────────────────────────────── */

function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^#+\s+/gm, "")
    .replace(/`/g, "")
    .replace(/~~/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const MODEL_BORDER_COLORS: Record<string, string> = {
  chatgpt: "border-l-emerald-500",
  gemini: "border-l-sky-500",
  claude: "border-l-orange-500",
  perplexity: "border-l-violet-500",
  google: "border-l-teal-500",
};

function RankDisplay({ rank }: { rank: number | null }) {
  if (rank === null) return <span className="text-red-600 font-medium">Not mentioned</span>;
  if (rank > 3) return <span className="text-orange-600 font-medium">#{rank}</span>;
  return <span className="font-medium">#{rank}</span>;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 py-6 justify-center text-sm text-muted-foreground">
      <CheckCircle className="h-4 w-4 text-green-500" />
      {message}
    </div>
  );
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

/* ─── Sections ──────────────────────────────────────────────────────── */

const PAGE_SECTIONS: PageSection[] = [
  { id: "prompt-opportunities", label: "Prompt Opportunities", heading: "Content Gaps" },
  { id: "platform-playbooks", label: "Platform Playbooks" },
  { id: "negative-narratives", label: "Narrative Remediation", heading: "Narrative Insights" },
  { id: "competitor-alerts", label: "Competitor Alerts", heading: "Monitoring" },
  { id: "source-gaps", label: "Source Gaps" },
  { id: "topic-gaps", label: "Topic Gaps" },
  { id: "declining-metrics", label: "Declining Metrics" },
];

/* ─── Section Components ────────────────────────────────────────────── */

function PromptOpportunitiesSection({
  data,
  brandName,
  summary,
}: {
  data: ApiResponse["promptOpportunities"];
  brandName: string;
  summary: string;
}) {
  // Group duplicate prompts across models
  const grouped = useMemo(() => {
    if (!data || data.length === 0) return [];
    const map = new Map<string, {
      promptText: string;
      cluster: string;
      worstRank: number | null;
      bestRank: number | null;
      competitors: Map<string, { displayName: string; bestRank: number }>;
      count: number;
    }>();

    for (const item of data) {
      const key = item.promptText;
      let group = map.get(key);
      if (!group) {
        group = {
          promptText: item.promptText,
          cluster: item.cluster,
          worstRank: item.brandRank,
          bestRank: item.brandRank,
          competitors: new Map(),
          count: 0,
        };
        map.set(key, group);
      }
      group.count++;

      // Track worst (highest number) brand rank; null means not mentioned
      if (item.brandRank === null) {
        group.worstRank = null;
      } else if (group.worstRank !== null) {
        group.worstRank = Math.max(group.worstRank, item.brandRank);
      }
      // Track best rank for display
      if (item.brandRank !== null) {
        group.bestRank = group.bestRank === null ? item.brandRank : Math.min(group.bestRank, item.brandRank);
      }

      // Merge competitors, keeping the best rank for each
      for (const c of item.topCompetitors) {
        const existing = group.competitors.get(c.entityId);
        if (!existing || c.rank < existing.bestRank) {
          group.competitors.set(c.entityId, { displayName: c.displayName, bestRank: c.rank });
        }
      }
    }

    return [...map.values()]
      .sort((a, b) => b.competitors.size - a.competitors.size || b.count - a.count);
  }, [data]);

  const [showGaps, setShowGaps] = useState(false);

  if (!data || data.length === 0) return <EmptyState message="No prompt gaps found — great coverage!" />;

  const ordinal = (n: number) =>
    n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;

  return (
    <div className="space-y-6">
      {/* AI-generated recommendations */}
      {summary && (
        <div>
          <p className="text-sm font-semibold mb-3">Recommendations</p>
          <div className="text-sm text-muted-foreground space-y-2">
            {summary.split("\n").filter(Boolean).map((line, i) => (
              <p key={i}>{stripMarkdown(line)}</p>
            ))}
          </div>
        </div>
      )}

      {/* Prompt gaps — collapsible */}
      <div className="border-t border-border pt-5">
        <button
          type="button"
          onClick={() => setShowGaps((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold hover:text-foreground/80 transition-colors"
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${showGaps ? "rotate-90" : ""}`} />
          Where {brandName} is missing or ranked poorly
          <span className="text-xs font-normal text-muted-foreground ml-1">({grouped.length})</span>
        </button>
        {showGaps && (
          <ul className="space-y-3 text-sm mt-3 ml-5.5">
            {grouped.map((item, i) => {
              const competitors = [...item.competitors.values()]
                .sort((a, b) => a.bestRank - b.bestRank)
                .slice(0, 5);

              const rankText = item.worstRank === null
                ? `${brandName} doesn't appear`
                : item.bestRank === item.worstRank
                  ? `${brandName} ranks ${ordinal(item.worstRank)}`
                  : `${brandName} ranks ${ordinal(item.bestRank!)} to ${ordinal(item.worstRank)}`;

              const compText = competitors.length > 0
                ? ` · Ahead: ${competitors.map((c) => c.displayName).join(", ")}`
                : "";

              return (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                  <div>
                    <p className="font-medium text-foreground leading-snug">{item.promptText}</p>
                    <p className="text-muted-foreground mt-0.5">
                      <span className={item.worstRank === null ? "text-red-600 font-medium" : (item.worstRank ?? 0) > 3 ? "text-orange-600 font-medium" : ""}>
                        {rankText}
                      </span>
                      {compText}
                      <span className="text-muted-foreground/60"> · {item.count} platform{item.count !== 1 ? "s" : ""}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function PlatformPlaybooksSection({
  data,
}: {
  data: ApiResponse["platformPlaybooks"];
}) {
  const [showGaps, setShowGaps] = useState(false);

  if (!data || data.length === 0) return <EmptyState message="No platform data available yet." />;

  // Filter out platforms where the brand is already performing well
  const needsWork = data.filter(
    (pb) => !(pb.avgBrandRank !== null && pb.avgBrandRank <= 2 && pb.mentionRate >= 0.8),
  );

  if (needsWork.length === 0) return <EmptyState message="Strong performance across all platforms — no recommendations needed." />;

  // Collect all tips as recommendations text
  const tips = needsWork.filter((pb) => pb.platformTip).map((pb) => `**${MODEL_LABELS[pb.model] ?? pb.model}:** ${stripMarkdown(pb.platformTip)}`);

  // Collect total specific gaps
  const totalGaps = needsWork.reduce((sum, pb) => sum + pb.specificGaps.length, 0);

  return (
    <div className="space-y-6">
      {/* Recommendations (platform tips) */}
      {tips.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-3">Recommendations</p>
          <ul className="space-y-3 text-sm">
            {tips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                <p className="text-muted-foreground leading-snug" dangerouslySetInnerHTML={{ __html: tip.replace(/\*\*(.+?)\*\*/g, '<span class="font-medium text-foreground">$1</span>') }} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Platform stats as bullet list */}
      <ul className="space-y-3 text-sm">
        {needsWork.map((pb) => {
          const rankText = pb.avgBrandRank !== null ? `Avg Rank #${pb.avgBrandRank.toFixed(1)}` : "Not ranked";
          const sourceText = pb.topSourceCategories.length > 0
            ? ` · Top sources: ${pb.topSourceCategories.slice(0, 3).map((sc) => sc.category).join(", ")}`
            : "";

          return (
            <li key={pb.model} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
              <div>
                <p className="font-medium text-foreground leading-snug">{MODEL_LABELS[pb.model] ?? pb.model}</p>
                <p className="text-muted-foreground mt-0.5">
                  Mention Rate <span className="font-medium">{pct(pb.mentionRate)}</span>
                  {" · "}<span className="font-medium">{rankText}</span>
                  {sourceText}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Specific gaps — collapsible */}
      {totalGaps > 0 && (
        <div className="border-t border-border pt-5">
          <button
            type="button"
            onClick={() => setShowGaps((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold hover:text-foreground/80 transition-colors"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${showGaps ? "rotate-90" : ""}`} />
            Platform-specific prompt gaps
            <span className="text-xs font-normal text-muted-foreground ml-1">({totalGaps})</span>
          </button>
          {showGaps && (
            <ul className="space-y-3 text-sm mt-3 ml-5.5">
              {needsWork.map((pb) =>
                pb.specificGaps.map((gap, j) => (
                  <li key={`${pb.model}-${j}`} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                    <div>
                      <p className="font-medium text-foreground leading-snug">{gap.promptText}</p>
                      <p className="text-muted-foreground mt-0.5">
                        {MODEL_LABELS[pb.model] ?? pb.model}: Rank <RankDisplay rank={gap.brandRankOnModel} />
                        <span className="text-muted-foreground/60"> · vs #{gap.crossModelAvg.toFixed(1)} avg across platforms</span>
                      </p>
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NegativeNarrativesSection({
  data,
  brandName,
}: {
  data: ApiResponse["negativeNarratives"];
  brandName: string;
}) {
  const hasWeaknesses = data?.weaknesses && data.weaknesses.length > 0;
  const hasThemes = data?.negativeThemes && data.negativeThemes.length > 0;
  const [showWeaknesses, setShowWeaknesses] = useState(false);
  const [showThemes, setShowThemes] = useState(false);
  if (!hasWeaknesses && !hasThemes) return <EmptyState message="No negative narratives detected." />;

  // Strip markdown markers, leading/trailing bullets and punctuation artifacts
  const clean = (text: string) =>
    text
      .replace(/\*+/g, "")
      .replace(/^[·•\-\s]+/, "")
      .replace(/[·•]+\s*$/, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  return (
    <div className="space-y-6">
      {/* AI-generated recommendations */}
      {data.narrativeSummary && (
        <div>
          <p className="text-sm font-semibold mb-3">Recommendations</p>
          <div className="text-sm text-muted-foreground space-y-2">
            {data.narrativeSummary.split("\n").filter(Boolean).map((line, i) => (
              <p key={i}>{stripMarkdown(line)}</p>
            ))}
          </div>
        </div>
      )}

      {/* Weaknesses — collapsible */}
      {hasWeaknesses && (
        <div className="border-t border-border pt-5">
          <button
            type="button"
            onClick={() => setShowWeaknesses((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold hover:text-foreground/80 transition-colors"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${showWeaknesses ? "rotate-90" : ""}`} />
            Weaknesses AI associates with {brandName}
            <span className="text-xs font-normal text-muted-foreground ml-1">({data.weaknesses.length})</span>
          </button>
          {showWeaknesses && (
            <ul className="space-y-3 text-sm mt-3 ml-5.5">
              {data.weaknesses.map((w, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                  <div>
                    <p className="font-medium text-foreground leading-snug">{clean(w.weakness)}</p>
                    <p className="text-muted-foreground mt-0.5">
                      {w.count} response{w.count !== 1 ? "s" : ""}
                      {w.responses.length > 0 && (
                        <span className="text-muted-foreground/60"> · {[...new Set(w.responses.map((r) => MODEL_LABELS[r.model] ?? r.model))].join(", ")}</span>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Negative themes — collapsible */}
      {hasThemes && (
        <div className="border-t border-border pt-5">
          <button
            type="button"
            onClick={() => setShowThemes((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-semibold hover:text-foreground/80 transition-colors"
          >
            <ChevronRight className={`h-4 w-4 transition-transform ${showThemes ? "rotate-90" : ""}`} />
            Themes where AI skews negative
            <span className="text-xs font-normal text-muted-foreground ml-1">({data.negativeThemes.length})</span>
          </button>
          {showThemes && (
            <div className="text-sm space-y-1.5 mt-3 ml-5.5">
              {data.negativeThemes.map((t) => (
                <p key={t.theme} className="text-muted-foreground">
                  <span className="text-foreground font-medium">{t.theme}</span>
                  <span className="text-red-600"> · {t.negativeCount + t.mixedCount} negative</span>
                  {t.positiveCount > 0 && (
                    <span className="text-green-600"> · {t.positiveCount} positive</span>
                  )}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompetitorNarrativeGapsSection({
  data,
  brandName,
}: {
  data: ApiResponse["competitorNarrativeGaps"];
  brandName: string;
}) {
  if (!data || data.length === 0) return <EmptyState message="No competitor narrative gaps found." />;

  const ordinal = (n: number) =>
    n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Competitor</th>
            <th className="pb-2 pr-4 font-medium text-right w-44">Outranks {brandName}</th>
            <th className="pb-2 font-medium">Where They Beat {brandName}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((cg) => (
            <tr key={cg.entityId} className="align-top">
              <td className="py-3 pr-4 font-medium text-foreground whitespace-nowrap">{cg.displayName}</td>
              <td className="py-3 pr-4 text-right font-medium">
                {cg.outranksPercent}%
                <span className="text-muted-foreground font-normal text-xs ml-1">of responses</span>
              </td>
              <td className="py-3">
                {(cg.gaps ?? []).length > 0 ? (
                  <ul className="space-y-1.5">
                    {(cg.gaps ?? []).map((g, j) => {
                      const compRankText = ordinal(g.competitorRank);
                      const brandRankText = g.brandRank === null
                        ? `${brandName} not mentioned`
                        : `${brandName} ${ordinal(g.brandRank)}`;

                      return (
                        <li key={j} className="flex items-start gap-1.5">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                          <div>
                            <p className="text-foreground leading-snug">{g.promptText}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              <span className="font-medium">{cg.displayName} {compRankText}</span>
                              {" · "}
                              <span className={g.brandRank === null ? "text-red-600" : ""}>{brandRankText}</span>
                              {g.models.length > 0 && (
                                <span className="text-muted-foreground/60">
                                  {" · "}{g.models.map((m) => MODEL_LABELS[m] ?? m).join(", ")}
                                </span>
                              )}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <span className="text-muted-foreground/50">Higher ranked but no specific prompt gaps</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompetitorAlertsSection({
  data,
}: {
  data: ApiResponse["competitorAlerts"];
}) {
  if (!data || data.length === 0) return <EmptyState message="No competitor movement detected." />;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((alert) => {
        const isRising = alert.direction === "rising";
        const isFalling = alert.direction === "falling";
        const borderColor = isRising
          ? "border-red-200 bg-red-50/50"
          : isFalling
            ? "border-green-200 bg-green-50/50"
            : "border-border bg-card";
        const iconColor = isRising ? "text-red-600" : isFalling ? "text-green-600" : "text-gray-500";

        return (
          <div
            key={alert.entityId}
            className={`rounded-xl border p-4 ${borderColor}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-medium text-sm">{alert.displayName}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Mention rate: {pct(alert.previousMentionRate)} &rarr; {pct(alert.recentMentionRate)}
                </p>
              </div>
              <div className={`flex items-center gap-0.5 text-sm font-medium ${iconColor}`}>
                {isRising ? (
                  <ArrowUp className="h-4 w-4" />
                ) : isFalling ? (
                  <ArrowDown className="h-4 w-4" />
                ) : null}
                {alert.mentionRateChange > 0 ? "+" : ""}
                {(alert.mentionRateChange * 100).toFixed(1)} pts
              </div>
            </div>
            <div className="mt-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  isRising
                    ? "bg-red-100 text-red-700"
                    : isFalling
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600"
                }`}
              >
                {isRising ? "Rising competitor" : isFalling ? "Losing ground" : "Stable"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SourceGapsSection({
  data,
  brandName,
}: {
  data: ApiResponse["sourceGapOpportunities"];
  brandName: string;
}) {
  if (!data || data.length === 0) return <EmptyState message="No source gap opportunities found." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-3 pr-4 font-medium">Website</th>
            <th className="pb-3 pr-4 font-medium">Source Type</th>
            <th className="pb-3 pr-4 font-medium">Competitors Cited Here</th>
            <th className="pb-3 pr-4 font-medium">Times Cited by AI</th>
            <th className="pb-3 font-medium">Suggestion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((sg, i) => (
            <tr key={i} className="align-top">
              <td className="py-3 pr-4 font-medium">{sg.domain}</td>
              <td className="py-3 pr-4">
                {sg.category && sg.category !== "uncategorized" ? (
                  <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                    {sg.category}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="py-3 pr-4">
                <div className="flex flex-wrap gap-1">
                  {sg.competitorsCited.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </td>
              <td className="py-3 pr-4 font-medium">{sg.totalCitations}</td>
              <td className="py-3 text-muted-foreground italic max-w-[240px]">
                {stripMarkdown(sg.suggestion)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TopicGapsSection({
  data,
  brandName,
}: {
  data: ApiResponse["topicCoverageGaps"];
  brandName: string;
}) {
  if (!data || data.length === 0) return <EmptyState message="No topic coverage gaps found." />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="pb-3 pr-4 font-medium">Topic</th>
            <th className="pb-3 pr-4 font-medium">How often AI mentions {brandName}</th>
            <th className="pb-3 pr-4 font-medium">{brandName}&apos;s avg position</th>
            <th className="pb-3 pr-4 font-medium">Who ranks #1 instead</th>
            <th className="pb-3 font-medium">Suggestion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((tg, i) => {
            const barColor =
              tg.mentionRate < 0.3 ? "bg-red-500" : tg.mentionRate < 0.6 ? "bg-amber-500" : "bg-green-500";
            return (
              <tr key={i} className="align-top">
                <td className="py-3 pr-4 font-medium">{tg.topicKey}</td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-20 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${barColor}`}
                        style={{ width: `${(tg.mentionRate * 100).toFixed(0)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{pct(tg.mentionRate)}</span>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  {tg.avgRank !== null ? `#${tg.avgRank.toFixed(1)}` : "—"}
                </td>
                <td className="py-3 pr-4">
                  <div className="flex flex-wrap gap-1">
                    {tg.competitorLeaders.map((cl) => (
                      <span
                        key={cl.entityId}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                      >
                        {cl.displayName}{" "}
                        <span className="text-muted-foreground">ranked #1 {cl.rank1Count} {cl.rank1Count === 1 ? "time" : "times"}</span>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="py-3 text-muted-foreground italic max-w-[240px]">
                  {stripMarkdown(tg.suggestion)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const METRIC_DISPLAY_NAMES: Record<string, string> = {
  mentionRate: "Mention Rate",
  avgRank: "Average Position",
};

function DecliningMetricsSection({
  data,
}: {
  data: ApiResponse["decliningMetrics"];
}) {
  const declining = data?.filter((m) => m.direction === "declining") ?? [];
  if (declining.length === 0) return <EmptyState message="No declining metrics — all trends are stable or improving." />;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {declining.map((m) => {
        const isDeclining = m.direction === "declining";
        const displayName = METRIC_DISPLAY_NAMES[m.metric] ?? m.metric;
        const modelLabel = m.model ? ` on ${MODEL_LABELS[m.model] ?? m.model}` : "";
        const isRate = m.metric === "mentionRate";

        return (
          <div
            key={`${m.metric}-${m.model ?? "all"}`}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <p className="text-sm font-medium">{displayName}{modelLabel}</p>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-2xl font-semibold">
                {isRate ? pct(m.recentValue) : `#${m.recentValue.toFixed(1)}`}
              </span>
              <span className="text-sm text-muted-foreground">
                was{" "}
                {isRate ? pct(m.previousValue) : `#${m.previousValue.toFixed(1)}`}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-1">
              {isDeclining ? (
                <TrendingDown className="h-4 w-4 text-red-600" />
              ) : (
                <TrendingUp className="h-4 w-4 text-green-600" />
              )}
              <span
                className={`text-sm font-medium ${isDeclining ? "text-red-600" : "text-green-600"}`}
              >
                {m.change > 0 ? "+" : ""}
                {isRate
                  ? `${(m.change * 100).toFixed(1)} pts`
                  : m.change.toFixed(2)} {isDeclining ? "worse" : "better"}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {m.previousPeriod} vs {m.recentPeriod}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Header ────────────────────────────────────────────────────────── */

function Header({ brandName, range, model }: { brandName: string; range: number; model: string }) {
  return (
    <div>
      <h2 className="text-2xl font-bold tracking-tight">Recommendations</h2>
      <p className="text-sm text-muted-foreground mt-1">
        Actionable recommendations to improve {brandName}&apos;s AI visibility based on current
        performance gaps, narrative analysis, and competitive intelligence.
      </p>
    </div>
  );
}

/* ─── Section Wrapper ───────────────────────────────────────────────── */

function Section({
  id,
  title,
  description,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="scroll-mt-24 rounded-xl border border-border bg-card shadow-sm">
      <div className="px-6 py-5">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{title}</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">{description}</p>
        {children}
      </div>
    </div>
  );
}

/* ─── Inner Page Component ──────────────────────────────────────────── */

function RecommendationsInner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const brandName = useBrandName(params.slug);
  const range = Number(searchParams.get("range") ?? 90);
  const model = searchParams.get("model") ?? "all";

  const validModel = model === "all" || VALID_MODELS.includes(model);
  const qs = new URLSearchParams({
    brandSlug: params.slug,
    model,
    range: String(range),
  }).toString();
  const url = validModel ? `/api/recommendations?${qs}` : null;
  const { data: apiData, loading, error } = useCachedFetch<ApiResponse>(url);

  /* Loading */
  if (loading) {
    return (
      <div className="space-y-8">
        <Header brandName={brandName} range={range} model={model} />
        <div className="space-y-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-6 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/4 mb-4" />
              <div className="h-3 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* Error */
  if (error) {
    return (
      <div className="space-y-8">
        <Header brandName={brandName} range={range} model={model} />
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  /* No data */
  if (apiData && !apiData.hasData) {
    const linkQs = new URLSearchParams({ range: String(range), model }).toString();
    return (
      <div className="space-y-8">
        <Header brandName={brandName} range={range} model={model} />
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            No completed runs yet for{" "}
            <span className="font-medium text-foreground">
              {MODEL_LABELS[model] ?? model}
            </span>{" "}
            with a {range}-day range.
          </p>
          <p className="text-sm text-muted-foreground">
            Use{" "}
            <Link
              href={`/entity/${params.slug}/overview?${linkQs}`}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Run prompts on Overview
            </Link>{" "}
            to generate data.
          </p>
        </div>
      </div>
    );
  }

  if (!apiData) return null;

  /* Check if all platforms are performing well (no playbook recs needed) */
  const showPlaybooks = (apiData.platformPlaybooks ?? []).some(
    (pb) => !(pb.avgBrandRank !== null && pb.avgBrandRank <= 2 && pb.mentionRate >= 0.8),
  );

  const hasCompetitorAlerts = (apiData.competitorAlerts ?? []).length > 0;
  const hasTopicGaps = (apiData.topicCoverageGaps ?? []).length > 0;
  const hasDeclining = (apiData.decliningMetrics ?? []).some((m) => m.direction === "declining");

  const activeSections = PAGE_SECTIONS.filter((s) => {
    if (s.id === "platform-playbooks" && !showPlaybooks) return false;
    if (s.id === "competitor-alerts" && !hasCompetitorAlerts) return false;
    if (s.id === "topic-gaps" && !hasTopicGaps) return false;
    if (s.id === "declining-metrics" && !hasDeclining) return false;
    return true;
  });

  /* Has data */
  return (
    <div className="flex gap-8 xl:-ml-52">
      {/* Sidebar */}
      <div className="w-40 shrink-0">
        <OnThisPage sections={activeSections} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-8 xl:max-w-[1060px]">
        <Header brandName={brandName} range={range} model={model} />

        {/* ── Content Gaps ─────────────────────────────── */}
        <h2 className="text-lg font-semibold border-b border-border pb-2">Content Gaps</h2>

        <Section
          id="prompt-opportunities"
          title="Prompt Opportunities"
          description={`Prompts where ${apiData.brandName} is absent or poorly ranked — the biggest content gaps to address.`}
          icon={Target}
        >
          <PromptOpportunitiesSection data={apiData.promptOpportunities} brandName={apiData.brandName} summary={apiData.promptOpportunitySummary} />
        </Section>

        {showPlaybooks && (
          <Section
            id="platform-playbooks"
            title="Platform Playbooks"
            description="Per-platform performance breakdown with tailored tips for each AI model."
            icon={Zap}
          >
            <PlatformPlaybooksSection data={apiData.platformPlaybooks} />
          </Section>
        )}

        {/* ── Narrative Insights ───────────────────────── */}
        <h2 className="text-lg font-semibold border-b border-border pb-2">Narrative Insights</h2>

        <Section
          id="negative-narratives"
          title="Narrative Remediation"
          description={`Weaknesses and negative themes AI models associate with ${apiData.brandName} — address these to improve perception.`}
          icon={Shield}
        >
          <NegativeNarrativesSection data={apiData.negativeNarratives} brandName={apiData.brandName} />
        </Section>

        {/* ── Monitoring ───────────────────────────────── */}
        <h2 className="text-lg font-semibold border-b border-border pb-2">Monitoring</h2>

        {hasCompetitorAlerts && (
          <Section
            id="competitor-alerts"
            title="Competitor Alerts"
            description="Competitors whose visibility is changing — rising threats and declining rivals."
            icon={AlertTriangle}
          >
            <CompetitorAlertsSection data={apiData.competitorAlerts} />
          </Section>
        )}

        <Section
          id="source-gaps"
          title="Source Gap Opportunities"
          description={`Domains that cite competitors but not ${apiData.brandName} — potential sources to target for coverage.`}
          icon={Target}
        >
          <SourceGapsSection data={apiData.sourceGapOpportunities} brandName={apiData.brandName} />
        </Section>

        {hasTopicGaps && (
          <Section
            id="topic-gaps"
            title="Topic Coverage Gaps"
            description={`Topics where ${apiData.brandName} has low mention rates or poor rankings compared to competitors.`}
            icon={TrendingDown}
          >
            <TopicGapsSection data={apiData.topicCoverageGaps} brandName={apiData.brandName} />
          </Section>
        )}

        {hasDeclining && (
          <Section
            id="declining-metrics"
            title="Declining Metrics"
            description="Key metrics that are trending downward and may need attention."
            icon={TrendingDown}
          >
            <DecliningMetricsSection data={apiData.decliningMetrics} />
          </Section>
        )}
      </div>
    </div>
  );
}

/* ─── Page Export ────────────────────────────────────────────────────── */

export default function RecommendationsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
      }
    >
      <RecommendationsInner />
    </Suspense>
  );
}
