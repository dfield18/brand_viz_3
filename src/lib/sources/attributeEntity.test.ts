import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { attributeEntitiesToUrls, buildEntityList } from "./attributeEntity";
import type { ExtractedUrl } from "./parseUrls";

function makeUrl(pos: number, domain = "example.com"): ExtractedUrl {
  return {
    originalUrl: `https://${domain}/page`,
    normalizedUrl: `https://${domain}/page`,
    domain,
    sourceType: "bare_url",
    positionIndex: pos,
  };
}

describe("attributeEntitiesToUrls", () => {
  it("attributes when single entity is nearby", () => {
    const text = "Nike is a great brand. Check https://example.com/page for more info.";
    const urls = [makeUrl(text.indexOf("https://"))];
    const entities = [{ entityId: "nike", name: "Nike", variants: ["Nike", "nike"] }];

    const result = attributeEntitiesToUrls({ responseText: text, urls, entities });
    assert.equal(result.length, 1);
    assert.equal(result[0].entityId, "nike");
  });

  it("returns null when no entity is nearby", () => {
    const text = "Some unrelated text with a link https://example.com/page in the middle.";
    const urls = [makeUrl(text.indexOf("https://"))];
    const entities = [{ entityId: "nike", name: "Nike", variants: ["Nike", "nike"] }];

    const result = attributeEntitiesToUrls({ responseText: text, urls, entities });
    assert.equal(result[0].entityId, null);
  });

  it("returns null when multiple entities are nearby (ambiguous)", () => {
    const text = "Nike and Adidas both are mentioned here https://example.com/page for comparison.";
    const urls = [makeUrl(text.indexOf("https://"))];
    const entities = [
      { entityId: "nike", name: "Nike", variants: ["Nike", "nike"] },
      { entityId: "adidas", name: "Adidas", variants: ["Adidas", "adidas"] },
    ];

    const result = attributeEntitiesToUrls({ responseText: text, urls, entities });
    assert.equal(result[0].entityId, null);
  });

  it("is case-insensitive", () => {
    const text = "NIKE products are available at https://example.com/page for purchase.";
    const urls = [makeUrl(text.indexOf("https://"))];
    const entities = [{ entityId: "nike", name: "Nike", variants: ["Nike", "nike"] }];

    const result = attributeEntitiesToUrls({ responseText: text, urls, entities });
    assert.equal(result[0].entityId, "nike");
  });

  it("respects the 300-char window boundary", () => {
    // Entity is > 300 chars before the URL — should not attribute
    const padding = "x".repeat(350);
    const text = `Nike ${padding} https://example.com/page for details.`;
    const urls = [makeUrl(text.indexOf("https://"))];
    const entities = [{ entityId: "nike", name: "Nike", variants: ["Nike", "nike"] }];

    const result = attributeEntitiesToUrls({ responseText: text, urls, entities });
    assert.equal(result[0].entityId, null);
  });

  it("attributes within 300-char window", () => {
    const padding = "x".repeat(250);
    const text = `Nike ${padding} https://example.com/page for details.`;
    const urls = [makeUrl(text.indexOf("https://"))];
    const entities = [{ entityId: "nike", name: "Nike", variants: ["Nike", "nike"] }];

    const result = attributeEntitiesToUrls({ responseText: text, urls, entities });
    assert.equal(result[0].entityId, "nike");
  });

  it("handles multiple URLs with different entities", () => {
    const text = "Nike sells shoes at https://nike.com and Adidas sells shoes at https://adidas.com for comparison.";
    const urls = [
      makeUrl(text.indexOf("https://nike.com"), "nike.com"),
      makeUrl(text.indexOf("https://adidas.com"), "adidas.com"),
    ];
    const entities = [
      { entityId: "nike", name: "Nike", variants: ["Nike", "nike"] },
      { entityId: "adidas", name: "Adidas", variants: ["Adidas", "adidas"] },
    ];

    const result = attributeEntitiesToUrls({ responseText: text, urls, entities });
    // Both entities are within 300 chars of both URLs in this short text,
    // so both should be null (ambiguous)
    assert.equal(result[0].entityId, null);
    assert.equal(result[1].entityId, null);
  });
});

describe("buildEntityList", () => {
  it("includes brand as first entity", () => {
    const entities = buildEntityList("Nike", "nike", null);
    assert.equal(entities.length, 1);
    assert.equal(entities[0].entityId, "nike");
    assert.equal(entities[0].name, "Nike");
    assert.ok(entities[0].variants.includes("Nike"));
  });

  it("extracts competitors from analysisJson", () => {
    const analysis = {
      competitors: [
        { name: "Adidas" },
        { name: "Puma" },
      ],
    };
    const entities = buildEntityList("Nike", "nike", analysis);
    assert.equal(entities.length, 3); // Nike + Adidas + Puma
    assert.equal(entities[1].entityId, "adidas");
    assert.equal(entities[2].entityId, "puma");
  });

  it("handles null/missing analysisJson", () => {
    const entities = buildEntityList("Nike", "nike", null);
    assert.equal(entities.length, 1);
  });

  it("skips competitors with same name as brand", () => {
    const analysis = {
      competitors: [
        { name: "Nike" }, // same as brand, should be skipped
        { name: "Adidas" },
      ],
    };
    const entities = buildEntityList("Nike", "nike", analysis);
    assert.equal(entities.length, 2); // Nike + Adidas only
  });

  it("handles malformed competitors array", () => {
    const analysis = {
      competitors: [null, {}, { name: "Adidas" }],
    };
    const entities = buildEntityList("Nike", "nike", analysis);
    assert.equal(entities.length, 2); // Nike + Adidas
  });
});
