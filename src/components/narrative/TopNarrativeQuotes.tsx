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
  /** When set, clicking a quote card calls this with the runId */
  onQuoteClick?: (runId: string) => void;
}

const FRAME_COLORS = [
  {
    border: "border-l-blue-500",
    bg: "bg-blue-50/40 dark:bg-blue-950/10",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400",
    bar: "bg-gradient-to-r from-blue-400 to-blue-600",
    rank: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/20 dark:border-blue-800",
    dot: "bg-blue-500",
  },
  {
    border: "border-l-violet-500",
    bg: "bg-violet-50/40 dark:bg-violet-950/10",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400",
    bar: "bg-gradient-to-r from-violet-400 to-violet-600",
    rank: "text-violet-600 bg-violet-50 border-violet-200 dark:text-violet-400 dark:bg-violet-950/20 dark:border-violet-800",
    dot: "bg-violet-500",
  },
  {
    border: "border-l-emerald-500",
    bg: "bg-emerald-50/40 dark:bg-emerald-950/10",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
    bar: "bg-gradient-to-r from-emerald-400 to-emerald-600",
    rank: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/20 dark:border-emerald-800",
    dot: "bg-emerald-500",
  },
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

const SENTIMENT_DOT: Record<string, string> = {
  POS: "bg-emerald-500",
  NEG: "bg-red-400",
  NEU: "bg-gray-400",
};

const SENTIMENT_LABEL: Record<string, string> = {
  POS: "Positive",
  NEG: "Negative",
  NEU: "Neutral",
};

/** Strip AI preamble like "Here are 5 bullet points..." from the start of a quote */
function trimPreamble(text: string): string {
  const preamblePatterns = [
    /^(?:Here (?:are|is)|Sure,?\s+here(?:'s| is| are)|Let me|I(?:'d| would) (?:say|recommend|suggest))[^:.\n]*[:.]\s*/i,
    /^(?:Based on|According to|When (?:it comes to|looking at|considering))[^:.\n]*[:.]\s*/i,
  ];
  let result = text;
  for (const pattern of preamblePatterns) {
    result = result.replace(pattern, "");
  }
  if (result.length > 0 && result !== text) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }
  return result;
}

