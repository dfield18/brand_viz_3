import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMovementSnapshots, type MovementRun } from "./buildMovementSnapshots";
import { computeCompetitorAlerts } from "./competitorAlerts";
import { buildEntityAliasGroups } from "./competition/canonicalize";

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

describe("lightweight competitor-alerts pipeline (ranked semantics)", () => {
  it("computes alerts using ranked text-order entities", () => {
    const runs: MovementRun[] = [
      makeRun({ id: "r1", jobDate: "2026-02-22", rawResponseText: "X Corp is leading.", analysisJson: { competitors: [{ name: "X Corp" }] } }),
      makeRun({ id: "r2", jobDate: "2026-02-22", rawResponseText: "Y Inc. is growing.", analysisJson: { competitors: [{ name: "Y Inc." }] } }),
      makeRun({ id: "r3", jobDate: "2026-03-21", rawResponseText: "X Corp and Y Inc. compete.", analysisJson: { competitors: [{ name: "X Corp" }, { name: "Y Inc." }] } }),
      makeRun({ id: "r4", jobDate: "2026-03-21", rawResponseText: "X Corp dominates.", analysisJson: { competitors: [{ name: "X Corp" }] } }),
    ];

    const allNames = ["x corp", "y inc."];
    const aliasMap = buildEntityAliasGroups(allNames);

    const snapshots = buildMovementSnapshots(runs, "TestBrand", "test-brand", aliasMap);
    const result = computeCompetitorAlerts(snapshots, "test-brand");
    assert.equal(result.recentDate, "2026-03-21");
    assert.equal(result.previousDate, "2026-02-22");
    assert.ok(result.alerts.length > 0);
  });

  it("does not count entities absent from response text", () => {
    const runs: MovementRun[] = [
      makeRun({
        id: "r1", jobDate: "2026-02-22",
        rawResponseText: "HP makes laptops.",
        analysisJson: { competitors: [{ name: "HP" }, { name: "GhostCorp" }] },
      }),
      makeRun({
        id: "r2", jobDate: "2026-03-21",
        rawResponseText: "HP Inc. is innovative.",
        analysisJson: { competitors: [{ name: "HP Inc." }, { name: "GhostCorp" }] },
      }),
    ];

    const aliasMap = buildEntityAliasGroups(["hp", "hp inc.", "ghostcorp"]);
    const snapshots = buildMovementSnapshots(runs, "Dell", "dell", aliasMap);
    const result = computeCompetitorAlerts(snapshots, "dell");

    // HP should be merged and present
    assert.equal(result.alerts.length, 1);
    assert.equal(result.alerts[0].entityId, "hp");
    // GhostCorp is NOT in the text → excluded
    assert.ok(!result.alerts.find((a) => a.entityId === "ghostcorp"));
  });

  it("excludes focal brand aliases", () => {
    const runs: MovementRun[] = [
      makeRun({
        id: "r1", jobDate: "2026-02-22",
        rawResponseText: "Microsoft Corp. and Google lead the industry.",
        analysisJson: { competitors: [{ name: "Microsoft Corp." }, { name: "Google" }] },
      }),
      makeRun({
        id: "r2", jobDate: "2026-03-21",
        rawResponseText: "Microsoft and Google compete.",
        analysisJson: { competitors: [{ name: "Microsoft" }, { name: "Google" }] },
      }),
    ];

    const aliasMap = buildEntityAliasGroups(
      ["microsoft", "microsoft corp.", "google"],
      "microsoft", ["Microsoft", "Microsoft Corp."],
    );
    const snapshots = buildMovementSnapshots(runs, "Microsoft", "microsoft", aliasMap);
    const result = computeCompetitorAlerts(snapshots, "microsoft");

    assert.ok(!result.alerts.find((a) => a.entityId === "microsoft"));
    assert.ok(result.alerts.find((a) => a.entityId === "google"));
  });

  it("handles empty data gracefully", () => {
    const snapshots = buildMovementSnapshots([], "Brand", "brand", new Map());
    const result = computeCompetitorAlerts(snapshots, "brand");
    assert.equal(result.alerts.length, 0);
  });

  it("deterministic fallback works when aliasMap is empty", () => {
    const runs: MovementRun[] = [
      makeRun({ id: "r1", jobDate: "2026-02-22", rawResponseText: "Apple Inc. is leading.", analysisJson: { competitors: [{ name: "Apple Inc." }] } }),
      makeRun({ id: "r2", jobDate: "2026-03-21", rawResponseText: "Apple continues to grow.", analysisJson: { competitors: [{ name: "Apple" }] } }),
    ];

    const snapshots = buildMovementSnapshots(runs, "TestBrand", "test-brand", new Map());
    const result = computeCompetitorAlerts(snapshots, "test-brand");

    // Both should canonicalize to "apple"
    assert.equal(result.alerts.length, 1);
    assert.equal(result.alerts[0].entityId, "apple");
  });
});
