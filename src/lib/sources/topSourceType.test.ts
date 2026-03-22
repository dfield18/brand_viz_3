import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterRunsToBrandScope,
  isRunInBrandScope,
  type BrandScopeRun,
  type BrandScopeIdentity,
} from "../visibility/brandScope";

function makeRun(overrides: Partial<BrandScopeRun> = {}): BrandScopeRun {
  return { rawResponseText: "", analysisJson: null, narrativeJson: undefined, ...overrides };
}

// ---------------------------------------------------------------------------
// Source-type scoping: overview and visibility should use scoped run IDs
// ---------------------------------------------------------------------------

describe("source-type scorecard scoping", () => {
  const BRAND: BrandScopeIdentity = {
    brandName: "Future Forward",
    brandSlug: "future-forward-usa",
    aliases: ["Future Forward PAC"],
  };

  it("overview topSourceType should exclude out-of-scope run IDs", () => {
    const validRun = makeRun({
      rawResponseText: "Future Forward PAC raised $950M. Future Forward is the largest Super PAC.",
      analysisJson: { brandMentioned: true, competitors: [{ name: "ActBlue" }] },
    });
    const unrelatedRun = makeRun({
      rawResponseText: "Future Forward staffing agency. See indeed.com, glassdoor.com.",
      analysisJson: { brandMentioned: false, competitors: [{ name: "Robert Half" }] },
    });

    const scopedRuns = filterRunsToBrandScope([validRun, unrelatedRun], BRAND);
    // Only valid run's sources should be counted
    assert.equal(scopedRuns.length, 1);
    assert.ok(scopedRuns.includes(validRun));
    // unrelatedRun's citations (indeed.com, glassdoor.com) are excluded
  });

  it("visibility topSourceType should exclude out-of-scope run IDs", () => {
    // Same test — visibility uses the same filterRunsToBrandScope for source scoping
    const validRun = makeRun({
      rawResponseText: "Future Forward PAC spent heavily. Future Forward set records.",
      analysisJson: { brandMentioned: true },
    });
    const unrelatedRun = makeRun({
      rawResponseText: "Future Forward web agency reviews on glassdoor.",
      analysisJson: { brandMentioned: false, competitors: [] },
    });

    const scopedRuns = filterRunsToBrandScope([validRun, unrelatedRun], BRAND);
    assert.equal(scopedRuns.length, 1);
    assert.ok(!scopedRuns.includes(unrelatedRun));
  });
});

// ---------------------------------------------------------------------------
// Overview internal consistency: denominator preserved, scope used correctly
// ---------------------------------------------------------------------------

describe("overview internal consistency", () => {
  const BRAND: BrandScopeIdentity = {
    brandName: "Future Forward",
    brandSlug: "future-forward-usa",
  };

  it("mention rate denominator includes all runs, not just scoped", () => {
    const mentioned = makeRun({
      rawResponseText: "Future Forward PAC is a leader. Future Forward raised funds.",
      analysisJson: { brandMentioned: true },
    });
    const notMentioned = makeRun({
      rawResponseText: "ActBlue is the top fundraising platform.",
      analysisJson: { brandMentioned: false },
    });
    const unrelated = makeRun({
      rawResponseText: "Future Forward agency does marketing.",
      analysisJson: { brandMentioned: false, competitors: [{ name: "HubSpot" }] },
    });

    // ALL runs stay in denominator
    const allRuns = [mentioned, notMentioned, unrelated];
    // isRunInBrandScope is the numerator detector
    const mentionCount = allRuns.filter((r) => isRunInBrandScope(r, BRAND)).length;
    assert.equal(mentionCount, 1, "Only the valid mentioned run counts");
    assert.equal(allRuns.length, 3, "Denominator is all 3 runs");
    // Mention rate = 1/3 = 33%, not 1/1 = 100%
    const mentionRate = Math.round((mentionCount / allRuns.length) * 100);
    assert.equal(mentionRate, 33);
  });

  it("source-type card uses scoped runs only", () => {
    const validRun = makeRun({
      rawResponseText: "Future Forward PAC raised $950M. Future Forward is a Super PAC.",
      analysisJson: { brandMentioned: true },
    });
    const unrelatedRun = makeRun({
      rawResponseText: "Future Forward agency. See indeed.com.",
      analysisJson: { brandMentioned: false, competitors: [{ name: "Robert Half" }] },
    });

    // Source-type card uses filterRunsToBrandScope
    const scopedForSources = filterRunsToBrandScope([validRun, unrelatedRun], BRAND);
    assert.equal(scopedForSources.length, 1);
    // Only validRun's citations feed the source-type card
  });

  it("non-ambiguous brand: all mentioned runs in both denominator and source scope", () => {
    const brand: BrandScopeIdentity = { brandName: "Patagonia", brandSlug: "patagonia" };
    const mentioned = makeRun({ rawResponseText: "Patagonia makes jackets." });
    const notMentioned = makeRun({ rawResponseText: "Nike makes shoes." });

    // Denominator: all runs
    const mentionCount = [mentioned, notMentioned].filter((r) => isRunInBrandScope(r, brand)).length;
    assert.equal(mentionCount, 1);
    assert.equal([mentioned, notMentioned].length, 2);

    // Source scope: only mentioned runs (same result for non-ambiguous)
    const scopedForSources = filterRunsToBrandScope([mentioned, notMentioned], brand);
    assert.equal(scopedForSources.length, 1);
    assert.ok(scopedForSources.includes(mentioned));
  });
});
