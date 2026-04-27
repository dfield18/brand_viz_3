"use client";

import type { ModelBreakdownRow } from "@/types/api";
import { MODEL_LABELS } from "@/lib/constants";
import { EmptyState } from "@/components/EmptyState";
import { subjectNoun } from "@/lib/subjectNoun";

interface VisibilityByModelProps {
  models: ModelBreakdownRow[];
  brandName?: string;
  category?: string | null;
}

export function VisibilityByModel({ models, brandName, category }: VisibilityByModelProps) {
  const noun = subjectNoun(brandName ?? "Brand", category);
  const NounCap = noun.charAt(0).toUpperCase() + noun.slice(1);
  const withData = models.filter((m) => m.mentionRate !== null);

  if (withData.length === 0) {
    return (
      <section className="rounded-xl bg-card p-6 shadow-section">
        <h2 className="text-base font-semibold">Visibility by Model</h2>
        <div className="mt-4">
          <EmptyState message="No model visibility data available yet." />
        </div>
      </section>
    );
  }

  const sorted = [...withData].sort((a, b) => (b.mentionRate ?? 0) - (a.mentionRate ?? 0));

  return (
    <section className="rounded-xl bg-card p-6 shadow-section">
      <h2 className="text-base font-semibold">Visibility by Model</h2>
      <p className="text-xs text-muted-foreground mt-1 mb-5">
        {NounCap} mention rate per model in industry responses
      </p>
      <div className="space-y-2.5">
        {sorted.map((row) => (
          <div key={row.model} className="flex items-center gap-3">
            <span className="text-sm w-24 shrink-0 text-muted-foreground">
              {MODEL_LABELS[row.model] ?? row.model}
            </span>
            <div className="flex-1 h-7 rounded bg-muted/50 overflow-hidden">
              <div
                className="h-full rounded bg-primary transition-all duration-300"
                style={{ width: `${row.mentionRate ?? 0}%` }}
              />
            </div>
            <span className="text-sm font-semibold tabular-nums w-10 text-right">
              {row.mentionRate ?? 0}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
