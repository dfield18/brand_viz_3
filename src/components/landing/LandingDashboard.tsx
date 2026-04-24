"use client";

import { VisibilityTrendChart } from "@/components/visibility/VisibilityTrendChart";
import type { VisibilityTrendPoint } from "@/types/api";

interface Props {
  brandName: string;
  /** Industry label used to build the chart descriptions (e.g. "athletic
   *  apparel", "civil rights"). Falls back to a generic phrasing if null. */
  industry?: string | null;
  trend: VisibilityTrendPoint[];
}

export function LandingDashboard({ brandName, industry, trend }: Props) {
  const industryLabel = industry?.trim() || "their industry";
  const descriptions: Record<string, string> = {
    visibility: `How often AI mentions ${brandName} in ${industryLabel} questions`,
    topResult: `How often ${brandName} ranks #1 when AI answers ${industryLabel} questions`,
    sov: `${brandName}'s share of mentions in ${industryLabel} responses`,
  };

  return (
    <div>
      <VisibilityTrendChart
        trend={trend}
        brandName={brandName}
        descriptionOverride={descriptions}
        hideDelta
      />
      {/* Line legend — the chart renders overall (solid) + per-platform
          (lighter) lines with no built-in key, so users couldn't tell
          which line was which. Placed under the chart so it doesn't
          compete with the heading inside VisibilityTrendChart. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[2px] w-4 bg-[var(--chart-1)] rounded-full" aria-hidden="true" />
          {brandName} — all AI platforms
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[2px] w-4 bg-muted-foreground/40 rounded-full" aria-hidden="true" />
          Individual platform
        </span>
      </div>
    </div>
  );
}
