/**
 * Helper to capture Clerk auth state for Playwright tests.
 *
 * Usage:
 *   npx playwright test tests/qa/captureAuth.ts
 *
 * Opens a browser. Sign in manually, then close the browser.
 * Auth cookies are saved to tests/qa/auth-state.json.
 */

import { test as setup } from "@playwright/test";
import * as path from "path";

const AUTH_FILE = path.join(__dirname, "auth-state.json");

setup("capture auth state", async ({ page }) => {
  const baseUrl = process.env.QA_BASE_URL || "https://brand-viz-3.vercel.app";
  await page.goto(baseUrl);

  // Wait for user to sign in — pause so user can interact
  await page.pause();

  // Save auth state after user resumes
  await page.context().storageState({ path: AUTH_FILE });
  console.log(`Auth state saved to ${AUTH_FILE}`);
});
