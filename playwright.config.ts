import { defineConfig } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const authStatePath = process.env.QA_STORAGE_STATE || path.join(__dirname, "tests/qa/auth-state.json");
const hasAuth = fs.existsSync(authStatePath);

export default defineConfig({
  testDir: "./tests/qa",
  testMatch: "**/*.{spec,setup}.ts",
  timeout: 120_000,
  retries: 0,
  workers: 1, // sequential — tests share state (CSV metrics)
  use: {
    baseURL: process.env.QA_BASE_URL || "https://brand-viz-3.vercel.app",
    screenshot: "on",
    trace: "retain-on-failure",
    ...(hasAuth ? { storageState: authStatePath } : {}),
  },
  reporter: [["list"], ["json", { outputFile: "tests/qa/results/report.json" }]],
  outputDir: "tests/qa/results/artifacts",
});
