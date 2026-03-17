import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Known brand/entity names that need special casing (acronyms, etc.).
 * Keys are lowercase; values are the canonical display form.
 */
const KNOWN_NAMES: Record<string, string> = {
  cnn: "CNN",
  nbcu: "NBCU",
  nbc: "NBC",
  abc: "ABC",
  cbs: "CBS",
  bbc: "BBC",
  hbo: "HBO",
  espn: "ESPN",
  ibm: "IBM",
  att: "AT&T",
  "at&t": "AT&T",
  bmw: "BMW",
  ups: "UPS",
  dhl: "DHL",
  hp: "HP",
  lg: "LG",
  ge: "GE",
  gm: "GM",
  jpmorgan: "JPMorgan",
  hsbc: "HSBC",
  usaa: "USAA",
  aaa: "AAA",
  ikea: "IKEA",
  nasa: "NASA",
  nfl: "NFL",
  nba: "NBA",
  mlb: "MLB",
  nhl: "NHL",
  ufc: "UFC",
  wwe: "WWE",
  aws: "AWS",
  sap: "SAP",
  tsmc: "TSMC",
  amd: "AMD",
  byd: "BYD",
  kia: "Kia",
  msnbc: "MSNBC",
  cnbc: "CNBC",
  hulu: "Hulu",
  roku: "Roku",
  meta: "Meta",
  openai: "OpenAI",
  chatgpt: "ChatGPT",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  iphone: "iPhone",
  ipad: "iPad",
  imac: "iMac",
  ios: "iOS",
  macos: "macOS",
  playstation: "PlayStation",
  xbox: "Xbox",
  mcdonalds: "McDonald's",
  "mcdonald's": "McDonald's",
  "jpmorgan chase": "JPMorgan Chase",
  walmart: "Walmart",
  salesforce: "Salesforce",
  hubspot: "HubSpot",
  wordpress: "WordPress",
  github: "GitHub",
  stackoverflow: "StackOverflow",
};

/**
 * Convert a slug or kebab-case/snake_case string to proper display name.
 * Uses a known-names map for acronyms and special casing, then falls
 * back to standard Title Case.
 */
export function titleCase(input: string): string {
  const lower = input.toLowerCase().replace(/[-_]/g, " ").trim();

  // Check full string first
  if (KNOWN_NAMES[lower]) return KNOWN_NAMES[lower];

  // Title-case each word, checking known names per-word for compound names
  return lower
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => KNOWN_NAMES[w] ?? (w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Build a map from lowercased entityId → properly cased display name
 * by extracting original competitor names from analysisJson across runs.
 * Picks the most frequently seen casing for each entity.
 */
export function buildEntityDisplayNames(
  runs: { analysisJson: unknown }[],
): Map<string, string> {
  const freq = new Map<string, Map<string, number>>();

  for (const run of runs) {
    if (!run.analysisJson || typeof run.analysisJson !== "object") continue;
    const analysis = run.analysisJson as Record<string, unknown>;
    if (!Array.isArray(analysis.competitors)) continue;
    for (const comp of analysis.competitors) {
      if (comp && typeof comp === "object" && "name" in comp) {
        const name = String((comp as { name: string }).name);
        const id = name.toLowerCase();
        if (!freq.has(id)) freq.set(id, new Map());
        const nameFreq = freq.get(id)!;
        nameFreq.set(name, (nameFreq.get(name) ?? 0) + 1);
      }
    }
  }

  const result = new Map<string, string>();
  for (const [id, nameFreq] of freq) {
    // Pick the most frequent casing
    let bestName = "";
    let bestCount = 0;
    for (const [name, count] of nameFreq) {
      if (count > bestCount || (count === bestCount && name > bestName)) {
        bestName = name;
        bestCount = count;
      }
    }
    if (bestName) result.set(id, bestName);
  }
  return result;
}

/**
 * Resolve an entity's display name: check the extracted name map first,
 * then fall back to the KNOWN_NAMES / titleCase logic.
 */
export function resolveEntityName(
  entityId: string,
  displayNames: Map<string, string>,
): string {
  return displayNames.get(entityId) ?? displayNames.get(entityId.toLowerCase()) ?? titleCase(entityId);
}

/**
 * Replace prompt template placeholders ({brand}, {industry}, {competitor})
 * with actual values for display purposes.
 */
export function expandPromptPlaceholders(
  text: string,
  opts: { brandName: string; industry?: string | null; competitor?: string | null },
): string {
  let expanded = text
    .replace(/\{brand\}/gi, opts.brandName)
    .replace(/\{industry\}/gi, opts.industry || `${opts.brandName}'s industry`);
  if (expanded.includes("{competitor}")) {
    expanded = expanded.replace(/\{competitor\}/gi, opts.competitor || "competitors");
  }
  return expanded;
}

/**
 * Compute the date cutoff for a time range (in days).
 * Validates against allowed ranges [7, 30, 90], defaulting to 90.
 */
export function computeRangeCutoff(viewRange: number): Date {
  const days = [7, 30, 90].includes(viewRange) ? viewRange : 90;
  return new Date(Date.now() - days * 86_400_000);
}
