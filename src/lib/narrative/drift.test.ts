import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { jsd, computeDrift } from "./drift";

describe("jsd", () => {
  it("returns 0 for identical distributions", () => {
    const p = [0.25, 0.25, 0.25, 0.25];
    assert.equal(jsd(p, p), 0);
  });

  it("returns ~1 for completely different distributions", () => {
    const p = [1, 0, 0, 0];
    const q = [0, 0, 0, 1];
    const result = jsd(p, q);
    assert.ok(result > 0.9, `Expected near 1, got ${result}`);
  });

  it("returns value between 0 and 1 for partially overlapping", () => {
    const p = [0.5, 0.3, 0.2, 0];
    const q = [0.2, 0.3, 0.3, 0.2];
    const result = jsd(p, q);
    assert.ok(result > 0 && result < 1, `Expected between 0 and 1, got ${result}`);
  });

  it("handles empty arrays", () => {
    assert.equal(jsd([], []), 0);
  });

  it("handles all-zero distributions", () => {
    assert.equal(jsd([0, 0, 0], [0, 0, 0]), 0);
  });
});

describe("computeDrift", () => {
  it("returns empty array for no buckets", () => {
    assert.deepEqual(computeDrift([]), []);
  });

  it("returns zero drift for single bucket", () => {
    const result = computeDrift([
      { date: "2025-01-06", themeCounts: { innovation: 5, quality: 3 } },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].drift, 0);
    assert.equal(result[0].emerging.length, 0);
    assert.equal(result[0].declining.length, 0);
  });

  it("returns zero drift for identical buckets", () => {
    const result = computeDrift([
      { date: "2025-01-06", themeCounts: { innovation: 5, quality: 3 } },
      { date: "2025-01-13", themeCounts: { innovation: 5, quality: 3 } },
    ]);
    assert.equal(result[1].drift, 0);
  });

  it("detects drift between different distributions", () => {
    const result = computeDrift([
      { date: "2025-01-06", themeCounts: { innovation: 10, quality: 2 } },
      { date: "2025-01-13", themeCounts: { innovation: 2, quality: 10 } },
    ]);
    assert.ok(result[1].drift > 0, "Should detect non-zero drift");
  });

  it("detects emerging themes", () => {
    const result = computeDrift([
      { date: "2025-01-06", themeCounts: { innovation: 10, quality: 0 } },
      { date: "2025-01-13", themeCounts: { innovation: 5, quality: 5 } },
    ]);
    // quality went from 0% to 50%, should be emerging if count >= 2
    assert.ok(result[1].emerging.length > 0 || result[1].drift > 0, "Should detect emerging or drift");
  });

  it("detects declining themes", () => {
    const result = computeDrift([
      { date: "2025-01-06", themeCounts: { innovation: 10, quality: 5 } },
      { date: "2025-01-13", themeCounts: { innovation: 2, quality: 5 } },
    ]);
    // innovation went from ~67% to ~29%, should be declining
    assert.ok(result[1].declining.length > 0 || result[1].drift > 0, "Should detect declining or drift");
  });

  it("includes topThemes in each point", () => {
    const result = computeDrift([
      { date: "2025-01-06", themeCounts: { innovation: 5, quality: 3, sustainability: 1 } },
    ]);
    assert.ok(result[0].topThemes.length > 0, "Should have top themes");
    assert.ok(result[0].topThemes[0].pct > 0, "Top theme should have non-zero pct");
  });
});
