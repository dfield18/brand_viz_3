import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateProminenceScores } from "./prominence";

describe("calculateProminenceScores", () => {
  it("returns empty array when no entities provided", () => {
    const results = calculateProminenceScores({
      responseText: "Some text about nothing.",
      entities: [],
    });
    assert.equal(results.length, 0);
  });

  it("returns empty array when response text is empty", () => {
    const results = calculateProminenceScores({
      responseText: "",
      entities: [{ entityId: "nike", name: "Nike", variants: ["Nike"] }],
    });
    assert.equal(results.length, 0);
  });

  it("returns all zeros when entity is not mentioned", () => {
    const results = calculateProminenceScores({
      responseText: "This is a response about running shoes and athletic wear.",
      entities: [{ entityId: "nike", name: "Nike", variants: ["Nike"] }],
    });
    assert.equal(results.length, 1);
    assert.equal(results[0].frequency, 0);
    assert.equal(results[0].position, 0);
    assert.equal(results[0].depth, 0);
    assert.equal(results[0].structure, 0);
    assert.equal(results[0].prominence, 0);
  });

  it("scores early mention higher position than late mention", () => {
    const earlyText = "Nike is a leading brand. " + "x ".repeat(200) + "That is all.";
    const lateText = "x ".repeat(200) + "Nike is a leading brand. That is all.";

    const earlyResults = calculateProminenceScores({
      responseText: earlyText,
      entities: [{ entityId: "nike", name: "Nike", variants: ["Nike"] }],
    });
    const lateResults = calculateProminenceScores({
      responseText: lateText,
      entities: [{ entityId: "nike", name: "Nike", variants: ["Nike"] }],
    });

    assert.ok(
      earlyResults[0].position > lateResults[0].position,
      `Early position (${earlyResults[0].position}) should be > late position (${lateResults[0].position})`,
    );
  });

  it("scores higher frequency for entity mentioned more times", () => {
    const text =
      "Nike makes great shoes. Nike also makes apparel. Nike dominates. " +
      "Adidas makes one product.";

    const results = calculateProminenceScores({
      responseText: text,
      entities: [
        { entityId: "nike", name: "Nike", variants: ["Nike"] },
        { entityId: "adidas", name: "Adidas", variants: ["Adidas"] },
      ],
    });

    const nike = results.find((r) => r.entityId === "nike")!;
    const adidas = results.find((r) => r.entityId === "adidas")!;

    assert.ok(
      nike.frequency > adidas.frequency,
      `Nike frequency (${nike.frequency}) should be > Adidas frequency (${adidas.frequency})`,
    );
  });

  it("computes higher depth for entity in multiple long sentences", () => {
    const deepText =
      "Nike is known for innovative athletic footwear and sportswear design. " +
      "Nike has sponsored many of the world's top athletes across various sports. " +
      "Other brands exist too.";

    const shallowText =
      "Nike exists. " +
      "Other brands are known for innovative athletic footwear and sportswear design. " +
      "Other companies have sponsored many athletes across various sports.";

    const deepResults = calculateProminenceScores({
      responseText: deepText,
      entities: [{ entityId: "nike", name: "Nike", variants: ["Nike"] }],
    });
    const shallowResults = calculateProminenceScores({
      responseText: shallowText,
      entities: [{ entityId: "nike", name: "Nike", variants: ["Nike"] }],
    });

    assert.ok(
      deepResults[0].depth > shallowResults[0].depth,
      `Deep depth (${deepResults[0].depth}) should be > shallow depth (${shallowResults[0].depth})`,
    );
  });

  it("gives structure boost for heading and bullet mentions", () => {
    const structuredText =
      "# Nike Overview\n\n" +
      "- Nike is the top brand in athletics\n" +
      "- They lead in innovation\n" +
      "- Revenue is growing\n";

    const plainText =
      "Here is some information. Nike is a brand in athletics. They lead in innovation. Revenue is growing.";

    const structuredResults = calculateProminenceScores({
      responseText: structuredText,
      entities: [{ entityId: "nike", name: "Nike", variants: ["Nike"] }],
    });
    const plainResults = calculateProminenceScores({
      responseText: plainText,
      entities: [{ entityId: "nike", name: "Nike", variants: ["Nike"] }],
    });

    assert.ok(
      structuredResults[0].structure > plainResults[0].structure,
      `Structured (${structuredResults[0].structure}) should be > plain (${plainResults[0].structure})`,
    );
  });

  it("gives recommendation cue boost", () => {
    const recoText = "Nike is the best brand for running shoes. It is the top recommended choice.";
    const neutralText = "Nike makes running shoes. They sell products globally.";

    const recoResults = calculateProminenceScores({
      responseText: recoText,
      entities: [{ entityId: "nike", name: "Nike", variants: ["Nike"] }],
    });
    const neutralResults = calculateProminenceScores({
      responseText: neutralText,
      entities: [{ entityId: "nike", name: "Nike", variants: ["Nike"] }],
    });

    assert.ok(
      recoResults[0].structure > neutralResults[0].structure,
      `Reco structure (${recoResults[0].structure}) should be > neutral (${neutralResults[0].structure})`,
    );
  });

  it("produces a prominence score in [0, 100]", () => {
    const text =
      "# Top Brands\n\n" +
      "- Nike is the best athletic brand globally\n" +
      "- Nike leads in innovation and design\n" +
      "- Nike sponsors top athletes worldwide\n" +
      "- Nike revenue continues to grow\n\n" +
      "Nike is the recommended choice for serious athletes.";

    const results = calculateProminenceScores({
      responseText: text,
      entities: [{ entityId: "nike", name: "Nike", variants: ["Nike"] }],
    });

    assert.ok(results[0].prominence >= 0, "Prominence should be >= 0");
    assert.ok(results[0].prominence <= 100, "Prominence should be <= 100");
    assert.ok(results[0].prominence > 0, "Prominence should be > 0 for a heavily mentioned entity");
  });

  it("handles case-insensitive variant matching", () => {
    const text = "nike makes great shoes. NIKE is also a tech company. Nike leads.";

    const results = calculateProminenceScores({
      responseText: text,
      entities: [{ entityId: "nike", name: "Nike", variants: ["Nike", "NIKE", "nike"] }],
    });

    assert.ok(results[0].frequency > 0, "Should find case-insensitive matches");
  });

  it("handles entities with special characters", () => {
    const text = "AT&T provides telecommunications services. AT&T is a major carrier.";

    const results = calculateProminenceScores({
      responseText: text,
      entities: [{ entityId: "att", name: "AT&T", variants: ["AT&T"] }],
    });

    assert.ok(results[0].frequency > 0, "Should match entities with special chars");
  });
});
