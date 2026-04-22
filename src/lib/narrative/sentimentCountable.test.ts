import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getCountableSentiment } from "./sentimentCountable";

describe("getCountableSentiment", () => {
  it("returns null when narrativeJson is null/undefined", () => {
    assert.equal(getCountableSentiment(null), null);
    assert.equal(getCountableSentiment(undefined), null);
  });

  it("returns null when sentiment is null (subject-not-mentioned, new shape)", () => {
    assert.equal(
      getCountableSentiment({ sentiment: null, themes: [], claims: [], descriptors: [] }),
      null,
    );
  });

  it("returns null for legacy auto-NEU (NEU + all evidence arrays empty)", () => {
    assert.equal(
      getCountableSentiment({
        sentiment: { label: "NEU", score: 0 },
        themes: [],
        claims: [],
        descriptors: [],
      }),
      null,
    );
  });

  it("passes POS through unchanged", () => {
    assert.equal(
      getCountableSentiment({ sentiment: { label: "POS", score: 0.6 }, themes: [{}], claims: [], descriptors: [] }),
      "POS",
    );
  });

  it("passes NEG through unchanged", () => {
    assert.equal(
      getCountableSentiment({ sentiment: { label: "NEG", score: -0.6 }, themes: [{}], claims: [], descriptors: [] }),
      "NEG",
    );
  });

  it("re-derives legacy NEU to POS when descriptors skew positive", () => {
    const nj = {
      sentiment: { label: "NEU", score: 0 },
      themes: [{ key: "advocacy" }],
      claims: [],
      descriptors: [
        { word: "progressive", polarity: "positive", count: 3 },
        { word: "respected", polarity: "positive", count: 2 },
        { word: "controversial", polarity: "negative", count: 1 },
      ],
    };
    assert.equal(getCountableSentiment(nj), "POS");
  });

  it("re-derives legacy NEU to NEG when descriptors skew negative", () => {
    const nj = {
      sentiment: { label: "NEU", score: 0 },
      themes: [{ key: "reputation" }],
      claims: [],
      descriptors: [
        { word: "scandalous", polarity: "negative", count: 2 },
        { word: "criticized", polarity: "negative", count: 2 },
        { word: "popular", polarity: "positive", count: 1 },
      ],
    };
    assert.equal(getCountableSentiment(nj), "NEG");
  });

  it("re-derives legacy NEU via claim types when descriptors are absent", () => {
    const nj = {
      sentiment: { label: "NEU", score: 0 },
      themes: [{ key: "record" }],
      claims: [
        { type: "strength", text: "…" },
        { type: "strength", text: "…" },
        { type: "weakness", text: "…" },
      ],
      descriptors: [],
    };
    assert.equal(getCountableSentiment(nj), "POS");
  });

  it("keeps NEU when descriptor polarity is balanced", () => {
    const nj = {
      sentiment: { label: "NEU", score: 0 },
      themes: [{ key: "mixed" }],
      claims: [],
      descriptors: [
        { word: "supported", polarity: "positive", count: 2 },
        { word: "criticized", polarity: "negative", count: 2 },
      ],
    };
    assert.equal(getCountableSentiment(nj), "NEU");
  });

  it("keeps NEU when evidence is below the minimum count threshold", () => {
    const nj = {
      sentiment: { label: "NEU", score: 0 },
      themes: [{ key: "record" }],
      claims: [],
      descriptors: [{ word: "pragmatic", polarity: "positive", count: 1 }],
    };
    // Only 1 evidence item — not enough to flip.
    assert.equal(getCountableSentiment(nj), "NEU");
  });

  it("ignores neutral-polarity descriptors in the tally", () => {
    const nj = {
      sentiment: { label: "NEU", score: 0 },
      themes: [{ key: "record" }],
      claims: [],
      descriptors: [
        { word: "senior", polarity: "neutral", count: 5 },
        { word: "championed", polarity: "positive", count: 2 },
        { word: "endorsed", polarity: "positive", count: 1 },
      ],
    };
    assert.equal(getCountableSentiment(nj), "POS");
  });

  it("returns null when stored label is malformed", () => {
    assert.equal(
      getCountableSentiment({ sentiment: { label: "WEIRD", score: 0 } }),
      null,
    );
  });
});
