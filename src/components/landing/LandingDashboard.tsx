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
    <VisibilityTrendChart
      trend={trend}
      brandName={brandName}
      descriptionOverride={descriptions}
    />
  );
}
