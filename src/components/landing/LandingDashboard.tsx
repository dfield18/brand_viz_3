"use client";

import { VisibilityTrendChart } from "@/components/visibility/VisibilityTrendChart";
import type { VisibilityTrendPoint } from "@/types/api";

interface Props {
  brandName: string;
  trend: VisibilityTrendPoint[];
}

const LANDING_DESCRIPTIONS: Record<string, string> = {
  visibility: "How often AI platforms mention ACLU when users ask about civil rights, voting rights, and constitutional law — without naming any organization",
  topResult: "How often ACLU appears as the #1 recommendation when AI answers questions about civil liberties",
  sov: "ACLU's share of all organization mentions when AI discusses civil rights issues",
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
