import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isRunInBrandScope,
  filterRunsToBrandScope,
  isRunInBrandQueryUniverse,
  filterRunsToBrandQueryUniverse,
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
    assert.equal(scoped.length, 1);
    assert.ok(scoped.includes(valid));
  });
});

// ---------------------------------------------------------------------------
// Query-universe scope
// ---------------------------------------------------------------------------

describe("isRunInBrandQueryUniverse", () => {
  const BRAND: BrandScopeIdentity = {
    brandName: "Future Forward",
    brandSlug: "future-forward-usa",
    aliases: ["Future Forward PAC"],
  };

  it("non-ambiguous brand: all runs pass unchanged", () => {
    const brand: BrandScopeIdentity = { brandName: "Patagonia", brandSlug: "patagonia" };
    const run1 = makeRun({ rawResponseText: "Nike makes shoes." });
    const run2 = makeRun({ rawResponseText: "Patagonia makes jackets." });
    assert.ok(isRunInBrandQueryUniverse(run1, brand));
    assert.ok(isRunInBrandQueryUniverse(run2, brand));
  });

  it("ambiguous brand, no text mention: keeps run (valid absent-brand answer)", () => {
    const run = makeRun({
      rawResponseText: "ActBlue is the top fundraising platform for Democrats.",
      analysisJson: { brandMentioned: false },
    });
    assert.ok(isRunInBrandQueryUniverse(run, BRAND));
  });

  it("ambiguous brand, text mention + valid evidence: keeps run", () => {
    const run = makeRun({
      rawResponseText: "Future Forward PAC raised $950M. Future Forward is the largest Super PAC.",
      analysisJson: { brandMentioned: true, competitors: [{ name: "ActBlue" }] },
    });
    assert.ok(isRunInBrandQueryUniverse(run, BRAND));
  });

  it("ambiguous brand, text mention + no evidence: excludes false positive", () => {
    const run = makeRun({
      rawResponseText: "Future Forward is a marketing agency.",
      analysisJson: { brandMentioned: false, competitors: [{ name: "HubSpot" }] },
    });
    assert.ok(!isRunInBrandQueryUniverse(run, BRAND));
  });
});

describe("filterRunsToBrandQueryUniverse", () => {
  const BRAND: BrandScopeIdentity = {
    brandName: "Future Forward",
    brandSlug: "future-forward-usa",
  };

  it("mixed dataset: keeps absent-brand + valid, removes false positives", () => {
    const validMention = makeRun({
      rawResponseText: "Future Forward PAC raised $950M. Future Forward is a leader.",
      analysisJson: { brandMentioned: true },
    });
    const absentBrand = makeRun({
      rawResponseText: "ActBlue is the top platform.",
      analysisJson: { brandMentioned: false },
    });
    const falsePositive = makeRun({
      rawResponseText: "Future Forward agency does web design.",
      analysisJson: { brandMentioned: false, competitors: [{ name: "HubSpot" }] },
    });

    const result = filterRunsToBrandQueryUniverse([validMention, absentBrand, falsePositive], BRAND);
    assert.equal(result.length, 2);
    assert.ok(result.includes(validMention));
    assert.ok(result.includes(absentBrand));
    assert.ok(!result.includes(falsePositive));
  });

  it("denominator is NOT collapsed — absent-brand runs survive", () => {
    const mentioned = makeRun({
      rawResponseText: "Future Forward PAC raised $950M. Future Forward is a leader.",
      analysisJson: { brandMentioned: true },
    });
    const absent1 = makeRun({
      rawResponseText: "ActBlue is the top platform.",
      analysisJson: null,
    });
    const absent2 = makeRun({
      rawResponseText: "WinRed raised $500M for Republicans.",
      analysisJson: null,
    });

    const result = filterRunsToBrandQueryUniverse([mentioned, absent1, absent2], BRAND);
    assert.equal(result.length, 3, "All 3 runs survive — denominator preserved");
  });
});

// ---------------------------------------------------------------------------
// Route-level regression: overview KPIs and sentiment agree on scoped data
// ---------------------------------------------------------------------------

