import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyPromptTopic } from "./extractTopic";

describe("classifyPromptTopic", () => {
  it("classifies brand reputation prompts", () => {
    const result = classifyPromptTopic("What is {brand} known for?");
    assert.equal(result.topicKey, "brand_reputation");
    assert.ok(result.confidence > 0);
  });

  it("classifies competitive comparison prompts", () => {
    const result = classifyPromptTopic("{brand} vs competitors in the market");
    assert.equal(result.topicKey, "competitive_comparison");
  });

  it("classifies sustainability prompts", () => {
    const result = classifyPromptTopic("How sustainable is {brand}? What is their environmental impact?");
    assert.equal(result.topicKey, "sustainability");
  });

  it("classifies brand discovery prompts", () => {
    const result = classifyPromptTopic("Which brands are similar to {brand}?");
    assert.equal(result.topicKey, "brand_discovery");
  });

  it("classifies market position prompts", () => {
    const result = classifyPromptTopic("What are the top EV companies?");
    assert.equal(result.topicKey, "market_position");
  });

  it("classifies product quality prompts", () => {
    const result = classifyPromptTopic("How reliable are {brand} products?");
    assert.equal(result.topicKey, "product_quality");
  });

  it("classifies customer experience prompts", () => {
    const result = classifyPromptTopic("What is {brand} customer service like?");
    assert.equal(result.topicKey, "customer_experience");
  });

  it("classifies innovation prompts", () => {
    const result = classifyPromptTopic("What AI technology does {brand} use?");
    assert.equal(result.topicKey, "innovation");
  });

  it("classifies pricing prompts", () => {
    const result = classifyPromptTopic("Is {brand} worth the price? Are they affordable?");
    assert.equal(result.topicKey, "pricing_value");
  });

  it("classifies trust prompts", () => {
    const result = classifyPromptTopic("Can I trust {brand} with my data? Are they credible?");
    assert.equal(result.topicKey, "trust_reliability");
  });

  it("strips {brand} before classification", () => {
    const result = classifyPromptTopic("{brand} reputation and identity");
    assert.equal(result.topicKey, "brand_reputation");
    // Should not be confused by {brand} text itself
  });

  it("returns other for unclassifiable text", () => {
    const result = classifyPromptTopic("xyzzy foobar baz");
    assert.equal(result.topicKey, "other");
    assert.equal(result.confidence, 0);
  });

  it("handles empty string", () => {
    const result = classifyPromptTopic("");
    assert.equal(result.topicKey, "other");
  });

  it("is case-insensitive", () => {
    const result = classifyPromptTopic("WHAT IS {BRAND} KNOWN FOR?");
    assert.equal(result.topicKey, "brand_reputation");
  });

  it("returns confidence based on keyword hits", () => {
    // More keyword hits → higher confidence
    const few = classifyPromptTopic("What is {brand} reputation?");
    const many = classifyPromptTopic("{brand} reputation identity brand image perception");
    assert.ok(many.confidence >= few.confidence);
  });

  it("returns topicLabel matching taxonomy", () => {
    const result = classifyPromptTopic("What is {brand} known for?");
    assert.equal(result.topicLabel, "Brand Reputation & Identity");
  });

  // Missing category tests
  it("classifies industry trends prompts", () => {
    const result = classifyPromptTopic("What are the future trends and outlook for this industry?");
    assert.equal(result.topicKey, "industry_trends");
  });

  it("classifies social impact prompts", () => {
    const result = classifyPromptTopic("How ethical is {brand}? What about diversity and inclusion?");
    assert.equal(result.topicKey, "social_impact");
  });

  it("classifies use cases prompts", () => {
    const result = classifyPromptTopic("What are the best use cases for {brand}? When to use it?");
    assert.equal(result.topicKey, "use_cases");
  });

  it("classifies seasonal prompts", () => {
    const result = classifyPromptTopic("Best {brand} products for winter road trips?");
    assert.equal(result.topicKey, "seasonal_contextual");
  });

  // Edge cases
  it("handles special characters in input", () => {
    const result = classifyPromptTopic("What's {brand}'s reputation? #1 rated! @mention");
    assert.equal(result.topicKey, "brand_reputation");
  });

  it("handles very long strings", () => {
    const longPrompt = "What is the reputation of {brand} ".repeat(20);
    const result = classifyPromptTopic(longPrompt);
    assert.equal(result.topicKey, "brand_reputation");
    assert.ok(result.confidence > 0);
  });

  it("breaks ties by taxonomy order (first topic wins)", () => {
    // "record" is not a keyword for either; "track record" is trust_reliability
    // but "reputation" is brand_reputation and appears first in taxonomy
    const result = classifyPromptTopic("reputation and trust");
    // brand_reputation has "reputation" (1 hit), trust_reliability has "trust" (1 hit)
    // tie → brand_reputation wins (appears first in taxonomy)
    assert.equal(result.topicKey, "brand_reputation");
  });

  it("handles multiple {brand} tokens", () => {
    const result = classifyPromptTopic("Is {brand} better than {brand} competitors?");
    // After stripping {brand}: "is better than competitors?"
    assert.equal(result.topicKey, "competitive_comparison");
  });
});
