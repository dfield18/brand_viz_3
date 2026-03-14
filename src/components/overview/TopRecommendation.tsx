"use client";

import { Lightbulb } from "lucide-react";
import { useCachedFetch } from "@/lib/useCachedFetch";

interface RecsApiResponse {
  hasData: boolean;
  promptOpportunities?: { promptText: string; suggestion: string; brandRank: number | null }[];
  negativeNarratives?: { weaknesses: { weakness: string; suggestion: string }[] };
  competitorNarrativeGaps?: { displayName: string; suggestions: string[] }[];
  decliningMetrics?: { metric: string; change: number; direction: string }[];
  platformPlaybooks?: { model: string; platformTip: string; mentionRate: number }[];
  sourceGapOpportunities?: { domain: string; suggestion: string }[];
  topicCoverageGaps?: { topicKey: string; suggestion: string }[];
}

interface Props {
  brandSlug: string;
  brandName: string;
  model: string;
  range: number;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")  // [text](url) → text
    .replace(/\*\*/g, "")                       // bold **
    .replace(/\*/g, "")                         // italic *
    .replace(/^#+\s+/gm, "")                    // heading markers
    .replace(/^[-•]\s+/gm, "")                  // bullet markers
    .replace(/`/g, "")                           // inline code
    .replace(/~~/g, "")                          // strikethrough
    .replace(/\(\s*\)/g, "")                     // empty parens ()
    .replace(/\s{2,}/g, " ")                     // collapse multiple spaces
    .trim();
}

export function TopRecommendation({ brandSlug, brandName, model, range }: Props) {
  const url = `/api/recommendations?brandSlug=${encodeURIComponent(brandSlug)}&model=${model}&range=${range}`;
  const { data, loading } = useCachedFetch<RecsApiResponse>(url);

  if (loading) {
    return (
      <div className="px-5 py-4 animate-pulse">
        <div className="h-4 w-48 bg-muted rounded mb-3" />
        <div className="h-10 bg-muted/40 rounded" />
      </div>
    );
  }

  if (!data?.hasData) return null;

  // Pick the highest-impact recommendation
  let recommendation: string | null = null;
  let source = "";

  // Priority 1: declining metrics
  const declining = data.decliningMetrics?.filter((m) => m.direction === "declining");
  if (declining && declining.length > 0) {
    const worst = declining.sort((a, b) => a.change - b.change)[0];
    const metricMessages: Record<string, string> = {
      mentionRate: `mention rate (how often AI platforms include ${brandName} in responses) has declined by ${Math.abs(worst.change * 100).toFixed(1)} percentage points`,
      avgRank: `average ranking position in AI responses (where ${brandName} appears in the list when AI recommends options) has worsened by ${Math.abs(worst.change).toFixed(1)} positions`,
    };
    recommendation = metricMessages[worst.metric]
      ? `${brandName}'s ${metricMessages[worst.metric]} — investigate recent content or competitive changes.`
      : `${brandName}'s ${worst.metric} has declined — investigate recent changes.`;
    source = "Declining Metric";
  }

  // Priority 2: negative narratives
  if (!recommendation && data.negativeNarratives?.weaknesses?.length) {
    const w = data.negativeNarratives.weaknesses[0];
    recommendation = w.suggestion;
    source = "Narrative Issue";
  }

  // Priority 3: prompt opportunities
  if (!recommendation && data.promptOpportunities?.length) {
    const opp = data.promptOpportunities[0];
    recommendation = opp.suggestion;
    source = "Prompt Opportunity";
  }

  // Priority 4: competitor gaps
  if (!recommendation && data.competitorNarrativeGaps?.length) {
    const gap = data.competitorNarrativeGaps[0];
    if (gap.suggestions.length > 0) {
      recommendation = gap.suggestions[0];
      source = "Competitive Gap";
    }
  }

  // Priority 5: platform playbooks
  if (!recommendation && data.platformPlaybooks?.length) {
    const pb = data.platformPlaybooks[0];
    recommendation = pb.platformTip;
    source = "Platform Strategy";
  }

  // Priority 6: source gaps
  if (!recommendation && data.sourceGapOpportunities?.length) {
    const sg = data.sourceGapOpportunities[0];
    recommendation = sg.suggestion;
    source = "Source Gap";
  }

  // Priority 7: topic gaps
  if (!recommendation && data.topicCoverageGaps?.length) {
    const tg = data.topicCoverageGaps[0];
    recommendation = tg.suggestion;
    source = "Topic Gap";
  }

  if (!recommendation) return null;

  return (
    <div className="flex items-start gap-3 px-5 py-3.5 border-t border-border bg-amber-50/20">
      <Lightbulb className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[13px] text-foreground/70 leading-relaxed">
          <span className="font-medium text-amber-700 mr-1.5">{source}:</span>
          {stripMarkdown(recommendation)}
        </p>
      </div>
    </div>
  );
}
