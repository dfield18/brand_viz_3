import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPositionRows } from "./PositionDistribution";

describe("buildPositionRows", () => {
  it("renders exact positions sorted ascending, Not Mentioned last", () => {
    const input = [
      { position: 1, model: "all", count: 4, percentage: 40 },
      { position: 2, model: "all", count: 3, percentage: 30 },
      { position: 5, model: "all", count: 1, percentage: 10 },
      { position: 0, model: "all", count: 2, percentage: 20 },
    ];
    const rows = buildPositionRows(input);

    // Should be sorted: #1, #2, #5, Not Mentioned
    assert.equal(rows.length, 4);
    assert.equal(rows[0].label, "#1");
    assert.equal(rows[0].count, 4);
    assert.equal(rows[0].percentage, 40);
    assert.equal(rows[1].label, "#2");
    assert.equal(rows[1].count, 3);
    assert.equal(rows[1].percentage, 30);
    assert.equal(rows[2].label, "#5");
    assert.equal(rows[2].count, 1);
    assert.equal(rows[2].percentage, 10);
    assert.equal(rows[3].label, "Not Mentioned");
    assert.equal(rows[3].count, 2);
    assert.equal(rows[3].percentage, 20);

    // No grouped labels should exist
    const labels = rows.map((r) => r.label);
    assert.ok(!labels.some((l) => l.includes("–")));
    assert.ok(!labels.some((l) => l.includes("+")));
  });

  it("handles model filtering (only matching rows)", () => {
    const input = [
      { position: 1, model: "chatgpt", count: 3, percentage: 75 },
      { position: 0, model: "chatgpt", count: 1, percentage: 25 },
    ];
    const rows = buildPositionRows(input);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].label, "#1");
    assert.equal(rows[0].percentage, 75);
    assert.equal(rows[1].label, "Not Mentioned");
    assert.equal(rows[1].percentage, 25);
  });

  it("recalculates percentages from counts (not trusting API percentages)", () => {
    // Total = 10, so #1 = 7/10 = 70%, Not Mentioned = 3/10 = 30%
    const input = [
      { position: 1, model: "all", count: 7, percentage: 0 },
      { position: 0, model: "all", count: 3, percentage: 0 },
    ];
    const rows = buildPositionRows(input);
    assert.equal(rows[0].percentage, 70);
    assert.equal(rows[1].percentage, 30);
  });

  it("handles empty input", () => {
    const rows = buildPositionRows([]);
    assert.equal(rows.length, 0);
  });

  it("handles single position with no Not Mentioned", () => {
    const input = [
      { position: 1, model: "all", count: 5, percentage: 100 },
    ];
    const rows = buildPositionRows(input);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].label, "#1");
    assert.equal(rows[0].percentage, 100);
  });

  it("assigns correct colors", () => {
    const input = [
      { position: 1, model: "all", count: 1, percentage: 25 },
      { position: 3, model: "all", count: 1, percentage: 25 },
      { position: 5, model: "all", count: 1, percentage: 25 },
      { position: 7, model: "all", count: 1, percentage: 25 },
    ];
    const rows = buildPositionRows(input);
    // #1 should be vivid blue, #3 lighter, #5 lighter still, #7 faded
    assert.equal(rows[0].color, "hsl(217, 91%, 50%)");
    assert.equal(rows[1].color, "hsl(217, 70%, 62%)");
    assert.equal(rows[2].color, "hsl(217, 45%, 72%)");
    assert.equal(rows[3].color, "hsl(218, 25%, 80%)");
  });
});
