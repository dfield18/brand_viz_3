import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeKpi,
  decomposeAlongDimension,
  decomposeKpi,
  assessConfidence,
  generateNarrative,
  type DecomposedRun,
} from "./driverDecomposition";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRun(overrides: Partial<DecomposedRun> = {}): DecomposedRun {
  return {
    model: "chatgpt",
    cluster: "industry",
    topic: "brand_reputation",
    brandMentioned: true,
    brandMentionStrength: 60,
    rank: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeKpi
// ---------------------------------------------------------------------------

describe("computeKpi", () => {
  it("mentionRate: all mentioned", () => {
    const runs = [makeRun(), makeRun(), makeRun()];
    assert.equal(computeKpi(runs, "mentionRate"), 100);
  });

  it("mentionRate: none mentioned", () => {
    const runs = [
      makeRun({ brandMentioned: false }),
      makeRun({ brandMentioned: false }),
    ];
    assert.equal(computeKpi(runs, "mentionRate"), 0);
  });

  it("mentionRate: 1 of 3", () => {
    const runs = [
      makeRun({ brandMentioned: true }),
      makeRun({ brandMentioned: false }),
      makeRun({ brandMentioned: false }),
    ];
    assert.equal(computeKpi(runs, "mentionRate"), 33.3);
  });

  it("firstMentionRate: all rank 1", () => {
    const runs = [makeRun({ rank: 1 }), makeRun({ rank: 1 })];
    assert.equal(computeKpi(runs, "firstMentionRate"), 100);
  });

  it("firstMentionRate: 1 of 2", () => {
    const runs = [makeRun({ rank: 1 }), makeRun({ rank: 2 })];
    assert.equal(computeKpi(runs, "firstMentionRate"), 50);
  });

  it("avgRank: ignores nulls", () => {
    const runs = [makeRun({ rank: 1 }), makeRun({ rank: 3 }), makeRun({ rank: null })];
    assert.equal(computeKpi(runs, "avgRank"), 2);
  });

  it("avgRank: all null returns null", () => {
    const runs = [makeRun({ rank: null }), makeRun({ rank: null })];
    assert.equal(computeKpi(runs, "avgRank"), null);
  });

  it("empty runs returns null", () => {
    assert.equal(computeKpi([], "mentionRate"), null);
    assert.equal(computeKpi([], "avgRank"), null);
  });
});

// ---------------------------------------------------------------------------
// decomposeAlongDimension
// ---------------------------------------------------------------------------

describe("decomposeAlongDimension", () => {
  it("contributions sum to total delta", () => {
    const current = [
      makeRun({ model: "chatgpt", brandMentioned: true }),
      makeRun({ model: "chatgpt", brandMentioned: true }),
      makeRun({ model: "gemini", brandMentioned: false }),
    ];
    const previous = [
      makeRun({ model: "chatgpt", brandMentioned: false }),
      makeRun({ model: "chatgpt", brandMentioned: false }),
      makeRun({ model: "gemini", brandMentioned: true }),
    ];
    const totalDelta = computeKpi(current, "mentionRate")! - computeKpi(previous, "mentionRate")!;
    const drivers = decomposeAlongDimension(
      current, previous, "mentionRate", "model",
      (r) => r.model, totalDelta,
    );
    const sum = drivers.reduce((s, d) => s + d.contribution, 0);
    assert.ok(Math.abs(sum - totalDelta) < 0.2, `Sum ${sum} should ≈ delta ${totalDelta}`);
  });

  it("handles single segment", () => {
    const current = [makeRun({ brandMentioned: true }), makeRun({ brandMentioned: true })];
    const previous = [makeRun({ brandMentioned: false }), makeRun({ brandMentioned: false })];
    const totalDelta = 100;
    const drivers = decomposeAlongDimension(
      current, previous, "mentionRate", "model",
      (r) => r.model, totalDelta,
    );
    assert.equal(drivers.length, 1);
    assert.ok(Math.abs(drivers[0].contribution - 100) < 0.2);
  });

  it("handles zero delta", () => {
    const runs = [makeRun({ brandMentioned: true })];
    const drivers = decomposeAlongDimension(
      runs, runs, "mentionRate", "model",
      (r) => r.model, 0,
    );
    assert.equal(drivers[0].contribution, 0);
  });

  it("handles missing segment in one period", () => {
    const current = [
      makeRun({ model: "chatgpt", brandMentioned: true }),
      makeRun({ model: "gemini", brandMentioned: false }),
    ];
    const previous = [
      makeRun({ model: "chatgpt", brandMentioned: false }),
      // gemini not present in previous
    ];
    const totalDelta = computeKpi(current, "mentionRate")! - computeKpi(previous, "mentionRate")!;
    const drivers = decomposeAlongDimension(
      current, previous, "mentionRate", "model",
      (r) => r.model, totalDelta,
    );
    // Should still produce drivers for both models
    assert.equal(drivers.length, 2);
    const sum = drivers.reduce((s, d) => s + d.contribution, 0);
    assert.ok(Math.abs(sum - totalDelta) < 0.2);
  });
});

// ---------------------------------------------------------------------------
// assessConfidence
// ---------------------------------------------------------------------------

describe("assessConfidence", () => {
  it("Low with < 3 runs", () => {
    assert.equal(assessConfidence([makeRun()], [makeRun()], new Set(["chatgpt"])), "Low");
  });

  it("Medium with 3-7 runs", () => {
    const runs = Array.from({ length: 5 }, () => makeRun());
    assert.equal(assessConfidence(runs, runs, new Set(["chatgpt"])), "Medium");
  });

  it("High with 8+ runs and multiple models", () => {
    const runs = Array.from({ length: 10 }, () => makeRun());
    assert.equal(assessConfidence(runs, runs, new Set(["chatgpt", "gemini"])), "High");
  });
});

// ---------------------------------------------------------------------------
// decomposeKpi (integration)
// ---------------------------------------------------------------------------

describe("decomposeKpi", () => {
  it("produces valid result with real data", () => {
    const current = [
      makeRun({ model: "chatgpt", cluster: "industry", topic: "brand_reputation", brandMentionStrength: 80, rank: 1 }),
      makeRun({ model: "chatgpt", cluster: "direct", topic: "product_quality", brandMentionStrength: 70, rank: 1 }),
      makeRun({ model: "gemini", cluster: "industry", topic: "brand_reputation", brandMentionStrength: 50, rank: 2 }),
    ];
    const previous = [
      makeRun({ model: "chatgpt", cluster: "industry", topic: "brand_reputation", brandMentionStrength: 40, rank: 2 }),
      makeRun({ model: "chatgpt", cluster: "direct", topic: "product_quality", brandMentionStrength: 30, rank: 3 }),
      makeRun({ model: "gemini", cluster: "industry", topic: "brand_reputation", brandMentionStrength: 40, rank: 2 }),
    ];

    const result = decomposeKpi(current, previous, "mentionRate", "2025-02 to 2025-03", "2025-01 to 2025-02");

    assert.equal(result.kpi, "mentionRate");
    assert.equal(result.kpiLabel, "Mention Rate");
    assert.ok(result.totalDelta > 0, "Delta should be positive");
    assert.ok(result.drivers.length > 0, "Should have drivers");
    assert.ok(result.narrative.length > 0, "Should have narrative");
    assert.ok(result.caveats.length > 0, "Should have caveats");
    assert.ok(["High", "Medium", "Low"].includes(result.confidence));
  });

  it("handles zero delta gracefully", () => {
    const runs = [
      makeRun({ model: "chatgpt", brandMentionStrength: 50 }),
      makeRun({ model: "chatgpt", brandMentionStrength: 50 }),
      makeRun({ model: "chatgpt", brandMentionStrength: 50 }),
    ];
    const result = decomposeKpi(runs, runs, "mentionRate", "curr", "prev");
    assert.equal(result.totalDelta, 0);
    assert.ok(result.narrative.includes("flat"));
  });

  it("handles sparse data", () => {
    const current = [makeRun({ model: "chatgpt", brandMentioned: true })];
    const previous = [makeRun({ model: "chatgpt", brandMentioned: false })];
    const result = decomposeKpi(current, previous, "mentionRate", "curr", "prev");
    assert.equal(result.confidence, "Low");
  });
});

// ---------------------------------------------------------------------------
// generateNarrative
// ---------------------------------------------------------------------------

describe("generateNarrative", () => {
  it("flat delta produces flat message", () => {
    const text = generateNarrative("mentionRate", 0, [], "High");
    assert.ok(text.includes("flat"));
  });

  it("positive delta mentions increase", () => {
    const drivers = [
      { dimension: "model", segment: "chatgpt", contribution: 5, pctOfDelta: 70, sampleSize: 10, direction: "positive" as const },
    ];
    const text = generateNarrative("mentionRate", 7, drivers, "High");
    assert.ok(text.includes("increased"));
    assert.ok(text.includes("chatgpt"));
  });

  it("avgRank decrease is improvement", () => {
    const text = generateNarrative("avgRank", -1.5, [], "Medium");
    assert.ok(text.includes("improved"));
  });
});
