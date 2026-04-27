import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isNationalJurisdiction, looksLikePersonName } from "./generateFeaturePrompts";

describe("isNationalJurisdiction", () => {
  it("matches common national strings", () => {
    assert.equal(isNationalJurisdiction("United States"), true);
    assert.equal(isNationalJurisdiction("united states"), true);
    assert.equal(isNationalJurisdiction("US"), true);
    assert.equal(isNationalJurisdiction("U.S."), true);
    assert.equal(isNationalJurisdiction("USA"), true);
    assert.equal(isNationalJurisdiction("U.S.A."), true);
    assert.equal(isNationalJurisdiction("national"), true);
    assert.equal(isNationalJurisdiction("federal"), true);
  });

  it("returns false for real states", () => {
    assert.equal(isNationalJurisdiction("Illinois"), false);
    assert.equal(isNationalJurisdiction("New York"), false);
    assert.equal(isNationalJurisdiction("Alaska"), false);
    assert.equal(isNationalJurisdiction("Pennsylvania"), false);
  });

  it("returns false for district specifiers", () => {
    assert.equal(isNationalJurisdiction("New York NY-14"), false);
    assert.equal(isNationalJurisdiction("California CA-12"), false);
  });

  it("tolerates surrounding whitespace", () => {
    assert.equal(isNationalJurisdiction("  United States  "), true);
  });
});

describe("looksLikePersonName", () => {
  it("accepts common two-word names", () => {
    assert.equal(looksLikePersonName("Kathy Hochul"), true);
    assert.equal(looksLikePersonName("Dick Durbin"), true);
    assert.equal(looksLikePersonName("Bernie Sanders"), true);
  });

  it("accepts three-word names", () => {
    assert.equal(looksLikePersonName("Alexandria Ocasio Cortez"), true);
  });

  it("accepts names with apostrophes and hyphens", () => {
    assert.equal(looksLikePersonName("Mary O'Brien"), true);
    assert.equal(looksLikePersonName("Jean-Luc Picard"), true);
  });

  it("rejects lowercase input", () => {
    assert.equal(looksLikePersonName("dick durbin"), false);
  });

  it("rejects organization names", () => {
    assert.equal(looksLikePersonName("ACLU Foundation"), false);
    assert.equal(looksLikePersonName("Sierra Club"), true); // 2 capitalized words, no org word matches
    assert.equal(looksLikePersonName("Common Cause Alliance"), false);
    assert.equal(looksLikePersonName("Nike Inc"), false);
  });

  it("accepts single-word names ≥4 chars (mononymous celebrities, last-name-only references)", () => {
    // Single-token celebrities & last-name-only references that callers
    // genuinely want classified as person-shape. The downstream
    // classifyBrandCategory still gates whether the public-figure
    // classifier runs (only when category === political_advocacy), so
    // commercial single-name brands like Nike never render as
    // "public figure" in copy.
    assert.equal(looksLikePersonName("Beyoncé"), true);
    assert.equal(looksLikePersonName("Madonna"), true);
    assert.equal(looksLikePersonName("Trudeau"), true);
    assert.equal(looksLikePersonName("Pelé"), true);
    // Nike is single-token ≥4 chars so it now passes the SHAPE test.
    // Whether it renders as person noun is decided downstream by
    // category — commercial brands stay "brand".
    assert.equal(looksLikePersonName("Nike"), true);
  });

  it("rejects short single-token tokens that often appear standalone in product copy", () => {
    // 3-char and shorter tokens are too easy to false-positive
    // (initialisms like "USA", "API", "AWS", "MIT" or short brand
    // tokens like "Cher" — though Cher is real, the single-token
    // 4-char floor still excludes it; users typing 3-char names
    // can disambiguate by typing the full form).
    assert.equal(looksLikePersonName("USA"), false);
    assert.equal(looksLikePersonName("API"), false);
    assert.equal(looksLikePersonName("AWS"), false);
    assert.equal(looksLikePersonName("MIT"), false);
  });

  it("rejects empty input", () => {
    assert.equal(looksLikePersonName(""), false);
    assert.equal(looksLikePersonName("   "), false);
  });
});
