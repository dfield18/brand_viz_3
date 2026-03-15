"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { MessageSquareQuote, TrendingUp, TrendingDown } from "lucide-react";
import type { NarrativeFrame, NarrativeExample } from "@/types/api";
import { MODEL_LABELS } from "@/lib/constants";

interface TopNarrativeQuotesProps {
  frames: NarrativeFrame[];
  examples: NarrativeExample[];
  brandName?: string;
  frameTrend?: Record<string, string | number>[];
  /** When set, clicking a frame heading calls this with the frame name */
  onFrameClick?: (frame: string) => void;
}

const FRAME_COLORS = [
  { border: "border-l-blue-500", bg: "bg-blue-50/50 dark:bg-blue-950/10", badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400", bar: "bg-blue-500" },
  { border: "border-l-violet-500", bg: "bg-violet-50/50 dark:bg-violet-950/10", badge: "bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400", bar: "bg-violet-500" },
  { border: "border-l-emerald-500", bg: "bg-emerald-50/50 dark:bg-emerald-950/10", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400", bar: "bg-emerald-500" },
];

function matchesFrame(example: NarrativeExample, frameName: string): boolean {
  const lower = frameName.toLowerCase();
  const frameWords = lower.split(/\s+/).filter((w) => w.length > 2);
  return example.themes.some((t) => {
    const tl = t.toLowerCase();
    if (tl.includes(lower) || lower.includes(tl)) return true;
    return frameWords.some((w) => tl.includes(w));
  });
}

const SENTIMENT_LABEL: Record<string, string> = {
  POS: "Positive",
  NEG: "Negative",
  NEU: "Neutral",
};

/** Strip AI preamble like "Here are 5 bullet points..." from the start of a quote */
function trimPreamble(text: string): string {
  // Remove patterns like "Here are X ..." or "Sure, here's..." up to the first colon/newline
  const preamblePatterns = [
    /^(?:Here (?:are|is)|Sure,?\s+here(?:'s| is| are)|Let me|I(?:'d| would) (?:say|recommend|suggest))[^:.\n]*[:.]\s*/i,
    /^(?:Based on|According to|When (?:it comes to|looking at|considering))[^:.\n]*[:.]\s*/i,
  ];
  let result = text;
  for (const pattern of preamblePatterns) {
    result = result.replace(pattern, "");
  }
  // Capitalize first letter after trimming
  if (result.length > 0 && result !== text) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }
  return result;
}

/** Compute frame trend delta (percentage point change over the trend period) */
function computeFrameDelta(
  frameName: string,
  frameTrend?: Record<string, string | number>[],
): number | null {
  if (!frameTrend || frameTrend.length < 2) return null;
  const allModel = frameTrend.filter((d) => (d.model ?? "all") === "all");
  if (allModel.length < 2) return null;
  const sorted = [...allModel].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const first = Number(sorted[0][frameName]);
  const last = Number(sorted[sorted.length - 1][frameName]);
  if (isNaN(first) || isNaN(last)) return null;
  const delta = last - first;
  if (delta === 0) return null;
  return Math.round(delta);
}

/** Extract the domain from a URL, stripping www. prefix. */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    const m = url.match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)/i);
    return m?.[1] ?? url;
  }
}

