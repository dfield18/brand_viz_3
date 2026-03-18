import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeTopicRows,
  computeTopicOwnership,
  detectEmergingTopics,
  type TopicMetricInput,
} from "./topicRollups";

function makeMetric(overrides: Partial<TopicMetricInput> = {}): TopicMetricInput {
  return {
    runId: "run-1",
    promptId: "prompt-1",
    topicKey: "brand_reputation",
    entityId: "acme",
    model: "chatgpt",
    rankPosition: 1,
    createdAt: new Date("2025-01-15"),
    ...overrides,
  };
}

describe("computeTopicRows", () => {
  it("returns empty array for empty input", () => {
    const result = computeTopicRows([], "acme", new Map());
    assert.deepEqual(result, []);
  });

  it("computes mention rate correctly", () => {
    const metrics: TopicMetricInput[] = [
      makeMetric({ runId: "r1", promptId: "p1" }),
      makeMetric({ runId: "r2", promptId: "p2" }),
    ];
    const totalByTopic = new Map([["brand_reputation", 4]]);
    const rows = computeTopicRows(metrics, "acme", totalByTopic);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].topicKey, "brand_reputation");
    assert.equal(rows[0].mentionRate, 50); // 2/4 = 50%
  });

  it("computes avgRank and rank1Rate", () => {
    const metrics: TopicMetricInput[] = [
      makeMetric({ runId: "r1", promptId: "p1", rankPosition: 1 }),
      makeMetric({ runId: "r2", promptId: "p2", rankPosition: 3 }),
      makeMetric({ runId: "r3", promptId: "p3", rankPosition: 1 }),
    ];
    const totalByTopic = new Map([["brand_reputation", 3]]);
    const rows = computeTopicRows(metrics, "acme", totalByTopic);

    assert.equal(rows.length, 1);
    // avgRank: (1+3+1)/3 = 1.67
    assert.equal(rows[0].avgRank, 1.67);
    // rank1Rate: 2/3 = 67%
    assert.equal(rows[0].rank1Rate, 67);
  });

  it("handles null rankPosition", () => {
    const metrics: TopicMetricInput[] = [
      makeMetric({ runId: "r1", rankPosition: null }),
      makeMetric({ runId: "r2", rankPosition: 2 }),
    ];
    const totalByTopic = new Map([["brand_reputation", 2]]);
    const rows = computeTopicRows(metrics, "acme", totalByTopic);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].avgRank, 2); // only one valid rank
  });

  it("only includes brand entity metrics", () => {
    const metrics: TopicMetricInput[] = [
      makeMetric({ entityId: "acme" }),
      makeMetric({ entityId: "competitor" }),
    ];
    const totalByTopic = new Map([["brand_reputation", 2]]);
    const rows = computeTopicRows(metrics, "acme", totalByTopic);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].mentionCount, 1);
  });

  it("sorts by mentionRate descending", () => {
    const metrics: TopicMetricInput[] = [
      makeMetric({ topicKey: "sustainability" }),
      makeMetric({ topicKey: "brand_reputation" }),
      makeMetric({ topicKey: "brand_reputation", runId: "r2", promptId: "p2" }),
    ];
    const totalByTopic = new Map([
      ["sustainability", 2],
      ["brand_reputation", 2],
    ]);
    const rows = computeTopicRows(metrics, "acme", totalByTopic);

    assert.equal(rows[0].topicKey, "brand_reputation"); // 100% > 50%
    assert.equal(rows[1].topicKey, "sustainability");
  });

  it("computes promptCount correctly", () => {
    const metrics: TopicMetricInput[] = [
      makeMetric({ entityId: "acme", promptId: "p1" }),
      makeMetric({ entityId: "acme", runId: "r2", promptId: "p2" }),
      makeMetric({ entityId: "other", runId: "r3", promptId: "p1" }),
    ];
    const totalByTopic = new Map([["brand_reputation", 3]]);
    const rows = computeTopicRows(metrics, "acme", totalByTopic);

    assert.equal(rows[0].promptCount, 2); // p1 and p2 (distinct prompts across all entities)
  });

  it("returns null avgRank when all ranks are null", () => {
    const metrics: TopicMetricInput[] = [
      makeMetric({ runId: "r1", rankPosition: null }),
      makeMetric({ runId: "r2", promptId: "p2", rankPosition: null }),
    ];
    const totalByTopic = new Map([["brand_reputation", 2]]);
    const rows = computeTopicRows(metrics, "acme", totalByTopic);

    assert.equal(rows[0].avgRank, null);
    assert.equal(rows[0].rank1Rate, 0);
  });

  it("falls back to mentions count when totalResponsesByTopic missing key", () => {
    const metrics: TopicMetricInput[] = [
      makeMetric({ runId: "r1" }),
    ];
    // Empty map — no entry for brand_reputation
    const rows = computeTopicRows(metrics, "acme", new Map());

    // Falls back: mentionRate = mentions/mentions = 100%
    assert.equal(rows[0].mentionRate, 100);
  });
});

