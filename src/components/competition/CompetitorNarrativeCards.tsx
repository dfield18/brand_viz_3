"use client";

import { useState } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import type { CompetitorNarrative, CompetitorRow } from "@/types/api";
import { StrengthsWeaknesses } from "@/components/narrative/StrengthsWeaknesses";

interface CompetitorNarrativeCardsProps {
  narratives: CompetitorNarrative[];
  competitors: CompetitorRow[];
  selectedEntityId?: string;
  onViewResponse?: (runId: string) => void;
}

const SENTIMENT_COLOR: Record<string, string> = {
  Strong: "text-emerald-700 bg-emerald-50 border-emerald-200",
  Positive: "text-emerald-700 bg-emerald-50 border-emerald-200",
  Neutral: "text-amber-700 bg-amber-50 border-amber-200",
  Conditional: "text-orange-700 bg-orange-50 border-orange-200",
  Negative: "text-red-700 bg-red-50 border-red-200",
};

const THEME_COLORS = [
  "bg-blue-100 text-blue-800",
  "bg-violet-100 text-violet-800",
  "bg-teal-100 text-teal-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
];

export function CompetitorNarrativeCards({ narratives, competitors, selectedEntityId, onViewResponse }: CompetitorNarrativeCardsProps) {
  const [prevSelected, setPrevSelected] = useState(selectedEntityId);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (selectedEntityId) return new Set([selectedEntityId]);
    return narratives.length > 0 ? new Set([narratives[0].entityId]) : new Set();
  });

  // When selected entity changes, auto-expand it
  if (selectedEntityId && selectedEntityId !== prevSelected) {
    setPrevSelected(selectedEntityId);
    setExpanded(new Set([selectedEntityId]));
  }

  // Filter to selected competitor when one is chosen
  const displayNarratives = selectedEntityId
    ? narratives.filter((n) => n.entityId === selectedEntityId)
    : narratives;

  if (displayNarratives.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No competitor narrative data available yet. Run prompts to generate data.
      </p>
    );
  }

  const toggle = (entityId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {displayNarratives.map((narrative) => {
        const isOpen = expanded.has(narrative.entityId);
        const comp = competitors.find((c) => c.entityId === narrative.entityId);
        const sentiment = comp?.avgSentiment;
        const hasContent = narrative.themes.length > 0 || narrative.strengths.length > 0 || narrative.weaknesses.length > 0;

        return (
          <div
            key={narrative.entityId}
            className="rounded-lg border border-border bg-card overflow-hidden"
          >
            {/* Header */}
            <button
              onClick={() => toggle(narrative.entityId)}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
            >
              <ChevronRight
                className={`h-4 w-4 text-muted-foreground/50 shrink-0 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
              />
              <span className="font-medium text-foreground">{narrative.name}</span>
              {sentiment && (
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${SENTIMENT_COLOR[sentiment] ?? ""}`}>
                  {sentiment}
                </span>
              )}
              {comp && (
                <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                  {comp.mentionRate}% recall &middot; {Math.round(comp.mentionShare)}% share
                </span>
              )}
            </button>

            {/* Expanded content */}
            {isOpen && (
              <div className="px-5 pb-5 space-y-5 border-t border-border/50">
                {!hasContent && (
                  <p className="text-sm text-muted-foreground pt-4">
                    No detailed narrative data available yet for this competitor. Run more analyses to generate themes and claims.
                  </p>
                )}
                {/* Themes */}
                {narrative.themes.length > 0 && (
                  <div className="pt-4">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2.5">
                      Key Themes AI Associates with {narrative.name}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {narrative.themes.map((theme, i) => (
                        <span
                          key={theme.key}
                          className={`text-xs font-medium px-2.5 py-1 rounded-full ${THEME_COLORS[i % THEME_COLORS.length]}`}
                        >
                          {theme.label}
                          <span className="ml-1 opacity-70">{theme.pct}%</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Descriptors */}
                {narrative.descriptors.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2.5">
                      How AI Describes {narrative.name}
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {narrative.descriptors.slice(0, 8).map((desc) => (
                        <span
                          key={desc.word}
                          className={`text-xs px-2 py-0.5 rounded border ${
                            desc.polarity === "positive"
                              ? "text-emerald-700 bg-emerald-50/50 border-emerald-200"
                              : desc.polarity === "negative"
                                ? "text-red-700 bg-red-50/50 border-red-200"
                                : "text-muted-foreground bg-muted/50 border-border"
                          }`}
                        >
                          {desc.word}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Strengths & Weaknesses */}
                {(narrative.strengths.length > 0 || narrative.weaknesses.length > 0) && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2.5">
                      What AI Says
                    </h4>
                    <StrengthsWeaknesses
                      strengths={narrative.strengths}
                      weaknesses={narrative.weaknesses}
                      brandName={narrative.name}
                    />
                  </div>
                )}

                {/* View sample responses */}
                {onViewResponse && narrative.sampleRunIds && narrative.sampleRunIds.length > 0 && (
                  <div className="pt-2">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2">
                      View AI Responses Mentioning {narrative.name}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {narrative.sampleRunIds.slice(0, 3).map((runId, i) => (
                        <button
                          key={runId}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onViewResponse(runId); }}
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Response {i + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
