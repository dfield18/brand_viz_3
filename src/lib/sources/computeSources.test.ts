import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeSourceSummary,
  computeTopDomains,
  computeSourceModelSplit,
  detectEmergingSources,
  computeCompetitorCrossCitation,
  type SourceOccurrenceInput,
  type EntityMetricInput,
} from "./computeSources";

function makeOcc(overrides: Partial<SourceOccurrenceInput> = {}): SourceOccurrenceInput {
  return {
    runId: "run1",
    promptId: "p1",
    model: "chatgpt",
    entityId: null,
    domain: "example.com",
    normalizedUrl: "https://example.com/page",
    createdAt: new Date("2024-06-15"),
    ...overrides,
  };
}

function makeMetric(overrides: Partial<EntityMetricInput> = {}): EntityMetricInput {
  return {
    runId: "run1",
    entityId: "nike",
    prominenceScore: 50,
    rankPosition: 2,
    ...overrides,
  };
}

describe("computeSourceSummary", () => {
  it("computes basic metrics", () => {
    const occ = [
      makeOcc({ runId: "r1", domain: "a.com" }),
      makeOcc({ runId: "r1", domain: "b.com" }),
      makeOcc({ runId: "r2", domain: "a.com" }),
    ];
    const result = computeSourceSummary(occ, [], "nike", 5);
    assert.equal(result.totalCitations, 3);
    assert.equal(result.uniqueDomains, 2);
    assert.equal(result.citationsPerResponse, 0.6);
    assert.equal(result.pctResponsesWithCitations, 40); // 2 runs with citations out of 5
  });

  it("computes authority driver count", () => {
    const occ = [
      makeOcc({ runId: "r1", domain: "authority.com" }),
      makeOcc({ runId: "r1", domain: "other.com" }),
      makeOcc({ runId: "r2", domain: "authority.com" }),
    ];
    const metrics = [
      makeMetric({ runId: "r1", entityId: "nike", prominenceScore: 80, rankPosition: 1 }),
      makeMetric({ runId: "r2", entityId: "nike", prominenceScore: 50, rankPosition: 3 }),
    ];
    const result = computeSourceSummary(occ, metrics, "nike", 2);
    assert.equal(result.authorityDriverCount, 2); // a.com and other.com cited in r1 which has rank=1 & prominence≥70
  });

  it("returns zeros for empty data", () => {
    const result = computeSourceSummary([], [], "nike", 0);
    assert.equal(result.totalCitations, 0);
    assert.equal(result.uniqueDomains, 0);
    assert.equal(result.citationsPerResponse, 0);
    assert.equal(result.pctResponsesWithCitations, 0);
    assert.equal(result.authorityDriverCount, 0);
  });
});