describe("computeTopicOwnership", () => {
  it("returns empty array for empty input", () => {
    const result = computeTopicOwnership([], "acme");
    assert.deepEqual(result, []);
  });

  it("identifies leader by mention count", () => {
    const metrics: TopicMetricInput[] = [
      makeMetric({ entityId: "acme" }),
      makeMetric({ entityId: "competitor-a", runId: "r2" }),
      makeMetric({ entityId: "competitor-a", runId: "r3" }),
    ];
    const rows = computeTopicOwnership(metrics, "acme");

    assert.equal(rows.length, 1);
    assert.equal(rows[0].leaderEntityId, "competitor-a");
    assert.equal(rows[0].brandRank, 2);
  });

  it("computes brand mention share", () => {
    const metrics: TopicMetricInput[] = [
      makeMetric({ entityId: "acme" }),
      makeMetric({ entityId: "acme", runId: "r2" }),
      makeMetric({ entityId: "other", runId: "r3" }),
    ];
    const rows = computeTopicOwnership(metrics, "acme");

    assert.equal(rows[0].leaderEntityId, "acme");
    // brand share: 2/3 = 66.67%
    assert.ok(rows[0].brandMentionShare > 66 && rows[0].brandMentionShare < 67);
  });

  it("counts all entity metrics for ownership", () => {
    const metrics: TopicMetricInput[] = [
      makeMetric({ entityId: "acme" }),
      makeMetric({ entityId: "other", runId: "r2" }),
    ];
    const rows = computeTopicOwnership(metrics, "acme");

    assert.equal(rows.length, 1);
    assert.equal(rows[0].brandMentionShare, 50);
  });

  it("returns null brandRank when brand is absent from topic", () => {
    const metrics: TopicMetricInput[] = [
      makeMetric({ entityId: "competitor-a" }),
      makeMetric({ entityId: "competitor-b", runId: "r2" }),
    ];
    const rows = computeTopicOwnership(metrics, "acme");

    assert.equal(rows[0].brandRank, null);
    assert.equal(rows[0].brandMentionShare, 0);
  });

  it("handles multiple topics producing multiple rows", () => {
    const metrics: TopicMetricInput[] = [
      makeMetric({ topicKey: "brand_reputation", entityId: "acme" }),
      makeMetric({ topicKey: "sustainability", entityId: "acme", runId: "r2" }),
    ];
    const rows = computeTopicOwnership(metrics, "acme");

    assert.equal(rows.length, 2);
    const keys = rows.map((r) => r.topicKey);
    assert.ok(keys.includes("brand_reputation"));
    assert.ok(keys.includes("sustainability"));
  });

  it("formats leaderName with titleCase", () => {
    const metrics: TopicMetricInput[] = [
      makeMetric({ entityId: "competitor-a" }),
    ];
    const rows = computeTopicOwnership(metrics, "acme");

    assert.equal(rows[0].leaderName, "Competitor A");
  });
});

