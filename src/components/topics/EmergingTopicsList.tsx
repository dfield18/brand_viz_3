"use client";

import { useState } from "react";
import { TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import type { EmergingTopic } from "@/types/api";

interface Props {
  emerging: EmergingTopic[];
}

const CONFIDENCE_STYLE: Record<string, { color: string; bg: string }> = {
  High: { color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/40" },
  Medium: { color: "text-amber-700 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/40" },
  Low: { color: "text-red-700 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/40" },
};

export default function EmergingTopicsList({ emerging }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (emerging.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 shadow-section">
        <h3 className="text-sm font-semibold mb-4">Emerging Topics</h3>
        <p className="text-sm text-muted-foreground">
          No emerging topics detected in this time range.
        </p>
      </div>
    );
  }

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="rounded-xl border bg-card p-6 shadow-section">
      <h3 className="text-sm font-semibold mb-1">Emerging Topics</h3>
      <p className="text-xs text-muted-foreground mb-4">
        Topics with growing brand mentions (≥25% growth, comparing first vs second half of range)
      </p>
      <div className="space-y-3">
        {emerging.map((e) => {
          const isExpanded = expanded.has(e.topicKey);
          const conf = CONFIDENCE_STYLE[e.confidence] ?? CONFIDENCE_STYLE.Low;

          return (
            <div
              key={e.topicKey}
              className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{e.topicLabel}</span>
                    <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                      +{e.growthRate}%
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${conf.color} ${conf.bg}`}
                      title={`Confidence: ${e.confidence} (based on ${e.currentMentions} current mentions)`}
                    >
                      {e.confidence}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {e.previousMentions} → {e.currentMentions} mentions
                  </p>
                </div>
                {e.samplePrompts.length > 0 && (
                  <button
                    onClick={() => toggleExpand(e.topicKey)}
                    className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>

              {/* Expandable sample prompts */}
              {isExpanded && e.samplePrompts.length > 0 && (
                <div className="mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-800/40">
                  <p className="text-[11px] text-muted-foreground font-medium mb-1.5">Example prompts:</p>
                  <ul className="space-y-1">
                    {e.samplePrompts.map((prompt, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        &ldquo;{prompt}&rdquo;
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
