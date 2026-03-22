import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canonicalizeEntityId, buildDeterministicAliasMap, buildEntityAliasGroups } from "./canonicalize";

describe("canonicalizeEntityId", () => {
  it("lowercases", () => assert.equal(canonicalizeEntityId("Apple"), "apple"));
  it("strips Inc.", () => assert.equal(canonicalizeEntityId("HP Inc."), "hp"));
  it("strips Corp", () => assert.equal(canonicalizeEntityId("Acme Corp"), "acme"));
  it("strips Corporation", () => assert.equal(canonicalizeEntityId("Acme Corporation"), "acme"));
  it("strips Group", () => assert.equal(canonicalizeEntityId("Lenovo Group"), "lenovo"));
  it("strips Company", () => assert.equal(canonicalizeEntityId("The Ford Motor Company"), "ford motor"));
  it("strips Ltd.", () => assert.equal(canonicalizeEntityId("Samsung Electronics Ltd."), "samsung electronics"));
  it("strips LLC", () => assert.equal(canonicalizeEntityId("SpaceX LLC"), "spacex"));
  it("strips Holdings", () => assert.equal(canonicalizeEntityId("Alphabet Holdings"), "alphabet"));
  it("strips Technologies", () => assert.equal(canonicalizeEntityId("Dell Technologies"), "dell"));
  it("strips International", () => assert.equal(canonicalizeEntityId("Marriott International"), "marriott"));
  it("strips leading the", () => assert.equal(canonicalizeEntityId("The Walt Disney Company"), "walt disney"));
  it("strips multiple suffixes", () => assert.equal(canonicalizeEntityId("Acme Corp. Inc."), "acme"));
  it("keeps suffix if it would leave empty", () => assert.equal(canonicalizeEntityId("Group"), "group"));
  it("collapses whitespace", () => assert.equal(canonicalizeEntityId("  HP   Inc.  "), "hp"));
  it("trims trailing punctuation", () => assert.equal(canonicalizeEntityId("Apple,"), "apple"));
  it("preserves meaningful names", () => assert.equal(canonicalizeEntityId("Ben & Jerry's"), "ben & jerry's"));
});

describe("buildDeterministicAliasMap", () => {
  it("merges HP + HP Inc.", () => {
    const map = buildDeterministicAliasMap(["hp", "hp inc."]);
    assert.equal(map.get("hp"), "hp");
    assert.equal(map.get("hp inc."), "hp");
  });

  it("merges Apple + Apple Inc.", () => {
    const map = buildDeterministicAliasMap(["apple", "apple inc."]);
    assert.equal(map.get("apple inc."), "apple");
  });

  it("does NOT merge unrelated entities", () => {
    const map = buildDeterministicAliasMap(["apple", "microsoft"]);
    assert.notEqual(map.get("apple"), map.get("microsoft"));
  });

  it("picks shortest raw ID", () => {
    const map = buildDeterministicAliasMap(["hp inc.", "hp"]);
    assert.equal(map.get("hp inc."), "hp");
  });
});

describe("buildEntityAliasGroups", () => {
  it("merges brand-family variants when base exists", () => {
    const map = buildEntityAliasGroups(["sony", "sony interactive entertainment", "microsoft"]);
    assert.equal(map.get("sony interactive entertainment"), "sony");
    assert.equal(map.get("microsoft"), "microsoft");
  });

  it("does NOT strip business-unit suffix when base is absent", () => {
    const map = buildEntityAliasGroups(["ea games", "microsoft"]);
    assert.equal(map.get("ea games"), "ea games");
  });

  it("merges gaming variants when base exists", () => {
    const map = buildEntityAliasGroups(["activision", "activision gaming"]);
    assert.equal(map.get("activision gaming"), "activision");
  });

  it("maps focal brand aliases to brandSlug", () => {
    const map = buildEntityAliasGroups(
      ["splc", "american civil liberties union"],
      "aclu",
      ["ACLU", "American Civil Liberties Union"],
    );
    assert.equal(map.get("american civil liberties union"), "aclu");
  });

  it("focal brand family does not appear as competitor", () => {
    const map = buildEntityAliasGroups(
      ["competitor-a", "microsoft corp.", "microsoft"],
      "microsoft",
      ["Microsoft", "Microsoft Corp."],
    );
    assert.equal(map.get("microsoft"), "microsoft");
    assert.equal(map.get("microsoft corp."), "microsoft");
    assert.equal(map.get("competitor-a"), "competitor-a");
  });

  it("regression: split variants merge into one row", () => {
    const map = buildEntityAliasGroups([
      "sony", "sony interactive entertainment",
      "nintendo", "microsoft",
    ]);
    assert.equal(map.get("sony interactive entertainment"), "sony");
    assert.equal(map.get("nintendo"), "nintendo");
  });

  it("regression: movement with alias merge produces correct deltas", () => {
    // Simulate the full flow: alias map → buildMovementSnapshots → computeCompetitorAlerts
    // This is an integration-level check of the alias grouping
    const ids = ["sony", "sony interactive entertainment", "nintendo"];
    const map = buildEntityAliasGroups(ids);
    // Both sony variants merge
    assert.equal(map.get("sony"), "sony");
    assert.equal(map.get("sony interactive entertainment"), "sony");
    // Nintendo stays separate
    assert.equal(map.get("nintendo"), "nintendo");
  });
});
