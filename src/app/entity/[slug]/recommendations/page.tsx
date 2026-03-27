"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { VALID_MODELS, MODEL_LABELS } from "@/lib/constants";
import { OnThisPage, type PageSection } from "@/components/OnThisPage";
import { useBrandName } from "@/lib/useBrandName";

/* ─── API Response Types ────────────────────────────────────────────── */

interface ApiResponse {
  hasData: boolean;
  brandName: string;
  promptOpportunitySummary: string;
  comparisonPeriodLabel?: string;

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

/** Extract a readable domain name from a URL: "https://en.wikipedia.org/wiki/..." → "Wikipedia" */
function urlToDomainLabel(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    // Known friendly names
    const KNOWN: Record<string, string> = {
      "en.wikipedia.org": "Wikipedia", "wikipedia.org": "Wikipedia",
      "nytimes.com": "NY Times", "washingtonpost.com": "Washington Post",
      "theguardian.com": "The Guardian", "bbc.com": "BBC", "bbc.co.uk": "BBC",
      "reuters.com": "Reuters", "bloomberg.com": "Bloomberg", "forbes.com": "Forbes",
      "cnn.com": "CNN", "wsj.com": "WSJ",
    };
    if (KNOWN[hostname]) return KNOWN[hostname];
    // Strip TLD: "example.org" → "Example"
    const parts = hostname.split(".");
    const name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return url;
  }
}

/** Resolve a domain-like string to a friendly name */
function domainToLabel(domain: string): string {
  const d = domain.toLowerCase().replace(/^www\./, "").replace(/\/.*$/, "").trim();
  const KNOWN: Record<string, string> = {
    "en.wikipedia.org": "Wikipedia", "wikipedia.org": "Wikipedia",
    "nytimes.com": "NY Times", "washingtonpost.com": "Washington Post",
    "theguardian.com": "The Guardian", "bbc.com": "BBC", "bbc.co.uk": "BBC",
    "reuters.com": "Reuters", "bloomberg.com": "Bloomberg", "forbes.com": "Forbes",
    "cnn.com": "CNN", "wsj.com": "WSJ", "mondoweiss.net": "Mondoweiss",
    "timesofisrael.com": "Times of Israel", "jpost.com": "Jerusalem Post",
    "haaretz.com": "Haaretz",
  };
  if (KNOWN[d]) return KNOWN[d];
  const parts = d.split(".");
  const name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Strip all URL/link noise from text, replacing with readable domain labels.
 * Handles: [label](url), ([domain](Label)), (url), bare URLs, bare domain.tld
 */
function cleanUrls(text: string): string {
  return text
    // ([domain.com](https://...)) or ([domain.com](Label)) — entire construct → domain label
    .replace(/\(\[([^\]]+)\]\([^)]*\)\)/g, (_, inner: string) => {
      if (/[a-z0-9-]+\.[a-z]{2,}/i.test(inner)) return `(${domainToLabel(inner)})`;
      return `(${inner})`;
    })
    // [label](url) — standard markdown link
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, (_, label: string, url: string) => {
      // If label is a URL/domain, show domain label
      if (/^(https?:\/\/|www\.)/.test(label)) return domainToLabel(label);
      if (/^[a-z0-9-]+\.[a-z]{2,}/i.test(label)) return domainToLabel(label);
      // If label is a readable name, keep it
      return label;
    })
    // (https://...) — parenthesized URL
    .replace(/\(https?:\/\/[^)]+\)/g, (match) => {
      const url = match.slice(1, -1);
      return `(${urlToDomainLabel(url)})`;
    })
    // Bare URLs
    .replace(/https?:\/\/\S+/g, (url) => urlToDomainLabel(url.replace(/[.,;:!?)]+$/, "")))
    // Empty parens leftover
    .replace(/\(\s*\)/g, "");
}

