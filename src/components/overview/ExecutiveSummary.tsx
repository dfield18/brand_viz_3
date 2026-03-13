"use client";

interface Props {
  brandName: string;
  mentionRate: number;
  shareOfVoice: number;
  avgRank: number;
  firstMentionRate: number;
  activeModels?: string[];
  topFrame?: string;
  sentimentSplit?: { positive: number; neutral: number; negative: number } | null;
}

export function ExecutiveSummary({
  brandName,
  mentionRate,
  shareOfVoice,
  avgRank,
  firstMentionRate,
  topFrame,
  sentimentSplit,
}: Props) {
  const parts: string[] = [];

  // Opening — lead with the headline narrative, not a data dump
  if (mentionRate >= 80 && avgRank > 0 && avgRank <= 1.5) {
    parts.push(
      `${brandName} dominates the AI conversation — surfacing in ${mentionRate}% of industry queries and consistently landing as the #1 recommendation.`,
    );
  } else if (mentionRate >= 60) {
    parts.push(
      `${brandName} is well-established in AI responses, appearing in ${mentionRate}% of industry queries and capturing ${shareOfVoice}% of all brand mentions.`,
    );
  } else if (mentionRate >= 30) {
    parts.push(
      `AI models are aware of ${brandName}, but there's room to grow — the brand shows up in ${mentionRate}% of industry queries with a ${shareOfVoice}% share of voice.`,
    );
  } else if (mentionRate > 0) {
    parts.push(
      `${brandName} is flying under the AI radar, appearing in just ${mentionRate}% of industry queries. There's significant untapped opportunity here.`,
    );
  } else {
    parts.push(
      `${brandName} isn't showing up in AI-generated responses yet — this is a blank canvas to build visibility from the ground up.`,
    );
  }

  // Position color — weave into narrative rather than stating raw numbers
  if (avgRank > 0) {
    if (avgRank <= 1.3) {
      parts.push(
        `When mentioned, it's almost always the first name out of the gate — ${firstMentionRate}% top-result rate puts it ahead of the pack.`,
      );
    } else if (avgRank <= 2.0) {
      parts.push(
        `It typically ranks near the top of recommendations (avg position ${avgRank.toFixed(1)}), earning the #1 spot ${firstMentionRate}% of the time.`,
      );
    } else if (avgRank <= 3.0) {
      parts.push(
        `Positioning is mid-tier at an average #${avgRank.toFixed(1)} — competitors are edging ahead in ${100 - firstMentionRate}% of responses.`,
      );
    } else {
      parts.push(
        `AI models tend to mention ${brandName} after several competitors (avg #${avgRank.toFixed(1)}) — improving content authority could move the needle.`,
      );
    }
  }

  // Sentiment — make it feel like insight, not a stat
  if (sentimentSplit) {
    if (sentimentSplit.positive >= 70) {
      parts.push(
        `The tone is overwhelmingly positive — ${sentimentSplit.positive}% of responses paint the brand favorably.`,
      );
    } else if (sentimentSplit.positive >= 50) {
      parts.push(
        `Sentiment leans positive (${sentimentSplit.positive}%), though ${sentimentSplit.negative > 0 ? `${sentimentSplit.negative}% of responses flag concerns worth monitoring` : "there's room to strengthen the narrative"}.`,
      );
    } else if (sentimentSplit.negative >= 30) {
      parts.push(
        `Watch the sentiment: ${sentimentSplit.negative}% of AI responses carry a critical tone — addressing these narratives proactively could prevent reputation drag.`,
      );
    }
  }

  // Narrative frame — the "so what" closer
  if (topFrame) {
    parts.push(
      `AI models primarily frame ${brandName} as a "${topFrame}" — ${sentimentSplit && sentimentSplit.positive >= 50 ? "a strong position to build on" : "worth evaluating whether this aligns with your brand strategy"}.`,
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card px-5 py-4 shadow-section">
      <h2 className="text-sm font-semibold mb-2">Executive Summary</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {parts.join(" ")}
      </p>
    </section>
  );
}
