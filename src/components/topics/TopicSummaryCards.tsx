"use client";

import { BookOpen, TrendingUp, Hash, Sparkles } from "lucide-react";
import type { TopicRow, EmergingTopic, TopicsScope } from "@/types/api";

interface Props {
  scope: TopicsScope;
  topics: TopicRow[];
  emerging: EmergingTopic[];
}

export default function TopicSummaryCards({ scope, topics, emerging }: Props) {
  const bestByMentionRate = topics.length > 0 ? topics[0] : null;
  const bestByRank = topics
    .filter((t) => t.avgRank !== null)
    .sort((a, b) => a.avgRank! - b.avgRank!)[0] ?? null;

  const cards = [
    {
      label: "Topics Classified",
      value: scope.topicsClassified,
      sub: scope.unclassifiedPrompts > 0
        ? `${scope.unclassifiedPrompts} unclassified`
        : `${scope.totalResponses} responses`,
      icon: BookOpen,
      color: "text-blue-600",
    },
    {
      label: "Best Topic",
      value: bestByMentionRate?.topicLabel ?? "—",
      sub: bestByMentionRate ? `${bestByMentionRate.mentionRate}% mention rate` : "",
      icon: TrendingUp,
      color: "text-emerald-600",
    },
    {
      label: "Best Avg Rank",
      value: bestByRank?.avgRank ?? "—",
      sub: bestByRank ? bestByRank.topicLabel : "",
      icon: Hash,
      color: "text-violet-600",
    },
    {
      label: "Emerging Topics",
      value: emerging.length,
      sub: emerging.length > 0
        ? emerging.slice(0, 2).map((e) => e.topicLabel).join(", ")
        : "None detected",
      icon: Sparkles,
      color: "text-amber-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border bg-card p-4 shadow-kpi space-y-1"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <c.icon className={`h-4 w-4 ${c.color}`} />
            {c.label}
          </div>
          <p className="text-2xl font-semibold tabular-nums truncate">
            {c.value}
          </p>
          {c.sub && (
            <p className="text-xs text-muted-foreground truncate">{c.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}
