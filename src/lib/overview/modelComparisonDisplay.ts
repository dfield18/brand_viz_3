/**
 * Shared display helpers for model comparison values.
 * Used by CrossModelTable (Overview tab) and the report page
 * so both surfaces render identical labels.
 */

/** Stability label from narrativeStability score (0–100). */
export function stabilityLabel(value: number): string {
  if (value >= 70) return "High";
  if (value >= 40) return "Medium";
  return "Low";
}

/** Sentiment label from sentimentSplit — shows the dominant category. */
export function sentimentLabel(split?: { positive: number; neutral: number; negative: number } | null): string {
  if (!split) return "\u2014";
  const { positive, neutral, negative } = split;
  const max = Math.max(positive, neutral, negative);
  const min = Math.min(positive, neutral, negative);
  if (max - min <= 10 && max < 45) return "Mixed";
  if (positive >= neutral && positive >= negative) return `${positive}% Positive`;
  if (negative >= neutral) return `${negative}% Negative`;
  return `${neutral}% Neutral`;
}
