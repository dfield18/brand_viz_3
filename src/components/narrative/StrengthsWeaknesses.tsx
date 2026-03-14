"use client";

import type { NarrativeClaim } from "@/types/api";
import { MODEL_LABELS } from "@/lib/constants";
import { ThumbsUp, ThumbsDown, Minus } from "lucide-react";

interface StrengthsWeaknessesProps {
  strengths: NarrativeClaim[];
  weaknesses: NarrativeClaim[];
  weaknessesAreNeutral?: boolean;
  brandName?: string;
}

/** Strip leading markdown list markers like "- ", "* ", "1. " etc. */
function stripListMarker(text: string): string {
  return text.replace(/^[\s]*[-*•]\s+/, "").replace(/^[\s]*\d+\.\s+/, "");
}

/** Remove URLs, markdown links, and stray markdown formatting from text. */
function stripMarkdownAndUrls(text: string): string {
  return text
    // markdown links: [label](url) → keep label unless it's a URL itself
    .replace(/\(\[([^\]]*)\]\([^)]*\)\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, (_, label: string) =>
      /^(https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,})/.test(label) ? "" : label,
    )
    // bare parenthesized URLs
    .replace(/\(https?:\/\/[^)]*\)/g, "")
    // bare URLs
    .replace(/https?:\/\/\S+/g, "")
    // bold/italic
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    // headings
    .replace(/^#+\s+/gm, "")
    // inline code and strikethrough
    .replace(/`/g, "")
    .replace(/~~/g, "")
    // empty parens leftover
    .replace(/\(\s*\)/g, "")
    // collapse whitespace
    .replace(/\s{2,}/g, " ")
    .trim()
    // trailing punctuation cleanup
    .replace(/[.,]\s*$/, "")
    .trim();
}

/** Derive a short, clean title from claim text. Ensures it reads as a category label. */
function deriveTitle(raw: string): { title: string; body: string } {
  const text = stripListMarker(raw);

  // Try to split on **bold** title pattern first
  const boldMatch = text.match(/\*\*(.+?)\*\*:?\s*([\s\S]*)$/);
  if (boldMatch) {
    const title = stripMarkdownAndUrls(boldMatch[1]);
    const body = stripMarkdownAndUrls(boldMatch[2]);
    // If the "title" is too long (looks like a sentence), re-derive
    if (title.split(/\s+/).length <= 6) {
      return { title, body };
    }
    // Fall through to sentence-based derivation with full text
  }

  const clean = stripMarkdownAndUrls(text.replace(/\*\*/g, ""));

  // Try splitting on colon or em-dash
  const colonSplit = clean.match(/^([^:–—]{4,50})[:\u2013\u2014]\s+([\s\S]+)$/);
  if (colonSplit) {
    const candidate = colonSplit[1].trim();
    // Only use if it reads like a label (not a sentence fragment starting with quotes/data)
    if (candidate.split(/\s+/).length <= 6 && !/^\d/.test(candidate) && !/^["'"…]/.test(candidate)) {
      return { title: candidate, body: colonSplit[2].trim() };
    }
  }

  // Take first ~4 words as title, rest as body
  const words = clean.split(/\s+/);
  if (words.length <= 4) {
    return { title: clean, body: "" };
  }
  return { title: words.slice(0, 4).join(" ") + "…", body: clean };
}

const VARIANT_STYLES = {
  strength: {
    border: "border-l-emerald-500",
    icon: <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" />,
    bg: "bg-emerald-50/50 dark:bg-emerald-950/10",
  },
  weakness: {
    border: "border-l-red-400",
    icon: <ThumbsDown className="h-3.5 w-3.5 text-red-500" />,
    bg: "bg-red-50/50 dark:bg-red-950/10",
  },
  neutral: {
    border: "border-l-muted-foreground/30",
    icon: <Minus className="h-3.5 w-3.5 text-muted-foreground" />,
    bg: "bg-muted/20",
  },
} as const;

/** Replace lowercase brand name occurrences with the properly cased version */
function capitalizeBrand(text: string, brandName?: string): string {
  if (!brandName) return text;
  const regex = new RegExp(brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return text.replace(regex, brandName);
}

/** Truncate a quote body to a max character length, breaking at word boundary */
function truncateBody(text: string, max: number): string {
  if (text.length <= max) return text;
  const truncated = text.slice(0, max);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > max * 0.5 ? truncated.slice(0, lastSpace) : truncated) + "…";
}

function ClaimCard({
  claim,
  variant,
  brandName,
}: {
  claim: NarrativeClaim;
  variant: "strength" | "weakness" | "neutral";
  brandName?: string;
}) {
  const { title: rawTitle, body: rawBody } = deriveTitle(claim.text);
  const title = rawTitle ? capitalizeBrand(rawTitle, brandName) : null;
  const body = rawBody ? capitalizeBrand(truncateBody(rawBody, 180), brandName) : "";
  const style = VARIANT_STYLES[variant];

  return (
    <div className={`rounded-lg border border-border ${style.border} border-l-[3px] ${style.bg} px-4 py-3`}>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 shrink-0">{style.icon}</div>
        <div className="min-w-0">
          {title && (
            <p className="text-sm font-semibold text-foreground capitalize leading-snug">{title}</p>
          )}
          {body && (() => {
            const firstChar = body.charAt(0);
            const isMidSentence = firstChar === firstChar.toLowerCase() && firstChar !== firstChar.toUpperCase();
            const displayBody = isMidSentence ? body : body.charAt(0).toUpperCase() + body.slice(1);
            return (
              <p className="text-[13px] text-muted-foreground leading-relaxed mt-1.5">
                &ldquo;{isMidSentence && "… "}{displayBody}&rdquo;
              </p>
            );
          })()}
          <div className="flex items-center gap-1.5 mt-2.5 text-[11px] text-muted-foreground/60">
            {claim.model && (
              <span className="font-medium text-muted-foreground/70">{MODEL_LABELS[claim.model] ?? claim.model}</span>
            )}
            {claim.prompt && (
              <>
                {claim.model && <span className="text-border">·</span>}
                <span className="line-clamp-1">{claim.prompt}</span>
              </>
            )}
            {claim.count > 1 && (
              <>
                {(claim.model || claim.prompt) && <span className="text-border">·</span>}
                <span>{claim.count} responses</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClaimList({
  items,
  variant,
  brandName,
}: {
  items: NarrativeClaim[];
  variant: "strength" | "weakness" | "neutral";
  brandName?: string;
}) {
  if (items.length === 0) {
    const label = variant === "strength" ? "strengths" : variant === "neutral" ? "neutral mentions" : "weaknesses";
    return (
      <p className="text-sm text-muted-foreground italic py-4 text-center">
        No {label} detected.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.slice(0, 3).map((claim, i) => (
        <ClaimCard key={i} claim={claim} variant={variant} brandName={brandName} />
      ))}
    </div>
  );
}

export function StrengthsWeaknesses({ strengths, weaknesses, weaknessesAreNeutral, brandName }: StrengthsWeaknessesProps) {
  if (
    (!strengths || strengths.length === 0) &&
    (!weaknesses || weaknesses.length === 0)
  ) {
    return <p className="text-sm text-muted-foreground">No strength/weakness claims detected.</p>;
  }

  const rightLabel = weaknessesAreNeutral ? "Neutral Mentions" : "Weaknesses";

  // Generate summary insight
  const summaryParts: string[] = [];
  if (strengths.length > 0 && brandName) {
    const topStrength = deriveTitle(strengths[0].text).title;
    summaryParts.push(`AI sees ${brandName}'s "${topStrength}" as its key strength`);
  }
  if (weaknesses.length > 0 && brandName) {
    const topWeakness = deriveTitle(weaknesses[0].text).title;
    if (weaknessesAreNeutral) {
      summaryParts.push(`while "${topWeakness}" is the most common neutral mention`);
    } else {
      summaryParts.push(`${summaryParts.length > 0 ? "while" : "While"} "${topWeakness}" ${weaknesses.length > 1 ? `and ${weaknesses.length - 1} other concern${weaknesses.length > 2 ? "s" : ""} are` : "is"} the most common criticism`);
    }
  }
  const summary = summaryParts.length > 0 ? summaryParts.join(", ") + "." : null;

  return (
    <div>
      {summary && (
        <p className="text-sm text-muted-foreground leading-relaxed mb-5">
          {summary}
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold mb-3">Strengths</h3>
          <ClaimList items={strengths} variant="strength" brandName={brandName} />
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-3">{rightLabel}</h3>
          <ClaimList items={weaknesses} variant={weaknessesAreNeutral ? "neutral" : "weakness"} brandName={brandName} />
        </div>
      </div>
    </div>
  );
}
