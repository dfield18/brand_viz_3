"use client";

import { VisibilityTrendChart } from "@/components/visibility/VisibilityTrendChart";
import type { VisibilityTrendPoint } from "@/types/api";

interface Props {
  brandName: string;
  trend: VisibilityTrendPoint[];
}

const LANDING_DESCRIPTIONS: Record<string, string> = {
  visibility: "How often AI mentions ACLU in civil rights questions",
  topResult: "How often ACLU ranks #1 when AI answers civil liberties questions",
  sov: "ACLU's share of mentions in civil rights responses",
};

export function LandingDashboard({ brandName, trend }: Props) {
  return (
    <VisibilityTrendChart
      trend={trend}
      brandName={brandName}
      descriptionOverride={LANDING_DESCRIPTIONS}
    />
  );
}
