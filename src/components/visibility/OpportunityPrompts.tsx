"use client";

import { AlertCircle } from "lucide-react";
import type { OpportunityPrompt } from "@/types/api";
import { subjectNoun } from "@/lib/subjectNoun";

interface OpportunityPromptsProps {
  prompts: OpportunityPrompt[];
  isOrg?: boolean;
  brandName?: string;
  category?: string | null;
}

export function OpportunityPrompts({ prompts, isOrg, brandName = "Brand", category }: OpportunityPromptsProps) {
  if (prompts.length === 0) return null;
  const noun = subjectNoun(brandName, category);

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <div className="flex items-center gap-2 mb-1">
        <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
        <h2 className="text-base font-semibold">Opportunity Prompts</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Top prompts where {isOrg ? "other organizations appear" : "competitors appear"} but {isOrg ? "this organization doesn\u2019t" : `this ${noun} doesn\u2019t`}
      </p>
      <ul className="space-y-3">
        {prompts.map((p) => (
          <li key={p.prompt}>
            <p className="text-sm text-foreground">
              &ldquo;{p.prompt}&rdquo;
            </p>
            {p.competitors.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {p.competitors.join(" · ")}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
