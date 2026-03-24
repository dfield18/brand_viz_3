/**
 * Shared helpers for narrative metric derivation.
 * Used by both NarrativeMetricCards and /api/report so they agree.
 */

const CONSISTENCY_PCT: Record<string, number> = { Low: 30, Moderate: 60, High: 85 };

/** Derive Platform Consistency percentage from polarization level. */
export function platformConsistencyFromPolarization(polarization: string | null | undefined): number {
  if (!polarization) return 0;
  return CONSISTENCY_PCT[polarization] ?? 0;
}

/** Derive Model Confidence percentage from hedging rate. */
export function modelConfidenceFromHedgingRate(hedgingRate: number | null | undefined): number {
  if (hedgingRate == null) return 0;
  return Math.max(0, 100 - hedgingRate);
}
