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
    rawResponseText: "",
    ...overrides,
  };
}

describe("buildMovementSnapshots", () => {
  const BRAND = "aclu";
  const BRAND_NAME = "ACLU";
  const NO_ALIASES = new Map<string, string>();

  it("returns empty for no runs", () => {
    assert.equal(buildMovementSnapshots([], BRAND_NAME, BRAND, NO_ALIASES).length, 0);
  });

  it("only includes industry-cluster runs", () => {
    const runs = [
      makeRun({ id: "r1", cluster: "industry", rawResponseText: "SPLC is here.", analysisJson: { competitors: [{ name: "SPLC" }] } }),
      makeRun({ id: "r2", cluster: "direct", rawResponseText: "SPLC is here.", analysisJson: { competitors: [{ name: "SPLC" }] } }),
    ];
    const result = buildMovementSnapshots(runs, BRAND_NAME, BRAND, NO_ALIASES);
    assert.equal(result[0].totalIndustryRuns, 1);
  });

  it("counts only entities present in response text (ranked semantics)", () => {
    const runs = [
      makeRun({
        id: "r1",
        rawResponseText: "SPLC and NAACP are active.",
        analysisJson: { competitors: [{ name: "SPLC" }, { name: "NAACP" }, { name: "NotInText" }] },
      }),
    ];
    const result = buildMovementSnapshots(runs, BRAND_NAME, BRAND, NO_ALIASES);
    assert.equal(result[0].entityMentions["splc"], 1);
    assert.equal(result[0].entityMentions["naacp"], 1);
    assert.equal(result[0].entityMentions["notintext"], undefined);
  });

  it("denominator includes runs with no competitors", () => {
    const runs = [
      makeRun({ id: "r1", rawResponseText: "SPLC is here.", analysisJson: { competitors: [{ name: "SPLC" }] } }),
      makeRun({ id: "r2", rawResponseText: "Nothing.", analysisJson: { competitors: [] } }),
      makeRun({ id: "r3", rawResponseText: "Empty.", analysisJson: null }),
    ];
    const result = buildMovementSnapshots(runs, BRAND_NAME, BRAND, NO_ALIASES);
    assert.equal(result[0].totalIndustryRuns, 3);
  });

  it("excludes focal brand", () => {
    const runs = [
      makeRun({
        id: "r1",
        rawResponseText: "ACLU and SPLC are both important.",
        analysisJson: { competitors: [{ name: "ACLU" }, { name: "SPLC" }] },
      }),
    ];
    const result = buildMovementSnapshots(runs, BRAND_NAME, BRAND, NO_ALIASES);
    assert.equal(result[0].entityMentions[BRAND], undefined);
    assert.equal(result[0].entityMentions["splc"], 1);
  });

  it("applies alias normalization", () => {
    const aliases = new Map([["southern poverty law center", "splc"], ["splc", "splc"]]);
    const runs = [
      makeRun({ id: "r1", rawResponseText: "Southern Poverty Law Center is active.", analysisJson: { competitors: [{ name: "Southern Poverty Law Center" }] } }),
      makeRun({ id: "r2", rawResponseText: "SPLC published a report.", analysisJson: { competitors: [{ name: "SPLC" }] } }),
    ];
    const result = buildMovementSnapshots(runs, BRAND_NAME, BRAND, aliases);
    assert.equal(result[0].entityMentions["splc"], 2);
  });

  it("uses deterministic canonicalization as fallback", () => {
    const runs = [
      makeRun({
        id: "r1",
        rawResponseText: "HP Inc. makes laptops.",
        analysisJson: { competitors: [{ name: "HP Inc." }] },
      }),
    ];
    const result = buildMovementSnapshots(runs, "Dell", "dell", new Map());
    assert.equal(result[0].entityMentions["hp"], 1);
  });

  it("groups by date", () => {
    const runs = [
      makeRun({ id: "r1", jobDate: "2026-02-22", rawResponseText: "X.", analysisJson: { competitors: [{ name: "X" }] } }),
      makeRun({ id: "r2", jobDate: "2026-03-21", rawResponseText: "X.", analysisJson: { competitors: [{ name: "X" }] } }),
    ];
    const result = buildMovementSnapshots(runs, BRAND_NAME, BRAND, NO_ALIASES);
    assert.equal(result.length, 2);
  });

  it("regression: split variants merge with correct deltas", () => {
    const aliases = new Map([["sony", "sony"], ["sony interactive entertainment", "sony"]]);
    const prev = Array.from({ length: 10 }, (_, i) => makeRun({
      id: `p${i}`, jobDate: "2026-02-22",
      rawResponseText: i < 3 ? "Sony makes products." : "Nothing.",
      analysisJson: i < 3 ? { competitors: [{ name: "Sony" }] } : { competitors: [] },
    }));
    const recent = Array.from({ length: 10 }, (_, i) => makeRun({
      id: `r${i}`, jobDate: "2026-03-21",
      rawResponseText: i < 5 ? "Sony is great." : i < 7 ? "Sony Interactive Entertainment released." : "Nothing.",
      analysisJson: i < 5 ? { competitors: [{ name: "Sony" }] } : i < 7 ? { competitors: [{ name: "Sony Interactive Entertainment" }] } : { competitors: [] },
    }));

    const snapshots = buildMovementSnapshots([...prev, ...recent], "Nintendo", "nintendo", aliases);
    const result = computeCompetitorAlerts(snapshots, "nintendo");
    const sony = result.alerts.find((a) => a.entityId === "sony");
    assert.ok(sony);
    assert.equal(sony!.recentMentionRate, 70);
    assert.equal(sony!.previousMentionRate, 30);
    assert.equal(sony!.direction, "rising");
  });

  it("regression: prose-only entities excluded from movement", () => {
    const runs = [
      makeRun({ id: "r1", jobDate: "2026-02-22", rawResponseText: "SPLC is active.", analysisJson: { competitors: [{ name: "SPLC" }, { name: "Big Corp" }] } }),
      makeRun({ id: "r2", jobDate: "2026-03-21", rawResponseText: "SPLC published.", analysisJson: { competitors: [{ name: "SPLC" }, { name: "Big Corp" }] } }),
    ];
    const snapshots = buildMovementSnapshots(runs, BRAND_NAME, BRAND, NO_ALIASES);
    const result = computeCompetitorAlerts(snapshots, BRAND);
    assert.ok(!result.alerts.find((a) => a.entityId === "big corp"));
    assert.ok(result.alerts.find((a) => a.entityId === "splc"));
  });
});
