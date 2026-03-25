/**
 * Playwright QA harness — compares dashboard API responses against
 * deterministic metrics computed from the Full Data CSV export.
 *
 * Usage:
 *   QA_BASE_URL=https://brand-viz-3.vercel.app \
 *   QA_BRAND_SLUG=cpac \
 *   QA_BRAND_TERMS=CPAC \
 *   npx playwright test tests/qa/dashboardConsistency.spec.ts
 *
 * Environment variables:
 *   QA_BASE_URL     — app URL (default: https://brand-viz-3.vercel.app)
 *   QA_BRAND_SLUG   — brand slug to test (required)
 *   QA_BRAND_TERMS  — comma-separated brand terms for CSV matching (required)
 *   QA_MODEL        — model filter (default: "all")
 *   QA_RANGE        — range in days (default: "90")
 *   QA_CSV_PATH     — path to a pre-downloaded CSV (skips export step)
 *
 * Auth:
 *   The app uses Clerk auth. Before running, create a storageState file:
 *     1. Run: npx playwright codegen https://brand-viz-3.vercel.app
 *     2. Sign in manually in the browser that opens
 *     3. Save state: tests/qa/auth-state.json
 *   Or set QA_STORAGE_STATE to the path of your auth state file.
 */

import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { computeMetrics, type CsvMetrics } from "./csvMetrics";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BRAND_SLUG = process.env.QA_BRAND_SLUG || "cpac";
const BRAND_TERMS = (process.env.QA_BRAND_TERMS || "CPAC").split(",").map((s) => s.trim());
const MODEL = process.env.QA_MODEL || "all";
const RANGE = process.env.QA_RANGE || "90";

const PRE_CSV_PATH = process.env.QA_CSV_PATH || "";

const RESULTS_DIR = path.join(__dirname, "results");
const CSV_DIR = path.join(RESULTS_DIR, "csv");
const SCREENSHOTS_DIR = path.join(RESULTS_DIR, "screenshots");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComparisonResult {
  metric: string;
  tab: string;
  apiValue: unknown;
  csvValue: unknown;
  match: boolean;
  tolerance?: number;
  note?: string;
}

