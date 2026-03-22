import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeCompetitorAlerts, type SnapshotData } from "./competitorAlerts";

describe("computeCompetitorAlerts", () => {
  const BRAND = "aclu";

  it("returns empty alerts when no snapshots", () => {
    const result = computeCompetitorAlerts([], BRAND);
    assert.deepEqual(result.alerts, []);
    assert.equal(result.recentDate, null);
    assert.equal(result.previousDate, null);
  });

  it("returns alerts with no delta when only one snapshot", () => {
    const snapshots: SnapshotData[] = [
      {
        date: "2026-03-21",
        entityMentions: { "splc": 6, [BRAND]: 10 },
        totalIndustryRuns: 16,
      },
    ];
    const result = computeCompetitorAlerts(snapshots, BRAND);
    assert.equal(result.recentDate, "2026-03-21");
    assert.equal(result.previousDate, null);
    assert.equal(result.alerts.length, 1);
    assert.equal(result.alerts[0].entityId, "splc");
    assert.equal(result.alerts[0].recentMentionRate, 38); // 6/16 = 37.5 → 38
    assert.equal(result.alerts[0].mentionRateChange, 0);
    assert.equal(result.alerts[0].direction, "stable");
  });

  it("uses latest and immediately previous snapshot (not halves)", () => {
    const snapshots: SnapshotData[] = [
      {
        date: "2025-12-21",
        entityMentions: { "nul": 1, "splc": 8 },
        totalIndustryRuns: 16,
      },
      {
        date: "2026-02-22",
        entityMentions: { "nul": 3, "splc": 11, "lcchr": 0 },
        totalIndustryRuns: 16,
      },
      {
        date: "2026-03-21",
        entityMentions: { "nul": 7, "splc": 6, "lcchr": 5 },
        totalIndustryRuns: 16,
      },
    ];

    const result = computeCompetitorAlerts(snapshots, BRAND);

    // Should use Mar 21 vs Feb 22, NOT half-period aggregation
    assert.equal(result.recentDate, "2026-03-21");
    assert.equal(result.previousDate, "2026-02-22");

    const nul = result.alerts.find((a) => a.entityId === "nul")!;
    assert.ok(nul, "National Urban League should be present");
    // 7/16 = 43.75% vs 3/16 = 18.75% → +25 pts
    assert.equal(nul.recentMentionRate, 44); // Math.round(43.75)
    assert.equal(nul.previousMentionRate, 19); // Math.round(18.75)
    assert.equal(nul.direction, "rising");

    const lcchr = result.alerts.find((a) => a.entityId === "lcchr")!;
    assert.ok(lcchr, "LCCHR should be present");
    // 5/16 = 31.25% vs 0/16 = 0% → +31.25 pts
    assert.equal(lcchr.recentMentionRate, 31);
    assert.equal(lcchr.previousMentionRate, 0);
    assert.equal(lcchr.direction, "rising");

    const splc = result.alerts.find((a) => a.entityId === "splc")!;
    assert.ok(splc, "SPLC should be present");
    // 6/16 = 37.5% vs 11/16 = 68.75% → -31.25 pts
    assert.equal(splc.recentMentionRate, 38);
    assert.equal(splc.previousMentionRate, 69);
    assert.equal(splc.direction, "falling");
  });

  it("excludes the brand entity from alerts", () => {
    const snapshots: SnapshotData[] = [
      {
        date: "2026-02-22",
        entityMentions: { [BRAND]: 10, "splc": 5 },
        totalIndustryRuns: 16,
      },
      {
        date: "2026-03-21",
        entityMentions: { [BRAND]: 12, "splc": 8 },
        totalIndustryRuns: 16,
      },
    ];

    const result = computeCompetitorAlerts(snapshots, BRAND);
    assert.ok(!result.alerts.find((a) => a.entityId === BRAND), "Brand should not appear in alerts");
    assert.equal(result.alerts.length, 1);
    assert.equal(result.alerts[0].entityId, "splc");
  });

  it("skips snapshots with zero industry runs", () => {
    const snapshots: SnapshotData[] = [
      {
        date: "2026-01-01",
        entityMentions: { "splc": 5 },
        totalIndustryRuns: 0, // No runs — skip
      },
      {
        date: "2026-02-22",
        entityMentions: { "splc": 5 },
        totalIndustryRuns: 10,
      },
      {
        date: "2026-03-21",
        entityMentions: { "splc": 8 },
        totalIndustryRuns: 10,
      },
    ];

    const result = computeCompetitorAlerts(snapshots, BRAND);
    assert.equal(result.recentDate, "2026-03-21");
    assert.equal(result.previousDate, "2026-02-22");
  });

  it("computes comparison label based on date gap", () => {
    // 7-day gap → "prior week"
    const weekly: SnapshotData[] = [
      { date: "2026-03-14", entityMentions: { "x": 1 }, totalIndustryRuns: 10 },
      { date: "2026-03-21", entityMentions: { "x": 2 }, totalIndustryRuns: 10 },
    ];
    assert.equal(computeCompetitorAlerts(weekly, BRAND).comparisonPeriodLabel, "prior week");

    // 28-day gap → "prior month"
    const monthly: SnapshotData[] = [
      { date: "2026-02-21", entityMentions: { "x": 1 }, totalIndustryRuns: 10 },
      { date: "2026-03-21", entityMentions: { "x": 2 }, totalIndustryRuns: 10 },
    ];
    assert.equal(computeCompetitorAlerts(monthly, BRAND).comparisonPeriodLabel, "prior month");

    // 90-day gap → "prior quarter"
    const quarterly: SnapshotData[] = [
      { date: "2025-12-21", entityMentions: { "x": 1 }, totalIndustryRuns: 10 },
      { date: "2026-03-21", entityMentions: { "x": 2 }, totalIndustryRuns: 10 },
    ];
    assert.equal(computeCompetitorAlerts(quarterly, BRAND).comparisonPeriodLabel, "prior quarter");
  });

  it("handles unsorted input correctly", () => {
    const snapshots: SnapshotData[] = [
      { date: "2026-03-21", entityMentions: { "x": 8 }, totalIndustryRuns: 10 },
      { date: "2026-01-01", entityMentions: { "x": 2 }, totalIndustryRuns: 10 },
      { date: "2026-02-15", entityMentions: { "x": 5 }, totalIndustryRuns: 10 },
    ];

    const result = computeCompetitorAlerts(snapshots, BRAND);
    assert.equal(result.recentDate, "2026-03-21");
    assert.equal(result.previousDate, "2026-02-15");
  });
});
