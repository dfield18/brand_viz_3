import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractNarrativeForRun } from "./extractNarrative";

describe("extractNarrativeForRun", () => {
  it("returns neutral sentiment for empty text", async () => {
    const result = await extractNarrativeForRun("", "TestBrand", "testbrand");
    assert.equal(result.sentiment.label, "NEU");
    assert.equal(result.authoritySignals, 0);
    assert.equal(result.themes.length, 0);
    assert.equal(result.descriptors.length, 0);
    assert.equal(result.claims.length, 0);
  });

  it("returns neutral sentiment when brand not mentioned", async () => {
    const result = await extractNarrativeForRun(
      "This is a response that talks about various things but never mentions the entity.",
      "TestBrand",
      "testbrand",
    );
    assert.equal(result.sentiment.label, "NEU");
    assert.equal(result.themes.length, 0);
  });

  it("detects positive sentiment from authority and trust signals", async () => {
    const text = `TestBrand is a trusted leader in the market. TestBrand is the best and most reliable option. TestBrand is widely recognized as a top brand.`;
    const result = await extractNarrativeForRun(text, "TestBrand", "testbrand");
    assert.equal(result.sentiment.label, "POS");
    assert.ok(result.authoritySignals >= 1, "Should detect authority signals");
    assert.ok(result.trustSignals >= 1, "Should detect trust signals");
  });

  it("detects negative sentiment from weakness signals", async () => {
    const text = `TestBrand is expensive and lacks features. TestBrand has limited options and is considered outdated. TestBrand is complex and has poor support.`;
    const result = await extractNarrativeForRun(text, "TestBrand", "testbrand");
    assert.equal(result.sentiment.label, "NEG");
    assert.ok(result.weaknessSignals >= 1, "Should detect weakness signals");
  });

  it("extracts themes from keyword matches", async () => {
    const text = `TestBrand is known for innovation and cutting-edge technology. TestBrand's pioneering approach uses advanced AI and data-driven solutions. TestBrand is innovative.`;
    const result = await extractNarrativeForRun(text, "TestBrand", "testbrand");
    const themeKeys = result.themes.map((t: { key: string }) => t.key);
    assert.ok(themeKeys.includes("innovation"), "Should detect innovation theme");
    assert.ok(themeKeys.includes("technology"), "Should detect technology theme");
  });

  it("extracts descriptors from adjective patterns", async () => {
    const text = `TestBrand is reliable and innovative. TestBrand is sustainable.`;
    const result = await extractNarrativeForRun(text, "TestBrand", "testbrand");
    assert.ok(result.descriptors.length > 0, "Should extract descriptors");
    const words = result.descriptors.map((d: { word: string }) => d.word);
    assert.ok(words.includes("reliable"), "Should extract 'reliable'");
  });

  it("extracts strength claims", async () => {
    const text = `TestBrand is a trusted leader in sustainable practices. TestBrand is recognized as the best in class.`;
    const result = await extractNarrativeForRun(text, "TestBrand", "testbrand");
    const strengths = result.claims.filter((c: { type: string }) => c.type === "strength");
    assert.ok(strengths.length > 0, "Should extract strength claims");
  });

  it("extracts weakness claims", async () => {
    const text = `TestBrand is expensive and overpriced. TestBrand lacks features compared to competitors.`;
    const result = await extractNarrativeForRun(text, "TestBrand", "testbrand");
    const weaknesses = result.claims.filter((c: { type: string }) => c.type === "weakness");
    assert.ok(weaknesses.length > 0, "Should extract weakness claims");
  });

  it("handles brand slug matching", async () => {
    const text = `testbrand is a leader in innovation.`;
    const result = await extractNarrativeForRun(text, "TestBrand", "testbrand");
    assert.ok(result.authoritySignals >= 1 || result.themes.length > 0, "Should detect brand via slug");
  });

  it("limits themes to top 5", async () => {
    // Construct text that triggers many themes
    const text = `TestBrand excels in innovation, quality, sustainability, pricing, market leadership, customer experience, trust, technology, brand reputation, social impact, and global reach. TestBrand is innovative, premium, sustainable, affordable, leading, and reliable.`;
    const result = await extractNarrativeForRun(text, "TestBrand", "testbrand");
    assert.ok(result.themes.length <= 5, "Should limit to 5 themes");
  });
});
