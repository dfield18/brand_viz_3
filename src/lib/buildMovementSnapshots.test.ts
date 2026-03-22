import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMovementSnapshots, type MovementRun } from "./buildMovementSnapshots";
import { computeCompetitorAlerts } from "./competitorAlerts";

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
    assert.equal(buildMovementSnapshots([], BRAND, NO_ALIASES).length, 0);
  });

  it("only includes industry-cluster runs", () => {
    const runs = [
      makeRun({ id: "r1", cluster: "industry", analysisJson: { competitors: [{ name: "SPLC" }] } }),
      makeRun({ id: "r2", cluster: "direct", analysisJson: { competitors: [{ name: "SPLC" }] } }),
    ];
    const result = buildMovementSnapshots(runs, BRAND, NO_ALIASES);
    assert.equal(result[0].totalIndustryRuns, 1);
  });

  it("counts from analysisJson.competitors, not prose", () => {
    const runs = [
      makeRun({ id: "r1", analysisJson: { competitors: [{ name: "SPLC" }, { name: "NAACP" }] } }),
    ];
    const result = buildMovementSnapshots(runs, BRAND, NO_ALIASES);
    assert.equal(result[0].entityMentions["splc"], 1);
    assert.equal(result[0].entityMentions["naacp"], 1);
    assert.equal(result[0].entityMentions["nra"], undefined);
  });

  it("denominator includes runs with no competitors", () => {
    const runs = [
      makeRun({ id: "r1", analysisJson: { competitors: [{ name: "SPLC" }] } }),
      makeRun({ id: "r2", analysisJson: { competitors: [] } }),
      makeRun({ id: "r3", analysisJson: null }),
    ];
    const result = buildMovementSnapshots(runs, BRAND, NO_ALIASES);
    assert.equal(result[0].totalIndustryRuns, 3);
    assert.equal(result[0].entityMentions["splc"], 1);
  });

  it("excludes the brand from entity counts", () => {
    const runs = [
      makeRun({ id: "r1", analysisJson: { competitors: [{ name: "ACLU" }, { name: "SPLC" }] } }),
    ];
    const result = buildMovementSnapshots(runs, BRAND, NO_ALIASES);
    assert.equal(result[0].entityMentions[BRAND], undefined);
    assert.equal(result[0].entityMentions["splc"], 1);
  });

  it("applies alias normalization", () => {
    const aliases = new Map([["southern poverty law center", "splc"], ["splc", "splc"]]);
    const runs = [
      makeRun({ id: "r1", analysisJson: { competitors: [{ name: "Southern Poverty Law Center" }] } }),
      makeRun({ id: "r2", analysisJson: { competitors: [{ name: "SPLC" }] } }),
    ];
    const result = buildMovementSnapshots(runs, BRAND, aliases);
    assert.equal(result[0].entityMentions["splc"], 2);
  });

  it("uses deterministic canonicalization as fallback when aliasMap is incomplete", () => {
    // aliasMap doesn't have "hp inc." but canonicalizeEntityId("hp inc.") → "hp"
    const partialAliases = new Map([["hp", "hp"]]);
    const runs = [
      makeRun({ id: "r1", analysisJson: { competitors: [{ name: "HP" }, { name: "HP Inc." }] } }),
    ];
    const result = buildMovementSnapshots(runs, BRAND, partialAliases);
    // Both should canonicalize to "hp" — counted once per run
    assert.equal(result[0].entityMentions["hp"], 1);
  });

  it("excludes focal brand aliases via brandAliases param", () => {
    const runs = [
      makeRun({
        id: "r1",
        analysisJson: {
          competitors: [
            { name: "American Civil Liberties Union" },
            { name: "SPLC" },
          ],
        },
      }),
    ];
    const result = buildMovementSnapshots(runs, BRAND, NO_ALIASES, ["ACLU", "American Civil Liberties Union"]);
    // Brand alias should be excluded
    assert.equal(result[0].entityMentions["american civil liberties union"], undefined);
    assert.equal(result[0].entityMentions[BRAND], undefined);
    // Competitor should remain
    assert.equal(result[0].entityMentions["splc"], 1);
  });

  it("groups by job date correctly", () => {
    const runs = [
      makeRun({ id: "r1", jobDate: "2026-02-22", analysisJson: { competitors: [{ name: "X" }] } }),
      makeRun({ id: "r2", jobDate: "2026-02-22", analysisJson: { competitors: [{ name: "X" }] } }),
      makeRun({ id: "r3", jobDate: "2026-03-21", analysisJson: { competitors: [{ name: "X" }] } }),
    ];
    const result = buildMovementSnapshots(runs, BRAND, NO_ALIASES);
    assert.equal(result.length, 2);
  });

  it("regression: split variants produce merged counts and correct deltas", () => {
    // Previous snapshot: "Sony" in 3/10 runs
    // Recent snapshot: "Sony" in 5/10 + "Sony Interactive Entertainment" in 2/10
    // After merge: recent = 7/10 (70%), previous = 3/10 (30%) → +40 pts rising
    const aliases = new Map([
      ["sony", "sony"],
      ["sony interactive entertainment", "sony"],
    ]);
    const prevRuns = Array.from({ length: 10 }, (_, i) =>
      makeRun({
        id: `prev-${i}`,
        jobDate: "2026-02-22",
        analysisJson: { competitors: i < 3 ? [{ name: "Sony" }] : [] },
      }),
    );
    const recentRuns = Array.from({ length: 10 }, (_, i) =>
      makeRun({
        id: `recent-${i}`,
        jobDate: "2026-03-21",
        analysisJson: {
          competitors: i < 5
            ? [{ name: "Sony" }]
            : i < 7
              ? [{ name: "Sony Interactive Entertainment" }]
              : [],
        },
      }),
    );

    const snapshots = buildMovementSnapshots([...prevRuns, ...recentRuns], BRAND, aliases);
    const result = computeCompetitorAlerts(snapshots, BRAND);

    assert.equal(result.recentDate, "2026-03-21");
    assert.equal(result.previousDate, "2026-02-22");

    const sony = result.alerts.find((a) => a.entityId === "sony");
    assert.ok(sony, "Sony should be present as merged entity");
    assert.equal(sony!.recentMentionRate, 70); // 7/10
    assert.equal(sony!.previousMentionRate, 30); // 3/10
    assert.equal(sony!.direction, "rising");
  });

  it("regression: focal brand aliases excluded from movement alerts", () => {
    const runs = [
      makeRun({
        id: "r1",
        jobDate: "2026-02-22",
        analysisJson: { competitors: [{ name: "ACLU" }, { name: "SPLC" }] },
      }),
      makeRun({
        id: "r2",
        jobDate: "2026-03-21",
        analysisJson: {
          competitors: [
            { name: "American Civil Liberties Union" },
            { name: "SPLC" },
          ],
        },
      }),
    ];
    const snapshots = buildMovementSnapshots(
      runs, BRAND, NO_ALIASES,
      ["ACLU", "American Civil Liberties Union"],
    );
    const result = computeCompetitorAlerts(snapshots, BRAND);

    // No brand aliases should appear
    assert.ok(!result.alerts.find((a) => a.entityId === BRAND));
    assert.ok(!result.alerts.find((a) => a.entityId === "american civil liberties union"));
    // SPLC should appear
    assert.ok(result.alerts.find((a) => a.entityId === "splc"));
  });
});
