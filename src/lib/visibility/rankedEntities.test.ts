import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getRankedEntitiesForRun, getTopBrandsForRun } from "./rankedEntities";

const RESPONSE_TEXT = `Here are the top companies in software:

1. **Microsoft** is a dominant force in the software industry.
2. **Alphabet Inc.** (Google) is a significant player.
3. **Oracle** offers enterprise database solutions.
4. **Salesforce** leads in CRM.
5. **SAP** is strong in ERP.`;

describe("getRankedEntitiesForRun", () => {
  it("returns entities in text order", () => {
    const result = getRankedEntitiesForRun({
      rawResponseText: RESPONSE_TEXT,
      analysisJson: {
        competitors: [
          { name: "Oracle" },
          { name: "Microsoft" },
          { name: "Salesforce" },
        ],
      },
      brandName: "SAP",
      brandSlug: "sap",
      includeBrand: true,
    });

    assert.equal(result[0].name, "Microsoft");
    assert.equal(result[1].name, "Oracle");
    assert.equal(result[2].name, "Salesforce");
    assert.equal(result[3].name, "SAP");
    assert.equal(result.length, 4);
  });

  it("excludes brand when includeBrand=false", () => {
    const result = getRankedEntitiesForRun({
      rawResponseText: RESPONSE_TEXT,
      analysisJson: { competitors: [{ name: "Microsoft" }, { name: "Oracle" }] },
      brandName: "SAP",
      brandSlug: "sap",
      includeBrand: false,
    });

    assert.ok(!result.find((e) => e.canonicalId === "sap"));
    assert.equal(result[0].name, "Microsoft");
  });

  it("only includes entities present in the text", () => {
    const result = getRankedEntitiesForRun({
      rawResponseText: "Microsoft is great. Oracle is good.",
      analysisJson: {
        competitors: [
          { name: "Microsoft" },
          { name: "NotInText" },
          { name: "Oracle" },
        ],
      },
      brandName: "TestBrand",
      brandSlug: "testbrand",
      includeBrand: false,
    });

    assert.equal(result.length, 2);
    assert.equal(result[0].name, "Microsoft");
    assert.equal(result[1].name, "Oracle");
  });

  it("deduplicates name variations", () => {
    const result = getRankedEntitiesForRun({
      rawResponseText: "Apple Inc. leads the market. Apple is innovative.",
      analysisJson: {
        competitors: [
          { name: "Apple" },
          { name: "Apple Inc." },
        ],
      },
      brandName: "TestBrand",
      brandSlug: "testbrand",
      includeBrand: false,
    });

    // Should only have one Apple entry
    assert.equal(result.length, 1);
  });

  it("applies alias map for canonicalization", () => {
    const aliasMap = new Map([
      ["hp", "hp"],
      ["hp inc.", "hp"],
    ]);
    const result = getRankedEntitiesForRun({
      rawResponseText: "HP Inc. makes great laptops.",
      analysisJson: {
        competitors: [{ name: "HP" }, { name: "HP Inc." }],
      },
      brandName: "Dell",
      brandSlug: "dell",
      includeBrand: false,
      aliasMap,
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].canonicalId, "hp");
  });

  it("excludes focal brand aliases", () => {
    const aliasMap = new Map([
      ["microsoft", "microsoft"],
      ["microsoft corp.", "microsoft"],
    ]);
    const result = getRankedEntitiesForRun({
      rawResponseText: "Microsoft Corp. and Google are top.",
      analysisJson: {
        competitors: [{ name: "Microsoft Corp." }, { name: "Google" }],
      },
      brandName: "Microsoft",
      brandSlug: "microsoft",
      includeBrand: false,
      aliasMap,
    });

    assert.ok(!result.find((e) => e.canonicalId === "microsoft"));
    assert.equal(result.length, 1);
    assert.equal(result[0].name, "Google");
  });

  it("respects limit", () => {
    const result = getRankedEntitiesForRun({
      rawResponseText: "A B C D E F G",
      analysisJson: {
        competitors: "ABCDEFG".split("").map((n) => ({ name: n })),
      },
      brandName: "TestBrand",
      brandSlug: "testbrand",
      includeBrand: false,
      limit: 3,
    });

    assert.equal(result.length, 3);
  });

  it("matches CSV export semantics (getTopBrandsForRun)", () => {
    const brands = getTopBrandsForRun({
      rawResponseText: RESPONSE_TEXT,
      analysisJson: {
        competitors: [
          { name: "Oracle" },
          { name: "Microsoft" },
          { name: "Salesforce" },
        ],
      },
      brandName: "SAP",
      brandSlug: "sap",
      includeBrand: true,
      limit: 5,
    });

    // Same order as text: Microsoft, Oracle, Salesforce, SAP
    assert.deepEqual(brands, ["Microsoft", "Oracle", "Salesforce", "SAP"]);
  });
});
