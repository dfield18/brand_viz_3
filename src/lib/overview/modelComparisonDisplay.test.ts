import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sentimentLabel, stabilityLabel } from "./modelComparisonDisplay";

describe("sentimentLabel", () => {
  it("shows dominant neutral", () => {
    assert.equal(sentimentLabel({ positive: 13, neutral: 75, negative: 13 }), "75% Neutral");
  });

  it("shows dominant positive", () => {
    assert.equal(sentimentLabel({ positive: 60, neutral: 30, negative: 10 }), "60% Positive");
  });

  it("shows dominant negative", () => {
    assert.equal(sentimentLabel({ positive: 10, neutral: 20, negative: 70 }), "70% Negative");
  });

  it("shows Mixed for near three-way tie", () => {
    assert.equal(sentimentLabel({ positive: 35, neutral: 33, negative: 32 }), "Mixed");
  });

  it("returns dash for null/undefined", () => {
    assert.equal(sentimentLabel(null), "\u2014");
    assert.equal(sentimentLabel(undefined), "\u2014");
  });
});

describe("stabilityLabel", () => {
  it("High for >= 70", () => {
    assert.equal(stabilityLabel(80), "High");
    assert.equal(stabilityLabel(70), "High");
  });

  it("Medium for >= 40", () => {
    assert.equal(stabilityLabel(50), "Medium");
    assert.equal(stabilityLabel(40), "Medium");
  });

  it("Low for < 40", () => {
    assert.equal(stabilityLabel(20), "Low");
    assert.equal(stabilityLabel(0), "Low");
  });
});
