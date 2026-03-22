import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMovementSnapshots, type MovementRun } from "./buildMovementSnapshots";

function makeRun(overrides: Partial<MovementRun> = {}): MovementRun {
  return {
    id: "run1",
    model: "chatgpt",
    jobDate: "2026-03-21",
    cluster: "industry",
    analysisJson: { competitors: [] },
    ...overrides,
  };
}

describe("buildMovementSnapshots", () => {
  const BRAND = "aclu";
  const NO_ALIASES = new Map<string, string>();

  it("returns empty for no runs", () => {
    const result = buildMovementSnapshots([], BRAND, NO_ALIASES);
    assert.equal(result.length, 0);
  });

  it("only includes industry-cluster runs", () => {
    const runs: MovementRun[] = [
      makeRun({ id: "r1", cluster: "industry", analysisJson: { competitors: [{ name: "SPLC" }] } }),
      makeRun({ id: "r2", cluster: "direct", analysisJson: { competitors: [{ name: "SPLC" }] } }),
      makeRun({ id: "r3", cluster: "comparative", analysisJson: { competitors: [{ name: "SPLC" }] } }),
    ];
    const result = buildMovementSnapshots(runs, BRAND, NO_ALIASES);
    assert.equal(result.length, 1);
    assert.equal(result[0].totalIndustryRuns, 1); // only 1 industry run
    assert.equal(result[0].entityMentions["splc"], 1);
  });

  it("counts entities from analysisJson.competitors, not prose", () => {
    // Run has "SPLC" in competitors list — should count
    // Run does NOT have "NRA" in competitors even though NRA might be in the prose
    const runs: MovementRun[] = [
      makeRun({
        id: "r1",
        analysisJson: {
          competitors: [{ name: "SPLC" }, { name: "NAACP" }],
        },
      }),
    ];
    const result = buildMovementSnapshots(runs, BRAND, NO_ALIASES);
    assert.equal(result[0].entityMentions["splc"], 1);
    assert.equal(result[0].entityMentions["naacp"], 1);
    // Any entity NOT in competitors list should be absent
    assert.equal(result[0].entityMentions["nra"], undefined);
  });

  it("denominator includes all industry runs even those with no competitors", () => {
    const runs: MovementRun[] = [
      makeRun({ id: "r1", analysisJson: { competitors: [{ name: "SPLC" }] } }),
      makeRun({ id: "r2", analysisJson: { competitors: [] } }), // no competitors
      makeRun({ id: "r3", analysisJson: null }), // no analysis at all
    ];
    const result = buildMovementSnapshots(runs, BRAND, NO_ALIASES);
    assert.equal(result[0].totalIndustryRuns, 3); // all 3 count in denominator
    assert.equal(result[0].entityMentions["splc"], 1); // only 1 run has SPLC
  });

  it("excludes the brand from entity counts", () => {
    const runs: MovementRun[] = [
      makeRun({
        id: "r1",
        analysisJson: {
          competitors: [{ name: "ACLU" }, { name: "SPLC" }],
        },
      }),
    ];
    const result = buildMovementSnapshots(runs, BRAND, NO_ALIASES);
    assert.equal(result[0].entityMentions[BRAND], undefined);
    assert.equal(result[0].entityMentions["splc"], 1);
  });

  it("applies alias normalization", () => {
    const aliases = new Map([
      ["southern poverty law center", "splc"],
      ["splc", "splc"],
    ]);
    const runs: MovementRun[] = [
      makeRun({
        id: "r1",
        analysisJson: { competitors: [{ name: "Southern Poverty Law Center" }] },
      }),
      makeRun({
        id: "r2",
        analysisJson: { competitors: [{ name: "SPLC" }] },
      }),
    ];
    const result = buildMovementSnapshots(runs, BRAND, aliases);
    // Both should be merged into "splc"
    assert.equal(result[0].entityMentions["splc"], 2);
    assert.equal(result[0].entityMentions["southern poverty law center"], undefined);
  });

  it("deduplicates entities within a single run", () => {
    const runs: MovementRun[] = [
      makeRun({
        id: "r1",
        analysisJson: {
          competitors: [
            { name: "SPLC" },
            { name: "SPLC" }, // duplicate
            { name: "NAACP" },
          ],
        },
      }),
    ];
    const result = buildMovementSnapshots(runs, BRAND, NO_ALIASES);
    assert.equal(result[0].entityMentions["splc"], 1); // not 2
    assert.equal(result[0].entityMentions["naacp"], 1);
  });

  it("groups by job date correctly", () => {
    const runs: MovementRun[] = [
      makeRun({ id: "r1", jobDate: "2026-02-22", analysisJson: { competitors: [{ name: "X" }] } }),
      makeRun({ id: "r2", jobDate: "2026-02-22", analysisJson: { competitors: [{ name: "X" }] } }),
      makeRun({ id: "r3", jobDate: "2026-03-21", analysisJson: { competitors: [{ name: "X" }] } }),
    ];
    const result = buildMovementSnapshots(runs, BRAND, NO_ALIASES);
    assert.equal(result.length, 2);
    const feb = result.find((s) => s.date === "2026-02-22")!;
    const mar = result.find((s) => s.date === "2026-03-21")!;
    assert.equal(feb.totalIndustryRuns, 2);
    assert.equal(feb.entityMentions["x"], 2);
    assert.equal(mar.totalIndustryRuns, 1);
    assert.equal(mar.entityMentions["x"], 1);
  });

  it("regression: prose-only entity should NOT appear in movement", () => {
    // Simulate: "Big Corp" appears in the response text but is NOT in
    // analysisJson.competitors. It should not be counted.
    const runs: MovementRun[] = [
      makeRun({
        id: "r1",
        analysisJson: {
          // Only SPLC is in the ranked competitor list
          competitors: [{ name: "SPLC" }],
          // "Big Corp" might appear in the response text but NOT here
        },
      }),
    ];
    const result = buildMovementSnapshots(runs, BRAND, NO_ALIASES);
    assert.equal(result[0].entityMentions["splc"], 1);
    assert.equal(result[0].entityMentions["big corp"], undefined);
  });
});
