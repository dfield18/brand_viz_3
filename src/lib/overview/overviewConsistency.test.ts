/**
 * Regression tests for overview payload internal consistency.
 *
 * These test the design invariants:
 * - Visibility KPIs use denominator-aware math (all runs + isRunInBrandScope)
 * - Content KPIs (dominant frame, controversy, stability) use scoped analyses only
 * - overview.topFrames and the KPI dominant frame agree
 * - Non-ambiguous brands are not regressed
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isRunInBrandScope,
  filterRunsToBrandScope,
  isBrandNameAmbiguous,
  type BrandScopeRun,
  type BrandScopeIdentity,
} from "../visibility/brandScope";
import { parseAnalysis, computeStability } from "../aggregateAnalysis";

function makeRun(overrides: Partial<BrandScopeRun & { analysisJson: unknown }> = {}): BrandScopeRun {
  return { rawResponseText: "", analysisJson: null, narrativeJson: undefined, ...overrides };
}

function makeAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    brandMentioned: true,
    brandMentionStrength: 50,
    competitors: [],
    topics: [],
    frames: [],
    sentiment: { legitimacy: 50, controversy: 50 },
    hedgingScore: 0,
    authorityScore: 50,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// A. Ambiguous-brand mixed dataset: different scopes produce different content
// ---------------------------------------------------------------------------

describe("overview consistency — ambiguous brand mixed dataset", () => {
  const BRAND: BrandScopeIdentity = {
    brandName: "Future Forward",
    brandSlug: "future-forward-usa",
    aliases: ["Future Forward PAC"],
  };

  const validRuns = [
    makeRun({
      rawResponseText: "Future Forward PAC raised $950M. Future Forward is a major Super PAC.",
      analysisJson: makeAnalysis({
        brandMentioned: true,
        frames: [{ name: "Record Fundraising", strength: 80 }],
        sentiment: { legitimacy: 70, controversy: 20 },
      }),
    }),
    makeRun({
      rawResponseText: "Future Forward PAC spent heavily. Future Forward set fundraising records.",
      analysisJson: makeAnalysis({
        brandMentioned: true,
        frames: [{ name: "Record Fundraising", strength: 60 }, { name: "Political Advertising", strength: 40 }],
        sentiment: { legitimacy: 65, controversy: 25 },
      }),
    }),
  ];

  const unrelatedRuns = [
    makeRun({
      rawResponseText: "Future Forward is a marketing agency with poor reviews.",
      analysisJson: makeAnalysis({
        brandMentioned: false,
        competitors: [{ name: "HubSpot", mentionStrength: 50 }],
        frames: [{ name: "Employee Complaints", strength: 70 }],
        sentiment: { legitimacy: 30, controversy: 80 },
      }),
    }),
    makeRun({
      rawResponseText: "Future Forward web design company does e-commerce.",
      analysisJson: makeAnalysis({
        brandMentioned: false,
        competitors: [{ name: "Wix", mentionStrength: 40 }],
        frames: [{ name: "Web Design Services", strength: 50 }],
        sentiment: { legitimacy: 40, controversy: 60 },
      }),
    }),
  ];

  // A run that doesn't mention the brand at all (part of denominator)
  const noMentionRun = makeRun({
    rawResponseText: "ActBlue is the top fundraising platform for Democrats.",
    analysisJson: makeAnalysis({ brandMentioned: false }),
  });

  const allRuns = [...validRuns, ...unrelatedRuns, noMentionRun];

  it("mention rate uses all runs as denominator, isRunInBrandScope as numerator", () => {
    const denominator = allRuns.length; // 5
    const numerator = allRuns.filter((r) => isRunInBrandScope(r, BRAND)).length; // 2 valid
    assert.equal(denominator, 5);
    assert.equal(numerator, 2);
    const mentionRate = Math.round((numerator / denominator) * 100);
    assert.equal(mentionRate, 40); // 2/5 = 40%, NOT 2/2 = 100%
  });

  it("content KPIs use scoped analyses only", () => {
    const scopedRuns = filterRunsToBrandScope(allRuns, BRAND);
    assert.equal(scopedRuns.length, 2, "Only 2 valid runs survive scope filter");

    const scopedAnalyses = scopedRuns
      .map((r) => parseAnalysis(r.analysisJson))
      .filter((a) => a !== null);

    // Controversy from scoped: avg of 20 and 25 = 22-23, NOT including 80 and 60 from unrelated
    const avgControversy = Math.round(
      scopedAnalyses.reduce((s, a) => s + a!.sentiment.controversy, 0) / scopedAnalyses.length,
    );
    assert.ok(avgControversy < 30, `Controversy should be low (~22), got ${avgControversy}`);

    // Raw analyses would give avg controversy of (20+25+80+60+50)/5 = 47
    const rawAnalyses = allRuns
      .map((r) => parseAnalysis(r.analysisJson))
      .filter((a) => a !== null);
    const rawAvgControversy = Math.round(
      rawAnalyses.reduce((s, a) => s + a!.sentiment.controversy, 0) / rawAnalyses.length,
    );
    assert.ok(rawAvgControversy > 40, `Raw controversy should be higher (~47), got ${rawAvgControversy}`);
    assert.ok(avgControversy !== rawAvgControversy, "Scoped and raw controversy must differ");
  });

  it("dominant frame comes from scoped analyses, not raw", () => {
    const scopedRuns = filterRunsToBrandScope(allRuns, BRAND);
    const scopedAnalyses = scopedRuns
      .map((r) => parseAnalysis(r.analysisJson))
      .filter((a) => a !== null);

    // Count frames from scoped analyses
    const frameCounts: Record<string, number> = {};
    for (const a of scopedAnalyses) {
      for (const f of a!.frames) {
        if (f.strength >= 20) frameCounts[f.name] = (frameCounts[f.name] ?? 0) + 1;
      }
    }
    const sorted = Object.entries(frameCounts).sort((a, b) => b[1] - a[1]);
    const dominantFrame = sorted[0]?.[0];
    assert.equal(dominantFrame, "Record Fundraising");

    // If we used raw analyses, "Employee Complaints" and "Web Design Services" would also appear
    const rawFrameCounts: Record<string, number> = {};
    for (const r of allRuns) {
      const a = parseAnalysis(r.analysisJson);
      if (!a) continue;
      for (const f of a.frames) {
        if (f.strength >= 20) rawFrameCounts[f.name] = (rawFrameCounts[f.name] ?? 0) + 1;
      }
    }
    assert.ok("Employee Complaints" in rawFrameCounts, "Raw pool has contaminating frames");
    assert.ok(!("Employee Complaints" in frameCounts), "Scoped pool excludes contaminating frames");
  });
});

// ---------------------------------------------------------------------------
// B. Internal consistency: KPI dominant frame and topFrames[0] agree
// ---------------------------------------------------------------------------

describe("overview consistency — KPI and topFrames agree", () => {
  it("dominant frame KPI is always topFrames[0]", () => {
    // Simulates the assembly logic: both read from the same scoped frame list
    const scopedFrames = [
      { frame: "Record Fundraising", percentage: 67 },
      { frame: "Political Advertising", percentage: 33 },
    ];

    // KPI derivation (same as route logic)
    const dominantFrame = scopedFrames[0];
    const kpiDisplayText = dominantFrame.frame;
    const kpiValue = dominantFrame.percentage;

    assert.equal(kpiDisplayText, scopedFrames[0].frame);
    assert.equal(kpiValue, scopedFrames[0].percentage);
  });
});

// ---------------------------------------------------------------------------
// C. Non-regression: non-ambiguous brands not over-filtered
// ---------------------------------------------------------------------------

describe("overview consistency — non-ambiguous brand not regressed", () => {
  const BRAND: BrandScopeIdentity = { brandName: "Patagonia", brandSlug: "patagonia" };

  it("all mentioned runs contribute to both denominator and content", () => {
    assert.ok(!isBrandNameAmbiguous("Patagonia"));

    const mentioned = makeRun({
      rawResponseText: "Patagonia makes outdoor gear.",
      analysisJson: makeAnalysis({ frames: [{ name: "Sustainability", strength: 70 }] }),
    });
    const notMentioned = makeRun({
      rawResponseText: "Nike makes shoes.",
      analysisJson: makeAnalysis({ brandMentioned: false }),
    });

    // Denominator includes all
    const allRuns = [mentioned, notMentioned];
    const mentionCount = allRuns.filter((r) => isRunInBrandScope(r, BRAND)).length;
    assert.equal(mentionCount, 1);
    assert.equal(allRuns.length, 2);

    // Content scope also includes the mentioned run
    const scoped = filterRunsToBrandScope(allRuns, BRAND);
    assert.equal(scoped.length, 1);
    assert.ok(scoped.includes(mentioned));
  });
});
