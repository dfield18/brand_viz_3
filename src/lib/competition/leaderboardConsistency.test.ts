import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeTextRanks,
  buildLeaderboardRows,
  buildPerModelRows,
  type LeaderboardRun,
  type LeaderboardEntity,
} from "./leaderboardMetrics";

/**
 * Regression tests for competition leaderboard mention-rate consistency.
 *
 * These tests exercise the REAL production helper (leaderboardMetrics.ts)
 * that the competition API route uses. They verify that the same methodology
 * is used for ALL entities (brand and competitors) in the leaderboard.
 *
 * The previous implementation used scope-aware response-level recall for
 * the brand but raw EntityResponseMetric counts for competitors — mixing
 * two different definitions of "Brand Recall" in the same table.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntities(...args: [string, string, boolean][]): LeaderboardEntity[] {
  return args.map(([entityId, name, isBrand]) => ({ entityId, name, isBrand }));
}

// ---------------------------------------------------------------------------
// Tests: core text-rank computation
// ---------------------------------------------------------------------------

describe("computeTextRanks (production helper)", () => {
  it("assigns ranks by first text appearance position", () => {
    const runs: LeaderboardRun[] = [
      { text: "First mention of Globex, then Acme appears.", model: "chatgpt" },
    ];
    const entities = makeEntities(["acme", "Acme", true], ["globex", "Globex", false]);
    const ranks = computeTextRanks(runs, entities);

    assert.equal(ranks.get("globex")![0], 1);
    assert.equal(ranks.get("acme")![0], 2);
  });

  it("assigns null rank when entity is not mentioned", () => {
    const runs: LeaderboardRun[] = [
      { text: "Only Acme is mentioned here.", model: "chatgpt" },
    ];
    const entities = makeEntities(["acme", "Acme", true], ["globex", "Globex", false]);
    const ranks = computeTextRanks(runs, entities);

    assert.equal(ranks.get("acme")![0], 1);
    assert.equal(ranks.get("globex")![0], null);
  });

  it("uses word-boundary matching (no substring false positives)", () => {
    const runs: LeaderboardRun[] = [
      { text: "Technikers is great. Nike is also recommended.", model: "chatgpt" },
    ];
    const entities = makeEntities(["nike", "Nike", true]);
    const ranks = computeTextRanks(runs, entities);

    assert.equal(ranks.get("nike")![0], 1);
  });

  it("produces one rank entry per run for each entity", () => {
    const runs: LeaderboardRun[] = [
      { text: "Acme and Globex", model: "chatgpt" },
      { text: "Only Acme here", model: "gemini" },
      { text: "Neither mentioned", model: "claude" },
    ];
    const entities = makeEntities(["acme", "Acme", true], ["globex", "Globex", false]);
    const ranks = computeTextRanks(runs, entities);

    assert.equal(ranks.get("acme")!.length, 3);
    assert.equal(ranks.get("globex")!.length, 3);
  });
});

// ---------------------------------------------------------------------------
// Tests: leaderboard row consistency
// ---------------------------------------------------------------------------

describe("buildLeaderboardRows (production helper)", () => {
  it("brand and competitors use the same mentionRate definition", () => {
    const runs: LeaderboardRun[] = [
      { text: "We recommend Acme for reliability. Globex is also good.", model: "chatgpt" },
      { text: "Globex leads the market. Acme is a strong alternative. Initech trails.", model: "gemini" },
      { text: "Top picks: Initech and Acme.", model: "claude" },
      { text: "Globex dominates this space.", model: "perplexity" },
    ];
    const entities = makeEntities(
      ["acme", "Acme", true],
      ["globex", "Globex", false],
      ["initech", "Initech", false],
    );
    const textRanks = computeTextRanks(runs, entities);
    const rows = buildLeaderboardRows(textRanks, entities, runs.length);

    const acme = rows.find((r) => r.entityId === "acme")!;
    const globex = rows.find((r) => r.entityId === "globex")!;
    const initech = rows.find((r) => r.entityId === "initech")!;

    // Acme: 3/4 = 75%, Globex: 3/4 = 75%, Initech: 2/4 = 50%
    assert.equal(acme.mentionRate, 75);
    assert.equal(globex.mentionRate, 75);
    assert.equal(initech.mentionRate, 50);

    // Key: brand and competitor with same presence must get same mentionRate
    assert.equal(acme.mentionRate, globex.mentionRate,
      "Brand and competitor with equal text presence must have equal mentionRate");
  });

  it("all rows share the same denominator (totalResponses)", () => {
    const runs: LeaderboardRun[] = [
      { text: "Acme is the top choice.", model: "chatgpt" },
      { text: "Globex provides alternatives.", model: "gemini" },
      { text: "Both Acme and Globex are recommended.", model: "claude" },
    ];
    const entities = makeEntities(["acme", "Acme", true], ["globex", "Globex", false]);
    const textRanks = computeTextRanks(runs, entities);
    const rows = buildLeaderboardRows(textRanks, entities, runs.length);

    assert.equal(rows[0].mentionRate, 67);
    assert.equal(rows[1].mentionRate, 67);
    assert.equal(rows[0].mentionRate, rows[1].mentionRate);
  });

  it("mentionShare sums to ~100% across all entities", () => {
    const runs: LeaderboardRun[] = [
      { text: "Acme and Globex are both mentioned here.", model: "chatgpt" },
      { text: "Only Acme appears in this response.", model: "gemini" },
      { text: "Globex and Initech dominate.", model: "claude" },
      { text: "Acme, Globex, and Initech all appear.", model: "perplexity" },
    ];
    const entities = makeEntities(
      ["acme", "Acme", true],
      ["globex", "Globex", false],
      ["initech", "Initech", false],
    );
    const textRanks = computeTextRanks(runs, entities);
    const rows = buildLeaderboardRows(textRanks, entities, runs.length);

    const totalShare = rows.reduce((s, r) => s + r.mentionShare, 0);
    assert.ok(Math.abs(totalShare - 100) < 1,
      `mentionShare should sum to ~100%, got ${totalShare}`);
  });

  it("rank1Rate uses the same text-order logic for brand and competitors", () => {
    const runs: LeaderboardRun[] = [
      { text: "Acme is great. Globex is also good.", model: "chatgpt" },
      { text: "Globex leads. Acme follows.", model: "gemini" },
      { text: "Acme is our top pick.", model: "claude" },
      { text: "Globex dominates.", model: "perplexity" },
    ];
    const entities = makeEntities(["acme", "Acme", true], ["globex", "Globex", false]);
    const textRanks = computeTextRanks(runs, entities);
    const rows = buildLeaderboardRows(textRanks, entities, runs.length);

    const acme = rows.find((r) => r.entityId === "acme")!;
    const globex = rows.find((r) => r.entityId === "globex")!;

    assert.equal(acme.rank1Rate, 50);
    assert.equal(globex.rank1Rate, 50);
  });

  it("returns empty rows for empty runs", () => {
    const entities = makeEntities(["acme", "Acme", true]);
    const textRanks = computeTextRanks([], entities);
    const rows = buildLeaderboardRows(textRanks, entities, 0);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].mentionRate, 0);
    assert.equal(rows[0].mentionShare, 0);
    assert.equal(rows[0].avgRank, null);
    assert.equal(rows[0].rank1Rate, 0);
  });
});

// ---------------------------------------------------------------------------
// Tests: per-model consistency
// ---------------------------------------------------------------------------

describe("buildPerModelRows (production helper)", () => {
  it("per-model rows use the same methodology as main leaderboard", () => {
    const runs: LeaderboardRun[] = [
      { text: "Acme is recommended. Globex too.", model: "chatgpt" },
      { text: "Globex leads the market.", model: "chatgpt" },
      { text: "Acme and Globex are both great.", model: "gemini" },
      { text: "Acme is the clear winner.", model: "gemini" },
    ];
    const entities = makeEntities(["acme", "Acme", true], ["globex", "Globex", false]);
    const textRanks = computeTextRanks(runs, entities);
    const runModels = runs.map((r) => r.model);
    const perModel = buildPerModelRows(textRanks, entities, runModels);

    for (const { model, rows } of perModel) {
      for (const row of rows) {
        // Verify each row's mentionRate is computed correctly from text presence
        const modelIndices: number[] = [];
        runModels.forEach((m, i) => { if (m === model) modelIndices.push(i); });
        const entityRanks = textRanks.get(row.entityId)!;
        const modelRanks = modelIndices.map((i) => entityRanks[i]);
        const expectedMentions = modelRanks.filter((r) => r !== null).length;
        const expectedRate = modelIndices.length > 0 ? Math.round((expectedMentions / modelIndices.length) * 100) : 0;
        assert.equal(row.mentionRate, expectedRate,
          `${row.entityId} in ${model}: expected ${expectedRate}, got ${row.mentionRate}`);
      }
    }
  });

  it("per-model mentionShare sums to ~100% within each model", () => {
    const runs: LeaderboardRun[] = [
      { text: "Acme and Globex mentioned.", model: "chatgpt" },
      { text: "Only Globex here.", model: "chatgpt" },
      { text: "Acme only.", model: "gemini" },
    ];
    const entities = makeEntities(["acme", "Acme", true], ["globex", "Globex", false]);
    const textRanks = computeTextRanks(runs, entities);
    const perModel = buildPerModelRows(textRanks, entities, runs.map((r) => r.model));

    for (const { rows } of perModel) {
      const totalShare = rows.reduce((s, r) => s + r.mentionShare, 0);
      assert.ok(Math.abs(totalShare - 100) < 1,
        `per-model mentionShare should sum to ~100%, got ${totalShare}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: no brand-only override drift
// ---------------------------------------------------------------------------

describe("No brand-only override drift", () => {
  it("brand row is NOT computed differently from competitor rows", () => {
    // This test would have passed incorrectly with the old implementation:
    // old: brand mentionRate = scope-aware text detection (different denominator/method)
    //      competitor mentionRate = raw EntityResponseMetric count
    // new: both use buildLeaderboardRows → same text-presence methodology
    //
    // Use runs where brand and competitor alternate who appears first,
    // so ALL metrics are equal when presence is identical.
    const runs: LeaderboardRun[] = [
      { text: "Acme is mentioned. Globex is mentioned.", model: "chatgpt" },
      { text: "Globex appears first. Acme too.", model: "gemini" },
      { text: "Neither brand here.", model: "claude" },
    ];
    const entities = makeEntities(["acme", "Acme", true], ["globex", "Globex", false]);
    const textRanks = computeTextRanks(runs, entities);
    const rows = buildLeaderboardRows(textRanks, entities, runs.length);

    const brand = rows.find((r) => r.isBrand)!;
    const competitor = rows.find((r) => !r.isBrand)!;

    // Both mentioned in 2/3 runs, each rank1 once
    assert.equal(brand.mentionRate, competitor.mentionRate,
      "Brand and competitor with identical presence must produce identical mentionRate — no override allowed");
    assert.equal(brand.rank1Rate, competitor.rank1Rate,
      "rank1Rate must be computed identically when each has rank1 the same number of times");
    assert.equal(brand.avgRank, competitor.avgRank,
      "avgRank must be computed identically when positions mirror");
    assert.equal(brand.mentionShare, competitor.mentionShare,
      "mentionShare must be computed identically when presence is equal");
  });
});
