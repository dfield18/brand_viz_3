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

  // Opening — plain language about what people see when they ask AI about this space
  if (mentionRate >= 80 && avgRank > 0 && avgRank <= 1.5) {
    parts.push(
      `When people ask ChatGPT, Gemini, or other AI tools about this space, ${brandName} comes up almost every time (${mentionRate}% of questions) — and it's usually the first name mentioned.`,
    );
  } else if (mentionRate >= 60) {
    parts.push(
      `${brandName} has strong AI visibility. When people ask AI assistants general questions about this space, ${brandName} comes up ${mentionRate}% of the time and makes up ${shareOfVoice}% of all brand mentions in those answers.`,
    );
  } else if (mentionRate >= 30) {
    parts.push(
      `When people ask AI assistants about this space, ${brandName} comes up in about ${mentionRate}% of answers — that means roughly ${100 - mentionRate}% of the time, AI is recommending other names without ever mentioning ${brandName}. It accounts for ${shareOfVoice}% of all brand mentions in AI responses.`,
    );
  } else if (mentionRate > 0) {
    parts.push(
      `${brandName} rarely comes up when people ask AI assistants about this space — only ${mentionRate}% of the time. Most potential customers using AI for research won't see ${brandName} at all, which is a significant gap.`,
    );
  } else {
    parts.push(
      `${brandName} doesn't appear in AI-generated answers yet. When people ask ChatGPT, Gemini, or other AI tools about this space, they won't hear about ${brandName} — which means a growing channel is sending people elsewhere.`,
    );
  }

  // Position — where does the brand appear in the list?
  if (avgRank > 0) {
    if (avgRank <= 1.3) {
      parts.push(
        `When AI does mention ${brandName}, it's typically the very first recommendation — it leads the list ${firstMentionRate}% of the time.`,
      );
    } else if (avgRank <= 2.0) {
      parts.push(
        `When it appears, ${brandName} is usually near the top of the list (averaging the #${avgRank.toFixed(1)} position), and it's the first brand named ${firstMentionRate}% of the time.`,
      );
    } else if (avgRank <= 3.0) {
      parts.push(
        `However, when ${brandName} does appear, it's typically listed in the middle of the pack (around the #${avgRank.toFixed(1)} spot) — competitors are getting named first in ${100 - firstMentionRate}% of answers.`,
      );
    } else {
      parts.push(
        `When ${brandName} is mentioned, it tends to appear lower in the list (around #${avgRank.toFixed(1)}) — meaning AI is positioning several competitors as stronger options. Improving the brand's online authority and content footprint could change this.`,
      );
    }
  }

  // Sentiment — what is AI saying about the brand?
  if (sentimentSplit) {
    if (sentimentSplit.positive >= 70) {
      parts.push(
        `The good news: when AI does talk about ${brandName}, the tone is very positive — ${sentimentSplit.positive}% of responses describe it favorably.`,
      );
    } else if (sentimentSplit.positive >= 50) {
      parts.push(
        `When AI discusses ${brandName}, the tone is generally positive (${sentimentSplit.positive}% favorable)${sentimentSplit.negative > 0 ? `, though ${sentimentSplit.negative}% of responses raise concerns worth keeping an eye on` : ""}.`,
      );
    } else if (sentimentSplit.negative >= 30) {
      parts.push(
        `A note of caution: ${sentimentSplit.negative}% of AI responses describe ${brandName} in a negative light. Since people increasingly trust AI recommendations, it's worth understanding what's driving this and whether your messaging can address it.`,
      );
    }
  }

  // Narrative frame — how is AI positioning the brand?
  if (topFrame) {
    parts.push(
      `The dominant story AI tells about ${brandName} is as a "${topFrame}" — ${sentimentSplit && sentimentSplit.positive >= 50 ? "a strong narrative to reinforce in your marketing" : "it's worth considering whether this matches how you want the brand to be perceived"}.`,
    );
  }

  return (
    <section className="rounded-xl bg-card px-5 py-4 shadow-section">
      <h2 className="text-sm font-semibold mb-2">Executive Summary</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {parts.join(" ")}
      </p>
    </section>
  );
}