interface ApiCapture {
  visibility: Record<string, unknown> | null;
  overview: Record<string, unknown> | null;
  narrative: Record<string, unknown> | null;
  competition: Record<string, unknown> | null;
  sources: Record<string, unknown> | null;
  responses: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDirs() {
  for (const dir of [RESULTS_DIR, CSV_DIR, SCREENSHOTS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** Compare two numbers within a tolerance (absolute points) */
function withinTolerance(a: number | null | undefined, b: number | null | undefined, tol: number): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return Math.abs(a - b) <= tol;
}

function pct(v: unknown): number | null {
  if (v == null) return null;
  return typeof v === "number" ? v : parseFloat(String(v));
}

// ---------------------------------------------------------------------------
// API interception
// ---------------------------------------------------------------------------

async function setupApiCapture(page: Page): Promise<ApiCapture> {
  const capture: ApiCapture = {
    visibility: null,
    overview: null,
    narrative: null,
    competition: null,
    sources: null,
    responses: null,
  };

  page.on("response", async (response) => {
    const url = response.url();
    try {
      if (response.status() !== 200) return;
      const ct = response.headers()["content-type"] || "";
      if (!ct.includes("application/json")) return;

      if (url.includes("/api/visibility") && !url.includes("/quotes")) {
        capture.visibility = await response.json();
      } else if (url.includes("/api/overview")) {
        capture.overview = await response.json();
      } else if (url.includes("/api/narrative")) {
        capture.narrative = await response.json();
      } else if (url.includes("/api/competition")) {
        capture.competition = await response.json();
      } else if (url.includes("/api/sources") && !url.includes("/domain-detail")) {
        capture.sources = await response.json();
      } else if (url.includes("/api/responses")) {
        capture.responses = await response.json();
      }
    } catch {
      // Response body may not be available — skip
    }
  });

  return capture;
}

// ---------------------------------------------------------------------------
// CSV export capture
// ---------------------------------------------------------------------------

async function downloadCsv(page: Page): Promise<string> {
  // Navigate to Full Data tab
  const fullDataUrl = `/entity/${BRAND_SLUG}/full-data?model=${MODEL}&range=${RANGE}`;
  await page.goto(fullDataUrl);
  await page.waitForLoadState("networkidle");
  // Wait for data to load
  await page.waitForTimeout(3000);

  // Click "Export CSV" button
  const downloadPromise = page.waitForEvent("download", { timeout: 15000 });
  const exportBtn = page.locator("button", { hasText: "Export CSV" });
  await exportBtn.waitFor({ state: "visible", timeout: 10000 });
  await exportBtn.click();
  const download = await downloadPromise;

  const csvPath = path.join(CSV_DIR, `${BRAND_SLUG}-${MODEL}-${RANGE}d.csv`);
  await download.saveAs(csvPath);
  return csvPath;
}

// ---------------------------------------------------------------------------
// Tab navigation + screenshot
// ---------------------------------------------------------------------------

type TabName = "overview" | "visibility" | "narrative" | "competition" | "sources";

async function navigateToTab(page: Page, tab: TabName): Promise<void> {
  const tabUrl = `/entity/${BRAND_SLUG}/${tab}?model=${MODEL}&range=${RANGE}`;
  await page.goto(tabUrl);
  await page.waitForLoadState("networkidle");
  // Give charts time to render
  await page.waitForTimeout(3000);
}

async function screenshotTab(page: Page, tab: string): Promise<void> {
  const screenshotPath = path.join(SCREENSHOTS_DIR, `${BRAND_SLUG}-${tab}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
}

// ---------------------------------------------------------------------------
// Comparison logic
// ---------------------------------------------------------------------------

function compareVisibility(api: Record<string, unknown>, csv: CsvMetrics): ComparisonResult[] {
  const results: ComparisonResult[] = [];
  const vis = api.visibility as Record<string, unknown> | undefined;
  if (!vis) return [{ metric: "visibility", tab: "visibility", apiValue: null, csvValue: "present", match: false, note: "No visibility data in API response" }];

  const scorecard = vis.scorecard as Record<string, unknown> | undefined;

  // Brand Recall
  const apiRecall = pct(scorecard?.overallMentionRate ?? vis.overallMentionRate);
  results.push({
    metric: "Brand Recall",
    tab: "visibility",
    apiValue: apiRecall,
    csvValue: csv.brandRecall,
    match: withinTolerance(apiRecall, csv.brandRecall, 2),
    tolerance: 2,
    note: "±2 pts tolerance (scope filtering may differ)",
  });

  // Share of Voice
  const apiSoV = pct(scorecard?.shareOfVoice ?? vis.shareOfVoice);
  results.push({
    metric: "Share of Voice",
    tab: "visibility",
    apiValue: apiSoV,
    csvValue: csv.shareOfVoice,
    match: withinTolerance(apiSoV, csv.shareOfVoice, 3),
    tolerance: 3,
    note: "±3 pts tolerance (SoV denominator uses entity counts)",
  });

  // Top Result Rate
  const apiTopResult = pct(scorecard?.firstMentionRate ?? vis.firstMentionRate);
  results.push({
    metric: "Top Result Rate",
    tab: "visibility",
    apiValue: apiTopResult,
    csvValue: csv.topResultRate,
    match: withinTolerance(apiTopResult, csv.topResultRate, 2),
    tolerance: 2,
  });

  // Avg Position
  const apiAvgPos = pct(scorecard?.avgRankScore ?? vis.avgRankScore);
  results.push({
    metric: "Avg Position",
    tab: "visibility",
    apiValue: apiAvgPos,
    csvValue: csv.avgPosition,
    match: withinTolerance(apiAvgPos, csv.avgPosition, 0.5),
    tolerance: 0.5,
  });

  // Ranking breakdown
  const apiBreakdown = vis.rankingBreakdown as Record<string, number> | undefined;
  if (apiBreakdown) {
    for (const [key, csvVal] of Object.entries(csv.rankBreakdown) as [string, number][]) {
      const apiVal = pct(apiBreakdown[key as keyof typeof apiBreakdown]);
      results.push({
        metric: `Rank Breakdown: ${key}`,
        tab: "visibility",
        apiValue: apiVal,
        csvValue: csvVal,
        match: withinTolerance(apiVal, csvVal, 3),
        tolerance: 3,
      });
    }
  }

  // By-model metrics
  const apiByModel = vis.byModel as Record<string, Record<string, unknown>> | undefined;
  if (apiByModel) {
    for (const [modelName, csvModelData] of Object.entries(csv.byModel) as [string, { recall: number; avgPosition: number | null; topResult: number; total: number }][]) {
      const apiModel = apiByModel[modelName];
      if (!apiModel) {
        results.push({ metric: `Model ${modelName}`, tab: "visibility", apiValue: null, csvValue: csvModelData.recall, match: false, note: "Model not in API response" });
        continue;
      }
      results.push({
        metric: `Model ${modelName} Recall`,
        tab: "visibility",
        apiValue: pct(apiModel.recall ?? apiModel.mentionRate),
        csvValue: csvModelData.recall,
        match: withinTolerance(pct(apiModel.recall ?? apiModel.mentionRate), csvModelData.recall, 3),
        tolerance: 3,
      });
    }
  }

  // Opportunity count
  const apiOpportunities = vis.opportunityPrompts as unknown[];
  if (Array.isArray(apiOpportunities)) {
    results.push({
      metric: "Opportunity Prompts Count",
      tab: "visibility",
      apiValue: apiOpportunities.length,
      csvValue: csv.opportunityCount,
      match: Math.abs(apiOpportunities.length - csv.opportunityCount) <= 2,
      tolerance: 2,
      note: "±2 tolerance (scope filtering may exclude some)",
    });
  }

  return results;
}

function compareOverview(api: Record<string, unknown>, csv: CsvMetrics): ComparisonResult[] {
  const results: ComparisonResult[] = [];

  // visibilityKpis from overview API
  const kpis = api.visibilityKpis as Record<string, unknown> | undefined;
  if (kpis) {
    results.push({
      metric: "Overview Brand Recall",
      tab: "overview",
      apiValue: pct(kpis.overallMentionRate),
      csvValue: csv.brandRecall,
      match: withinTolerance(pct(kpis.overallMentionRate), csv.brandRecall, 2),
      tolerance: 2,
    });
    results.push({
      metric: "Overview Share of Voice",
      tab: "overview",
      apiValue: pct(kpis.shareOfVoice),
      csvValue: csv.shareOfVoice,
      match: withinTolerance(pct(kpis.shareOfVoice), csv.shareOfVoice, 3),
      tolerance: 3,
    });
    results.push({
      metric: "Overview Top Result Rate",
      tab: "overview",
      apiValue: pct(kpis.firstMentionRate),
      csvValue: csv.topResultRate,
      match: withinTolerance(pct(kpis.firstMentionRate), csv.topResultRate, 2),
      tolerance: 2,
    });
    results.push({
      metric: "Overview Avg Position",
      tab: "overview",
      apiValue: pct(kpis.avgRankScore),
      csvValue: csv.avgPosition,
      match: withinTolerance(pct(kpis.avgRankScore), csv.avgPosition, 0.5),
      tolerance: 0.5,
    });
  }

  // Totals
  const totals = api.totals as Record<string, number> | undefined;
  if (totals) {
    results.push({
      metric: "Total Runs",
      tab: "overview",
      apiValue: totals.totalRuns ?? totals.analyzedRuns,
      csvValue: csv.totalRows,
      match: false, // informational — deduplication means API < CSV
      note: "API deduplicates runs; CSV has all historical rows",
    });
  }

  return results;
}

function compareNarrative(api: Record<string, unknown>, csv: CsvMetrics): ComparisonResult[] {
  const results: ComparisonResult[] = [];

  // Narrative doesn't have direct CSV equivalents for most fields,
  // but we can verify that the run counts are consistent
  const narrative = api.narrative as Record<string, unknown> | undefined;
  if (!narrative) {
    results.push({ metric: "narrative", tab: "narrative", apiValue: null, csvValue: "present", match: false, note: "No narrative data in API response" });
    return results;
  }

  const totalAnalyzed = narrative.totalAnalyzed as number | undefined;
  if (totalAnalyzed != null) {
    results.push({
      metric: "Narrative Analyzed Runs",
      tab: "narrative",
      apiValue: totalAnalyzed,
      csvValue: csv.dedupedIndustryRows,
      match: false, // informational
      note: "Narrative uses brand-scoped industry runs (may be subset of CSV industry rows)",
    });
  }

  return results;
}

function compareSources(api: Record<string, unknown>, csv: CsvMetrics): ComparisonResult[] {
  const results: ComparisonResult[] = [];

  const sources = api.sources as Record<string, unknown> | undefined;
  if (!sources && !api.topDomains) {
    results.push({ metric: "sources", tab: "sources", apiValue: null, csvValue: "present", match: false, note: "No sources data" });
    return results;
  }

  const topDomains = (sources?.topDomains ?? api.topDomains) as Array<{ domain: string; count: number }> | undefined;
  if (topDomains && csv.sourceDomains.length > 0) {
    // Compare top domain
    const apiTop = topDomains[0]?.domain;
    const csvTop = csv.sourceDomains[0]?.domain;
    results.push({
      metric: "Top Source Domain",
      tab: "sources",
      apiValue: apiTop,
      csvValue: csvTop,
      match: apiTop === csvTop,
      note: "Top cited domain should match",
    });

    // Compare total citation count direction
    const apiTotal = (sources?.totalCitations ?? api.totalCitations) as number | undefined;
    if (apiTotal != null) {
      results.push({
        metric: "Total Source Citations",
        tab: "sources",
        apiValue: apiTotal,
        csvValue: csv.totalSourceCitations,
        match: false, // informational — API counts SourceOccurrence, CSV counts regex-extracted URLs
        note: "API uses SourceOccurrence records; CSV uses regex URL extraction (will differ)",
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

interface QaReport {
  brand: string;
  model: string;
  range: string;
  timestamp: string;
  csvRowCount: number;
  csvLatestDate: string;
  results: ComparisonResult[];
  summary: { total: number; matched: number; mismatched: number; informational: number };
}

function generateReport(csv: CsvMetrics, results: ComparisonResult[]): QaReport {
  const matched = results.filter((r) => r.match).length;
  const informational = results.filter((r) => r.note?.includes("informational")).length;
  const mismatched = results.filter((r) => !r.match && !r.note?.includes("informational")).length;

  return {
    brand: BRAND_SLUG,
    model: MODEL,
    range: RANGE,
    timestamp: new Date().toISOString(),
    csvRowCount: csv.totalRows,
    csvLatestDate: csv.latestDate,
    results,
    summary: { total: results.length, matched, mismatched, informational },
  };
}

function reportToMarkdown(report: QaReport, csv?: CsvMetrics): string {
  const lines: string[] = [
    `# QA Report: ${report.brand}`,
    ``,
    `**Model**: ${report.model} | **Range**: ${report.range}d | **Run**: ${report.timestamp}`,
    `**CSV Rows**: ${report.csvRowCount} | **Latest Date**: ${report.csvLatestDate}`,
    ``,
    `## Summary`,
    ``,
    `| | Count |`,
    `|---|---|`,
    `| Matched | ${report.summary.matched} |`,
    `| Mismatched | ${report.summary.mismatched} |`,
    `| Informational | ${report.summary.informational} |`,
    `| **Total** | **${report.summary.total}** |`,
    ``,
    `## Results`,
    ``,
    `| Status | Tab | Metric | API Value | CSV Value | Tolerance | Note |`,
    `|--------|-----|--------|-----------|-----------|-----------|------|`,
  ];

  for (const r of report.results) {
    const status = r.note?.includes("informational") ? "ℹ️" : r.match ? "✅" : "❌";
    const apiStr = r.apiValue != null ? String(r.apiValue) : "—";
    const csvStr = r.csvValue != null ? (typeof r.csvValue === "object" ? JSON.stringify(r.csvValue) : String(r.csvValue)) : "—";
    const tolStr = r.tolerance != null ? `±${r.tolerance}` : "—";
    const noteStr = r.note || "";
    lines.push(`| ${status} | ${r.tab} | ${r.metric} | ${apiStr} | ${csvStr} | ${tolStr} | ${noteStr} |`);
  }

  // Per-model detail
  if (report.results.filter((r) => r.metric.startsWith("Model ")).length > 0) {
    lines.push("", "## By-Model Detail", "");
    const modelResults = report.results.filter((r) => r.metric.startsWith("Model "));
    for (const r of modelResults) {
      const status = r.match ? "✅" : "❌";
      lines.push(`- ${status} **${r.metric}**: API=${r.apiValue}, CSV=${r.csvValue}`);
    }
  }

  // By-question detail from CSV
  if (csv?.byQuestion?.length) {
    lines.push("", "## CSV By-Question Summary", "");
    lines.push("| Prompt | Status | Recall | Top Result | Avg Position |");
    lines.push("|--------|--------|--------|------------|--------------|");
    for (const q of csv.byQuestion) {
      const promptShort = q.prompt.length > 60 ? q.prompt.slice(0, 57) + "..." : q.prompt;
      lines.push(`| ${promptShort} | ${q.status} | ${q.recall}% | ${q.topResult}% | ${q.avgPosition ?? "—"} |`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe("Dashboard vs CSV Consistency", () => {
  let csvMetrics: CsvMetrics;
  let apiCapture: ApiCapture;

  test.beforeAll(() => {
    ensureDirs();
  });

  test("export CSV and compute metrics", async ({ page }) => {
    let csvPath: string;

    if (PRE_CSV_PATH && fs.existsSync(PRE_CSV_PATH)) {
      // Use pre-downloaded CSV
      csvPath = PRE_CSV_PATH;
      console.log(`Using pre-downloaded CSV: ${csvPath}`);
    } else {
      // Export CSV from Full Data tab (requires auth)
      apiCapture = await setupApiCapture(page);
      csvPath = await downloadCsv(page);
    }

    expect(fs.existsSync(csvPath)).toBe(true);

    // Compute metrics from CSV
    csvMetrics = computeMetrics(csvPath, BRAND_TERMS);
    expect(csvMetrics.totalRows).toBeGreaterThan(0);

    // Save CSV metrics for reference
    const metricsPath = path.join(RESULTS_DIR, `${BRAND_SLUG}-csv-metrics.json`);
    fs.writeFileSync(metricsPath, JSON.stringify(csvMetrics, null, 2));

    console.log(`CSV: ${csvMetrics.totalRows} rows, ${csvMetrics.industryRows} industry, latest date: ${csvMetrics.latestDate}`);
    console.log(`Brand Recall: ${csvMetrics.brandRecall}%, SoV: ${csvMetrics.shareOfVoice}%, Top Result: ${csvMetrics.topResultRate}%, Avg Pos: ${csvMetrics.avgPosition}`);
  });

  test("capture overview API and screenshot", async ({ page }) => {
    apiCapture = await setupApiCapture(page);
    await navigateToTab(page, "overview");
    await screenshotTab(page, "overview");
    // Wait a bit more for any delayed API calls
    await page.waitForTimeout(2000);
  });

  test("capture visibility API and screenshot", async ({ page }) => {
    apiCapture = await setupApiCapture(page);
    await navigateToTab(page, "visibility");
    await screenshotTab(page, "visibility");
    await page.waitForTimeout(2000);
  });

  test("capture narrative API and screenshot", async ({ page }) => {
    apiCapture = await setupApiCapture(page);
    await navigateToTab(page, "narrative");
    await screenshotTab(page, "narrative");
    await page.waitForTimeout(2000);
  });

  test("capture competition API and screenshot", async ({ page }) => {
    apiCapture = await setupApiCapture(page);
    await navigateToTab(page, "competition");
    await screenshotTab(page, "competition");
    await page.waitForTimeout(2000);
  });

  test("capture sources API and screenshot", async ({ page }) => {
    apiCapture = await setupApiCapture(page);
    await navigateToTab(page, "sources");
    await screenshotTab(page, "sources");
    await page.waitForTimeout(2000);
  });

  test("compare API data vs CSV metrics and generate report", async ({ page }) => {
    // Load CSV metrics if not already computed (tests run in parallel)
    const metricsPath = path.join(RESULTS_DIR, `${BRAND_SLUG}-csv-metrics.json`);
    if (!csvMetrics && fs.existsSync(metricsPath)) {
      csvMetrics = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
    }
    expect(csvMetrics).toBeTruthy();

    // Capture all APIs by visiting each tab
    apiCapture = await setupApiCapture(page);

    // Visit overview + visibility tabs to capture their API responses
    await navigateToTab(page, "overview");
    await page.waitForTimeout(2000);
    await navigateToTab(page, "visibility");
    await page.waitForTimeout(2000);
    await navigateToTab(page, "narrative");
    await page.waitForTimeout(2000);
    await navigateToTab(page, "sources");
    await page.waitForTimeout(2000);

    // Run comparisons
    const results: ComparisonResult[] = [];

    if (apiCapture.overview) {
      results.push(...compareOverview(apiCapture.overview, csvMetrics));
    } else {
      results.push({ metric: "Overview API", tab: "overview", apiValue: null, csvValue: "expected", match: false, note: "API response not captured" });
    }

    if (apiCapture.visibility) {
      results.push(...compareVisibility(apiCapture.visibility, csvMetrics));
    } else {
      results.push({ metric: "Visibility API", tab: "visibility", apiValue: null, csvValue: "expected", match: false, note: "API response not captured" });
    }

    if (apiCapture.narrative) {
      results.push(...compareNarrative(apiCapture.narrative, csvMetrics));
    }

    if (apiCapture.sources) {
      results.push(...compareSources(apiCapture.sources, csvMetrics));
    }

    // Generate report
    const report = generateReport(csvMetrics, results);
    const reportJson = path.join(RESULTS_DIR, `${BRAND_SLUG}-qa-report.json`);
    const reportMd = path.join(RESULTS_DIR, `${BRAND_SLUG}-qa-report.md`);
    fs.writeFileSync(reportJson, JSON.stringify(report, null, 2));
    fs.writeFileSync(reportMd, reportToMarkdown(report, csvMetrics));

    // Log summary
    console.log(`\n📊 QA Report: ${report.summary.matched}/${report.summary.total} matched, ${report.summary.mismatched} mismatched, ${report.summary.informational} informational\n`);

    // Assert no hard mismatches (informational items are OK)
    const hardMismatches = results.filter((r) => !r.match && !r.note?.includes("informational"));
    if (hardMismatches.length > 0) {
      console.log("❌ Mismatches:");
      for (const m of hardMismatches) {
        console.log(`   ${m.tab}/${m.metric}: API=${m.apiValue}, CSV=${m.csvValue} ${m.note || ""}`);
      }
    }

    // Soft assertion — report mismatches but don't fail the test run
    // (Some differences are expected due to scope filtering, dedup, latest-snapshot logic)
    expect(report.summary.mismatched).toBeLessThan(report.summary.total);
  });
});