describe("computeTopDomains", () => {
  it("sorts by citation count descending", () => {
    const occ = [
      makeOcc({ runId: "r1", domain: "less.com" }),
      makeOcc({ runId: "r1", domain: "more.com" }),
      makeOcc({ runId: "r2", domain: "more.com" }),
      makeOcc({ runId: "r3", domain: "more.com" }),
    ];
    const result = computeTopDomains(occ, [], "nike", 3);
    assert.equal(result[0].domain, "more.com");
    assert.equal(result[0].citations, 3);
    assert.equal(result[1].domain, "less.com");
    assert.equal(result[1].citations, 1);
  });

  it("computes prominence lift", () => {
    const occ = [
      makeOcc({ runId: "r1", domain: "good.com" }),
      makeOcc({ runId: "r2", domain: "bad.com" }),
    ];
    const metrics = [
      makeMetric({ runId: "r1", prominenceScore: 90, rankPosition: 1 }),
      makeMetric({ runId: "r2", prominenceScore: 30, rankPosition: 5 }),
    ];
    const result = computeTopDomains(occ, metrics, "nike", 2);
    const good = result.find((r) => r.domain === "good.com")!;
    const bad = result.find((r) => r.domain === "bad.com")!;
    // Baseline: (90+30)/2 = 60
    assert.ok(good.prominenceLift > 0); // 90 - 60 = 30
    assert.ok(bad.prominenceLift < 0);  // 30 - 60 = -30
  });

  it("computes rank lift", () => {
    const occ = [
      makeOcc({ runId: "r1", domain: "good.com" }),
      makeOcc({ runId: "r2", domain: "bad.com" }),
    ];
    const metrics = [
      makeMetric({ runId: "r1", prominenceScore: 80, rankPosition: 1 }),
      makeMetric({ runId: "r2", prominenceScore: 40, rankPosition: 5 }),
    ];
    const result = computeTopDomains(occ, metrics, "nike", 2);
    const good = result.find((r) => r.domain === "good.com")!;
    const bad = result.find((r) => r.domain === "bad.com")!;
    // Baseline rank: (1+5)/2 = 3
    assert.ok(good.rankLift < 0); // 1 - 3 = -2 (better)
    assert.ok(bad.rankLift > 0);  // 5 - 3 = 2 (worse)
  });

  it("respects limit", () => {
    const occ = [
      makeOcc({ domain: "a.com" }),
      makeOcc({ domain: "b.com" }),
      makeOcc({ domain: "c.com" }),
    ];
    const result = computeTopDomains(occ, [], "nike", 3, 2);
    assert.equal(result.length, 2);
  });

  it("returns empty for no occurrences", () => {
    assert.equal(computeTopDomains([], [], "nike", 0).length, 0);
  });

  it("computes firstSeen and lastSeen", () => {
    const occ = [
      makeOcc({ runId: "r1", domain: "a.com", createdAt: new Date("2024-01-01") }),
      makeOcc({ runId: "r2", domain: "a.com", createdAt: new Date("2024-06-15") }),
    ];
    const result = computeTopDomains(occ, [], "nike", 2);
    assert.equal(result[0].firstSeen, "2024-01-01");
    assert.equal(result[0].lastSeen, "2024-06-15");
  });

  it("computes rank1 rate", () => {
    const occ = [
      makeOcc({ runId: "r1", domain: "a.com" }),
      makeOcc({ runId: "r2", domain: "a.com" }),
      makeOcc({ runId: "r3", domain: "a.com" }),
    ];
    const metrics = [
      makeMetric({ runId: "r1", rankPosition: 1 }),
      makeMetric({ runId: "r2", rankPosition: 1 }),
      makeMetric({ runId: "r3", rankPosition: 3 }),
    ];
    const result = computeTopDomains(occ, metrics, "nike", 3);
    assert.equal(result[0].rank1RateWhenCited, 67); // 2 out of 3
  });
});

describe("computeSourceModelSplit", () => {
  it("groups by model", () => {
    const occ = [
      makeOcc({ model: "chatgpt", domain: "a.com" }),
      makeOcc({ model: "chatgpt", domain: "a.com" }),
      makeOcc({ model: "gemini", domain: "b.com" }),
    ];
    const result = computeSourceModelSplit(occ);
    assert.equal(result.length, 2);
    const chatgpt = result.find((r) => r.model === "chatgpt")!;
    const gemini = result.find((r) => r.model === "gemini")!;
    assert.equal(chatgpt.domains[0].domain, "a.com");
    assert.equal(chatgpt.domains[0].citations, 2);
    assert.equal(gemini.domains[0].domain, "b.com");
  });

  it("limits to 15 domains per model", () => {
    const occ = Array.from({ length: 20 }, (_, i) =>
      makeOcc({ model: "chatgpt", domain: `domain${i}.com` }),
    );
    const result = computeSourceModelSplit(occ);
    assert.equal(result[0].domains.length, 15);
  });
});

