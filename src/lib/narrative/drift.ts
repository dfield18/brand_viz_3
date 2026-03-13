/**
 * Narrative Drift computation using Jensen-Shannon Divergence.
 * Measures how theme distributions change across time buckets.
 */

import { THEME_TAXONOMY } from "./themeTaxonomy";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DriftBucket {
  date: string;
  themeCounts: Record<string, number>;
}

export interface DriftPoint {
  date: string;
  drift: number; // 0-1 (JSD from previous bucket)
  topThemes: { key: string; label: string; pct: number }[];
  emerging: string[]; // theme labels with significant increase
  declining: string[]; // theme labels with significant decrease
  themeDrift?: Record<string, number>; // per-theme JSD from previous bucket
}

// ---------------------------------------------------------------------------
// Jensen-Shannon Divergence
// ---------------------------------------------------------------------------

const EPSILON = 1e-9;

function klDivergence(p: number[], q: number[]): number {
  let sum = 0;
  for (let i = 0; i < p.length; i++) {
    if (p[i] > EPSILON) {
      sum += p[i] * Math.log2(p[i] / Math.max(q[i], EPSILON));
    }
  }
  return sum;
}

/**
 * Compute Jensen-Shannon Divergence between two probability distributions.
 * Returns value in [0, 1] (using log base 2).
 */
export function jsd(p: number[], q: number[]): number {
  if (p.length !== q.length || p.length === 0) return 0;

  // Normalize to ensure they're valid probability distributions
  const sumP = p.reduce((s, v) => s + v, 0);
  const sumQ = q.reduce((s, v) => s + v, 0);

  if (sumP === 0 && sumQ === 0) return 0;

  const pNorm = sumP > 0 ? p.map((v) => v / sumP) : p.map(() => 1 / p.length);
  const qNorm = sumQ > 0 ? q.map((v) => v / sumQ) : q.map(() => 1 / q.length);

  // M = (P + Q) / 2
  const m = pNorm.map((v, i) => (v + qNorm[i]) / 2);

  return 0.5 * klDivergence(pNorm, m) + 0.5 * klDivergence(qNorm, m);
}

// ---------------------------------------------------------------------------
// Drift computation
// ---------------------------------------------------------------------------

const THEME_LABEL_MAP: Record<string, string> = {};
for (const t of THEME_TAXONOMY) {
  THEME_LABEL_MAP[t.key] = t.label;
}

/**
 * Compute narrative drift across time buckets.
 * Each bucket has theme counts aggregated from runs in that period.
 */
export function computeDrift(buckets: DriftBucket[]): DriftPoint[] {
  if (buckets.length === 0) return [];

  // Collect all theme keys appearing across all buckets
  const allKeys = new Set<string>();
  for (const bucket of buckets) {
    for (const key of Object.keys(bucket.themeCounts)) {
      allKeys.add(key);
    }
  }
  const themeKeys = Array.from(allKeys).sort();

  if (themeKeys.length === 0) {
    return buckets.map((b) => ({
      date: b.date,
      drift: 0,
      topThemes: [],
      emerging: [],
      declining: [],
    }));
  }

  // Convert each bucket to a distribution vector
  const distributions = buckets.map((bucket) =>
    themeKeys.map((k) => bucket.themeCounts[k] ?? 0),
  );

  const points: DriftPoint[] = [];

  for (let i = 0; i < buckets.length; i++) {
    const dist = distributions[i];
    const totalCount = dist.reduce((s, v) => s + v, 0);

    // Top themes for this bucket
    const topThemes = themeKeys
      .map((key, idx) => ({
        key,
        label: THEME_LABEL_MAP[key] ?? key,
        pct: totalCount > 0 ? Math.round((dist[idx] / totalCount) * 100) : 0,
      }))
      .filter((t) => t.pct > 0)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3);

    // Drift from previous bucket
    let drift = 0;
    const emerging: string[] = [];
    const declining: string[] = [];
    const themeDrift: Record<string, number> = {};

    if (i > 0) {
      const prevDist = distributions[i - 1];
      drift = Math.round(jsd(prevDist, dist) * 1000) / 1000;

      // Detect emerging and declining themes + per-theme JSD
      const prevTotal = prevDist.reduce((s, v) => s + v, 0);

      for (let k = 0; k < themeKeys.length; k++) {
        const prevPct = prevTotal > 0 ? prevDist[k] / prevTotal : 0;
        const currPct = totalCount > 0 ? dist[k] / totalCount : 0;
        const diff = currPct - prevPct;
        const label = THEME_LABEL_MAP[themeKeys[k]] ?? themeKeys[k];

        // Per-theme JSD: compare [pct, 1-pct] distributions
        const themJsd = jsd([prevPct, 1 - prevPct], [currPct, 1 - currPct]);
        themeDrift[label] = Math.round(themJsd * 1000) / 1000;

        if (diff >= 0.15 && dist[k] >= 2) {
          emerging.push(label);
        } else if (diff <= -0.15 && prevDist[k] >= 2) {
          declining.push(label);
        }
      }
    }

    points.push({ date: buckets[i].date, drift, topThemes, emerging, declining, themeDrift });
  }

  return points;
}