/** Convert markdown links to readable domain labels, strip remaining markdown */
function stripMarkdown(text: string): string {
  return cleanUrls(text)
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^#+\s+/gm, "")
    .replace(/`/g, "")
    .replace(/~~/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Clean text for headlines — convert URLs to domain labels, strip formatting */
function clean(text: string): string {
  return cleanUrls(text)
    .replace(/\*+/g, "")
    .replace(/^[·•\-\s]+/, "")
    .replace(/[·•]+\s*$/, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

const PAGE_SECTIONS: PageSection[] = [
  { id: "top-priorities", label: "Top Priorities" },
  { id: "prompt-opportunities", label: "Where You're Missing", heading: "Content Gaps" },
  { id: "platform-playbooks", label: "By AI Platform" },
  { id: "topic-coverage-gaps", label: "Topic Gaps" },
  { id: "negative-narratives", label: "Narrative Issues", heading: "Narrative" },
  { id: "competitor-alerts", label: "Competitor Movement", heading: "Monitoring" },
  { id: "source-gaps", label: "Source Gaps" },
  { id: "declining-metrics", label: "Declining Metrics" },
];

/* ─── Prose Section Components (Site-Audit Style) ───────────────────── */

function TopPrioritiesSection({ data, brandName }: { data: ApiResponse; brandName: string }) {
  const items: string[] = [];

  const notMentioned = (data.promptOpportunities ?? []).filter((p) => p.brandRank === null).length;
  if (notMentioned > 0) {
    items.push(`${brandName} is not mentioned in ${notMentioned} AI prompt${notMentioned !== 1 ? "s" : ""} where competitors are ranking. These are the highest-priority content gaps to address.`);
  }

  const risingComps = (data.competitorAlerts ?? []).filter((a) => a.direction === "rising");
  if (risingComps.length > 0) {
    const names = risingComps.slice(0, 3).map((a) => a.displayName).join(", ");
    items.push(`${risingComps.length} competitor${risingComps.length !== 1 ? "s are" : " is"} gaining AI visibility, including ${names}. Monitor their content strategies and consider differentiating ${brandName}'s positioning.`);
  }

  const weaknessCount = (data.negativeNarratives?.weaknesses ?? []).length;
  if (weaknessCount > 0) {
    const topWeakness = clean(data.negativeNarratives.weaknesses[0].weakness);
    items.push(`AI platforms are surfacing ${weaknessCount} negative narrative${weaknessCount !== 1 ? "s" : ""} about ${brandName}. The most common: "${topWeakness.slice(0, 100)}${topWeakness.length > 100 ? "..." : ""}". Publishing counter-content can help shift this perception.`);
  }

  const declining = (data.decliningMetrics ?? []).filter((m) => m.direction === "declining");
  if (declining.length > 0) {
    items.push(`${declining.length} key metric${declining.length !== 1 ? "s are" : " is"} trending downward. Review the Declining Metrics section below for specific areas that need attention.`);
  }

  if (items.length === 0) {
    items.push(`${brandName} is performing well across AI platforms. No urgent issues were detected. Continue monitoring to maintain this position.`);
  }

  return (
    <div>
      {items.map((text, i) => (
        <p key={i} className="text-sm text-muted-foreground leading-relaxed mb-4 last:mb-0">{text}</p>
      ))}
    </div>
  );
}

