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

/** Remove URLs and markdown links from text, keeping only non-URL label text. */
function stripUrls(text: string): string {
  return text
    .replace(/\(\[([^\]]*)\]\([^)]*\)\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, (_, label: string) =>
      /^(https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,})/.test(label) ? "" : label,
    )
    .replace(/\(https?:\/\/[^)]*\)/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[.,]\s*$/, "")
    .trim();
}

/** Derive a short title from a sentence (first clause or first N words). */
function deriveTitle(text: string): string {
  // Try splitting on colon or dash first
  const colonSplit = text.match(/^([^:–—]{4,60})[:\u2013\u2014]\s/);
  if (colonSplit) return colonSplit[1].trim();
  // Take first ~6 words
  const words = text.split(/\s+/);
  const title = words.slice(0, 6).join(" ");
  return title + (words.length > 6 ? "…" : "");
}

/** Clean claim text: strip list markers, parse bold title, remove stray markdown and URLs. */
function cleanClaim(raw: string): { title: string | null; body: string } {
  const text = stripListMarker(raw);
  const match = text.match(/\*\*(.+?)\*\*:?\s*([\s\S]*)$/);
  if (match) return { title: stripUrls(match[1]), body: stripUrls(match[2]) };
  const body = stripUrls(text.replace(/\*\*/g, ""));
  return { title: deriveTitle(body), body };
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

function ClaimCard({
  claim,
  variant,
  brandName,
}: {
  claim: NarrativeClaim;
  variant: "strength" | "weakness" | "neutral";
  brandName?: string;
}) {
  const raw = cleanClaim(claim.text);
  const title = raw.title ? capitalizeBrand(raw.title, brandName) : null;
  const body = raw.body ? capitalizeBrand(raw.body, brandName) : "";
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
              <p className="text-[13px] text-muted-foreground leading-relaxed mt-1">
                &ldquo;{isMidSentence && "… "}{displayBody}&rdquo;
              </p>
            );
          })()}
          <p className="text-[11px] text-muted-foreground/70 mt-1.5">
            {claim.model && (
              <span>{MODEL_LABELS[claim.model] ?? claim.model}</span>
            )}
            {claim.prompt && (
              <span>
                {claim.model ? " · " : ""}
                {claim.prompt}
              </span>
            )}
            {claim.count > 1 && (
              <span>
                {claim.model || claim.prompt ? " · " : ""}
                {claim.count} responses
              </span>
            )}
          </p>
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
    <div className="space-y-2.5">
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

  return (
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
  );
}