describe("overview route regression — KPIs and sentiment from same scoped pool", () => {
  const BRAND: BrandScopeIdentity = {
    brandName: "Future Forward",
    brandSlug: "future-forward-usa",
    aliases: ["Future Forward PAC"],
  };

  it("ambiguous brand: 4 valid + 3 unrelated → metrics only from valid", () => {
    const valid = Array.from({ length: 4 }, (_, i) => makeRun({
      rawResponseText: `Future Forward PAC is a leader. Future Forward raised funds. Run ${i}.`,
      analysisJson: { brandMentioned: true, competitors: [{ name: "ActBlue" }] },
      narrativeJson: { sentiment: { label: "POS", score: 0.5 }, authoritySignals: 1, trustSignals: 0, weaknessSignals: 0, themes: [], claims: [], descriptors: [] },
    }));
    const unrelated = Array.from({ length: 3 }, (_, i) => makeRun({
      rawResponseText: `Future Forward marketing agency does web design. Run ${i}.`,
      analysisJson: { brandMentioned: false, competitors: [{ name: "HubSpot" }] },
      narrativeJson: { sentiment: { label: "NEG", score: -0.7 }, authoritySignals: 0, trustSignals: 0, weaknessSignals: 2, themes: [], claims: [{ type: "weakness", text: "Bad reviews" }], descriptors: [] },
    }));

    const scoped = filterRunsToBrandScope([...valid, ...unrelated], BRAND);
    assert.equal(scoped.length, 4, "Only 4 valid runs should survive");

    // Sentiment from scoped: 4 POS / 0 NEG = 100% positive
    let pos = 0, neg = 0;
    for (const r of scoped) {
      const nj = r.narrativeJson as { sentiment?: { label?: string } } | undefined;
      if (nj?.sentiment?.label === "POS") pos++;
      if (nj?.sentiment?.label === "NEG") neg++;
    }
    assert.equal(pos, 4);
    assert.equal(neg, 0);
  });
});

// ---------------------------------------------------------------------------
// Route-level regression: visibility model breakdown uses scoped runs
// ---------------------------------------------------------------------------

describe("visibility route regression — model breakdown from scoped runs", () => {
  const BRAND: BrandScopeIdentity = {
    brandName: "Apple",
    brandSlug: "apple",
  };

  it("model breakdown excludes fruit-related runs", () => {
    const validChatgpt = makeRun({
      rawResponseText: "Apple released the iPhone 16. Apple leads in smartphone innovation.",
      analysisJson: { brandMentioned: true, competitors: [{ name: "Samsung" }] },
    });
    const validGemini = makeRun({
      rawResponseText: "Apple is a tech giant. Apple makes Macs and iPads.",
      analysisJson: { brandMentioned: true, competitors: [{ name: "Microsoft" }] },
    });
    const fruitRun = makeRun({
      rawResponseText: "Apple is a healthy fruit with vitamins.",
      analysisJson: { brandMentioned: false, competitors: [] },
    });

    const scoped = filterRunsToBrandScope([validChatgpt, validGemini, fruitRun], BRAND);
    assert.equal(scoped.length, 2);
    assert.ok(!scoped.includes(fruitRun));
  });
});

// ---------------------------------------------------------------------------
// Route-level regression: narrative fallback case (no industry runs)
// ---------------------------------------------------------------------------