/** Truncate text at a word boundary near maxLen */
function smartTruncate(text: string, maxLen = 180): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > maxLen * 0.6 ? truncated.slice(0, lastSpace) : truncated) + "\u2026";
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
  onClick,
}: {
  example: NarrativeExample;
  color: (typeof FRAME_COLORS)[number];
  onClick?: () => void;
}) {
  const cleanExcerpt = smartTruncate(trimPreamble(example.excerpt));
  const sentimentDot = example.sentiment ? SENTIMENT_DOT[example.sentiment] ?? "bg-gray-400" : null;
  const sentimentText = example.sentiment ? SENTIMENT_LABEL[example.sentiment] ?? example.sentiment : null;
  const reason = example.reason;
  return (
    <div
      className={`rounded-lg border border-border/60 ${color.border} border-l-[3px] ${color.bg} px-4 py-3.5 ${onClick ? "cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2.5">
        <MessageSquareQuote className="h-3.5 w-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[13px] text-foreground/85 leading-relaxed">
            &ldquo;{renderTextWithLinks(cleanExcerpt)}&rdquo;
          </p>
          <div className="flex items-center gap-2 mt-3">
            {example.model && (
              <span className="text-[10px] font-medium text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
                {MODEL_LABELS[example.model] ?? example.model}
              </span>
            )}
            {sentimentDot && sentimentText && (
              <span className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${sentimentDot} shrink-0`} />
                <span className="text-[10px] text-muted-foreground/60">{sentimentText}</span>
              </span>
            )}
          </div>
          {example.prompt && (
            <p className="text-[10px] text-muted-foreground/50 mt-2 line-clamp-1 italic">
              {example.prompt}
            </p>
          )}
          {reason && (
            <p className="text-[10px] text-muted-foreground/60 mt-1.5 leading-relaxed">
              <span className="font-medium text-muted-foreground">Why:</span> {reason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function TopNarrativeQuotes({ frames, examples, brandName, frameTrend, onFrameClick, onQuoteClick }: TopNarrativeQuotesProps) {
  const topFrames = useMemo(() => {
    return [...frames].sort((a, b) => b.percentage - a.percentage).slice(0, 3);
  }, [frames]);

  const quotesByFrame = useMemo(() => {
    const usedIds = new Set<number>();
    const result = topFrames.map((frame) => {
      // Prefer GPT-assigned matchedFrame, fall back to keyword matching
      const matching = examples
        .map((ex, i) => ({ ex, i }))
        .filter(({ ex, i }) => {
          if (usedIds.has(i)) return false;
          if (ex.matchedFrame) return ex.matchedFrame === frame.frame;
          return matchesFrame(ex, frame.frame);
        });
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
      <p className="text-xs text-muted-foreground mb-6">
        The most common ways AI platforms describe {brandName ?? "this brand"}, with representative quotes
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {quotesByFrame.map(({ frame, quotes }, idx) => {
          const color = FRAME_COLORS[idx] ?? FRAME_COLORS[0];
          const delta = computeFrameDelta(frame.frame, frameTrend);
          const cleanFrameName = frame.frame.replace(/https?:\/\/\S+/g, "").replace(/\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
          return (
            <div key={frame.frame} className="flex flex-col">
              {/* Frame heading */}
              <div className="mb-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <span className={`inline-flex items-center justify-center h-5 w-5 rounded text-[11px] font-bold border ${color.rank} shrink-0`}>
                    {idx + 1}
                  </span>
                  <h3
                    className={`text-sm font-semibold capitalize leading-snug ${onFrameClick ? "cursor-pointer hover:text-primary transition-colors" : ""}`}
                    onClick={() => onFrameClick?.(frame.frame)}
                  >
                    {cleanFrameName}
                  </h3>
                </div>
                {/* Percentage + Progress bar */}
                <div className="flex items-center gap-2.5">
                  <div className="flex-1 h-2 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${color.bar} transition-all duration-700 ease-out`}
                      style={{ width: `${(frame.percentage / Math.max(maxPct, 1)) * 100}%` }}
                    />
                  </div>
                  <span className={`text-xs font-semibold tabular-nums shrink-0 ${color.badge} rounded-full px-2 py-0.5`}>
                    {frame.percentage}%
                  </span>
                </div>
                {/* Trend delta */}
                {delta != null && (
                  <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-0.5">
                    {delta > 0 ? <TrendingUp className="h-2.5 w-2.5 text-emerald-600" /> : <TrendingDown className="h-2.5 w-2.5 text-red-500" />}
                    <span className={delta > 0 ? "text-emerald-600" : "text-red-500"}>
                      {delta > 0 ? "+" : ""}{delta}%
                    </span>
                    {" "}over trend period
                  </p>
                )}
              </div>
              {/* Quotes */}
              {quotes.length > 0 ? (
                <div className="space-y-2.5 flex-1">
                  {quotes.map((q, i) => (
                    <QuoteCard key={i} example={q} color={color} onClick={q.runId && onQuoteClick ? () => onQuoteClick(q.runId!) : undefined} />
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
        <div className="mt-6 pt-4 border-t border-border/50">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Other Narratives</p>
          <div className="flex flex-wrap gap-2">
            {remainingFrames.map((f, i) => {
              const pillColor = FRAME_COLORS[i % FRAME_COLORS.length];
              return (
                <span
                  key={f.frame}
                  className={`inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full border px-3 py-1 text-muted-foreground bg-card border-border/70 shadow-sm ${onFrameClick ? "cursor-pointer hover:border-primary/40 hover:text-foreground transition-colors" : ""}`}
                  onClick={() => onFrameClick?.(f.frame)}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${pillColor.dot} shrink-0`} />
                  {f.frame}
                  <span className="text-muted-foreground/50 font-normal">{f.percentage}%</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
