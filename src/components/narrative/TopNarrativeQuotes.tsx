"use client";

import { useMemo } from "react";
import { MessageSquareQuote } from "lucide-react";
import type { NarrativeFrame, NarrativeExample } from "@/types/api";
import { MODEL_LABELS } from "@/lib/constants";

interface TopNarrativeQuotesProps {
  frames: NarrativeFrame[];
  examples: NarrativeExample[];
  brandName?: string;
}

const FRAME_COLORS = [
  { border: "border-l-blue-500", bg: "bg-blue-50/50 dark:bg-blue-950/10", badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400" },
  { border: "border-l-violet-500", bg: "bg-violet-50/50 dark:bg-violet-950/10", badge: "bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400" },
];

function matchesFrame(example: NarrativeExample, frameName: string): boolean {
  const lower = frameName.toLowerCase();
  const frameWords = lower.split(/\s+/).filter((w) => w.length > 2);
  return example.themes.some((t) => {
    const tl = t.toLowerCase();
    // Direct substring match
    if (tl.includes(lower) || lower.includes(tl)) return true;
    // Word-level overlap: at least one significant word from the frame appears in the theme
    return frameWords.some((w) => tl.includes(w));
  });
}

const SENTIMENT_LABEL: Record<string, string> = {
  POS: "Positive",
  NEG: "Negative",
  NEU: "Neutral",
};

function QuoteCard({
  example,
  color,
}: {
  example: NarrativeExample;
  color: (typeof FRAME_COLORS)[number];
}) {
  return (
    <div className={`rounded-lg border border-border ${color.border} border-l-[3px] ${color.bg} px-4 py-3`}>
      <div className="flex items-start gap-2.5">
        <MessageSquareQuote className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[13px] text-foreground leading-relaxed">
            &ldquo;{example.excerpt}{example.excerpt.length >= 198 ? "\u2026" : ""}&rdquo;
          </p>
          <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground/70">
            {example.model && (
              <span>{MODEL_LABELS[example.model] ?? example.model}</span>
            )}
            {example.sentiment && (
              <span>
                {example.model ? " · " : ""}
                {SENTIMENT_LABEL[example.sentiment] ?? example.sentiment}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">
            {example.prompt}
          </p>
        </div>
      </div>
    </div>
  );
}

export function TopNarrativeQuotes({ frames, examples, brandName }: TopNarrativeQuotesProps) {
  const topFrames = useMemo(() => {
    return [...frames].sort((a, b) => b.percentage - a.percentage).slice(0, 2);
  }, [frames]);

  const quotesByFrame = useMemo(() => {
    const usedIds = new Set<number>();
    const result = topFrames.map((frame) => {
      const matching = examples
        .map((ex, i) => ({ ex, i }))
        .filter(({ ex }) => matchesFrame(ex, frame.frame));
      const picked = matching.slice(0, 3);
      picked.forEach(({ i }) => usedIds.add(i));
      return { frame, quotes: picked.map(({ ex }) => ex) };
    });
    // Fallback: if any frame has no quotes, fill from unused examples
    for (const entry of result) {
      if (entry.quotes.length === 0) {
        const fallbacks = examples.filter((_, i) => !usedIds.has(i)).slice(0, 1);
        fallbacks.forEach((ex) => {
          const idx = examples.indexOf(ex);
          if (idx >= 0) usedIds.add(idx);
        });
        entry.quotes = fallbacks;
      }
    }
    return result;
  }, [topFrames, examples]);

  if (topFrames.length === 0 || quotesByFrame.every((q) => q.quotes.length === 0)) {
    return null;
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold mb-1">Top Narratives in AI Responses</h2>
      <p className="text-xs text-muted-foreground mb-5">
        The two most common ways AI platforms describe {brandName ?? "this brand"}, with representative quotes from actual responses
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {quotesByFrame.map(({ frame, quotes }, idx) => {
          const color = FRAME_COLORS[idx] ?? FRAME_COLORS[0];
          return (
            <div key={frame.frame}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold capitalize">{frame.frame.replace(/https?:\/\/\S+/g, "").replace(/\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim()}</h3>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${color.badge}`}>
                  {frame.percentage}%
                </span>
              </div>
              {quotes.length > 0 ? (
                <div className="space-y-2.5">
                  {quotes.map((q, i) => (
                    <QuoteCard key={i} example={q} color={color} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic py-4 text-center">
                  No example quotes available for this narrative.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