describe("detectEmergingTopics", () => {
  const midpoint = new Date("2025-01-15");

  it("returns empty array for empty input", () => {
    const result = detectEmergingTopics([], "acme", midpoint, new Map());
    assert.deepEqual(result, []);
  });

  it("detects emerging topics with growth >= 25%", () => {
    const metrics: TopicMetricInput[] = [
      // Previous period (before midpoint): 1 mention
      makeMetric({ createdAt: new Date("2025-01-10") }),
      // Current period (at/after midpoint): 3 mentions
      makeMetric({ runId: "r2", createdAt: new Date("2025-01-20") }),
      makeMetric({ runId: "r3", createdAt: new Date("2025-01-21") }),
      makeMetric({ runId: "r4", createdAt: new Date("2025-01-22") }),
    ];
    const result = detectEmergingTopics(metrics, "acme", midpoint, new Map());

    assert.equal(result.length, 1);
    assert.equal(result[0].topicKey, "brand_reputation");
    assert.equal(result[0].currentMentions, 3);
    assert.equal(result[0].previousMentions, 1);
    assert.equal(result[0].growthRate, 200); // (3-1)/1 * 100
  });

  it("skips topics with fewer than 2 current mentions", () => {
    const metrics: TopicMetricInput[] = [
      makeMetric({ createdAt: new Date("2025-01-10") }),
      makeMetric({ runId: "r2", createdAt: new Date("2025-01-20") }),
    ];
    const result = detectEmergingTopics(metrics, "acme", midpoint, new Map());

    // Only 1 current mention → skipped
    assert.equal(result.length, 0);
  });

  it("detects brand-new topics (0 previous → 100% growth)", () => {
    const metrics: TopicMetricInput[] = [
      // No previous mentions, 2 current
      makeMetric({ runId: "r1", createdAt: new Date("2025-01-20") }),
      makeMetric({ runId: "r2", createdAt: new Date("2025-01-21") }),
    ];
    const result = detectEmergingTopics(metrics, "acme", midpoint, new Map());

    assert.equal(result.length, 1);
    assert.equal(result[0].growthRate, 100);
  });

  it("only considers brand entity metrics", () => {
    const metrics: TopicMetricInput[] = [
      makeMetric({ entityId: "other", runId: "r1", createdAt: new Date("2025-01-20") }),
      makeMetric({ entityId: "other", runId: "r2", createdAt: new Date("2025-01-21") }),
    ];
    const result = detectEmergingTopics(metrics, "acme", midpoint, new Map());

    assert.equal(result.length, 0);
  });

  it("sorts by growthRate descending", () => {
    const metrics: TopicMetricInput[] = [
      // sustainability: 1 prev → 2 cur = 100% growth
      makeMetric({ topicKey: "sustainability", createdAt: new Date("2025-01-10") }),
      makeMetric({ topicKey: "sustainability", runId: "r2", createdAt: new Date("2025-01-20") }),
      makeMetric({ topicKey: "sustainability", runId: "r3", createdAt: new Date("2025-01-21") }),
      // brand_reputation: 1 prev → 4 cur = 300% growth
      makeMetric({ topicKey: "brand_reputation", createdAt: new Date("2025-01-10") }),
      makeMetric({ topicKey: "brand_reputation", runId: "r5", createdAt: new Date("2025-01-20") }),
      makeMetric({ topicKey: "brand_reputation", runId: "r6", createdAt: new Date("2025-01-21") }),
      makeMetric({ topicKey: "brand_reputation", runId: "r7", createdAt: new Date("2025-01-22") }),
      makeMetric({ topicKey: "brand_reputation", runId: "r8", createdAt: new Date("2025-01-23") }),
    ];
    const result = detectEmergingTopics(metrics, "acme", midpoint, new Map());

    assert.equal(result.length, 2);
    assert.equal(result[0].topicKey, "brand_reputation"); // 300% > 100%
    assert.equal(result[1].topicKey, "sustainability");
  });

  it("excludes declining topics (negative growth)", () => {
    const metrics: TopicMetricInput[] = [
      // 3 previous, 2 current = -33% growth → excluded
      makeMetric({ runId: "r1", createdAt: new Date("2025-01-05") }),
      makeMetric({ runId: "r2", createdAt: new Date("2025-01-06") }),
      makeMetric({ runId: "r3", createdAt: new Date("2025-01-07") }),
      makeMetric({ runId: "r4", createdAt: new Date("2025-01-20") }),
      makeMetric({ runId: "r5", createdAt: new Date("2025-01-21") }),
    ];
    const result = detectEmergingTopics(metrics, "acme", midpoint, new Map());

    assert.equal(result.length, 0);
  });

  it("includes topic at exactly 25% growth boundary", () => {
    const metrics: TopicMetricInput[] = [
      // 4 previous, 5 current = 25% growth → included
      makeMetric({ runId: "r1", createdAt: new Date("2025-01-05") }),
      makeMetric({ runId: "r2", createdAt: new Date("2025-01-06") }),
      makeMetric({ runId: "r3", createdAt: new Date("2025-01-07") }),
      makeMetric({ runId: "r4", createdAt: new Date("2025-01-08") }),
      makeMetric({ runId: "r5", createdAt: new Date("2025-01-20") }),
      makeMetric({ runId: "r6", createdAt: new Date("2025-01-21") }),
      makeMetric({ runId: "r7", createdAt: new Date("2025-01-22") }),
      makeMetric({ runId: "r8", createdAt: new Date("2025-01-23") }),
      makeMetric({ runId: "r9", createdAt: new Date("2025-01-24") }),
    ];
    const result = detectEmergingTopics(metrics, "acme", midpoint, new Map());

    assert.equal(result.length, 1);
    assert.equal(result[0].growthRate, 25);
  });

  it("counts all brand entity metrics", () => {
    const metrics: TopicMetricInput[] = [
      makeMetric({ runId: "r1", createdAt: new Date("2025-01-20") }),
      makeMetric({ runId: "r2", createdAt: new Date("2025-01-21") }),
      makeMetric({ runId: "r3", createdAt: new Date("2025-01-22") }),
    ];
    const result = detectEmergingTopics(metrics, "acme", midpoint, new Map());

    assert.equal(result.length, 1);
    assert.equal(result[0].currentMentions, 3);
  });
});