function PromptOpportunitiesSection({ data, brandName, summary }: { data: ApiResponse["promptOpportunities"]; brandName: string; summary: string }) {
  // Deduplicate prompts across models — hook must be called before early return
  const grouped = useMemo(() => {
    if (!data || data.length === 0) return [];
    const map = new Map<string, {
      promptText: string;
      worstRank: number | null;
      competitors: Map<string, { displayName: string; bestRank: number }>;
      suggestion: string;
    }>();
    for (const item of data) {
      let group = map.get(item.promptText);
      if (!group) {
        group = { promptText: item.promptText, worstRank: item.brandRank, competitors: new Map(), suggestion: item.suggestion };
        map.set(item.promptText, group);
      }
      if (item.brandRank === null) group.worstRank = null;
      else if (group.worstRank !== null) group.worstRank = Math.max(group.worstRank, item.brandRank);
      for (const c of item.topCompetitors) {
        const existing = group.competitors.get(c.entityId);
        if (!existing || c.rank < existing.bestRank) {
          group.competitors.set(c.entityId, { displayName: c.displayName, bestRank: c.rank });
        }
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.worstRank === null && b.worstRank !== null) return -1;
      if (a.worstRank !== null && b.worstRank === null) return 1;
      return b.competitors.size - a.competitors.size;
    });
  }, [data]);

  if (grouped.length === 0) {
    return <p className="text-sm text-muted-foreground">No prompt gaps found — {brandName} has great coverage across AI questions.</p>;
  }

  const notMentioned = grouped.filter((g) => g.worstRank === null);
  const outranked = grouped.filter((g) => g.worstRank !== null);

  return (
    <div>
      {/* Intro line */}
      <p className="text-sm text-muted-foreground leading-relaxed mb-5">
        {notMentioned.length > 0
          ? `${brandName} is absent from ${notMentioned.length} AI prompt${notMentioned.length !== 1 ? "s" : ""} where competitors rank.`
          : `${brandName} appears in all prompts but ranks behind competitors in ${outranked.length}.`}
        {" "}Here&apos;s what to do about each one:
      </p>

      {/* Not mentioned — highest priority */}
      {notMentioned.map((item, i) => {
        const comps = [...item.competitors.values()].sort((a, b) => a.bestRank - b.bestRank).slice(0, 4);
        const compText = comps.length > 0
          ? ` Competitors ranking: ${comps.map((c) => `${c.displayName} #${c.bestRank}`).join(", ")}.`
          : "";
        return (
          <div key={`nm-${i}`} className="mb-5 last:mb-0">
            <h4 className="text-sm font-semibold mb-1">&ldquo;{item.promptText}&rdquo;</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {brandName} is not mentioned at all.{compText} {stripMarkdown(item.suggestion) || `Create content that directly addresses this question to close the gap.`}
            </p>
          </div>
        );
      })}

      {/* Outranked */}
      {outranked.map((item, i) => {
        const comps = [...item.competitors.values()].sort((a, b) => a.bestRank - b.bestRank).slice(0, 4);
        const compText = comps.length > 0
          ? ` Outranked by: ${comps.map((c) => `${c.displayName} #${c.bestRank}`).join(", ")}.`
          : "";
        return (
          <div key={`or-${i}`} className="mb-5 last:mb-0">
            <h4 className="text-sm font-semibold mb-1">&ldquo;{item.promptText}&rdquo;</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {brandName} ranks #{item.worstRank}.{compText} {stripMarkdown(item.suggestion) || `Strengthen claims and build authority signals to improve positioning.`}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function PlatformPlaybooksSection({ data, brandName }: { data: ApiResponse["platformPlaybooks"]; brandName: string }) {
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">No platform data available yet.</p>;

  const needsWork = data.filter((pb) => !(pb.avgBrandRank !== null && pb.avgBrandRank <= 2 && pb.mentionRate >= 0.8));
  if (needsWork.length === 0) return <p className="text-sm text-muted-foreground">Strong performance across all platforms — no specific recommendations needed.</p>;

  return (
    <div>
      {needsWork.map((pb) => {
        const label = MODEL_LABELS[pb.model] ?? pb.model;
        const rankText = pb.avgBrandRank !== null ? `#${pb.avgBrandRank.toFixed(1)}` : "not ranked";
        const mentionPct = pct(pb.mentionRate);
        const gapCount = pb.specificGaps.length;

        return (
          <div key={pb.model} className="mb-6 last:mb-0">
            <h4 className="text-base font-semibold mb-2">{label}</h4>
            <p className="text-sm text-muted-foreground leading-relaxed mb-2">
              {brandName} is mentioned in {mentionPct} of {label} responses with an average position of {rankText}.
              {gapCount > 0 ? ` There ${gapCount === 1 ? "is" : "are"} ${gapCount} prompt${gapCount !== 1 ? "s" : ""} where ${brandName} underperforms on this platform specifically.` : ""}
            </p>
            {pb.platformTip && (
              <p className="text-sm text-muted-foreground leading-relaxed">
                {stripMarkdown(pb.platformTip)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NegativeNarrativesSection({ data, brandName }: { data: ApiResponse["negativeNarratives"]; brandName: string }) {
  const hasWeaknesses = data?.weaknesses && data.weaknesses.length > 0;
  const hasThemes = data?.negativeThemes && data.negativeThemes.length > 0;

  if (!hasWeaknesses && !hasThemes) return <p className="text-sm text-muted-foreground">No negative narratives detected across AI platforms.</p>;

  const weaknesses = data?.weaknesses ?? [];

  return (
    <div>
      {weaknesses.map((w, i) => {
        const platforms = [...new Set(w.responses.map((r) => MODEL_LABELS[r.model] ?? r.model))];
        const platformText = platforms.length > 0 ? ` This appears across ${platforms.join(", ")}.` : "";

        return (
          <div key={i} className="mb-6 last:mb-0">
            <h4 className="text-base font-semibold mb-2">{clean(w.weakness)}</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This narrative appeared {w.count} time{w.count !== 1 ? "s" : ""} in AI responses about {brandName}.{platformText}
              {w.suggestion ? ` ${stripMarkdown(w.suggestion)}` : " Consider publishing content that directly addresses this perception."}
            </p>
          </div>
        );
      })}

      {hasThemes && (
        <div className="mt-4">
          <h4 className="text-base font-semibold mb-2">Themes Where AI Skews Negative</h4>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {data.negativeThemes.map((t) =>
              `${t.theme} (${t.negativeCount + t.mixedCount} negative vs ${t.positiveCount} positive)`
            ).join("; ")}.
          </p>
        </div>
      )}
    </div>
  );
}

function CompetitorAlertsSection({ data, brandName, slug, range, model }: { data: ApiResponse["competitorAlerts"]; brandName: string; slug: string; range: number; model: string }) {
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">No significant competitor movement detected.</p>;

  const rising = data.filter((a) => a.direction === "rising");
  const falling = data.filter((a) => a.direction === "falling");

  return (
    <div>
      {rising.length > 0 && (
        <div className="mb-6">
          <h4 className="text-base font-semibold mb-2">Rising Competitors</h4>
          {rising.map((a) => (
            <p key={a.entityId} className="text-sm text-muted-foreground leading-relaxed mb-2">
              <span className="font-medium text-foreground">{a.displayName}</span> has increased from {pct(a.previousMentionRate)} to {pct(a.recentMentionRate)} mention rate ({a.mentionRateChange > 0 ? "+" : ""}{Math.round(a.mentionRateChange * 100)} pts). This means AI platforms are mentioning them more frequently in industry responses.
            </p>
          ))}
        </div>
      )}

      {falling.length > 0 && (
        <div className="mb-6">
          <h4 className="text-base font-semibold mb-2">Declining Competitors</h4>
          {falling.map((a) => (
            <p key={a.entityId} className="text-sm text-muted-foreground leading-relaxed mb-2">
              <span className="font-medium text-foreground">{a.displayName}</span> dropped from {pct(a.previousMentionRate)} to {pct(a.recentMentionRate)} mention rate. This could be an opportunity for {brandName} to fill the gap.
            </p>
          ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        <Link href={`/entity/${slug}/competition?${new URLSearchParams({ range: String(range), model }).toString()}`} className="text-primary hover:underline">
          View full competitive landscape →
        </Link>
      </p>
    </div>
  );
}

function SourceGapsSection({ data, brandName }: { data: ApiResponse["sourceGapOpportunities"]; brandName: string }) {
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">No source gap opportunities found.</p>;

  const topGaps = data.slice(0, 8);
  const highPriority = topGaps.filter((sg) => sg.totalCitations >= 5 && sg.competitorsCited.length >= 2);
  const others = topGaps.filter((sg) => !(sg.totalCitations >= 5 && sg.competitorsCited.length >= 2));

  return (
    <div>
      {highPriority.length > 0 && (
        <div className="mb-6">
          <h4 className="text-base font-semibold mb-2">High-Priority Sources</h4>
          {highPriority.map((sg, i) => (
            <p key={i} className="text-sm text-muted-foreground leading-relaxed mb-2">
              <span className="font-medium text-foreground">{sg.domain}</span> has {sg.totalCitations} citations for competitors like {sg.competitorsCited.slice(0, 3).join(", ")} but never cites {brandName}. {stripMarkdown(sg.suggestion)}
            </p>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <div>
          <h4 className="text-base font-semibold mb-2">Additional Sources to Target</h4>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Other sites citing competitors but not {brandName}: {others.map((sg) => `${sg.domain} (${sg.totalCitations} citations)`).join(", ")}.
          </p>
        </div>
      )}
    </div>
  );
}

function TopicCoverageGapsSection({ data, brandName }: { data: ApiResponse["topicCoverageGaps"]; brandName: string }) {
  if (!data || data.length === 0) return <p className="text-sm text-muted-foreground">No topic coverage gaps found — {brandName} is well represented across all topics.</p>;

  return (
    <div>
      {data.map((gap, i) => {
        const mentionPct = Math.round(gap.mentionRate * 100);
        const rankText = gap.avgRank !== null ? ` with an average position of #${gap.avgRank.toFixed(1)}` : "";
        const leaders = gap.competitorLeaders;
        const leaderText = leaders.length > 0
          ? ` Competitors leading this topic: ${leaders.map((l) => `${l.displayName} (#1 in ${l.rank1Count} response${l.rank1Count !== 1 ? "s" : ""})`).join(", ")}.`
          : "";

        return (
          <div key={i} className="mb-6 last:mb-0">
            <h4 className="text-base font-semibold mb-2">{gap.topicKey}</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {brandName} is only mentioned in {mentionPct}% of AI responses about this topic{rankText}.{leaderText} {stripMarkdown(gap.suggestion)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function DecliningMetricsSection({ data, brandName }: { data: ApiResponse["decliningMetrics"]; brandName: string }) {
  const declining = data?.filter((m) => m.direction === "declining") ?? [];
  if (declining.length === 0) return <p className="text-sm text-muted-foreground">All metrics are stable or improving — no declining trends detected.</p>;

  const METRIC_NAMES: Record<string, string> = {
    mentionRate: "Mention Rate",
    avgRank: "Average Position",
    rank1Rate: "Top Result Rate",
    avgProminence: "Prominence Score",
  };

  return (
    <div>
      {declining.map((m) => {
        const name = METRIC_NAMES[m.metric] ?? m.metric;
        const modelLabel = m.model ? ` on ${MODEL_LABELS[m.model] ?? m.model}` : "";
        const isRate = m.metric === "mentionRate";
        const recent = isRate ? pct(m.recentValue) : `#${m.recentValue.toFixed(1)}`;
        const previous = isRate ? pct(m.previousValue) : `#${m.previousValue.toFixed(1)}`;

        return (
          <div key={`${m.metric}-${m.model ?? "all"}`} className="mb-6 last:mb-0">
            <h4 className="text-base font-semibold mb-2">{name}{modelLabel}</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {name} has declined from {previous} to {recent} ({m.previousPeriod} vs {m.recentPeriod}). {
                m.metric === "mentionRate" ? `Focus on content optimization to ensure ${brandName} appears in relevant AI responses.` :
                m.metric === "avgRank" ? `Improve positioning by strengthening claims and targeting prompts where ${brandName} ranks poorly.` :
                `Monitor this trend and consider adjusting ${brandName}'s content strategy.`
              }
            </p>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main Layout ─────────────────────────────────────────────────────── */

function SectionBlock({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24 rounded-xl bg-card border border-border shadow-sm px-6 py-5">
      <h3 className="text-lg font-bold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function RecommendationsInner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const brandName = useBrandName(params.slug);
  const range = Number(searchParams.get("range") ?? 90);
  const model = searchParams.get("model") ?? "all";

  const validModel = model === "all" || VALID_MODELS.includes(model);
  const qs = new URLSearchParams({ brandSlug: params.slug, model, range: String(range) }).toString();
  const url = validModel ? `/api/recommendations?${qs}` : null;
  const { data: apiData, loading, error } = useCachedFetch<ApiResponse>(url);

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold">Recommendations</h2>
          <p className="text-sm text-muted-foreground mt-1">Loading recommendations...</p>
        </div>
        <div className="space-y-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-5 bg-muted rounded w-1/3 mb-3" />
              <div className="h-3 bg-muted rounded w-full mb-2" />
              <div className="h-3 bg-muted rounded w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8">
        <h2 className="text-2xl font-bold">Recommendations</h2>
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  if (apiData && !apiData.hasData) {
    return (
      <div className="space-y-8">
        <h2 className="text-2xl font-bold">Recommendations</h2>
        <p className="text-sm text-muted-foreground">
          No completed runs yet. Use{" "}
          <Link href={`/entity/${params.slug}/overview?${new URLSearchParams({ range: String(range), model }).toString()}`} className="underline hover:text-foreground">
            Run prompts on Overview
          </Link>{" "}
          to generate data.
        </p>
      </div>
    );
  }

  if (!apiData) return null;

  const name = apiData.brandName;
  const showPlaybooks = (apiData.platformPlaybooks ?? []).some((pb) => !(pb.avgBrandRank !== null && pb.avgBrandRank <= 2 && pb.mentionRate >= 0.8));
  const hasTopicGaps = (apiData.topicCoverageGaps ?? []).length > 0;
  const hasCompetitorAlerts = (apiData.competitorAlerts ?? []).length > 0;
  const hasDeclining = (apiData.decliningMetrics ?? []).some((m) => m.direction === "declining");

  const activeSections = PAGE_SECTIONS.filter((s) => {
    if (s.id === "platform-playbooks" && !showPlaybooks) return false;
    if (s.id === "topic-coverage-gaps" && !hasTopicGaps) return false;
    if (s.id === "competitor-alerts" && !hasCompetitorAlerts) return false;
    if (s.id === "declining-metrics" && !hasDeclining) return false;
    return true;
  });

  return (
    <div className="flex gap-8 xl:-ml-52">
      <div className="w-40 shrink-0">
        <OnThisPage sections={activeSections} />
      </div>

      <div className="flex-1 min-w-0 space-y-8 xl:max-w-[1060px]">
        <div>
          <h2 className="text-2xl font-bold">Recommendations</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Actionable recommendations to improve {name}&apos;s AI visibility based on current performance gaps, narrative analysis, and competitive intelligence.
          </p>
        </div>

        <SectionBlock id="top-priorities" title="Top Priorities">
          <TopPrioritiesSection data={apiData} brandName={name} />
        </SectionBlock>

        <h2 className="text-lg font-semibold border-b border-border pb-2">Content Gaps</h2>

        <SectionBlock id="prompt-opportunities" title="Where You're Missing">
          <PromptOpportunitiesSection data={apiData.promptOpportunities} brandName={name} summary={apiData.promptOpportunitySummary} />
        </SectionBlock>

        {showPlaybooks && (
          <SectionBlock id="platform-playbooks" title="Performance by AI Platform">
            <PlatformPlaybooksSection data={apiData.platformPlaybooks} brandName={name} />
          </SectionBlock>
        )}

        {hasTopicGaps && (
          <SectionBlock id="topic-coverage-gaps" title="Topics Where You're Underrepresented">
            <TopicCoverageGapsSection data={apiData.topicCoverageGaps} brandName={name} />
          </SectionBlock>
        )}

        <h2 className="text-lg font-semibold border-b border-border pb-2">Narrative</h2>

        <SectionBlock id="negative-narratives" title="What AI Gets Wrong">
          <NegativeNarrativesSection data={apiData.negativeNarratives} brandName={name} />
        </SectionBlock>

        <h2 className="text-lg font-semibold border-b border-border pb-2">Monitoring</h2>

        {hasCompetitorAlerts && (
          <SectionBlock id="competitor-alerts" title="Competitor Movement">
            <CompetitorAlertsSection data={apiData.competitorAlerts} brandName={name} slug={params.slug} range={range} model={model} />
          </SectionBlock>
        )}

        <SectionBlock id="source-gaps" title="Sources Not Covering You">
          <SourceGapsSection data={apiData.sourceGapOpportunities} brandName={name} />
        </SectionBlock>

        {hasDeclining && (
          <SectionBlock id="declining-metrics" title="Metrics Trending Down">
            <DecliningMetricsSection data={apiData.decliningMetrics} brandName={name} />
          </SectionBlock>
        )}
      </div>
    </div>
  );
}

export default function RecommendationsPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>}>
      <RecommendationsInner />
    </Suspense>
  );
}
