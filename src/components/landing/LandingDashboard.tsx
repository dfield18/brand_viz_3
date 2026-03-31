"use client";

import { VisibilityTrendChart } from "@/components/visibility/VisibilityTrendChart";
import type { VisibilityTrendPoint } from "@/types/api";

interface Props {
  brandName: string;
  trend: VisibilityTrendPoint[];
}

export function LandingDashboard({ brandName, trend }: Props) {
  return (
    <VisibilityTrendChart
      trend={trend}
      brandName={brandName}
    />
  );
}
