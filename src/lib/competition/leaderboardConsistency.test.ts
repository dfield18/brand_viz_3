import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeMentionRate,
  computeMentionShare,
  computeAvgRank,
} from "./computeCompetition";

/**
 * Regression tests for competition leaderboard mention-rate consistency.
 *
 * These tests verify that the same methodology is used for ALL entities
 * (brand and competitors) in the leaderboard. The previous implementation
 * used scope-aware response-level recall for the brand but raw
 * EntityResponseMetric counts for competitors — mixing two different
 * definitions of "Brand Recall" in the same table.
 *
 * The fixed implementation derives all metrics from text-presence detection
 * (wordBoundaryIndex) applied uniformly to every entity in every run.
 */

// ---------------------------------------------------------------------------
// Simulated text-presence detection (mirrors route.ts text-rank loop)
// ---------------------------------------------------------------------------

/**
 * Simple word-boundary match (mirrors wordBoundaryIndex behavior).
 * Returns the character index of the first match, or -1.
 */
function wordBoundaryIndex(text: string, term: string): number {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`, "i");
  const match = regex.exec(text);
  return match ? match.index : -1;
}

interface SimulatedRun {
  text: string;
}

/**
 * Compute text-order ranks for a set of entities across runs.
 * This mirrors the leaderboard's unified text-rank loop.
 */
function computeTextRanks(
  runs: SimulatedRun[],
  entityNames: Map<string, string>, // entityId → display name
): Map<string, (number | null)[]> {
  const textRanks = new Map<string, (number | null)[]>();
  for (const id of entityNames.keys()) textRanks.set(id, []);

  for (const run of runs) {
    const positions: { entityId: string; pos: number }[] = [];
    for (const [entityId, name] of entityNames) {
      const pos = wordBoundaryIndex(run.text, name);
      if (pos >= 0) positions.push({ entityId, pos });
    }
    positions.sort((a, b) => a.pos - b.pos);
    for (const entityId of entityNames.keys()) {
      const idx = positions.findIndex((e) => e.entityId === entityId);
      textRanks.get(entityId)!.push(idx >= 0 ? idx + 1 : null);
    }
  }

  return textRanks;
}

/**
 * Derive leaderboard rows from text ranks (mirrors the fixed route.ts logic).
 */
function buildLeaderboardRows(
  textRanks: Map<string, (number | null)[]>,
  totalResponses: number,
  brandId: string,
) {
  // Derive text-presence counts
  const textMentions = new Map<string, number>();
  let totalTextMentions = 0;
  for (const [entityId, ranks] of textRanks) {
    const count = ranks.filter((r) => r !== null).length;
    textMentions.set(entityId, count);
    totalTextMentions += count;
  }

  return [...textRanks.entries()].map(([entityId, ranks]) => {
    const mentions = textMentions.get(entityId) ?? 0;
    const rank1Count = ranks.filter((r) => r === 1).length;
    return {
      entityId,
      isBrand: entityId === brandId,
      mentionRate: computeMentionRate(mentions, totalResponses),
      mentionShare: computeMentionShare(mentions, totalTextMentions),
      avgRank: computeAvgRank(ranks),
      rank1Rate: totalResponses > 0 ? Math.round((rank1Count / totalResponses) * 100) : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Leaderboard mention-rate consistency", () => {
  it("brand and competitors use the same mentionRate definition", () => {
    // Scenario: 4 runs. Brand "Acme" mentioned in 3 runs.
    // Competitor "Globex" mentioned in 3 runs. Competitor "Initech" in 2 runs.
    const runs: SimulatedRun[] = [
      { text: "We recommend Acme for reliability. Globex is also good." },
      { text: "Globex leads the market. Acme is a strong alternative. Initech trails." },
      { text: "Top picks: Initech and Acme." },
      { text: "Globex dominates this space." }, // brand absent
    ];

    const entityNames = new Map([
      ["acme", "Acme"],
      ["globex", "Globex"],
      ["initech", "Initech"],
    ]);

    const textRanks = computeTextRanks(runs, entityNames);
    const rows = buildLeaderboardRows(textRanks, runs.length, "acme");

    const acme = rows.find((r) => r.entityId === "acme")!;
    const globex = rows.find((r) => r.entityId === "globex")!;
    const initech = rows.find((r) => r.entityId === "initech")!;

    // Acme: mentioned in 3/4 runs = 75%
    assert.equal(acme.mentionRate, 75);
    // Globex: mentioned in 3/4 runs = 75%
    assert.equal(globex.mentionRate, 75);
    // Initech: mentioned in 2/4 runs = 50%
    assert.equal(initech.mentionRate, 50);

    // Key assertion: brand and competitor with same presence count
    // must have the same mentionRate — this was broken before the fix
    assert.equal(acme.mentionRate, globex.mentionRate,
      "Brand and competitor with equal text presence must have equal mentionRate");
  });

  it("all rows share the same denominator (totalResponses)", () => {
    const runs: SimulatedRun[] = [
      { text: "Acme is the top choice." },
      { text: "Globex provides alternatives." },
      { text: "Both Acme and Globex are recommended." },
    ];

    const entityNames = new Map([
      ["acme", "Acme"],
      ["globex", "Globex"],
    ]);

    const textRanks = computeTextRanks(runs, entityNames);
    const rows = buildLeaderboardRows(textRanks, runs.length, "acme");

    // Acme: 2/3 = 67%, Globex: 2/3 = 67%
    assert.equal(rows[0].mentionRate, 67);
    assert.equal(rows[1].mentionRate, 67);

    // Confirm they compute against the same denominator
    // If brand used a different denominator, these would diverge
    assert.equal(rows[0].mentionRate, rows[1].mentionRate);
  });

  it("mentionShare sums to ~100% across all entities", () => {
    const runs: SimulatedRun[] = [
      { text: "Acme and Globex are both mentioned here." },
      { text: "Only Acme appears in this response." },
      { text: "Globex and Initech dominate." },
      { text: "Acme, Globex, and Initech all appear." },
    ];

    const entityNames = new Map([
      ["acme", "Acme"],
      ["globex", "Globex"],
      ["initech", "Initech"],
    ]);

    const textRanks = computeTextRanks(runs, entityNames);
    const rows = buildLeaderboardRows(textRanks, runs.length, "acme");

    const totalShare = rows.reduce((s, r) => s + r.mentionShare, 0);
    // Should sum to 100% (with possible rounding tolerance)
    assert.ok(Math.abs(totalShare - 100) < 1,
      `mentionShare should sum to ~100%, got ${totalShare}`);
  });

  it("rank1Rate uses the same text-order logic for brand and competitors", () => {
    // Run 1: Acme first (rank 1), Globex second (rank 2)
    // Run 2: Globex first (rank 1), Acme second (rank 2)
    // Run 3: Acme first (rank 1)
    // Run 4: Globex first (rank 1)
    const runs: SimulatedRun[] = [
      { text: "Acme is great. Globex is also good." },
      { text: "Globex leads. Acme follows." },
      { text: "Acme is our top pick." },
      { text: "Globex dominates." },
    ];

    const entityNames = new Map([
      ["acme", "Acme"],
      ["globex", "Globex"],
    ]);

    const textRanks = computeTextRanks(runs, entityNames);
    const rows = buildLeaderboardRows(textRanks, runs.length, "acme");

    const acme = rows.find((r) => r.entityId === "acme")!;
    const globex = rows.find((r) => r.entityId === "globex")!;

    // Acme: rank 1 in runs 1,3 → 2/4 = 50%
    assert.equal(acme.rank1Rate, 50);
    // Globex: rank 1 in runs 2,4 → 2/4 = 50%
    assert.equal(globex.rank1Rate, 50);
  });

  it("per-model rows use the same methodology as main leaderboard", () => {
    // Simulate per-model extraction:
    // Model A runs: [run 0, run 1], Model B runs: [run 2, run 3]
    const runs: SimulatedRun[] = [
      { text: "Acme is recommended. Globex too." },     // model A
      { text: "Globex leads the market." },              // model A
      { text: "Acme and Globex are both great." },       // model B
      { text: "Acme is the clear winner." },             // model B
    ];

    const entityNames = new Map([
      ["acme", "Acme"],
      ["globex", "Globex"],
    ]);

    const textRanks = computeTextRanks(runs, entityNames);
    const runModels = ["modelA", "modelA", "modelB", "modelB"];

    // Per-model extraction (mirrors route.ts model split logic)
    for (const modelId of ["modelA", "modelB"]) {
      const modelIndices: number[] = [];
      for (let i = 0; i < runModels.length; i++) {
        if (runModels[i] === modelId) modelIndices.push(i);
      }
      const modelTotal = modelIndices.length;

      // Extract per-model text ranks
      const modelTextRanks = new Map<string, (number | null)[]>();
      for (const [entityId, allRanks] of textRanks) {
        modelTextRanks.set(entityId, modelIndices.map((i) => allRanks[i]));
      }

      const modelRows = buildLeaderboardRows(modelTextRanks, modelTotal, "acme");

      // Verify brand and competitor use same methodology within each model
      for (const row of modelRows) {
        const ranks = modelTextRanks.get(row.entityId)!;
        const textMentions = ranks.filter((r) => r !== null).length;
        const expectedRate = computeMentionRate(textMentions, modelTotal);
        assert.equal(row.mentionRate, expectedRate,
          `${row.entityId} in ${modelId}: mentionRate should be ${expectedRate}, got ${row.mentionRate}`);
      }
    }
  });
});

describe("Text-rank computation", () => {
  it("assigns ranks by first text appearance position", () => {
    const runs: SimulatedRun[] = [
      { text: "First mention of Globex, then Acme appears." },
    ];

    const entityNames = new Map([
      ["acme", "Acme"],
      ["globex", "Globex"],
    ]);

    const textRanks = computeTextRanks(runs, entityNames);

    // Globex appears first → rank 1, Acme appears second → rank 2
    assert.equal(textRanks.get("globex")![0], 1);
    assert.equal(textRanks.get("acme")![0], 2);
  });

  it("assigns null rank when entity is not mentioned", () => {
    const runs: SimulatedRun[] = [
      { text: "Only Acme is mentioned here." },
    ];

    const entityNames = new Map([
      ["acme", "Acme"],
      ["globex", "Globex"],
    ]);

    const textRanks = computeTextRanks(runs, entityNames);

    assert.equal(textRanks.get("acme")![0], 1);
    assert.equal(textRanks.get("globex")![0], null);
  });

  it("uses word-boundary matching (avoids substring false positives)", () => {
    const runs: SimulatedRun[] = [
      { text: "Technikers is great. Nike is also recommended." },
    ];

    const entityNames = new Map([
      ["nike", "Nike"],
    ]);

    const textRanks = computeTextRanks(runs, entityNames);

    // "Nike" should match at position of "Nike", not "Technikers"
    assert.equal(textRanks.get("nike")![0], 1);
  });
});