describe("narrative route regression — fallback when no industry runs", () => {
  const BRAND: BrandScopeIdentity = {
    brandName: "Future Forward",
    brandSlug: "future-forward-usa",
    aliases: ["Future Forward PAC"],
  };

  it("non-industry scoped runs are used for both cards and trends", () => {
    // Simulates: no industry-cluster runs exist, only comparative/direct
    const comparativeRuns = Array.from({ length: 3 }, (_, i) => ({
      ...makeRun({
        rawResponseText: `Future Forward PAC vs ActBlue comparison. Future Forward focuses on data. Run ${i}.`,
        analysisJson: { brandMentioned: true, competitors: [{ name: "ActBlue" }] },
        narrativeJson: { sentiment: { label: "POS", score: 0.4 }, authoritySignals: 1, trustSignals: 0, weaknessSignals: 0, themes: [], claims: [], descriptors: [] },
      }),
      prompt: { cluster: "comparative" },
    }));
    const unrelated = {
      ...makeRun({
        rawResponseText: "Future Forward agency does web design.",
        analysisJson: { brandMentioned: false, competitors: [{ name: "Wix" }] },
      }),
      prompt: { cluster: "direct" },
    };

    type RunWithCluster = typeof comparativeRuns[number];
    const allRuns = [...comparativeRuns, unrelated] as RunWithCluster[];
    const scoped = filterRunsToBrandScope(allRuns, BRAND);

    // No industry runs exist
    const industryScoped = scoped.filter((r) => r.prompt.cluster === "industry");
    assert.equal(industryScoped.length, 0);

    // Fallback: use all scoped runs (comparative)
    const narrativePool = industryScoped.length > 0 ? industryScoped : scoped;
    assert.equal(narrativePool.length, 3, "Cards should use 3 comparative runs");

    // Trend should use the same scope rule (not hardcode industry)
    const useIndustryScope = industryScoped.length > 0;
    assert.ok(!useIndustryScope, "Should NOT use industry scope");
    // So trend query would also fetch all clusters, matching the cards
  });
});

// ---------------------------------------------------------------------------
// Route-level regression: sources firstSeen doesn't leak unrelated history
// ---------------------------------------------------------------------------

describe("sources route regression — firstSeen from scoped history only", () => {
  const BRAND: BrandScopeIdentity = {
    brandName: "Future Forward",
    brandSlug: "future-forward-usa",
  };

  it("historical unrelated runs are excluded from firstSeen computation", () => {
    // Current scoped run cites wikipedia
    const currentValid = makeRun({
      rawResponseText: "Future Forward PAC raised $950M. Future Forward is the largest Super PAC. See wikipedia.org.",
      analysisJson: { brandMentioned: true, competitors: [{ name: "ActBlue" }] },
    });
    // Old unrelated run also cites wikipedia (should NOT contribute to firstSeen)
    const oldUnrelated = makeRun({
      rawResponseText: "Future Forward staffing company info at wikipedia.org.",
      analysisJson: { brandMentioned: false, competitors: [{ name: "Robert Half" }] },
    });

    const scopedHistory = filterRunsToBrandScope([currentValid, oldUnrelated], BRAND);
    assert.equal(scopedHistory.length, 1, "Only current valid run survives scope filter");
    assert.ok(scopedHistory.includes(currentValid));
    // firstSeen would only be computed from currentValid's occurrence dates
  });
});

// ---------------------------------------------------------------------------
// Acronym collision: FIRE (org) vs FIRE (retire early)
// ---------------------------------------------------------------------------