describe("detectEmergingSources", () => {
  it("detects growing domains", () => {
    const mid = new Date("2024-06-01");
    const occ = [
      makeOcc({ domain: "growing.com", createdAt: new Date("2024-05-01") }),
      makeOcc({ domain: "growing.com", createdAt: new Date("2024-07-01") }),
      makeOcc({ domain: "growing.com", createdAt: new Date("2024-07-02") }),
      makeOcc({ domain: "growing.com", createdAt: new Date("2024-07-03") }),
    ];
    const result = detectEmergingSources(occ, mid);
    assert.ok(result.length > 0);
    assert.equal(result[0].domain, "growing.com");
    assert.ok(result[0].growthRate >= 25);
  });

  it("filters out domains with < 2 current citations", () => {
    const mid = new Date("2024-06-01");
    const occ = [
      makeOcc({ domain: "tiny.com", createdAt: new Date("2024-07-01") }), // only 1 current
    ];
    const result = detectEmergingSources(occ, mid);
    assert.equal(result.length, 0);
  });

  it("detects brand new domains (0 previous → 100% growth)", () => {
    const mid = new Date("2024-06-01");
    const occ = [
      makeOcc({ domain: "new.com", createdAt: new Date("2024-07-01") }),
      makeOcc({ domain: "new.com", createdAt: new Date("2024-07-02") }),
    ];
    const result = detectEmergingSources(occ, mid);
    assert.ok(result.length > 0);
    assert.equal(result[0].domain, "new.com");
    assert.equal(result[0].growthRate, 100);
    assert.equal(result[0].previousCitations, 0);
    assert.equal(result[0].currentCitations, 2);
  });

  it("excludes domains with < 25% growth", () => {
    const mid = new Date("2024-06-01");
    const occ = [
      // 10 previous, 12 current → 20% growth (below threshold)
      ...Array.from({ length: 10 }, () => makeOcc({ domain: "stable.com", createdAt: new Date("2024-05-01") })),
      ...Array.from({ length: 12 }, () => makeOcc({ domain: "stable.com", createdAt: new Date("2024-07-01") })),
    ];
    const result = detectEmergingSources(occ, mid);
    assert.equal(result.length, 0);
  });

  it("sorts by growth rate descending", () => {
    const mid = new Date("2024-06-01");
    const occ = [
      // slow: 2 prev, 3 current → 50% growth
      makeOcc({ domain: "slow.com", createdAt: new Date("2024-05-01") }),
      makeOcc({ domain: "slow.com", createdAt: new Date("2024-05-02") }),
      makeOcc({ domain: "slow.com", createdAt: new Date("2024-07-01") }),
      makeOcc({ domain: "slow.com", createdAt: new Date("2024-07-02") }),
      makeOcc({ domain: "slow.com", createdAt: new Date("2024-07-03") }),
      // fast: 0 prev, 5 current → 100%
      ...Array.from({ length: 5 }, () => makeOcc({ domain: "fast.com", createdAt: new Date("2024-07-01") })),
    ];
    const result = detectEmergingSources(occ, mid);
    assert.equal(result[0].domain, "fast.com");
    assert.equal(result[1].domain, "slow.com");
  });
});

describe("computeCompetitorCrossCitation", () => {
  it("counts entity attributions per domain", () => {
    const occ = [
      makeOcc({ domain: "a.com", entityId: "nike" }),
      makeOcc({ domain: "a.com", entityId: "nike" }),
      makeOcc({ domain: "a.com", entityId: "adidas" }),
      makeOcc({ domain: "b.com", entityId: "nike" }),
    ];
    const result = computeCompetitorCrossCitation(occ, ["a.com", "b.com"]);
    assert.equal(result.length, 2);

    const aDom = result.find((r) => r.domain === "a.com")!;
    assert.equal(aDom.entityCounts["nike"], 2);
    assert.equal(aDom.entityCounts["adidas"], 1);

    const bDom = result.find((r) => r.domain === "b.com")!;
    assert.equal(bDom.entityCounts["nike"], 1);
  });

  it("excludes occurrences with null entityId", () => {
    const occ = [
      makeOcc({ domain: "a.com", entityId: null }),
      makeOcc({ domain: "a.com", entityId: "nike" }),
    ];
    const result = computeCompetitorCrossCitation(occ, ["a.com"]);
    assert.equal(result[0].entityCounts["nike"], 1);
    assert.equal(Object.keys(result[0].entityCounts).length, 1);
  });

  it("only includes domains from topDomains list", () => {
    const occ = [
      makeOcc({ domain: "a.com", entityId: "nike" }),
      makeOcc({ domain: "excluded.com", entityId: "nike" }),
    ];
    const result = computeCompetitorCrossCitation(occ, ["a.com"]);
    assert.equal(result.length, 1);
    assert.equal(result[0].domain, "a.com");
  });

  it("returns empty for no attributed occurrences", () => {
    const occ = [makeOcc({ domain: "a.com", entityId: null })];
    const result = computeCompetitorCrossCitation(occ, ["a.com"]);
    assert.equal(result.length, 0);
  });
});
