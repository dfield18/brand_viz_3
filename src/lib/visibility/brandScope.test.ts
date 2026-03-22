import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isRunInBrandScope,
  filterRunsToBrandScope,
  isBrandNameAmbiguous,
  type BrandScopeRun,
  type BrandScopeIdentity,
} from "./brandScope";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRun(overrides: Partial<BrandScopeRun> = {}): BrandScopeRun {
  return {
    rawResponseText: "",
    analysisJson: null,
    narrativeJson: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isBrandNameAmbiguous
// ---------------------------------------------------------------------------

describe("isBrandNameAmbiguous", () => {
  it("flags common-word names as ambiguous", () => {
    assert.ok(isBrandNameAmbiguous("Future Forward"));
    assert.ok(isBrandNameAmbiguous("Target"));
    assert.ok(isBrandNameAmbiguous("National Action"));
    assert.ok(isBrandNameAmbiguous("General American"));
  });

  it("does not flag distinctive names", () => {
    assert.ok(!isBrandNameAmbiguous("Patagonia"));
    assert.ok(!isBrandNameAmbiguous("ACLU"));
    assert.ok(!isBrandNameAmbiguous("Salesforce"));
    assert.ok(!isBrandNameAmbiguous("Volkswagen"));
    assert.ok(!isBrandNameAmbiguous("Nike"));
  });

  it("very short single words are ambiguous", () => {
    assert.ok(isBrandNameAmbiguous("Gap"));
    assert.ok(isBrandNameAmbiguous("Go"));
  });

  it("single words with 4+ chars are not ambiguous", () => {
    assert.ok(!isBrandNameAmbiguous("Nike"));
    assert.ok(!isBrandNameAmbiguous("Adidas"));
    assert.ok(!isBrandNameAmbiguous("Tesla"));
  });
});

// ---------------------------------------------------------------------------
// isRunInBrandScope — non-ambiguous brands
// ---------------------------------------------------------------------------

describe("isRunInBrandScope — non-ambiguous brands", () => {
  const BRAND: BrandScopeIdentity = { brandName: "Patagonia", brandSlug: "patagonia" };

  it("passes when brand is mentioned in text", () => {
    const run = makeRun({ rawResponseText: "Patagonia makes outdoor gear." });
    assert.ok(isRunInBrandScope(run, BRAND));
  });

  it("fails when brand is not mentioned", () => {
    const run = makeRun({ rawResponseText: "Nike makes shoes." });
    assert.ok(!isRunInBrandScope(run, BRAND));
  });

  it("non-ambiguous brands do not require structured evidence", () => {
    const run = makeRun({
      rawResponseText: "Patagonia is mentioned once.",
      analysisJson: null,
    });
    assert.ok(isRunInBrandScope(run, BRAND));
  });
});

// ---------------------------------------------------------------------------
// isRunInBrandScope — ambiguous brands
// ---------------------------------------------------------------------------

describe("isRunInBrandScope — ambiguous brands", () => {
  const BRAND: BrandScopeIdentity = {
    brandName: "Future Forward",
    brandSlug: "future-forward-usa",
    aliases: ["Future Forward PAC", "Future Forward USA Action"],
  };

  it("rejects run that mentions phrase but is about a different entity", () => {
    const run = makeRun({
      rawResponseText:
        "Future Forward is a marketing agency specializing in e-commerce solutions for small businesses.",
      analysisJson: { brandMentioned: false, competitors: [{ name: "GirnarSOFT" }] },
    });
    assert.ok(!isRunInBrandScope(run, BRAND));
  });

  it("accepts run with analysisJson.brandMentioned=true", () => {
    const run = makeRun({
      rawResponseText: "Future Forward PAC raised $950 million for the 2024 election.",
      analysisJson: { brandMentioned: true, competitors: [{ name: "ActBlue" }] },
    });
    assert.ok(isRunInBrandScope(run, BRAND));
  });

  it("accepts run where brand/alias appears in competitor list", () => {
    const run = makeRun({
      rawResponseText: "Top PACs include Future Forward and ActBlue.",
      analysisJson: {
        brandMentioned: false,
        competitors: [{ name: "Future Forward PAC" }, { name: "ActBlue" }],
      },
    });
    assert.ok(isRunInBrandScope(run, BRAND));
  });

  it("accepts run with narrative evidence (non-zero signals)", () => {
    const run = makeRun({
      rawResponseText: "Future Forward set a fundraising record.",
      analysisJson: null,
      narrativeJson: { authoritySignals: 2, trustSignals: 0, weaknessSignals: 0, themes: [], claims: [], sentiment: { label: "POS", score: 0.5 }, descriptors: [] },
    });
    assert.ok(isRunInBrandScope(run, BRAND));
  });

  it("accepts run with multiple text mentions (prominence)", () => {
    const run = makeRun({
      rawResponseText:
        "Future Forward PAC, supporting Kamala Harris, set a fundraising record. Future Forward raised over $950 million.",
      analysisJson: null,
    });
    assert.ok(isRunInBrandScope(run, BRAND));
  });

  it("rejects single-mention run with no structured evidence", () => {
    const run = makeRun({
      rawResponseText:
        "Companies like Future Forward and other agencies provide digital marketing services.",
      analysisJson: null,
    });
    assert.ok(!isRunInBrandScope(run, BRAND));
  });
});

// ---------------------------------------------------------------------------
// filterRunsToBrandScope
// ---------------------------------------------------------------------------

describe("filterRunsToBrandScope", () => {
  const BRAND: BrandScopeIdentity = {
    brandName: "Future Forward",
    brandSlug: "future-forward-usa",
    aliases: ["Future Forward PAC"],
  };

  it("mixed dataset: keeps valid runs, excludes unrelated", () => {
    const validIndustry = makeRun({
      rawResponseText: "Future Forward PAC is the largest Super PAC. Future Forward raised $950M.",
      analysisJson: { brandMentioned: true, competitors: [{ name: "ActBlue" }] },
    });
    const unrelatedDirect = makeRun({
      rawResponseText: "Future Forward is a marketing agency. Competitors include HubSpot.",
      analysisJson: { brandMentioned: false, competitors: [{ name: "HubSpot" }] },
    });
    const validComparative = makeRun({
      rawResponseText: "Future Forward PAC vs ActBlue: Future Forward focuses on data-driven advertising.",
      analysisJson: { competitors: [{ name: "Future Forward PAC" }, { name: "ActBlue" }] },
    });

    const result = filterRunsToBrandScope(
      [validIndustry, unrelatedDirect, validComparative],
      BRAND,
    );
    assert.equal(result.length, 2);
    assert.ok(result.includes(validIndustry));
    assert.ok(result.includes(validComparative));
    assert.ok(!result.includes(unrelatedDirect));
  });

  it("non-ambiguous brand keeps all mentioned runs", () => {
    const brand: BrandScopeIdentity = { brandName: "Patagonia", brandSlug: "patagonia" };
    const runs = [
      makeRun({ rawResponseText: "Patagonia makes jackets." }),
      makeRun({ rawResponseText: "Nike makes shoes." }),
      makeRun({ rawResponseText: "Patagonia is a region in South America." }),
    ];
    const result = filterRunsToBrandScope(runs, brand);
    assert.equal(result.length, 2); // Both mention "Patagonia"
  });
});

// ---------------------------------------------------------------------------
// Sources contamination scenario
// ---------------------------------------------------------------------------

describe("sources contamination scenario", () => {
  const BRAND: BrandScopeIdentity = {
    brandName: "Future Forward",
    brandSlug: "future-forward-usa",
  };

  it("unrelated run with many citations is excluded", () => {
    const unrelatedWithCitations = makeRun({
      rawResponseText: "Future Forward is a staffing company. See indeed.com, glassdoor.com, linkedin.com for reviews.",
      analysisJson: { brandMentioned: false, competitors: [{ name: "Robert Half" }] },
    });
    const validWithCitations = makeRun({
      rawResponseText: "Future Forward PAC raised $950M. Future Forward spent heavily on advertising. See opensecrets.org.",
      analysisJson: { brandMentioned: true, competitors: [{ name: "ActBlue" }] },
    });

    const result = filterRunsToBrandScope([unrelatedWithCitations, validWithCitations], BRAND);
    assert.equal(result.length, 1);
    assert.ok(result.includes(validWithCitations));
  });
});

// ---------------------------------------------------------------------------
// Consistency scenario: frames, sentiment, claims from same pool
// ---------------------------------------------------------------------------

describe("narrative consistency — single scoped pool", () => {
  const BRAND: BrandScopeIdentity = {
    brandName: "Future Forward",
    brandSlug: "future-forward-usa",
    aliases: ["Future Forward PAC"],
  };

  it("scoped runs exclude unrelated negative claims", () => {
    const validIndustry = makeRun({
      rawResponseText: "Future Forward PAC is a major Super PAC. Future Forward raised record funds.",
      analysisJson: { brandMentioned: true },
      narrativeJson: {
        sentiment: { label: "POS", score: 0.5 },
        authoritySignals: 2, trustSignals: 1, weaknessSignals: 0,
        themes: [{ key: "fundraising", label: "Record Fundraising", score: 0.8, evidence: [] }],
        claims: [{ type: "strength", text: "Record-breaking fundraising" }],
        descriptors: [],
      },
    });
    const unrelatedNegative = makeRun({
      rawResponseText: "Future Forward staffing agency has poor reviews and high turnover.",
      analysisJson: { brandMentioned: false, competitors: [{ name: "Robert Half" }] },
      narrativeJson: {
        sentiment: { label: "NEG", score: -0.8 },
        authoritySignals: 0, trustSignals: 0, weaknessSignals: 3,
        themes: [{ key: "employee_reviews", label: "Employee Reviews", score: 0.7, evidence: [] }],
        claims: [{ type: "weakness", text: "Poor employee reviews and high turnover" }],
        descriptors: [],
      },
    });

    const scoped = filterRunsToBrandScope([validIndustry, unrelatedNegative], BRAND);
    assert.equal(scoped.length, 1);
    // The unrelated negative claims should not contaminate the brand's narrative
    assert.ok(scoped.includes(validIndustry));
    assert.ok(!scoped.includes(unrelatedNegative));
  });
});