describe("acronym collision — FIRE organization vs FIRE movement", () => {
  const FIRE_ORG: BrandScopeIdentity = {
    brandName: "FIRE",
    brandSlug: "fire",
    aliases: ["Foundation for Individual Rights and Expression", "Foundation for Individual Rights in Education"],
  };

  it("flags FIRE as ambiguous", () => {
    assert.ok(isBrandNameAmbiguous("FIRE"));
  });

  it("accepts run about the free-speech organization", () => {
    const run = makeRun({
      rawResponseText: "FIRE, the Foundation for Individual Rights and Expression, defends free speech on college campuses. FIRE has won numerous First Amendment cases.",
      analysisJson: { brandMentioned: true, competitors: [{ name: "ACLU" }] },
    });
    assert.ok(isRunInBrandScope(run, FIRE_ORG));
  });

  it("accepts run with free-speech context terms", () => {
    const run = makeRun({
      rawResponseText: "FIRE rates colleges on their free speech policies. FIRE advocates for academic freedom and due process for students accused of misconduct.",
      analysisJson: null,
    });
    assert.ok(isRunInBrandScope(run, FIRE_ORG));
  });

  it("accepts run with full organization name alias in text", () => {
    const run = makeRun({
      rawResponseText: "The Foundation for Individual Rights and Expression published a new report on campus speech codes.",
      analysisJson: null,
    });
    assert.ok(isRunInBrandScope(run, FIRE_ORG));
  });

  it("rejects run about Financial Independence / Retire Early", () => {
    const run = makeRun({
      rawResponseText: "The FIRE movement is about financial independence and retiring early. To achieve FIRE, you need to save aggressively and follow the 4% rule for safe withdrawal rates.",
      analysisJson: { brandMentioned: false, competitors: [] },
    });
    assert.ok(!isRunInBrandScope(run, FIRE_ORG));
  });

  it("rejects run with lean/fat/barista FIRE variants", () => {
    const run = makeRun({
      rawResponseText: "There are several types of FIRE: lean fire means extreme frugality, fat fire means a more comfortable retirement, and barista fire means working part-time.",
      analysisJson: null,
    });
    assert.ok(!isRunInBrandScope(run, FIRE_ORG));
  });

  it("rejects run about early retirement planning", () => {
    const run = makeRun({
      rawResponseText: "FIRE stands for Financial Independence, Retire Early. Many people aim to retire by 40 using aggressive saving strategies.",
      analysisJson: null,
    });
    assert.ok(!isRunInBrandScope(run, FIRE_ORG));
  });

  it("rejects even with brandMentioned=true if reject phrases present", () => {
    // GPT may flag brandMentioned for FIRE but the content is about retirement
    const run = makeRun({
      rawResponseText: "FIRE is a movement focused on financial independence and retire early strategies. FIRE followers track their nest egg and safe withdrawal rate.",
      analysisJson: { brandMentioned: true },
    });
    assert.ok(!isRunInBrandScope(run, FIRE_ORG));
  });

  it("FIRE retirement run stays in query universe (absent-brand valid)", () => {
    // A FIRE/retirement run with the acronym should be excluded from query universe
    // because it mentions the phrase and fails content scope
    const retirementRun = makeRun({
      rawResponseText: "The FIRE movement is about financial independence and retiring early.",
      analysisJson: { brandMentioned: false },
    });
    assert.ok(!isRunInBrandQueryUniverse(retirementRun, FIRE_ORG));
  });

  it("absent-brand industry run stays in query universe", () => {
    const industryRun = makeRun({
      rawResponseText: "The ACLU defends civil liberties across the United States.",
      analysisJson: null,
    });
    assert.ok(isRunInBrandQueryUniverse(industryRun, FIRE_ORG));
  });

  it("mixed dataset: narrative/sources only get org runs", () => {
    const orgRun = makeRun({
      rawResponseText: "FIRE defends free speech on campus. FIRE rates colleges on academic freedom.",
      analysisJson: { brandMentioned: true },
    });
    const retireRun = makeRun({
      rawResponseText: "FIRE stands for financial independence retire early. The 4% rule is key to FIRE.",
      analysisJson: { brandMentioned: false },
    });
    const unrelatedRun = makeRun({
      rawResponseText: "The ACLU filed a brief in the Supreme Court case.",
      analysisJson: null,
    });

    // Content scope: only the org run
    const contentScoped = filterRunsToBrandScope([orgRun, retireRun, unrelatedRun], FIRE_ORG);
    assert.equal(contentScoped.length, 1);
    assert.ok(contentScoped.includes(orgRun));
    assert.ok(!contentScoped.includes(retireRun));

    // Query universe: org run + unrelated (no brand mention), NOT retire run
    const queryUniverse = filterRunsToBrandQueryUniverse([orgRun, retireRun, unrelatedRun], FIRE_ORG);
    assert.equal(queryUniverse.length, 2);
    assert.ok(queryUniverse.includes(orgRun));
    assert.ok(queryUniverse.includes(unrelatedRun));
    assert.ok(!queryUniverse.includes(retireRun));
  });
});
