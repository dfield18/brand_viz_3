/**
 * Decide whether a run should be counted in sentiment aggregations.
 *
 * Two cases we exclude:
 *
 * 1. Explicit null sentiment (new runs where extractNarrativeForRun
 *    returned null because the subject wasn't mentioned in the text).
 *
 * 2. Legacy "auto-NEU" runs — extractNarrativeForRun used to stamp
 *    NEU + zero signals on subject-not-mentioned runs before we
 *    switched to null. Detect those as NEU + empty themes + empty
 *    claims + empty descriptors. A genuinely neutral response about
 *    the subject will always have produced at least one theme or
 *    descriptor, so this heuristic is safe.
 *
 * For political figures this matters a lot: many industry-scope runs
 * ("Which senators are outspoken on X?") don't mention the target at
 * all, so without this gate every such run gets counted as NEU and
 * floods the distribution toward "100% neutral."
 */
export type SentimentLabel = "POS" | "NEU" | "NEG";

export function getCountableSentiment(
  narrativeJson: unknown,
): SentimentLabel | null {
  const nj = narrativeJson as Record<string, unknown> | null;
  if (!nj) return null;
  const sent = nj.sentiment as { label?: string } | null | undefined;
  if (!sent || !sent.label) return null;
  const label = sent.label as SentimentLabel;
  if (label !== "POS" && label !== "NEU" && label !== "NEG") return null;

  if (label === "NEU") {
    const themes = nj.themes;
    const claims = nj.claims;
    const descriptors = nj.descriptors;
    const themesLen = Array.isArray(themes) ? themes.length : 0;
    const claimsLen = Array.isArray(claims) ? claims.length : 0;
    const descLen = Array.isArray(descriptors) ? descriptors.length : 0;
    if (themesLen === 0 && claimsLen === 0 && descLen === 0) return null;
  }
  return label;
}
