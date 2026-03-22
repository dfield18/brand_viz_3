import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isRunInBrandScope,
  filterRunsToBrandScope,
  isBrandNameAmbiguous,
  buildBrandIdentity,
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
  it("flags common-word multi-word names as ambiguous", () => {
    assert.ok(isBrandNameAmbiguous("Future Forward"));
    assert.ok(isBrandNameAmbiguous("Old Navy"));
    assert.ok(isBrandNameAmbiguous("National Action"));
    assert.ok(isBrandNameAmbiguous("General American"));
  });

  it("flags documented ambiguous single-word examples", () => {
    assert.ok(isBrandNameAmbiguous("Apple"));
    assert.ok(isBrandNameAmbiguous("Target"));
    assert.ok(isBrandNameAmbiguous("Shell"));
    assert.ok(isBrandNameAmbiguous("Coach"));
    assert.ok(isBrandNameAmbiguous("Dove"));
    assert.ok(isBrandNameAmbiguous("Chase"));
    assert.ok(isBrandNameAmbiguous("Ally"));
    assert.ok(isBrandNameAmbiguous("Indeed"));
    assert.ok(isBrandNameAmbiguous("Snap"));
    assert.ok(isBrandNameAmbiguous("Compass"));
  });

  it("flags very short single words", () => {
    assert.ok(isBrandNameAmbiguous("Gap"));
    assert.ok(isBrandNameAmbiguous("Go"));
    assert.ok(isBrandNameAmbiguous("HP"));
  });

  it("flags single common words in COMMON_WORDS", () => {
    assert.ok(isBrandNameAmbiguous("Target"));
    assert.ok(isBrandNameAmbiguous("Pioneer"));
    assert.ok(isBrandNameAmbiguous("Express"));
    assert.ok(isBrandNameAmbiguous("Frontier"));
  });

  it("does not flag distinctive names", () => {
    assert.ok(!isBrandNameAmbiguous("Patagonia"));
    assert.ok(!isBrandNameAmbiguous("ACLU"));
    assert.ok(!isBrandNameAmbiguous("Salesforce"));
    assert.ok(!isBrandNameAmbiguous("Volkswagen"));
    assert.ok(!isBrandNameAmbiguous("Nike"));
    assert.ok(!isBrandNameAmbiguous("Tesla"));
    assert.ok(!isBrandNameAmbiguous("Adidas"));
    assert.ok(!isBrandNameAmbiguous("Starbucks"));
  });

  it("multi-word name with at least one non-common word is not ambiguous", () => {
    assert.ok(!isBrandNameAmbiguous("Tesla Motors"));
    assert.ok(!isBrandNameAmbiguous("Patagonia Outdoor"));
    assert.ok(!isBrandNameAmbiguous("Nike Global"));
  });
});

// ---------------------------------------------------------------------------
// buildBrandIdentity
// ---------------------------------------------------------------------------

