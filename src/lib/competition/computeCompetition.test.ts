import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assignRanks,
  computeMentionShare,
  computeAvgRank,
  computeRank1Rate,
  computeHHI,
  computeFragmentation,
  computeWinLoss,
  computeMentionRate,
  computeAvgProminence,
} from "./computeCompetition";

// ---------------------------------------------------------------------------
// assignRanks
// ---------------------------------------------------------------------------

describe("assignRanks", () => {
  it("ranks 3 entities by prominence desc", () => {
    const result = assignRanks([
      { entityId: "a", prominenceScore: 0.5 },
      { entityId: "b", prominenceScore: 0.9 },
      { entityId: "c", prominenceScore: 0.2 },
    ]);
    assert.equal(result.length, 3);
    assert.equal(result[0].entityId, "b");
    assert.equal(result[0].rankPosition, 1);
    assert.equal(result[1].entityId, "a");
    assert.equal(result[1].rankPosition, 2);
    assert.equal(result[2].entityId, "c");
    assert.equal(result[2].rankPosition, 3);
    // All should have competitorsInResponse = 3
    for (const r of result) {
      assert.equal(r.competitorsInResponse, 3);
    }
  });

  it("single entity gets rank 1, score 100", () => {
    const result = assignRanks([{ entityId: "only", prominenceScore: 0.8 }]);
    assert.equal(result.length, 1);
    assert.equal(result[0].rankPosition, 1);
    assert.equal(result[0].normalizedRankScore, 100);
    assert.equal(result[0].competitorsInResponse, 1);
  });

  it("excludes zero-prominence entities", () => {
    const result = assignRanks([
      { entityId: "a", prominenceScore: 0.5 },
      { entityId: "b", prominenceScore: 0 },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].entityId, "a");
  });

  it("returns empty array for all-zero input", () => {
    const result = assignRanks([
      { entityId: "a", prominenceScore: 0 },
      { entityId: "b", prominenceScore: 0 },
    ]);
    assert.equal(result.length, 0);
  });

  it("normalized rank score: rank 1 = 100, last rank = 0 for K>1", () => {
    const result = assignRanks([
      { entityId: "a", prominenceScore: 0.9 },
      { entityId: "b", prominenceScore: 0.1 },
    ]);
    assert.equal(result[0].normalizedRankScore, 100);
    assert.equal(result[1].normalizedRankScore, 0);
  });
});

// ---------------------------------------------------------------------------
// computeMentionShare
// ---------------------------------------------------------------------------

describe("computeMentionShare", () => {
  it("computes correct percentage", () => {
    assert.equal(computeMentionShare(25, 100), 25);
  });

  it("handles single entity (100%)", () => {
    assert.equal(computeMentionShare(10, 10), 100);
  });

  it("returns 0 for zero total", () => {
    assert.equal(computeMentionShare(5, 0), 0);
  });

  it("rounds to 2 decimal places", () => {
    const result = computeMentionShare(1, 3);
    assert.equal(result, 33.33);
  });
});

// ---------------------------------------------------------------------------
// computeAvgRank
// ---------------------------------------------------------------------------

describe("computeAvgRank", () => {
  it("computes average of mixed ranks", () => {
    assert.equal(computeAvgRank([1, 2, 3]), 2);
  });

  it("returns null for all nulls", () => {
    assert.equal(computeAvgRank([null, null]), null);
  });

  it("ignores nulls in mixed array", () => {
    assert.equal(computeAvgRank([1, null, 3]), 2);
  });

  it("single value returns that value", () => {
    assert.equal(computeAvgRank([4]), 4);
  });

  it("returns null for empty array", () => {
    assert.equal(computeAvgRank([]), null);
  });
});

// ---------------------------------------------------------------------------
// computeRank1Rate
// ---------------------------------------------------------------------------

describe("computeRank1Rate", () => {
  it("computes percentage of rank 1 appearances", () => {
    assert.equal(computeRank1Rate([1, 1, 2, 3]), 50);
  });

  it("all rank 1 → 100%", () => {
    assert.equal(computeRank1Rate([1, 1, 1]), 100);
  });

  it("no rank 1 → 0%", () => {
    assert.equal(computeRank1Rate([2, 3, 4]), 0);
  });

  it("ignores nulls", () => {
    assert.equal(computeRank1Rate([1, null, 2]), 50);
  });

  it("all nulls → 0%", () => {
    assert.equal(computeRank1Rate([null, null]), 0);
  });
});

// ---------------------------------------------------------------------------
// computeHHI + computeFragmentation
// ---------------------------------------------------------------------------

describe("computeHHI", () => {
  it("monopoly (100% share) → HHI = 10000", () => {
    assert.equal(computeHHI([100]), 10000);
  });

  it("even 4-way split → HHI = 2500", () => {
    assert.equal(computeHHI([25, 25, 25, 25]), 2500);
  });

  it("even 2-way split → HHI = 5000", () => {
    assert.equal(computeHHI([50, 50]), 5000);
  });
});

describe("computeFragmentation", () => {
  it("monopoly → fragmentation score 0 (not fragmented)", () => {
    const result = computeFragmentation([100]);
    assert.equal(result.score, 0);
    assert.equal(result.hhi, 10000);
  });

  it("even 4-way → highly fragmented", () => {
    const result = computeFragmentation([25, 25, 25, 25]);
    assert.equal(result.hhi, 2500);
    assert.equal(result.score, 100); // perfectly even = max fragmentation
  });

  it("dominant player with small competitors → low fragmentation", () => {
    const result = computeFragmentation([80, 10, 5, 5]);
    assert.ok(result.score < 50, `Expected score < 50, got ${result.score}`);
  });
});

// ---------------------------------------------------------------------------
// computeWinLoss
// ---------------------------------------------------------------------------

describe("computeWinLoss", () => {
  it("brand rank 1, competitor rank 3 → win", () => {
    assert.equal(computeWinLoss(1, 3), "win");
  });

  it("brand rank 3, competitor rank 1 → loss", () => {
    assert.equal(computeWinLoss(3, 1), "loss");
  });

  it("tie → skip", () => {
    assert.equal(computeWinLoss(2, 2), "skip");
  });

  it("brand null → skip", () => {
    assert.equal(computeWinLoss(null, 1), "skip");
  });

  it("competitor null → skip", () => {
    assert.equal(computeWinLoss(1, null), "skip");
  });

  it("both null → skip", () => {
    assert.equal(computeWinLoss(null, null), "skip");
  });
});

// ---------------------------------------------------------------------------
// computeMentionRate
// ---------------------------------------------------------------------------

describe("computeMentionRate", () => {
  it("computes percentage", () => {
    assert.equal(computeMentionRate(3, 10), 30);
  });

  it("rounds to nearest integer", () => {
    assert.equal(computeMentionRate(1, 3), 33);
  });

  it("returns 0 for zero total", () => {
    assert.equal(computeMentionRate(5, 0), 0);
  });

  it("returns 100 for all mentions", () => {
    assert.equal(computeMentionRate(10, 10), 100);
  });
});

// ---------------------------------------------------------------------------
// computeAvgProminence
// ---------------------------------------------------------------------------

describe("computeAvgProminence", () => {
  it("computes average rounded to 2 decimals", () => {
    assert.equal(computeAvgProminence([80, 60, 70]), 70);
  });

  it("returns 0 for empty array", () => {
    assert.equal(computeAvgProminence([]), 0);
  });

  it("handles single value", () => {
    assert.equal(computeAvgProminence([55.5]), 55.5);
  });

  it("rounds correctly", () => {
    assert.equal(computeAvgProminence([33, 33, 34]), 33.33);
  });
});
