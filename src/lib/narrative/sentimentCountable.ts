/**
 * Decide whether a run should be counted in sentiment aggregations,
 * and with which effective label.
 *
 * Three cases:
 *
 * 1. Subject-not-mentioned runs (new: `sentiment: null`; legacy: NEU
 *    with empty themes+claims+descriptors) are NOT countable — return
 *    null so the aggregator skips them instead of flooding the NEU
 *    bucket.
 *
 * 2. Stored NEU with directional descriptor / claim evidence — common
 *    for legacy runs where the old keyword-based scorer returned 0
 *    signals on political language but the descriptor and claim
 *    extractors captured real polarity. Re-derive the label from
 *    descriptors (positive vs negative polarity counts) and claims
 *    (strength vs weakness). Requires >=2 items of evidence and a
 *    clear skew (>=20% net lean) to flip.
 *
 * 3. Otherwise return the stored label as-is — trusted LLM-classified
 *    POS/NEG/NEU values pass through unchanged.
 *
 * This addresses the "100% NEU for politicians" bug: keyword-era runs
 * about political figures were stamped NEU even when descriptors like
 * "progressive", "outspoken", "conservative", "controversial" were
 * extracted. Those provide enough signal to reclassify at aggregation
 * time without a full data backfill.
 */
export type SentimentLabel = "POS" | "NEU" | "NEG";

const SKEW_THRESHOLD = 0.2;
const MIN_EVIDENCE_COUNT = 2;

export function getCountableSentiment(
  narrativeJson: unknown,
): SentimentLabel | null {
  const nj = narrativeJson as Record<string, unknown> | null;
  if (!nj) return null;
  const sent = nj.sentiment as { label?: string; score?: number } | null | undefined;
  if (!sent || !sent.label) return null;
  const label = sent.label as SentimentLabel;
  if (label !== "POS" && label !== "NEU" && label !== "NEG") return null;

  const themes = nj.themes;
  const claims = nj.claims as Array<{ type?: string }> | undefined;
  const descriptors = nj.descriptors as Array<{ polarity?: string; count?: number }> | undefined;
  const themesLen = Array.isArray(themes) ? themes.length : 0;
  const claimsArr = Array.isArray(claims) ? claims : [];
  const descriptorsArr = Array.isArray(descriptors) ? descriptors : [];

  if (label !== "NEU") return label;

  // Legacy auto-NEU (subject not mentioned): no evidence of any kind.
  // Skip entirely — counting as NEU would pollute the distribution.
  if (themesLen === 0 && claimsArr.length === 0 && descriptorsArr.length === 0) {
    return null;
  }

  // Re-derive from descriptor polarity + claim types. descriptors.count
  // is the number of times a descriptor appeared in the response so
  // "championed" (count 3) counts 3× toward positive.
  let pos = 0;
  let neg = 0;
  for (const d of descriptorsArr) {
    const count = typeof d?.count === "number" && d.count > 0 ? d.count : 1;
    if (d?.polarity === "positive") pos += count;
    else if (d?.polarity === "negative") neg += count;
  }
  for (const c of claimsArr) {
    if (c?.type === "strength") pos += 1;
    else if (c?.type === "weakness") neg += 1;
  }

  const total = pos + neg;
  if (total >= MIN_EVIDENCE_COUNT) {
    const skew = (pos - neg) / total;
    if (skew >= SKEW_THRESHOLD) return "POS";
    if (skew <= -SKEW_THRESHOLD) return "NEG";
  }
  return "NEU";
}