/** Render text with markdown links and bare URLs as clickable domain-only links. */
function renderTextWithLinks(text: string): ReactNode[] {
  const pattern = /\(?\[([^\]]*)\]\((https?:\/\/[^\s)]*[^\s).,;:])\)?[).,;:\s]*|\(?(https?:\/\/[^\s)]+[^\s).,;:])\)?/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const url = match[2] ?? match[3];
    const domain = extractDomain(url);
    parts.push(
      <a
        key={key++}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary/70 hover:text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {domain}
      </a>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

function QuoteCard({
  example,
  color,
}: {
  example: NarrativeExample;
  color: (typeof FRAME_COLORS)[number];
}) {
  const cleanExcerpt = trimPreamble(example.excerpt);
  return (
    <div className={`rounded-lg border border-border ${color.border} border-l-[3px] ${color.bg} px-4 py-3`}>
      <div className="flex items-start gap-2.5">
        <MessageSquareQuote className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[13px] text-foreground leading-relaxed">
            &ldquo;{renderTextWithLinks(cleanExcerpt)}{cleanExcerpt.length >= 198 ? "\u2026" : ""}&rdquo;
          </p>
          <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-muted-foreground/70">
            {example.model && (
              <span className="font-medium">{MODEL_LABELS[example.model] ?? example.model}</span>
            )}
            {example.sentiment && (
              <>
                <span className="text-border">·</span>
                <span>{SENTIMENT_LABEL[example.sentiment] ?? example.sentiment}</span>
              </>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground/60 mt-1.5 line-clamp-1 italic">
            {example.prompt}
          </p>
        </div>
      </div>
    </div>
  );
}

export function TopNarrativeQuotes({ frames, examples, brandName, frameTrend, onFrameClick }: TopNarrativeQuotesProps) {
  const topFrames = useMemo(() => {
    return [...frames].sort((a, b) => b.percentage - a.percentage).slice(0, 3);
  }, [frames]);

  const quotesByFrame = useMemo(() => {
    const usedIds = new Set<number>();
    const result = topFrames.map((frame) => {
      const matching = examples
        .map((ex, i) => ({ ex, i }))
        .filter(({ ex }) => matchesFrame(ex, frame.frame));
      const picked = matching.slice(0, 2);
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

  // Remaining frames not shown
  const remainingFrames = useMemo(() => {
    const topNames = new Set(topFrames.map((f) => f.frame));
    return frames.filter((f) => !topNames.has(f.frame) && f.percentage > 0).slice(0, 5);
  }, [frames, topFrames]);

  if (topFrames.length === 0 || quotesByFrame.every((q) => q.quotes.length === 0)) {
    return null;
  }

  // Max percentage for scaling bars
  const maxPct = topFrames[0]?.percentage ?? 100;

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold mb-1">Top Narratives in AI Responses</h2>
      <p className="text-xs text-muted-foreground mb-5">
        The most common ways AI platforms describe {brandName ?? "this brand"}, with representative quotes
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {quotesByFrame.map(({ frame, quotes }, idx) => {
          const color = FRAME_COLORS[idx] ?? FRAME_COLORS[0];
          const delta = computeFrameDelta(frame.frame, frameTrend);
          return (
            <div key={frame.frame}>
              {/* Frame heading with progress bar */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <h3
                    className={`text-sm font-semibold capitalize ${onFrameClick ? "cursor-pointer hover:text-primary transition-colors" : ""}`}
                    onClick={() => onFrameClick?.(frame.frame)}
                  >
                    {frame.frame.replace(/https?:\/\/\S+/g, "").replace(/\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim()}
                  </h3>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${color.badge}`}>
                    {frame.percentage}%
                  </span>
                </div>
                {/* Progress bar */}
                <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${color.bar} transition-all duration-500`}
                    style={{ width: `${(frame.percentage / Math.max(maxPct, 1)) * 100}%` }}
                  />
                </div>
                {/* Trend delta */}
                {delta != null && (
                  <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-0.5">
                    {delta > 0 ? <TrendingUp className="h-2.5 w-2.5 text-emerald-600" /> : <TrendingDown className="h-2.5 w-2.5 text-red-500" />}
                    <span className={delta > 0 ? "text-emerald-600" : "text-red-500"}>
                      {delta > 0 ? "+" : ""}{delta}%
                    </span>
                    {" "}over trend period
                  </p>
                )}
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

      {/* Remaining frames summary */}
      {remainingFrames.length > 0 && (
        <div className="mt-5 pt-4 border-t border-border/50">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Other Narratives</p>
          <div className="flex flex-wrap gap-2">
            {remainingFrames.map((f) => (
              <span
                key={f.frame}
                className={`text-[11px] font-medium rounded-full border px-2.5 py-0.5 text-muted-foreground bg-muted/30 border-border ${onFrameClick ? "cursor-pointer hover:border-primary/40 hover:text-foreground transition-colors" : ""}`}
                onClick={() => onFrameClick?.(f.frame)}
              >
                {f.frame} · {f.percentage}%
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
