import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildMovementSnapshots, type MovementRun } from "./buildMovementSnapshots";
import { computeCompetitorAlerts } from "./competitorAlerts";
import { buildEntityAliasGroups } from "./competition/canonicalize";

/**
 * Integration tests for the lightweight competitor-alerts path.
 * These test the full flow: alias grouping → snapshot building → alert computation
 * without any GPT dependency.
 */

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

describe("lightweight competitor-alerts pipeline", () => {
  it("computes alerts from latest vs previous snapshot without GPT", () => {
    const runs: MovementRun[] = [
      makeRun({ id: "r1", jobDate: "2026-02-22", analysisJson: { competitors: [{ name: "X Corp" }] } }),
      makeRun({ id: "r2", jobDate: "2026-02-22", analysisJson: { competitors: [{ name: "Y Inc." }] } }),
      makeRun({ id: "r3", jobDate: "2026-03-21", analysisJson: { competitors: [{ name: "X Corp" }, { name: "Y Inc." }] } }),
      makeRun({ id: "r4", jobDate: "2026-03-21", analysisJson: { competitors: [{ name: "X Corp" }] } }),
    ];

    // Step 1: deterministic alias grouping (no GPT)
    const allNames = ["x corp", "y inc."];
    const aliasMap = buildEntityAliasGroups(allNames);
    // "x corp" → "x", "y inc." → "y"

    // Step 2: build snapshots
    const snapshots = buildMovementSnapshots(runs, "test-brand", aliasMap);
    assert.equal(snapshots.length, 2);

    // Step 3: compute alerts
    const result = computeCompetitorAlerts(snapshots, "test-brand");
    assert.equal(result.recentDate, "2026-03-21");
    assert.equal(result.previousDate, "2026-02-22");
    assert.ok(result.alerts.length > 0);
  });

  it("does not require GPT for obvious alias merging", () => {
    const runs: MovementRun[] = [
      makeRun({ id: "r1", jobDate: "2026-02-22", analysisJson: { competitors: [{ name: "HP" }] } }),
      makeRun({ id: "r2", jobDate: "2026-03-21", analysisJson: { competitors: [{ name: "HP Inc." }] } }),
    ];

    const allNames = ["hp", "hp inc."];
    const aliasMap = buildEntityAliasGroups(allNames);

    const snapshots = buildMovementSnapshots(runs, "test-brand", aliasMap);
    const result = computeCompetitorAlerts(snapshots, "test-brand");

    // HP and HP Inc. should be merged into one entity
    assert.equal(result.alerts.length, 1);
    assert.equal(result.alerts[0].entityId, "hp");
    // Present in both snapshots → stable
    assert.equal(result.alerts[0].recentMentionRate, 100);
    assert.equal(result.alerts[0].previousMentionRate, 100);
  });

  it("excludes focal brand aliases from alerts", () => {
    const runs: MovementRun[] = [
      makeRun({
        id: "r1", jobDate: "2026-02-22",
        analysisJson: { competitors: [{ name: "Microsoft" }, { name: "Google" }] },
      }),
      makeRun({
        id: "r2", jobDate: "2026-03-21",
        analysisJson: { competitors: [{ name: "Microsoft Corp." }, { name: "Google" }] },
      }),
    ];

    // Microsoft is the focal brand
    const allNames = ["microsoft", "microsoft corp.", "google"];
    const aliasMap = buildEntityAliasGroups(allNames, "microsoft", ["Microsoft", "Microsoft Corp."]);

    const snapshots = buildMovementSnapshots(runs, "microsoft", aliasMap, ["Microsoft", "Microsoft Corp."]);
    const result = computeCompetitorAlerts(snapshots, "microsoft");

    // Microsoft should NOT appear as a competitor
    assert.ok(!result.alerts.find((a) => a.entityId === "microsoft"));
    // Google should appear
    assert.ok(result.alerts.find((a) => a.entityId === "google"));
  });

  it("handles empty data gracefully", () => {
    const snapshots = buildMovementSnapshots([], "test-brand", new Map());
    const result = computeCompetitorAlerts(snapshots, "test-brand");
    assert.equal(result.alerts.length, 0);
    assert.equal(result.recentDate, null);
  });

  it("fallback: deterministic canonicalization works when aliasMap is empty", () => {
    const runs: MovementRun[] = [
      makeRun({ id: "r1", jobDate: "2026-02-22", analysisJson: { competitors: [{ name: "Apple Inc." }] } }),
      makeRun({ id: "r2", jobDate: "2026-03-21", analysisJson: { competitors: [{ name: "Apple" }] } }),
    ];

    // Empty alias map — fallback to canonicalizeEntityId
    const snapshots = buildMovementSnapshots(runs, "test-brand", new Map());
    const result = computeCompetitorAlerts(snapshots, "test-brand");

    // Both should canonicalize to "apple" via deterministic fallback
    assert.equal(result.alerts.length, 1);
    assert.equal(result.alerts[0].entityId, "apple");
  });
});
