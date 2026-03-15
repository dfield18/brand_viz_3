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
  Lightbulb,
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

const PRIORITY_STYLES = {
  high: "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400",
  medium: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400",
  low: "bg-muted/50 text-muted-foreground",
} as const;

function PriorityBadge({ level }: { level: "high" | "medium" | "low" }) {
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${PRIORITY_STYLES[level]}`}>
      {level === "high" ? "High" : level === "medium" ? "Med" : "Low"} priority
    </span>
  );
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

/* ─── Priority Summary ─────────────────────────────────────────────── */

function PrioritySummary({ data }: { data: ApiResponse }) {
  const bullets = useMemo(() => {
    const items: { text: string; severity: "high" | "medium" | "low" }[] = [];

    const notMentioned = (data.promptOpportunities ?? []).filter((p) => p.brandRank === null).length;
    if (notMentioned > 0) {
      items.push({
        text: `Not mentioned in ${notMentioned} AI prompt${notMentioned !== 1 ? "s" : ""} where competitors rank`,
        severity: "high",
      });
    }

    const risingCompetitors = (data.competitorAlerts ?? []).filter((a) => a.direction === "rising").length;
    if (risingCompetitors > 0) {
      items.push({
        text: `${risingCompetitors} competitor${risingCompetitors !== 1 ? "s" : ""} gaining visibility`,
        severity: risingCompetitors >= 2 ? "high" : "medium",
      });
    }

    const weaknessCount = (data.negativeNarratives?.weaknesses ?? []).length;
    if (weaknessCount > 0) {
      items.push({
        text: `${weaknessCount} negative narrative${weaknessCount !== 1 ? "s" : ""} detected across AI platforms`,
        severity: weaknessCount >= 3 ? "high" : "medium",
      });
    }

    const decliningCount = (data.decliningMetrics ?? []).filter((m) => m.direction === "declining").length;
    if (decliningCount > 0) {
      items.push({
        text: `${decliningCount} key metric${decliningCount !== 1 ? "s" : ""} trending downward`,
        severity: "medium",
      });
    }

    return items;
  }, [data]);

  if (bullets.length === 0) return null;

  const SEVERITY_DOT = {
    high: "bg-red-500",
    medium: "bg-amber-500",
    low: "bg-muted-foreground/40",
  };

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300">Top Priorities</h3>
      </div>
      <ul className="space-y-2">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-center gap-2.5 text-sm text-blue-900/80 dark:text-blue-300/80">
            <span className={`h-2 w-2 rounded-full shrink-0 ${SEVERITY_DOT[b.severity]}`} />
            {b.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

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
  const SCROLL_THRESHOLD = 5;

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

      if (item.brandRank === null) {
        group.worstRank = null;
      } else if (group.worstRank !== null) {
        group.worstRank = Math.max(group.worstRank, item.brandRank);
      }
      if (item.brandRank !== null) {
        group.bestRank = group.bestRank === null ? item.brandRank : Math.min(group.bestRank, item.brandRank);
      }

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

  // Match AI summary bullets to specific prompts by finding quoted prompt text
  const matchedRecommendations = useMemo(() => {
    const map = new Map<string, string>();
    if (!summary) return map;
    const bullets = summary.split("\n").filter(Boolean);
    for (const bullet of bullets) {
      const clean = stripMarkdown(bullet);
      // Find which grouped prompt this bullet references
      let bestMatch: string | null = null;
      let bestLen = 0;
      for (const g of grouped) {
        // Check if the bullet contains a substantial substring of the prompt
        const promptLower = g.promptText.toLowerCase();
        const bulletLower = clean.toLowerCase();
        if (bulletLower.includes(promptLower) || bulletLower.includes(promptLower.slice(0, 40))) {
          if (promptLower.length > bestLen) {
            bestLen = promptLower.length;
            bestMatch = g.promptText;
          }
        }
      }
      if (bestMatch) {
        map.set(bestMatch, clean.replace(/^[-•]\s*/, ""));
      }
    }
    return map;
  }, [summary, grouped]);

  if (!data || data.length === 0) return <EmptyState message="No prompt gaps found — great coverage!" />;

  const ordinal = (n: number) =>
    n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;

  const severityBorder = (worstRank: number | null) => {
    if (worstRank === null) return "border-l-red-300 dark:border-l-red-800";
    if (worstRank > 3) return "border-l-orange-300 dark:border-l-orange-800";
    return "border-l-amber-300 dark:border-l-amber-800";
  };

  const severityLabel = (worstRank: number | null, bestRank: number | null) => {
    if (worstRank === null) return { text: "Not mentioned", className: "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400" };
    const rankStr = bestRank === worstRank ? `#${worstRank}` : `#${bestRank}–${worstRank}`;
    if (worstRank > 3) return { text: `Ranked ${rankStr}`, className: "bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400" };
    return { text: `Ranked ${rankStr}`, className: "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400" };
  };

  const needsScroll = grouped.length >= SCROLL_THRESHOLD;

  return (
    <div className={needsScroll ? "max-h-[600px] overflow-y-auto pr-1 space-y-3" : "space-y-3"}>
      {grouped.map((item, i) => {
        const competitors = [...item.competitors.values()]
          .sort((a, b) => a.bestRank - b.bestRank)
          .slice(0, 5);
        const severity = severityLabel(item.worstRank, item.bestRank);
        const recommendation = matchedRecommendations.get(item.promptText);
        const priority: "high" | "medium" | "low" = item.worstRank === null ? "high" : item.worstRank > 3 ? "medium" : "low";

        return (
          <div
            key={i}
            className={`rounded-lg border border-border/80 ${severityBorder(item.worstRank)} border-l-[3px] bg-card px-5 py-3.5 space-y-2.5`}
          >
            {/* Prompt + status */}
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground/90 leading-snug">
                  &ldquo;{item.promptText}&rdquo;
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <PriorityBadge level={priority} />
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${severity.className}`}>
                  {severity.text}
                </span>
              </div>
            </div>

            {/* Competitors + platform count */}
            <div className="flex flex-wrap items-center gap-1.5">
              {competitors.length > 0 && (
                <>
                  <span className="text-[11px] text-muted-foreground/60 mr-0.5">Beating you:</span>
                  {competitors.map((c) => (
                    <span
                      key={c.displayName}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground"
                    >
                      {c.displayName}
                      <span className="text-muted-foreground/40">#{c.bestRank}</span>
                    </span>
                  ))}
                </>
              )}
              <span className="text-[11px] text-muted-foreground/40 ml-auto">
                {item.count} platform{item.count !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Recommendation */}
            {recommendation && (
              <div className="flex items-start gap-2 bg-muted/30 dark:bg-muted/10 rounded-md px-3 py-2.5">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500/70 mt-0.5 shrink-0" />
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  {recommendation}
                </p>
              </div>
            )}
          </div>
        );
      })}

    </div>
  );
}

function PlatformPlaybooksSection({
  data,
}: {
  data: ApiResponse["platformPlaybooks"];
}) {
  const [expandedGaps, setExpandedGaps] = useState<Record<string, boolean>>({});

  if (!data || data.length === 0) return <EmptyState message="No platform data available yet." />;

  const needsWork = data.filter(
    (pb) => !(pb.avgBrandRank !== null && pb.avgBrandRank <= 2 && pb.mentionRate >= 0.8),
  );

  if (needsWork.length === 0) return <EmptyState message="Strong performance across all platforms — no recommendations needed." />;

  const toggleGaps = (model: string) =>
    setExpandedGaps((prev) => ({ ...prev, [model]: !prev[model] }));

  return (
    <div className="space-y-3">
      {needsWork.map((pb) => {
        const borderColor = MODEL_BORDER_COLORS[pb.model] ?? "border-l-muted-foreground/30";
        const rankText = pb.avgBrandRank !== null ? `#${pb.avgBrandRank.toFixed(1)}` : "Not ranked";
        const gapsExpanded = expandedGaps[pb.model] ?? false;

        return (
          <div
            key={pb.model}
            className={`rounded-lg border border-border/80 ${borderColor} border-l-[3px] bg-card px-5 py-3.5 space-y-2.5`}
          >
            {/* Platform name + stat pills */}
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground/90 leading-snug">
                  {MODEL_LABELS[pb.model] ?? pb.model}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  pb.mentionRate < 0.5
                    ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                    : pb.mentionRate < 0.8
                      ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                      : "bg-muted/50 text-muted-foreground"
                }`}>
                  {pct(pb.mentionRate)} mentioned
                </span>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  pb.avgBrandRank === null || pb.avgBrandRank > 3
                    ? "bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400"
                    : "bg-muted/50 text-muted-foreground"
                }`}>
                  Avg {rankText}
                </span>
              </div>
            </div>

            {/* Top source categories */}
            {pb.topSourceCategories.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground/60 mr-0.5">Top sources:</span>
                {pb.topSourceCategories.slice(0, 3).map((sc) => (
                  <span
                    key={sc.category}
                    className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground"
                  >
                    {sc.category}
                  </span>
                ))}
              </div>
            )}

            {/* Platform tip */}
            {pb.platformTip && (
              <div className="flex items-start gap-2 bg-muted/30 dark:bg-muted/10 rounded-md px-3 py-2.5">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500/70 mt-0.5 shrink-0" />
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  {stripMarkdown(pb.platformTip)}
                </p>
              </div>
            )}

            {/* Per-platform specific gaps — collapsible */}
            {pb.specificGaps.length > 0 && (
              <div className="border-t border-border/50 pt-2.5">
                <button
                  type="button"
                  onClick={() => toggleGaps(pb.model)}
                  className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronRight className={`h-3.5 w-3.5 transition-transform ${gapsExpanded ? "rotate-90" : ""}`} />
                  {pb.specificGaps.length} prompt gap{pb.specificGaps.length !== 1 ? "s" : ""} on this platform
                </button>
                {gapsExpanded && (
                  <ul className="space-y-2 text-sm mt-2 ml-5">
                    {pb.specificGaps.map((gap, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                        <div>
                          <p className="text-[13px] text-foreground/80 leading-snug">{gap.promptText}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            Rank <RankDisplay rank={gap.brandRankOnModel} />
                            <span className="text-muted-foreground/60"> · vs #{gap.crossModelAvg.toFixed(1)} avg across platforms</span>
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
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
  const SCROLL_THRESHOLD = 5;
  const [showThemes, setShowThemes] = useState(false);

  const clean = (text: string) =>
    text
      .replace(/\*+/g, "")
      .replace(/^[·•\-\s]+/, "")
      .replace(/[·•]+\s*$/, "")
      // markdown links: ([label](url)) or [label](url) → keep label unless it's a URL
      .replace(/\(\[([^\]]*)\]\([^)]*\)\)/g, (_, label: string) =>
        /^(https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,})/.test(label) ? "" : label,
      )
      .replace(/\[([^\]]+)\]\([^)]+\)/g, (_, label: string) =>
        /^(https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,})/.test(label) ? "" : label,
      )
      // bare parenthesized URLs
      .replace(/\(https?:\/\/[^)]*\)/g, "")
      // bare URLs
      .replace(/https?:\/\/\S+/g, "")
      // empty parens leftover
      .replace(/\(\s*\)/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  // Match AI summary bullets to specific weaknesses
  const matchedRecs = useMemo(() => {
    const map = new Map<number, string>();
    if (!data?.narrativeSummary || !data?.weaknesses) return map;
    const bullets = data.narrativeSummary.split("\n").filter(Boolean);
    for (const bullet of bullets) {
      const cleanBullet = stripMarkdown(bullet).replace(/^[-•]\s*/, "");
      let bestIdx = -1;
      let bestScore = 0;
      for (let i = 0; i < data.weaknesses.length; i++) {
        const weakness = clean(data.weaknesses[i].weakness).toLowerCase();
        const words = weakness.split(/\s+/).filter((w) => w.length > 3);
        const score = words.filter((w) => cleanBullet.toLowerCase().includes(w)).length;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
      if (bestIdx >= 0 && bestScore >= 2 && !map.has(bestIdx)) {
        map.set(bestIdx, cleanBullet);
      }
    }
    return map;
  }, [data]);

  if (!hasWeaknesses && !hasThemes) return <EmptyState message="No negative narratives detected." />;

  const weaknesses = data?.weaknesses ?? [];
  const needsScroll = weaknesses.length >= SCROLL_THRESHOLD;

  const severityBorder = (count: number) => {
    if (count >= 5) return "border-l-red-300 dark:border-l-red-800";
    if (count >= 2) return "border-l-orange-300 dark:border-l-orange-800";
    return "border-l-amber-300 dark:border-l-amber-800";
  };

  return (
    <div className="space-y-3">
      {/* Weakness cards */}
      <div className={needsScroll ? "max-h-[600px] overflow-y-auto pr-1 space-y-3" : "space-y-3"}>
      {hasWeaknesses && weaknesses.map((w, i) => {
        const platforms = w.responses.length > 0
          ? [...new Set(w.responses.map((r) => MODEL_LABELS[r.model] ?? r.model))]
          : [];
        const recommendation = matchedRecs.get(i);
        const priority: "high" | "medium" | "low" = w.count >= 5 ? "high" : w.count >= 2 ? "medium" : "low";

        return (
          <div
            key={i}
            className={`rounded-lg border border-border/80 ${severityBorder(w.count)} border-l-[3px] bg-card px-5 py-3.5 space-y-2.5`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground/90 leading-snug">{clean(w.weakness)}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <PriorityBadge level={priority} />
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  w.count >= 5
                    ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                    : w.count >= 2
                      ? "bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400"
                      : "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                }`}>
                  {w.count} mention{w.count !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Platforms */}
            {platforms.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground/60 mr-0.5">Platforms:</span>
                {platforms.map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}

            {/* Recommendation */}
            {recommendation && (
              <div className="flex items-start gap-2 bg-muted/30 dark:bg-muted/10 rounded-md px-3 py-2.5">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500/70 mt-0.5 shrink-0" />
                <p className="text-[13px] text-muted-foreground leading-relaxed">
                  {recommendation}
                </p>
              </div>
            )}
          </div>
        );
      })}

      </div>

      {/* Negative themes — collapsible below */}
      {hasThemes && (
        <div className="border-t border-border pt-4 mt-4">
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

function CompetitorAlertsSection({
  data,
  slug,
  range,
  model,
}: {
  data: ApiResponse["competitorAlerts"];
  slug: string;
  range: number;
  model: string;
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
              <Link
                href={`/entity/${slug}/competition?${new URLSearchParams({ range: String(range), model }).toString()}`}
                className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline ml-2"
              >
                View details
                <ChevronRight className="h-3 w-3" />
              </Link>
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

  const SCROLL_THRESHOLD = 5;
  const needsScroll = data.length >= SCROLL_THRESHOLD;

  return (
    <div className={needsScroll ? "max-h-[600px] overflow-y-auto pr-1 space-y-3" : "space-y-3"}>
      {data.map((sg, i) => {
        const priority: "high" | "medium" | "low" =
          sg.totalCitations >= 5 && sg.competitorsCited.length >= 2 ? "high"
            : sg.totalCitations >= 3 || sg.competitorsCited.length >= 1 ? "medium"
              : "low";
        return (
        <div
          key={i}
          className="rounded-lg border border-border/80 border-l-[3px] border-l-violet-300 dark:border-l-violet-800 bg-card px-5 py-3.5 space-y-2.5"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-foreground/90 leading-snug">{sg.domain}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <PriorityBadge level={priority} />
              {sg.category && sg.category !== "uncategorized" && (
                <span className="inline-flex items-center rounded-full bg-purple-50/80 dark:bg-purple-950/20 px-2 py-0.5 text-[11px] text-purple-600 dark:text-purple-400">
                  {sg.category}
                </span>
              )}
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground">
                {sg.totalCitations} citation{sg.totalCitations !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Competitors cited */}
          {sg.competitorsCited.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground/60 mr-0.5">Cites competitors:</span>
              {sg.competitorsCited.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground"
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          {/* Suggestion */}
          <div className="flex items-start gap-2 bg-muted/30 dark:bg-muted/10 rounded-md px-3 py-2.5">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500/70 mt-0.5 shrink-0" />
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              {stripMarkdown(sg.suggestion)}
            </p>
          </div>
        </div>
        );
      })}

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

  const SCROLL_THRESHOLD = 5;
  const needsScroll = data.length >= SCROLL_THRESHOLD;

  const topicLabel = (key: string) =>
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const severityBorder = (mentionRate: number, avgRank: number | null) => {
    if (mentionRate < 0.3) return "border-l-red-300 dark:border-l-red-800";
    if ((avgRank ?? 99) > 3) return "border-l-orange-300 dark:border-l-orange-800";
    return "border-l-amber-300 dark:border-l-amber-800";
  };

  return (
    <div className={needsScroll ? "max-h-[600px] overflow-y-auto pr-1 space-y-3" : "space-y-3"}>
      {data.map((tg, i) => {
        const barColor =
          tg.mentionRate < 0.3 ? "bg-red-400" : tg.mentionRate < 0.6 ? "bg-amber-400" : "bg-green-400";
        const priority: "high" | "medium" | "low" =
          tg.mentionRate < 0.3 ? "high" : (tg.avgRank ?? 99) > 3 || tg.mentionRate < 0.6 ? "medium" : "low";

        return (
          <div
            key={i}
            className={`rounded-lg border border-border/80 ${severityBorder(tg.mentionRate, tg.avgRank)} border-l-[3px] bg-card px-5 py-3.5 space-y-2.5`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground/90 leading-snug">{topicLabel(tg.topicKey)}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <PriorityBadge level={priority} />
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  tg.mentionRate < 0.3
                    ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                    : tg.mentionRate < 0.6
                      ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400"
                      : "bg-muted/50 text-muted-foreground"
                }`}>
                  {pct(tg.mentionRate)} mentioned
                </span>
                {tg.avgRank !== null && (
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    tg.avgRank > 3
                      ? "bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400"
                      : "bg-muted/50 text-muted-foreground"
                  }`}>
                    Avg #{tg.avgRank.toFixed(1)}
                  </span>
                )}
              </div>
            </div>

            {/* Mention rate bar + competitors */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 rounded-full bg-muted/60 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor}`}
                    style={{ width: `${(tg.mentionRate * 100).toFixed(0)}%` }}
                  />
                </div>
              </div>
              {tg.competitorLeaders.length > 0 && (
                <>
                  <span className="text-[11px] text-muted-foreground/60">Ranks #1 instead:</span>
                  {tg.competitorLeaders.map((cl) => (
                    <span
                      key={cl.entityId}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground"
                    >
                      {cl.displayName}
                      <span className="text-muted-foreground/40">{cl.rank1Count}x</span>
                    </span>
                  ))}
                </>
              )}
            </div>

            {/* Suggestion */}
            <div className="flex items-start gap-2 bg-muted/30 dark:bg-muted/10 rounded-md px-3 py-2.5">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500/70 mt-0.5 shrink-0" />
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {stripMarkdown(tg.suggestion)}
              </p>
            </div>
          </div>
        );
      })}

    </div>
  );
}

const METRIC_DISPLAY_NAMES: Record<string, string> = {
  mentionRate: "Mention Rate",
  avgRank: "Average Position",
};

const METRIC_ADVICE: Record<string, string> = {
  mentionRate: "Focus on content optimization — ensure your brand appears in relevant AI training data and authoritative sources.",
  avgRank: "Improve positioning by strengthening claims, adding structured data, and targeting prompts where you rank poorly.",
  rank1Rate: "Increase top-result appearances by building authority signals and targeting high-intent prompts.",
  avgProminence: "Boost prominence by increasing the depth and specificity of content about your brand.",
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
            {METRIC_ADVICE[m.metric] && (
              <div className="flex items-start gap-2 bg-muted/30 dark:bg-muted/10 rounded-md px-3 py-2 mt-3">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500/70 mt-0.5 shrink-0" />
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  {METRIC_ADVICE[m.metric]}
                </p>
              </div>
            )}
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
        <p className="text-base text-muted-foreground mb-4">{description}</p>
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
      <div className="flex-1 min-w-0 space-y-6 xl:max-w-[1060px]">
        <Header brandName={brandName} range={range} model={model} />

        <PrioritySummary data={apiData} />

        {/* ── Content Gaps ─────────────────────────────── */}
        <h2 className="text-lg font-semibold border-b border-border pb-2">Content Gaps</h2>

        <Section
          id="prompt-opportunities"
          title="Prompt Opportunities"
          description={`AI questions where ${apiData.brandName} is missing or outranked — each card shows the gap and what to do about it.`}
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
            <CompetitorAlertsSection data={apiData.competitorAlerts} slug={params.slug} range={range} model={model} />
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
