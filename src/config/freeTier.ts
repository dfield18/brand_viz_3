/**
 * Free-tier configuration.
 *
 * Every knob here reads an env var first and falls back to a sensible default,
 * so you can change behavior at deploy time without editing code. Update the
 * defaults only when a change should be the new permanent behavior.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function envList(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function envString(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(raw);
}

/** How many prompts run per free analysis. */
export const FREE_TIER_PROMPT_COUNT = envInt("FREE_TIER_PROMPT_COUNT", 5);

/** Which prompt cluster the free tier draws from. Industry = generic questions about the category, no brand name. */
export const FREE_TIER_PROMPT_CLUSTER = envString("FREE_TIER_PROMPT_CLUSTER", "industry");

/** Models used for free runs. Cheapest mix by default (drops Claude at ~7× output cost and Google/SerpAPI). */
export const FREE_TIER_MODELS = envList("FREE_TIER_MODELS", ["chatgpt", "gemini"]);

/** Max free runs per IP per calendar day. */
export const FREE_TIER_RUNS_PER_IP_PER_DAY = envInt("FREE_TIER_RUNS_PER_IP_PER_DAY", 10);

/** Max free runs per anonymous session cookie per calendar day. Cheap anti-abuse alongside the IP limit. */
export const FREE_TIER_RUNS_PER_SESSION_PER_DAY = envInt("FREE_TIER_RUNS_PER_SESSION_PER_DAY", 10);

/** How long anonymous results stay visible on refresh before purge. */
export const FREE_TIER_RESULT_TTL_HOURS = envInt("FREE_TIER_RESULT_TTL_HOURS", 24);

/** Show the "Sign up for the full report" CTA under free results. */
export const FREE_TIER_SHOW_SIGNUP_CTA = envBool("FREE_TIER_SHOW_SIGNUP_CTA", true);

/** Name of the cookie used to tie a browser session to a free run. */
export const FREE_TIER_SESSION_COOKIE = envString("FREE_TIER_SESSION_COOKIE", "asw_free_session");

/** Master switch. Flip to false to hide the free tier entirely (landing falls back to the /marketing page). */
export const FREE_TIER_ENABLED = envBool("FREE_TIER_ENABLED", true);

/** Example brand chips shown under the free-dashboard input — one click fills and runs. */
export const FREE_TIER_EXAMPLE_BRANDS = envList("FREE_TIER_EXAMPLE_BRANDS", [
  "Nike",
  "Tesla",
  "Kamala Harris",
  "ACLU",
]);

/** How many historical time points (in months-ago buckets) the trend chart
 *  shows in addition to "today". 2 → trend line draws 60d, 30d, today. */
export const FREE_TIER_HISTORICAL_MONTHS = envInt("FREE_TIER_HISTORICAL_MONTHS", 2);

/** Prompts run per historical time point. Fewer than `promptCount` because
 *  trend-chart mention rates need directional data, not full coverage. */
export const FREE_TIER_HISTORICAL_PROMPT_COUNT = envInt("FREE_TIER_HISTORICAL_PROMPT_COUNT", 3);

/** How fresh a cached free-tier report must be to be reused. Default 7 days.
 *  Set to 0 to disable caching entirely. */
export const FREE_TIER_CACHE_TTL_HOURS = envInt("FREE_TIER_CACHE_TTL_HOURS", 168);

export const FREE_TIER_CONFIG = {
  promptCount: FREE_TIER_PROMPT_COUNT,
  promptCluster: FREE_TIER_PROMPT_CLUSTER,
  models: FREE_TIER_MODELS,
  runsPerIpPerDay: FREE_TIER_RUNS_PER_IP_PER_DAY,
  runsPerSessionPerDay: FREE_TIER_RUNS_PER_SESSION_PER_DAY,
  resultTtlHours: FREE_TIER_RESULT_TTL_HOURS,
  showSignupCta: FREE_TIER_SHOW_SIGNUP_CTA,
  sessionCookie: FREE_TIER_SESSION_COOKIE,
  enabled: FREE_TIER_ENABLED,
  exampleBrands: FREE_TIER_EXAMPLE_BRANDS,
  historicalMonths: FREE_TIER_HISTORICAL_MONTHS,
  historicalPromptCount: FREE_TIER_HISTORICAL_PROMPT_COUNT,
  cacheTtlHours: FREE_TIER_CACHE_TTL_HOURS,
} as const;
