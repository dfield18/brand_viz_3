import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalizeEntityId, buildDeterministicAliasMap } from "./canonicalize";

describe("canonicalizeEntityId", () => {
  it("lowercases", () => {
    assert.equal(canonicalizeEntityId("Apple"), "apple");
  });

  it("strips trailing Inc.", () => {
    assert.equal(canonicalizeEntityId("HP Inc."), "hp");
    assert.equal(canonicalizeEntityId("apple inc."), "apple");
    assert.equal(canonicalizeEntityId("Apple Inc"), "apple");
  });

  it("strips trailing Corp / Corp.", () => {
    assert.equal(canonicalizeEntityId("Acme Corp"), "acme");
    assert.equal(canonicalizeEntityId("Acme Corp."), "acme");
  });

  it("strips trailing Corporation", () => {
    assert.equal(canonicalizeEntityId("Acme Corporation"), "acme");
  });

  it("strips trailing Group", () => {
    assert.equal(canonicalizeEntityId("Lenovo Group"), "lenovo");
  });

  it("strips trailing Company", () => {
    assert.equal(canonicalizeEntityId("The Ford Motor Company"), "ford motor");
  });

  it("strips trailing Ltd / Ltd.", () => {
    assert.equal(canonicalizeEntityId("Samsung Electronics Ltd."), "samsung electronics");
    assert.equal(canonicalizeEntityId("Samsung Electronics Ltd"), "samsung electronics");
  });

  it("strips trailing LLC", () => {
    assert.equal(canonicalizeEntityId("SpaceX LLC"), "spacex");
  });

  it("strips trailing Holdings", () => {
    assert.equal(canonicalizeEntityId("Alphabet Holdings"), "alphabet");
  });

  it("strips trailing Technologies", () => {
    assert.equal(canonicalizeEntityId("Dell Technologies"), "dell");
  });

  it("strips trailing International", () => {
    assert.equal(canonicalizeEntityId("Marriott International"), "marriott");
  });

  it("strips leading 'the'", () => {
    assert.equal(canonicalizeEntityId("The Walt Disney Company"), "walt disney");
  });

  it("strips multiple trailing suffixes iteratively", () => {
    assert.equal(canonicalizeEntityId("Acme Corp. Inc."), "acme");
  });

  it("does NOT strip suffix that would leave empty string", () => {
    // "Group" alone → keep it (it IS the name)
    assert.equal(canonicalizeEntityId("Group"), "group");
  });

  it("collapses whitespace", () => {
    assert.equal(canonicalizeEntityId("  HP   Inc.  "), "hp");
  });

  it("trims trailing punctuation", () => {
    assert.equal(canonicalizeEntityId("Apple,"), "apple");
    assert.equal(canonicalizeEntityId("Apple."), "apple");
  });

  it("preserves meaningful multi-word names", () => {
    assert.equal(canonicalizeEntityId("Ben & Jerry's"), "ben & jerry's");
    assert.equal(canonicalizeEntityId("Procter & Gamble"), "procter & gamble");
  });
});

describe("buildDeterministicAliasMap", () => {
  it("merges HP + HP Inc.", () => {
    const map = buildDeterministicAliasMap(["hp", "hp inc."]);
    assert.equal(map.get("hp"), "hp");
    assert.equal(map.get("hp inc."), "hp");
  });

  it("merges Apple + Apple Inc.", () => {
    const map = buildDeterministicAliasMap(["apple", "apple inc."]);
    assert.equal(map.get("apple"), "apple");
    assert.equal(map.get("apple inc."), "apple");
  });

  it("merges Lenovo + Lenovo Group", () => {
    const map = buildDeterministicAliasMap(["lenovo", "lenovo group"]);
    assert.equal(map.get("lenovo"), "lenovo");
    assert.equal(map.get("lenovo group"), "lenovo");
  });

  it("merges Dell + Dell Technologies", () => {
    const map = buildDeterministicAliasMap(["dell", "dell technologies"]);
    assert.equal(map.get("dell"), "dell");
    assert.equal(map.get("dell technologies"), "dell");
  });

  it("merges Acme Corp + Acme Corp. + Acme Corporation", () => {
    const map = buildDeterministicAliasMap(["acme corp", "acme corp.", "acme corporation"]);
    // All should map to the shortest — but after canonicalization, all are "acme"
    // The shortest raw ID is "acme corp" (9 chars)
    const canonical = map.get("acme corp");
    assert.equal(map.get("acme corp."), canonical);
    assert.equal(map.get("acme corporation"), canonical);
  });

  it("does NOT merge unrelated entities", () => {
    const map = buildDeterministicAliasMap(["apple", "microsoft", "google"]);
    assert.equal(map.get("apple"), "apple");
    assert.equal(map.get("microsoft"), "microsoft");
    assert.equal(map.get("google"), "google");
  });

  it("does NOT merge entities where suffix is part of the brand name", () => {
    // "International Business Machines" should NOT be collapsed to "international business machines"
    // stripped to "" — but our guard prevents that
    const map = buildDeterministicAliasMap(["ibm", "international business machines"]);
    // These should NOT merge (different canonical forms: "ibm" vs "international business machines")
    assert.notEqual(map.get("ibm"), map.get("international business machines"));
  });

  it("picks shortest raw ID as canonical", () => {
    const map = buildDeterministicAliasMap(["hp inc.", "hp"]);
    assert.equal(map.get("hp inc."), "hp");
    assert.equal(map.get("hp"), "hp");
  });

  it("integration: mixed list produces correct groups", () => {
    const ids = [
      "hp", "hp inc.", "apple", "apple inc.", "lenovo", "lenovo group",
      "microsoft", "dell", "dell technologies",
    ];
    const map = buildDeterministicAliasMap(ids);

    // HP group
    assert.equal(map.get("hp"), map.get("hp inc."));
    // Apple group
    assert.equal(map.get("apple"), map.get("apple inc."));
    // Lenovo group
    assert.equal(map.get("lenovo"), map.get("lenovo group"));
    // Dell group
    assert.equal(map.get("dell"), map.get("dell technologies"));
    // Microsoft is alone
    assert.equal(map.get("microsoft"), "microsoft");

    // No cross-group merging
    assert.notEqual(map.get("hp"), map.get("apple"));
    assert.notEqual(map.get("apple"), map.get("lenovo"));
  });
});