describe("buildBrandIdentity", () => {
  it("prefers displayName over name", () => {
    const identity = buildBrandIdentity({ name: "Future Forward Usa", displayName: "Future Forward", slug: "future-forward-usa", aliases: [] });
    assert.equal(identity.brandName, "Future Forward");
    assert.equal(identity.brandSlug, "future-forward-usa");
  });

  it("falls back to name when displayName is null", () => {
    const identity = buildBrandIdentity({ name: "Patagonia", displayName: null, slug: "patagonia", aliases: [] });
    assert.equal(identity.brandName, "Patagonia");
  });

  it("omits aliases when empty", () => {
    const identity = buildBrandIdentity({ name: "Test", slug: "test", aliases: [] });
    assert.equal(identity.aliases, undefined);
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

  it("accepts run with narrative evidence (non-zero authority/trust signals)", () => {
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
// isRunInBrandScope — ambiguous single-word brands
// ---------------------------------------------------------------------------

describe("isRunInBrandScope — ambiguous single-word brands", () => {
  const APPLE: BrandScopeIdentity = { brandName: "Apple", brandSlug: "apple" };

  it("rejects run about apple fruit", () => {
    const run = makeRun({
      rawResponseText: "Apple is a popular fruit. It contains vitamins and fiber.",
      analysisJson: { brandMentioned: false, competitors: [] },
    });
    assert.ok(!isRunInBrandScope(run, APPLE));
  });

  it("accepts run about Apple Inc with brandMentioned evidence", () => {
    const run = makeRun({
      rawResponseText: "Apple released the new iPhone 16 with advanced features.",
      analysisJson: { brandMentioned: true, competitors: [{ name: "Samsung" }] },
    });
    assert.ok(isRunInBrandScope(run, APPLE));
  });

  it("accepts run with multiple mentions of Apple the brand", () => {
    const run = makeRun({
      rawResponseText: "Apple is a technology leader. Apple makes the iPhone, iPad, and Mac. Apple is headquartered in Cupertino.",
      analysisJson: null,
    });
    assert.ok(isRunInBrandScope(run, APPLE));
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
    assert.equal(result.length, 2);
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
// Narrative consistency — single scoped pool
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
    assert.ok(scoped.includes(validIndustry));
    assert.ok(!scoped.includes(unrelatedNegative));
  });

  it("same scoped pool is suitable for frames AND claims/sentiment", () => {
    // When one pool is used, frames/sentiment/claims all see only valid runs
    const valid1 = makeRun({
      rawResponseText: "Future Forward PAC set a record. Future Forward raised $950M.",
      analysisJson: { brandMentioned: true },
      narrativeJson: { sentiment: { label: "POS", score: 0.5 }, authoritySignals: 2, trustSignals: 0, weaknessSignals: 0, themes: [], claims: [{ type: "strength", text: "Record fundraising" }], descriptors: [] },
    });
    const valid2 = makeRun({
      rawResponseText: "Future Forward PAC supports campaigns. Future Forward uses data-driven ads.",
      analysisJson: { brandMentioned: true },
      narrativeJson: { sentiment: { label: "NEU", score: 0 }, authoritySignals: 0, trustSignals: 1, weaknessSignals: 0, themes: [], claims: [], descriptors: [] },
    });
    const unrelated = makeRun({
      rawResponseText: "Future Forward agency does web design.",
      analysisJson: { brandMentioned: false, competitors: [{ name: "Wix" }] },
      narrativeJson: { sentiment: { label: "NEG", score: -0.5 }, authoritySignals: 0, trustSignals: 0, weaknessSignals: 2, themes: [], claims: [{ type: "weakness", text: "Bad reviews" }], descriptors: [] },
    });

    const scoped = filterRunsToBrandScope([valid1, valid2, unrelated], BRAND);
    assert.equal(scoped.length, 2);
    // If we computed sentiment from scoped runs: 1 POS + 1 NEU = 50%/50%
    // Without scope filter it would be 1 POS + 1 NEU + 1 NEG = 33%/33%/33%
    // The scoped result matches what the narrative page should show
  });
});

// ---------------------------------------------------------------------------
// Cross-route consistency: overview and visibility use same filter
// ---------------------------------------------------------------------------

describe("cross-route consistency", () => {
  const BRAND: BrandScopeIdentity = {
    brandName: "Target",
    brandSlug: "target",
  };

  it("ambiguous brand 'Target' excludes generic uses", () => {
    const validAboutStore = makeRun({
      rawResponseText: "Target is a major retail chain. Target operates 1,900+ stores across the US.",
      analysisJson: { brandMentioned: true, competitors: [{ name: "Walmart" }] },
    });
    const genericUse = makeRun({
      rawResponseText: "To target your audience, use social media advertising.",
      analysisJson: { brandMentioned: false, competitors: [] },
    });

    const result = filterRunsToBrandScope([validAboutStore, genericUse], BRAND);
    assert.equal(result.length, 1);
    assert.ok(result.includes(validAboutStore));
  });

  it("filtered runs produce consistent metrics across routes", () => {
    const valid = makeRun({
      rawResponseText: "Target opened new stores. Target reported strong earnings.",
      analysisJson: { brandMentioned: true, competitors: [{ name: "Walmart" }, { name: "Costco" }] },
    });
    const unrelated1 = makeRun({
      rawResponseText: "The target market for this product is young professionals.",
      analysisJson: { brandMentioned: false, competitors: [] },
    });
    const unrelated2 = makeRun({
      rawResponseText: "Set a target for your savings plan.",
      analysisJson: null,
    });

    const scoped = filterRunsToBrandScope([valid, unrelated1, unrelated2], BRAND);
    // Only the valid run survives — same filter used by overview, visibility, narrative, sources
    assert.equal(scoped.length, 1);
    assert.ok(scoped.includes(valid));
  });
});
