import { openai } from "@/lib/openai";
import { getPerplexity } from "@/lib/perplexity";

export type BrandCategory = "commercial" | "political_advocacy";

/** Structured facts about a political public figure that let the
 *  industry-prompt generator scope its questions to near-certain
 *  recall contexts (the figure's state + role). Returned null when
 *  the subject isn't primarily a political figure — the caller falls
 *  back to the generic industry-prompt path. */
export type PublicFigureRole =
  | "US Senator"
  | "US Rep"
  | "Governor"
  | "State Senator"
  | "State Rep"
  | "Mayor"
  | "Vice President"
  // Catches Cabinet members (Secretary of State, AG, Defense, Treasury,
  // etc.). Single role keeps the allowlist compact — the role name plus
  // figureMeta.signatureIssue gives the prompt template enough
  // specificity to construct cohort-style questions.
  | "Cabinet Secretary"
  | "Speaker"
  // Catches non-Cabinet executive-branch officials: White House Chief
  // of Staff, National Security Advisor, DNI, CIA Director, US Trade
  // Representative, UN Ambassador, Federal Reserve Chair, etc. The
  // template anchors on "the current presidential administration" and
  // "senior White House staff" which surfaces these officials.
  | "White House Official"
  // Heads of government / state outside the US — Prime Ministers,
  // foreign Presidents, Chancellors. figureMeta.jurisdiction holds the
  // country name and the templates anchor on it.
  | "Foreign Leader"
  | "Activist"
  | "Candidate"
  // Former officeholders — historical/legacy figures who haven't held
  // current office in years. The current-officeholder prompt templates
  // ("most influential senators in 2026") naturally exclude them, so we
  // route to a separate cohort-based template ("most consequential
  // recent presidents", "former senators turned senior statespeople")
  // that gives organic recall a real chance.
  | "Former President"
  | "Former Vice President"
  | "Former Senator"
  | "Former Rep"
  | "Former Governor"
  | "Former Mayor"
  | "Former Cabinet Secretary"
  | "Former Speaker"
  | "Former White House Official"
  | "Former Foreign Leader"
  | "Former Officeholder";

/** Map common LLM output variants to the canonical role label. Keeps
 *  the allowlist strict while tolerating minor phrasing differences —
 *  e.g. "Senator" vs "US Senator", "Congressman" vs "US Rep". Returning
 *  null here lets the caller fall through to the generic industry-
 *  prompt path instead of rejecting an otherwise-usable classification. */
function normalizePublicFigureRole(raw: string): PublicFigureRole | null {
  const key = raw.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  const variantMap: Record<string, PublicFigureRole> = {
    "us senator": "US Senator",
    "senator": "US Senator",
    "senior senator": "US Senator",
    "junior senator": "US Senator",
    "us rep": "US Rep",
    "us representative": "US Rep",
    "representative": "US Rep",
    "rep": "US Rep",
    "congressman": "US Rep",
    "congresswoman": "US Rep",
    "congressperson": "US Rep",
    "member of congress": "US Rep",
    "state senator": "State Senator",
    "state rep": "State Rep",
    "state representative": "State Rep",
    "assemblymember": "State Rep",
    "assemblyman": "State Rep",
    "assemblywoman": "State Rep",
    "governor": "Governor",
    "mayor": "Mayor",
    "vice president": "Vice President",
    "us vice president": "Vice President",
    "vp": "Vice President",
    // Cabinet roles — collapse all Secretary-of-X / AG / cabinet-level
    // titles into one bucket since the prompt templates work the same
    // way for all of them.
    "cabinet secretary": "Cabinet Secretary",
    "secretary": "Cabinet Secretary",
    "secretary of state": "Cabinet Secretary",
    "secretary of defense": "Cabinet Secretary",
    "secretary of the treasury": "Cabinet Secretary",
    "treasury secretary": "Cabinet Secretary",
    "defense secretary": "Cabinet Secretary",
    "attorney general": "Cabinet Secretary",
    "us attorney general": "Cabinet Secretary",
    "ag": "Cabinet Secretary",
    "cabinet member": "Cabinet Secretary",
    // Speaker of the House — separate from Cabinet because the cohort
    // is "House leadership", not "executive cabinet".
    "speaker": "Speaker",
    "speaker of the house": "Speaker",
    "house speaker": "Speaker",
    // White House Official — non-Cabinet executive-branch roles
    "white house official": "White House Official",
    "white house chief of staff": "White House Official",
    "chief of staff": "White House Official",
    "national security advisor": "White House Official",
    "national security adviser": "White House Official",
    "nsa": "White House Official",
    "director of national intelligence": "White House Official",
    "dni": "White House Official",
    "cia director": "White House Official",
    "director of the cia": "White House Official",
    "us trade representative": "White House Official",
    "ustr": "White House Official",
    "un ambassador": "White House Official",
    "us ambassador to the un": "White House Official",
    "federal reserve chair": "White House Official",
    "fed chair": "White House Official",
    "fed chairman": "White House Official",
    "press secretary": "White House Official",
    "white house press secretary": "White House Official",
    // Foreign leaders — heads of government / state outside the US
    "foreign leader": "Foreign Leader",
    "head of state": "Foreign Leader",
    "head of government": "Foreign Leader",
    "prime minister": "Foreign Leader",
    "pm": "Foreign Leader",
    "chancellor": "Foreign Leader",
    "president": "Foreign Leader", // generic; if classifier picks it the figure is non-US
    "premier": "Foreign Leader",
    "taoiseach": "Foreign Leader",
    "activist": "Activist",
    "candidate": "Candidate",
    // Former-officeholder variants
    "former president": "Former President",
    "ex-president": "Former President",
    "former vice president": "Former Vice President",
    "former vp": "Former Vice President",
    "ex-vice president": "Former Vice President",
    "ex-vp": "Former Vice President",
    "former cabinet secretary": "Former Cabinet Secretary",
    "former secretary": "Former Cabinet Secretary",
    "former secretary of state": "Former Cabinet Secretary",
    "former secretary of defense": "Former Cabinet Secretary",
    "former treasury secretary": "Former Cabinet Secretary",
    "former defense secretary": "Former Cabinet Secretary",
    "former attorney general": "Former Cabinet Secretary",
    "former us attorney general": "Former Cabinet Secretary",
    "former cabinet member": "Former Cabinet Secretary",
    "ex-secretary": "Former Cabinet Secretary",
    "former speaker": "Former Speaker",
    "former speaker of the house": "Former Speaker",
    "former house speaker": "Former Speaker",
    "former white house official": "Former White House Official",
    "former white house chief of staff": "Former White House Official",
    "former chief of staff": "Former White House Official",
    "former national security advisor": "Former White House Official",
    "former national security adviser": "Former White House Official",
    "former dni": "Former White House Official",
    "former cia director": "Former White House Official",
    "former fed chair": "Former White House Official",
    "former federal reserve chair": "Former White House Official",
    "former us trade representative": "Former White House Official",
    "former un ambassador": "Former White House Official",
    "former press secretary": "Former White House Official",
    "former foreign leader": "Former Foreign Leader",
    "former prime minister": "Former Foreign Leader",
    "former chancellor": "Former Foreign Leader",
    "former premier": "Former Foreign Leader",
    "former head of state": "Former Foreign Leader",
    "former head of government": "Former Foreign Leader",
    "former us senator": "Former Senator",
    "former senator": "Former Senator",
    "ex-senator": "Former Senator",
    "former us representative": "Former Rep",
    "former representative": "Former Rep",
    "former us rep": "Former Rep",
    "former rep": "Former Rep",
    "former congressman": "Former Rep",
    "former congresswoman": "Former Rep",
    "former member of congress": "Former Rep",
    "former governor": "Former Governor",
    "ex-governor": "Former Governor",
    "former mayor": "Former Mayor",
    "former officeholder": "Former Officeholder",
    "former politician": "Former Officeholder",
  };
  return variantMap[key] ?? null;
}

/** True when the role represents someone who's no longer in office.
 *  Drives the prompt-template branch (cohort/legacy questions instead
 *  of current-officeholder roster questions). */
function isFormerRole(role: PublicFigureRole): boolean {
  return role.startsWith("Former");
}

/** Build a single brand-direct "anchor" prompt that asks AI about the
 *  figure by name. Stored with cluster="direct" so it feeds sentiment,
 *  themes, and narrative data without polluting the organic-recall
 *  KPIs (Mention Rate / SoV / Top Result Rate, all industry-cluster
 *  scoped). Guarantees the free-tier report shows meaningful sentiment
 *  + narrative even when organic recall yields 0% — the floor previously
 *  hit by former officeholders and obscure-but-real public figures. */
export function buildDirectAnchorPrompt(
  brandName: string,
  figureMeta: PublicFigureMeta | null,
): GeneratedPrompt {
  let text: string;
  if (figureMeta) {
    if (figureMeta.role === "Former President") {
      text = `What is ${brandName}'s legacy as a US president?`;
    } else if (figureMeta.role === "Former Vice President") {
      text = `What is ${brandName}'s legacy as US vice president?`;
    } else if (figureMeta.role === "Former Cabinet Secretary") {
      text = `What is ${brandName}'s legacy in the US Cabinet?`;
    } else if (figureMeta.role === "Former Speaker") {
      text = `What is ${brandName}'s legacy as US House Speaker?`;
    } else if (figureMeta.role === "Former White House Official") {
      text = `What is ${brandName}'s legacy in the US executive branch?`;
    } else if (figureMeta.role === "Former Foreign Leader") {
      const country = figureMeta.jurisdiction;
      text = country && !isNationalJurisdiction(country)
        ? `What is ${brandName}'s legacy as a leader of ${country}?`
        : `What is ${brandName}'s legacy as a world leader?`;
    } else if (figureMeta.role.startsWith("Former")) {
      const roleNoun = figureMeta.role.replace(/^Former /, "").toLowerCase();
      text = `What is ${brandName} best known for from their time as ${roleNoun}?`;
    } else if (figureMeta.role === "Vice President") {
      text = `What is ${brandName} known for as US vice president?`;
    } else if (figureMeta.role === "Cabinet Secretary") {
      text = `What is ${brandName} known for as a US Cabinet official?`;
    } else if (figureMeta.role === "Speaker") {
      text = `What is ${brandName} known for as US House Speaker?`;
    } else if (figureMeta.role === "White House Official") {
      text = `What is ${brandName} known for in the US executive branch?`;
    } else if (figureMeta.role === "Foreign Leader") {
      const country = figureMeta.jurisdiction;
      text = country && !isNationalJurisdiction(country)
        ? `What is ${brandName} known for as the leader of ${country}?`
        : `What is ${brandName} known for as a world leader?`;
    } else if (figureMeta.role === "US Senator" || figureMeta.role === "US Rep") {
      text = `What is ${brandName} known for in the US Congress?`;
    } else if (figureMeta.role === "Governor") {
      text = `What is ${brandName} known for as a US governor?`;
    } else if (figureMeta.role === "Mayor") {
      text = `What is ${brandName} known for as a US mayor?`;
    } else if (figureMeta.role === "Activist") {
      text = `What is ${brandName} known for as an activist?`;
    } else if (figureMeta.role === "Candidate") {
      text = `What is ${brandName} running on?`;
    } else {
      text = `What is ${brandName} best known for?`;
    }
  } else {
    text = `What is ${brandName} best known for?`;
  }
  return {
    text,
    cluster: "direct" as const,
    intent: "informational" as const,
    source: "generated" as const,
  };
}

export type PublicFigureMeta = {
  role: PublicFigureRole;
  jurisdiction: string;       // e.g. "Pennsylvania", "New York NY-14", "United States"
  party: string | null;       // "Democrat" | "Republican" | "Independent" | "Other" | null
  caucus: string | null;      // "Progressive" | "Freedom Caucus" | null
  signatureIssue: string | null; // "worker rights" | "climate" | null
};

// Re-exported from the shared no-deps module so client code can import
// the heuristic without pulling this openai-dependent file into its
// bundle.
export { looksLikePersonName } from "@/lib/personNameHeuristic";

/** Detect jurisdictions that would produce ungrammatical phrases like
 *  "senators from United States" when composed into scope facets or
 *  roster questions. For these the caller should swap in a
 *  jurisdiction-less phrasing ("US senators" vs "senators from X"). */
export function isNationalJurisdiction(jurisdiction: string): boolean {
  const k = jurisdiction.trim().toLowerCase().replace(/\./g, "");
  return k === "united states" || k === "us" || k === "usa" || k === "national" || k === "federal";
}

/** Static override map for figures whose current role is recent enough
 *  that GPT-4o-mini's training data (cutoff ~Apr 2024) doesn't know
 *  their up-to-date position. Keyed by lowercased canonical name.
 *  Checked BEFORE the LLM call so these always classify correctly
 *  regardless of model knowledge.
 *
 *  Maintain as the US administration changes — entries here are the
 *  source of truth for the current officeholder.
 */
const STATIC_FIGURE_OVERRIDES: Record<string, PublicFigureMeta> = {
  // Current Trump Cabinet (Jan 2025–): GPT-4o-mini's training pre-dates
  // most of these confirmations and frequently classifies these figures
  // by their pre-Cabinet roles (senator / Fox News personality / etc).
  "pete hegseth": { role: "Cabinet Secretary", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "defense policy" },
  "marco rubio": { role: "Cabinet Secretary", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "foreign policy" },
  "pam bondi": { role: "Cabinet Secretary", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "law enforcement" },
  "robert f kennedy jr": { role: "Cabinet Secretary", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "health policy" },
  "rfk jr": { role: "Cabinet Secretary", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "health policy" },
  "doug burgum": { role: "Cabinet Secretary", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "energy and natural resources" },
  "linda mcmahon": { role: "Cabinet Secretary", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "education" },
  "scott bessent": { role: "Cabinet Secretary", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "economic policy" },
  "lee zeldin": { role: "Cabinet Secretary", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "environmental policy" },
  "kristi noem": { role: "Cabinet Secretary", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "homeland security" },
  "doug collins": { role: "Cabinet Secretary", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "veterans affairs" },
  "sean duffy": { role: "Cabinet Secretary", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "transportation" },
  "chris wright": { role: "Cabinet Secretary", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "energy policy" },
  "brooke rollins": { role: "Cabinet Secretary", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "agriculture" },
  "scott turner": { role: "Cabinet Secretary", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "housing" },
  // Senior White House staff / non-Cabinet executive
  "susie wiles": { role: "White House Official", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: null },
  "tulsi gabbard": { role: "White House Official", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "intelligence" },
  "john ratcliffe": { role: "White House Official", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "intelligence" },
  "mike waltz": { role: "White House Official", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "national security" },
  "stephen miller": { role: "White House Official", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "immigration" },
  "karoline leavitt": { role: "White House Official", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: null },
  "russell vought": { role: "White House Official", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "budget" },
  "jerome powell": { role: "White House Official", jurisdiction: "United States", party: null, caucus: null, signatureIssue: "monetary policy" },
  "jamieson greer": { role: "White House Official", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: "trade" },
  // VP and Speaker (already covered by classifier worked examples but
  // included here as belt-and-suspenders so cached/legacy classification
  // glitches don't recur).
  "jd vance": { role: "Vice President", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: null },
  "mike johnson": { role: "Speaker", jurisdiction: "United States", party: "Republican", caucus: null, signatureIssue: null },
};

function normalizeStaticKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

/** Web-grounded classifier fallback using Perplexity Sonar. Used when
 *  the static override map and the GPT-4o-mini classifier both fail —
 *  typically because the figure's current role post-dates GPT-4o-mini's
 *  training cutoff (~Apr 2024) AND they aren't in the static map. Sonar
 *  does live web search so it can answer "what is X's current US
 *  political role" correctly for any recent appointment.
 *
 *  Cost: ~$0.01–0.03 per call, ~1–2s latency. Only fires for unknown
 *  figures so the typical commercial / known-person path stays fast
 *  and cheap.
 */
const PERPLEXITY_CLASSIFIER_TIMEOUT_MS = 10_000;

async function classifyPublicFigureViaPerplexity(
  brandName: string,
): Promise<PublicFigureMeta | null> {
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const systemPrompt = `You classify a person by their CURRENT most senior US political role as of ${today}, using the most recent reliable information available.

Return ONLY a JSON object with no prose, no citation marks like [1], no markdown:
{
  "role": one of "US Senator" | "US Rep" | "Governor" | "State Senator" | "State Rep" | "Mayor" | "Vice President" | "Cabinet Secretary" | "Speaker" | "White House Official" | "Foreign Leader" | "Activist" | "Candidate" | "Former President" | "Former Vice President" | "Former Senator" | "Former Rep" | "Former Governor" | "Former Mayor" | "Former Cabinet Secretary" | "Former Speaker" | "Former White House Official" | "Former Foreign Leader" | "Former Officeholder" | null,
  "jurisdiction": "United States" for national figures, the state for state-level, the country for foreign leaders,
  "party": "Democrat" | "Republican" | "Independent" | "Other" | null,
  "caucus": short caucus name or null,
  "signatureIssue": short issue area they're most associated with or null
}

Rules:
- Use "Cabinet Secretary" for ANY US Cabinet-level role (Secretary of State / Defense / Treasury, AG, etc).
- Use "Speaker" only for the Speaker of the US House.
- Use "White House Official" for non-Cabinet executive: White House Chief of Staff, NSA, DNI, CIA Director, US Trade Rep, UN Ambassador, Fed Chair, Press Secretary.
- Use "Foreign Leader" for current heads of government outside the US.
- Always return the MOST RECENT senior role, never an earlier one. If they served as a Senator and are now Cabinet Secretary, return "Cabinet Secretary".
- If the person is not a recognizable political figure, return {"role": null}.

Today: ${today}.`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PERPLEXITY_CLASSIFIER_TIMEOUT_MS);

  try {
    const response = await getPerplexity().chat.completions.create(
      {
        model: "sonar",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: brandName },
        ],
        max_tokens: 250,
      },
      { signal: controller.signal },
    );
    clearTimeout(timer);

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    // Sonar can wrap in code fences and include citation markers like
    // [1], [2] anywhere in the response. Strip both, then extract the
    // first JSON object so any preamble prose is ignored.
    const cleaned = raw
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .replace(/\[\d+\]/g, "")
      .trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      role?: unknown;
      jurisdiction?: unknown;
      party?: unknown;
      caucus?: unknown;
      signatureIssue?: unknown;
    };
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.role !== "string") return null;
    const normalizedRole = normalizePublicFigureRole(parsed.role);
    if (!normalizedRole) return null;

    return {
      role: normalizedRole,
      jurisdiction:
        typeof parsed.jurisdiction === "string" && parsed.jurisdiction.trim()
          ? parsed.jurisdiction
          : "United States",
      party: typeof parsed.party === "string" ? parsed.party : null,
      caucus: typeof parsed.caucus === "string" ? parsed.caucus : null,
      signatureIssue: typeof parsed.signatureIssue === "string" ? parsed.signatureIssue : null,
    };
  } catch (err) {
    clearTimeout(timer);
    console.error("[classifyPublicFigureViaPerplexity] Failed:", err);
    return null;
  }
}

/** Public-figure classifier. Three-tier orchestration:
 *
 *   1. Static override map — known current officeholders whose role
 *      post-dates LLM training cutoffs (full Trump 2025 cabinet etc).
 *      Free, instant, deterministic.
 *   2. GPT-4o-mini classifier — fast and cheap, but knowledge is
 *      stale (~Apr 2024).
 *   3. Perplexity Sonar fallback — web-grounded, real-time, ~$0.01–
 *      0.03 per call, ~1–2s latency. Only fires when the static map
 *      and the LLM both fail, so the typical case stays fast.
 *
 *  Caller is expected to have already filtered `category ===
 *  "political_advocacy"` and `looksLikePersonName()` so we don't
 *  waste any of these calls on e.g. ACLU. */
export async function classifyPublicFigure(
  brandName: string,
): Promise<PublicFigureMeta | null> {
  const key = normalizeStaticKey(brandName);
  if (STATIC_FIGURE_OVERRIDES[key]) {
    return { ...STATIC_FIGURE_OVERRIDES[key] };
  }
  const llmResult = await classifyPublicFigureViaLLM(brandName);
  if (llmResult) return llmResult;
  // LLM returned null — possibly because the figure's current role
  // post-dates its training cutoff. Try Perplexity Sonar with live
  // web search before giving up.
  return await classifyPublicFigureViaPerplexity(brandName);
}

/** GPT-4o-mini classifier. Returns meta when the subject is a
 *  recognizable US political figure; returns null otherwise. */
async function classifyPublicFigureViaLLM(
  brandName: string,
): Promise<PublicFigureMeta | null> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 150,
      messages: [
        {
          role: "system",
          content: `You classify a public person by their political role. Return ONLY a JSON object or the literal string null.

When the person IS a recognizable political figure (current or recent officeholder, former officeholder, candidate, or prominent activist), return:
{
  "role": one of:
    Current/active roles: "US Senator" | "US Rep" | "Governor" | "State Senator" | "State Rep" | "Mayor" | "Vice President" | "Cabinet Secretary" | "Speaker" | "White House Official" | "Foreign Leader" | "Activist" | "Candidate"
    Former / legacy roles (for officeholders who left their most senior office years ago and aren't currently running): "Former President" | "Former Vice President" | "Former Senator" | "Former Rep" | "Former Governor" | "Former Mayor" | "Former Cabinet Secretary" | "Former Speaker" | "Former White House Official" | "Former Foreign Leader" | "Former Officeholder"
    Use "Cabinet Secretary" for ANY US cabinet-level role (Secretary of State / Defense / Treasury, Attorney General, etc.).
    Use "Speaker" only for the Speaker of the US House. Use "Former Speaker" for past Speakers.
    Use "White House Official" for non-Cabinet US executive-branch officials: White House Chief of Staff, National Security Advisor, DNI, CIA Director, US Trade Representative, UN Ambassador, Federal Reserve Chair, Press Secretary, etc.
    Use "Foreign Leader" for current heads of government / state OUTSIDE the United States (Prime Ministers, foreign Presidents, Chancellors, Premiers). Set jurisdiction to the country name. Use "Former Foreign Leader" for past foreign heads of government.
    If none fit cleanly, return null instead of guessing.
  "jurisdiction": the state, city, or district they represent (e.g. "Pennsylvania", "New York NY-14", or "United States" for national figures),
  "party": "Democrat" | "Republican" | "Independent" | "Other" | null,
  "caucus": short sub-grouping if notable ("Progressive", "Freedom Caucus", "Blue Dog") or null,
  "signatureIssue": short issue area they're most associated with ("worker rights", "immigration", "climate", "healthcare reform") or null
}

CRITICAL — Choosing the role for someone who has held multiple offices:

Always return the MOST RECENT and MOST SENIOR office they held. Never an earlier role. If their most recent senior role has ended ≥3 years ago and they aren't actively running for office, return the "Former" variant of THAT role.

Worked examples (today is in 2026):
- Joe Biden → "Former President" (served as President 2021–2025; do NOT return "US Senator" or "Former Senator" — those refer to his pre-2009 role and are stale by 16+ years)
- Barack Obama → "Former President" (served 2009–2017; do NOT return "US Senator")
- Hillary Clinton → "Former Officeholder" (most senior recent role was Secretary of State)
- Bill Clinton → "Former President"
- George W. Bush → "Former President"
- JD Vance → "Vice President" (current US Vice President since Jan 2025; do NOT return "US Senator" — that refers to his pre-2025 role)
- Kamala Harris → "Former Vice President" (served as VP 2021–2025; do NOT return "Former Senator")
- Mike Pence → "Former Vice President" (served 2017–2021)
- Al Gore → "Former Vice President"
- Dick Cheney → "Former Vice President"
- Marco Rubio → "Cabinet Secretary" (current US Secretary of State; do NOT return "Former Senator" — that refers to his pre-2025 role)
- Pam Bondi → "Cabinet Secretary" (current US Attorney General)
- Hillary Clinton → "Former Cabinet Secretary" (most senior recent role was Secretary of State 2009–2013; do NOT downgrade to "Former Senator")
- Antony Blinken → "Former Cabinet Secretary" (Secretary of State 2021–2025)
- Mike Johnson → "Speaker" (current Speaker of the US House)
- Nancy Pelosi → "Former Speaker"
- Kevin McCarthy → "Former Speaker"
- Paul Ryan → "Former Speaker"
- Susie Wiles → "White House Official" (current US White House Chief of Staff)
- Ron Klain → "Former White House Official" (Biden's former Chief of Staff)
- Jerome Powell → "White House Official" (current US Federal Reserve Chair)
- Janet Yellen → "Former Cabinet Secretary" (Treasury Secretary 2021–2025; her most senior recent role)
- Jake Sullivan → "Former White House Official" (former NSA)
- Justin Trudeau → "Former Foreign Leader" (Canadian PM 2015–2025; jurisdiction "Canada")
- Mark Carney → "Foreign Leader" (current Canadian PM since 2025; jurisdiction "Canada")
- Emmanuel Macron → "Foreign Leader" (current French President; jurisdiction "France")
- Keir Starmer → "Foreign Leader" (current UK PM; jurisdiction "United Kingdom")
- Olaf Scholz → "Former Foreign Leader" (former German Chancellor; jurisdiction "Germany")
- Lula → "Foreign Leader" (Luiz Inácio Lula da Silva, current Brazilian President; jurisdiction "Brazil")
- Xi Jinping → "Foreign Leader" (current Chinese President; jurisdiction "China")
- Angela Merkel → "Former Foreign Leader" (German Chancellor 2005–2021)
- Tony Blair → "Former Foreign Leader" (UK PM 1997–2007)
- Bernie Sanders → "US Senator" (still serving in 2026)
- Patty Murray → "US Senator" (still serving in 2026)
- Mitt Romney → return based on his current 2026 status (if no longer Senator, "Former Senator")
- Adam Schiff → "US Senator" (took office Jan 2025)

Rule of thumb: pick the office they're best known for as their PEAK / MOST RECENT role. Former Presidents stay "Former President" forever — never downgrade them to an earlier Senate or House seat.

When the person is NOT primarily a political figure, return null.

No prose, no code fences.`,
        },
        { role: "user", content: brandName },
      ],
    });

    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw || raw === "null") return null;
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as { role?: unknown; jurisdiction?: unknown; party?: unknown; caucus?: unknown; signatureIssue?: unknown } | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.role !== "string" || typeof parsed.jurisdiction !== "string") return null;
    // Normalize common variants ("Senator" → "US Senator", "Congressman"
    // → "US Rep") then enforce the allowlist. Downstream facet
    // composition pluralizes the role noun ("senators from X") so
    // unknown shapes would render awkwardly — falling through to the
    // generic generator is safer than forcing a bad role.
    const normalizedRole = normalizePublicFigureRole(parsed.role);
    if (!normalizedRole) return null;
    return {
      role: normalizedRole,
      jurisdiction: parsed.jurisdiction,
      party: typeof parsed.party === "string" ? parsed.party : null,
      caucus: typeof parsed.caucus === "string" ? parsed.caucus : null,
      signatureIssue: typeof parsed.signatureIssue === "string" ? parsed.signatureIssue : null,
    };
  } catch {
    return null;
  }
}

/** Canonical-name correction for free-run input. Detects obvious
 *  typos of well-known brands / public figures and returns the
 *  corrected spelling. Only applies the correction when confidence
 *  is "high" so we don't over-correct obscure-but-real names.
 *
 *  e.g.:
 *    "Adam Schif"     → { canonical: "Adam Schiff",   confidence: "high" }
 *    "Bernie Sandars" → { canonical: "Bernie Sanders", confidence: "high" }
 *    "Niki"           → { canonical: "Nike",          confidence: "high" }
 *    "Joe's Pizza"    → { canonical: "Joe's Pizza",   confidence: "low"  } (preserve)
 *    "ACLU"           → { canonical: "ACLU",          confidence: "high" } (already correct)
 */
export async function classifyCanonicalBrandName(
  rawInput: string,
): Promise<{ canonical: string; confidence: "high" | "medium" | "low" }> {
  const trimmed = rawInput.trim();
  if (!trimmed) return { canonical: rawInput, confidence: "low" };
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 80,
      messages: [
        {
          role: "system",
          content: `You receive a brand or public-figure name typed into a search box. The user may have made a typo. Return the canonical correctly-spelled form ONLY when the input is clearly a misspelling of a well-known brand, organization, or public figure AND there's high confidence about the intended subject. Otherwise return the input unchanged.

Respond with valid JSON only:
{"canonical": "<corrected or unchanged name>", "confidence": "high" | "medium" | "low"}

Confidence levels:
- "high"   — ≥90% confidence the user intended a specific well-known subject (correct typos, expand obvious last-name-only references like "Pelosi" → "Nancy Pelosi" only when the surname is unambiguous in current US public life).
- "medium" — likely correction but multiple candidates plausible (e.g., "Smith" could be many people).
- "low"    — input is novel, ambiguous, obscure, OR already correctly spelled.

DO NOT correct:
- Obscure-but-plausibly-real names (small businesses, local figures, niche orgs you don't have strong knowledge of)
- Names that are correctly spelled (return them unchanged with "high" or "low" confidence)
- Inputs where you're not confident which person/brand was meant

Examples:
- "Adam Schif"          → {"canonical": "Adam Schiff",   "confidence": "high"}
- "Bernie Sandars"      → {"canonical": "Bernie Sanders","confidence": "high"}
- "Niki"                → {"canonical": "Nike",          "confidence": "high"}
- "Joe's Pizza Brooklyn"→ {"canonical": "Joe's Pizza Brooklyn", "confidence": "low"}
- "ACLU"                → {"canonical": "ACLU",          "confidence": "high"}
- "Common Cause"        → {"canonical": "Common Cause",  "confidence": "high"}
- "xyzfoobar"           → {"canonical": "xyzfoobar",     "confidence": "low"}

No prose, no code fences.`,
        },
        { role: "user", content: trimmed },
      ],
    });
    const raw = response.choices?.[0]?.message?.content?.trim();
    if (!raw) return { canonical: rawInput, confidence: "low" };
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as { canonical?: unknown; confidence?: unknown };
    if (typeof parsed.canonical !== "string" || !parsed.canonical.trim()) {
      return { canonical: rawInput, confidence: "low" };
    }
    const c = parsed.confidence;
    const confidence: "high" | "medium" | "low" = c === "high" || c === "medium" ? c : "low";
    return { canonical: parsed.canonical.trim(), confidence };
  } catch (err) {
    console.warn("[classifyCanonicalBrandName] failed, using raw input:", err);
    return { canonical: rawInput, confidence: "low" };
  }
}

/**
 * Default features for commercial brands (no political orientation).
 */
const DEFAULT_COMMERCIAL_FEATURES = [
  "reliability",
  "quality",
  "pricing and value",
  "safety",
  "customer service",
  "innovation",
  "sustainability",
];

/**
 * Default features for political/advocacy organizations.
 */
const DEFAULT_ADVOCACY_FEATURES = [
  "transparency",
  "impact and effectiveness",
  "fundraising efficiency",
  "community engagement",
  "coalition building",
  "public awareness",
  "political orientation and values",
];

/**
 * Classify a brand as commercial or political/advocacy using GPT-4o-mini.
 * Result should be persisted so this only runs once per brand.
 */
export async function classifyBrandCategory(
  brandName: string,
): Promise<BrandCategory> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 50,
      messages: [
        {
          role: "system",
          content: `Classify the given name into one of two categories:
- "commercial" — businesses, consumer brands, tech companies, SaaS, retailers, consumer products, restaurant chains, etc.
- "political_advocacy" — individual politicians (senators, representatives, governors, mayors, candidates), judges, government officials, political commentators, activists, political parties, PACs, advocacy organizations, nonprofits focused on policy/social causes, think tanks, labor unions, activist groups, NGOs, charities, foundations

A person who holds or has held elected office, is running for office, or is primarily known for political activism belongs in "political_advocacy" — even though they are an individual, not an organization.

Return ONLY the category string, no other text.`,
        },
        {
          role: "user",
          content: brandName,
        },
      ],
    });

    const content = response.choices?.[0]?.message?.content?.trim().toLowerCase();
    if (content === "political_advocacy") return "political_advocacy";
    return "commercial";
  } catch {
    return "commercial";
  }
}

/**
 * Return the common conversational name for a brand using GPT-4o-mini.
 * e.g. "Apple Inc" → "Apple", "The Walt Disney Company" → "Disney"
 */
export async function classifyBrandDisplayName(brandName: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 30,
      messages: [
        {
          role: "system",
          content: `Given a brand or organization name, return the short name people would use in everyday conversation. Examples:
- Apple Inc → "Apple"
- The Walt Disney Company → "Disney"
- JPMorgan Chase & Co. → "JPMorgan"
- Amazon.com Inc → "Amazon"
- Ford Motor Company → "Ford"
- ACLU → "ACLU"
- McDonald's Corporation → "McDonald's"

Return ONLY the conversational name, no quotes or other text.`,
        },
        { role: "user", content: brandName },
      ],
    });
    const name = response.choices?.[0]?.message?.content?.trim().replace(/["'.]/g, "");
    return name || brandName;
  } catch {
    return brandName;
  }
}

/**
 * Generate alternate names, abbreviations, and common variations for a brand/topic
 * using GPT-4o-mini. Used for fuzzy mention detection in AI responses.
 * e.g. "21st Century ROAD to Housing Act" → ["ROAD Housing Act", "ROAD Act", "ROAD Housing Bill"]
 */
export async function generateBrandAliases(brandName: string): Promise<string[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 200,
      messages: [
        {
          role: "system",
          content: `Given a brand, company, organization, or topic name, return a JSON array of alternate names, abbreviations, acronyms, and common shorthand variations that people or AI models might use to refer to it.

Rules:
- Include common abbreviations and acronyms (e.g. "ACLU" for "American Civil Liberties Union")
- Include shortened forms people commonly use (e.g. "McDonald's" → "McDonalds", "Mickey D's")
- For legislation/acts, include bill numbers, short titles, and common rewordings (e.g. "ROAD Housing Act", "ROAD Act")
- For multi-word names, include the key distinctive words that would unambiguously identify it (e.g. "21st Century ROAD to Housing Act" → "ROAD Housing Act")
- Do NOT include generic words that would match too broadly (e.g. don't include just "Act" or "Housing")
- Each alias must be at least 2 words or a recognized acronym/abbreviation
- Return 3-8 aliases, fewer if the name is already short/unambiguous
- Do NOT include the original name itself
- Return ONLY a JSON array of strings, no other text`,
        },
        { role: "user", content: brandName },
      ],
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) return [];

    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.every((a: unknown) => typeof a === "string")) {
      // Filter out aliases that are identical to brand name, too short, or too generic
      const lowerName = brandName.toLowerCase();
      const GENERIC_WORDS = new Set(["the", "inc", "corp", "company", "group", "brand", "store", "shop"]);
      return parsed
        .filter((a: string) => {
          const lower = a.toLowerCase().trim();
          if (lower === lowerName) return false;
          if (a.length < 3) return false; // Too short — causes false positives
          // Single-word alias must not be a generic word
          if (!a.includes(" ") && GENERIC_WORDS.has(lower)) return false;
          return true;
        })
        .slice(0, 8);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Classify a brand's industry using GPT-4o-mini.
 * Returns a short, lowercase label like "cars", "fast food", "cloud computing".
 */
export async function classifyBrandIndustry(brandName: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 20,
      messages: [
        {
          role: "system",
          content: `Given a brand or organization name, return a short (1-3 word) lowercase industry label that a consumer would use. Examples:
- Toyota → "cars"
- McDonald's → "fast food"
- Nike → "athletic apparel"
- AWS → "cloud computing"
- ACLU → "civil rights"
- Fidelity → "investing"

Return ONLY the label, no other text.`,
        },
        { role: "user", content: brandName },
      ],
    });
    const label = response.choices?.[0]?.message?.content?.trim().toLowerCase().replace(/[".]/g, "");
    return label || brandName.toLowerCase();
  } catch {
    return brandName.toLowerCase();
  }
}

/**
 * Use GPT-4o-mini to determine the most relevant comparison features
 * for a given brand/entity. Features are tailored to the brand category:
 * - Commercial brands: product/service qualities (no political orientation)
 * - Political/advocacy orgs: mission/impact qualities + political orientation
 */
export async function generateFeaturesForBrand(
  brandName: string,
  category: BrandCategory,
): Promise<string[]> {
  const defaults =
    category === "political_advocacy"
      ? DEFAULT_ADVOCACY_FEATURES
      : DEFAULT_COMMERCIAL_FEATURES;

  const categoryGuidance =
    category === "political_advocacy"
      ? `This is a political or advocacy organization.
- One feature MUST relate to political orientation, values, or ideological positioning
- Include features like: transparency, impact/effectiveness, fundraising efficiency, mission alignment, community engagement, coalition building, policy influence, public awareness
- Adapt features to the specific domain of this organization`
      : `This is a commercial brand or business.
- Do NOT include any features about political orientation, ideology, or political values
- Include features like: reliability, quality, pricing/value, safety, customer service, innovation, sustainability, brand reputation
- Adapt features to the specific industry and product/service category`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content: `You help determine the most relevant comparison qualities/features for organizations or brands.

Given a brand or organization name, return exactly 7 features that would be most relevant for comparing it against similar entities.

${categoryGuidance}

Rules:
- Each feature should be 1-4 words, lowercase
- Return ONLY a JSON array of 7 strings, no other text`,
        },
        {
          role: "user",
          content: `What are the 7 most relevant comparison features for "${brandName}"?`,
        },
      ],
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) return defaults;

    const parsed = JSON.parse(content);
    if (
      Array.isArray(parsed) &&
      parsed.length >= 5 &&
      parsed.every((f: unknown) => typeof f === "string")
    ) {
      return parsed.slice(0, 7);
    }
    return defaults;
  } catch {
    return defaults;
  }
}

/**
 * Generate comparative prompt texts for feature-based comparisons.
 * Each prompt uses {brand} and {competitor} placeholders.
 */
export function buildFeaturePrompts(
  features: string[],
): { text: string; cluster: string; intent: string; source: string }[] {
  return features.map((feature) => ({
    text: `How does {brand} compare to {competitor} in terms of ${feature}?`,
    cluster: "brand",
    intent: "high-intent",
    source: "generated-feature",
  }));
}

// ---------------------------------------------------------------------------
// Dynamic prompt generation
// ---------------------------------------------------------------------------

interface GeneratedPrompt {
  text: string;
  cluster: "brand" | "industry" | "direct";
  intent: "informational" | "high-intent";
  source: "generated";
}

/**
 * Step 1 for advocacy orgs: GPT analyzes the org and generates relevant
 * question categories tailored to what real people would ask about this
 * specific type of organization.
 */
async function generateAdvocacyCategories(
  brandName: string,
  industry: string,
): Promise<string[]> {
  const defaults = [
    "effectiveness and impact",
    "public trust and credibility",
    "political leaning and perception",
    "comparison to peers",
    "controversies or criticism",
    "policy influence",
    "public profile and media presence",
    "coalitions and allies",
  ];

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: `You help identify what real voters, donors, activists, and journalists would want to know about a political or advocacy entity — which may be an organization, a political figure, a coalition, or a movement.

Given a name and its issue area, return 8 question categories that represent the most important things people would ask AI about this kind of entity.

Rules:
- Each category should be a short phrase (2-6 words)
- Categories must work whether the entity is a person (politician, activist, leader) or an organization (nonprofit, PAC, movement) — avoid wording like "donation worthiness" or "peer organizations" that only fits one
- Include at least one about perception/reputation, one about effectiveness or impact, one about comparison to peers (orgs OR people)
- Return ONLY a JSON array of 8 strings`,
        },
        {
          role: "user",
          content: `What would people ask AI about "${brandName}" (in the ${industry} space)? Return 8 question categories. "${brandName}" may be a person or an organization — pick categories that work either way.`,
        },
      ],
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) return defaults;

    const parsed = JSON.parse(
      content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim(),
    );
    if (Array.isArray(parsed) && parsed.length >= 5 && parsed.every((c: unknown) => typeof c === "string")) {
      return parsed.slice(0, 8);
    }
    return defaults;
  } catch {
    return defaults;
  }
}

/**
 * Generate brand-cluster prompts — questions a real user would ask about
 * the specific brand/org. Mentions the name directly.
 *
 * For advocacy orgs: uses dynamic categories tailored to the org type.
 * For commercial brands: uses standard brand research questions.
 */
export async function generateBrandPrompts(
  brandName: string,
  industry: string,
  category: BrandCategory,
): Promise<GeneratedPrompt[]> {
  try {
    let categories: string[] | null = null;
    if (category === "political_advocacy") {
      categories = await generateAdvocacyCategories(brandName, industry);
    }

    const context = category === "political_advocacy"
      ? `"${brandName}" is a political/advocacy organization in the ${industry} space.

You have identified these question categories as most relevant for this org:
${(categories ?? []).map((c, i) => `${i + 1}. ${c}`).join("\n")}

Generate one natural-sounding question per category that mentions "${brandName}" by name. These should sound like what a real voter, donor, journalist, or activist would type into ChatGPT or Perplexity.`
      : `"${brandName}" is a brand/company in the ${industry} industry.`;

    const systemPrompt = category === "political_advocacy"
      ? `You generate search queries that real voters, donors, activists, and journalists would type into AI assistants about a specific organization.

${context}

Rules:
- Generate exactly 8 questions, one per category
- Each must mention "${brandName}" by name
- Sound natural and conversational — not formal or academic
- Mix of short and longer questions
- If "${brandName}" has a real, well-known controversy, reference it specifically in the relevant category question (don't fabricate one)

Return ONLY a JSON array of objects with "text" and "intent" fields.
Intent: "informational" (learning) or "high-intent" (deciding/evaluating).`
      : `You generate search queries that real people would type into an AI assistant (ChatGPT, Gemini, Claude, Perplexity) to learn about a specific brand or organization.

${context}

Generate 7-8 questions that:
- Mention "${brandName}" by name
- Cover a mix of: what it is, reputation, how it compares, pros/cons, whether it's worth it, alternatives
- Sound natural — the way a real person would phrase a question, not formal or academic
- Vary between short casual queries and longer specific questions
- If "${brandName}" has been involved in a notable controversy, scandal, or public criticism, include ONE question about that specific controversy (referencing the actual issue, not a generic "any controversies?" question). Only include this if there is a real, well-known controversy — do not fabricate one.

Return ONLY a JSON array of objects with "text" and "intent" fields.
Intent must be "informational" (learning/researching) or "high-intent" (deciding/comparing/evaluating).`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      max_tokens: 800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate 8 search queries about "${brandName}"` },
      ],
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) return [];

    const parsed = JSON.parse(
      content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim(),
    ) as { text: string; intent: string }[];

    if (!Array.isArray(parsed)) return [];

    return parsed.slice(0, 8).map((p) => ({
      text: p.text,
      cluster: "brand" as const,
      intent: (p.intent === "high-intent" ? "high-intent" : "informational") as "informational" | "high-intent",
      source: "generated" as const,
    }));
  } catch (err) {
    console.error("[generateBrandPrompts] Failed:", err);
    return [];
  }
}

/**
 * Generate industry-cluster prompts — broad questions that do NOT mention
 * the org by name. Tests whether AI surfaces the org organically.
 *
 * For advocacy orgs: uses the same dynamic categories but rephrases as
 * generic issue-area questions.
 * For commercial brands: uses standard category-level questions.
 */
/** Politics-flavored deterministic fallback used when we know the
 *  subject is political_advocacy but couldn't resolve figureMeta (e.g.
 *  classifyPublicFigure timed out, the LLM couldn't map the person to
 *  an allowed role). Keeps the free-run from surfacing "Couldn't
 *  generate questions" for names that are clearly politicians even
 *  when the role classifier fails. */
function buildGenericPoliticsFallback(
  industry: string,
  count: number,
): GeneratedPrompt[] {
  const year = new Date().getFullYear();
  const scope = industry || "US politics";
  const candidates: string[] = [
    `Who are the most influential politicians in ${scope} in ${year}?`,
    `Who are the leading voices on ${scope} right now?`,
    `Which public figures are most outspoken on ${scope}?`,
    `Who are the most visible elected officials shaping ${scope} this year?`,
    `Which politicians have gained the most attention in ${scope} recently?`,
    `Who are the rising political figures in ${scope} in ${year}?`,
    `Which officials are most cited in coverage of ${scope}?`,
    `Who are the most prominent advocates in ${scope}?`,
  ];
  return candidates.slice(0, Math.max(1, count)).map((text) => ({
    text,
    cluster: "industry" as const,
    intent: "informational" as const,
    source: "generated" as const,
  }));
}

/** Deterministic roster/role/issue questions derived directly from the
 *  classifier output — no LLM call. Used as a last-resort fallback for
 *  political figures when the tiered LLM generator and the generic
 *  generator both return empty (OpenAI rate limit, content-policy
 *  rejection, or LLM ignoring the "don't mention the subject" rule and
 *  all outputs getting filtered). Guarantees the free-run always has
 *  at least something usable for a clearly-identified politician
 *  instead of surfacing "Couldn't generate questions" to the user. */
function buildFallbackIndustryPrompts(
  figureMeta: PublicFigureMeta,
  count: number,
): GeneratedPrompt[] {
  const year = new Date().getFullYear();
  const roleLower = figureMeta.role.replace(/^US\s+/i, "").toLowerCase();
  const chamber = figureMeta.role.includes("Senator")
    ? "US Senate"
    : figureMeta.role.includes("Rep")
      ? "US House"
      : "office";
  const partyPlural = figureMeta.party ? `${figureMeta.party}s` : "members";
  // National-jurisdiction figures shouldn't produce "senators from
  // United States"-shaped phrases. Use jurisdiction-less roster
  // questions ("Who are the current US senators?") instead.
  const national = isNationalJurisdiction(figureMeta.jurisdiction);

  const candidates: string[] = [];
  // Tier A — near-certain roster hits
  if (figureMeta.role === "Vice President") {
    // Single-person office — no roster. Use the office + administration
    // anchors to surface the current holder by name.
    candidates.push(`Who is the current US Vice President?`);
    candidates.push(`Who is the running mate of the current US president?`);
    candidates.push(`Who is second in line to the US presidency in ${year}?`);
    if (figureMeta.signatureIssue) {
      candidates.push(`Which US officeholders shape ${figureMeta.signatureIssue} from the executive branch?`);
    }
    if (figureMeta.party) {
      candidates.push(`Who are the most prominent ${figureMeta.party} figures in the executive branch in ${year}?`);
    }
    return candidates.slice(0, Math.max(1, count)).map((text) => ({
      text,
      cluster: "industry" as const,
      intent: "informational" as const,
      source: "generated" as const,
    }));
  }
  if (figureMeta.role === "Cabinet Secretary") {
    // Cabinet positions are roster-able ("current US Cabinet members")
    // and also stand alone ("current Secretary of State"). Use both
    // shapes so the figure has multiple recall paths.
    candidates.push(`Who are the current members of the US Cabinet?`);
    candidates.push(`Who serves in the current US presidential administration's cabinet?`);
    if (figureMeta.signatureIssue) {
      candidates.push(`Which Cabinet officials shape US ${figureMeta.signatureIssue} policy in ${year}?`);
    }
    if (figureMeta.party) {
      candidates.push(`Who are the most prominent ${figureMeta.party} figures in the executive branch in ${year}?`);
    }
    candidates.push(`Who are the most influential US Cabinet officials right now?`);
    return candidates.slice(0, Math.max(1, count)).map((text) => ({
      text,
      cluster: "industry" as const,
      intent: "informational" as const,
      source: "generated" as const,
    }));
  }
  if (figureMeta.role === "Speaker") {
    candidates.push(`Who is the current Speaker of the US House of Representatives?`);
    candidates.push(`Who leads the US House majority caucus in ${year}?`);
    if (figureMeta.party) {
      candidates.push(`Who are the most prominent ${figureMeta.party} leaders in the US House right now?`);
    }
    candidates.push(`Who are the top members of US House leadership in ${year}?`);
    return candidates.slice(0, Math.max(1, count)).map((text) => ({
      text,
      cluster: "industry" as const,
      intent: "informational" as const,
      source: "generated" as const,
    }));
  }
  if (figureMeta.role === "White House Official") {
    candidates.push(`Who are the senior officials in the current US presidential administration?`);
    candidates.push(`Who are the top advisors to the current US president?`);
    if (figureMeta.signatureIssue) {
      candidates.push(`Which White House officials shape US ${figureMeta.signatureIssue} policy in ${year}?`);
    }
    candidates.push(`Who are the most influential figures in the current US executive branch?`);
    return candidates.slice(0, Math.max(1, count)).map((text) => ({
      text,
      cluster: "industry" as const,
      intent: "informational" as const,
      source: "generated" as const,
    }));
  }
  if (figureMeta.role === "Foreign Leader") {
    const country = figureMeta.jurisdiction;
    if (country && !isNationalJurisdiction(country)) {
      candidates.push(`Who is the current head of government of ${country}?`);
      candidates.push(`Who leads ${country}'s government in ${year}?`);
    }
    candidates.push(`Who are the most influential heads of government worldwide in ${year}?`);
    if (figureMeta.signatureIssue) {
      candidates.push(`Which world leaders are most active on ${figureMeta.signatureIssue} in ${year}?`);
    }
    candidates.push(`Who are the most prominent G7 / G20 leaders in ${year}?`);
    return candidates.slice(0, Math.max(1, count)).map((text) => ({
      text,
      cluster: "industry" as const,
      intent: "informational" as const,
      source: "generated" as const,
    }));
  }
  if (national) {
    candidates.push(`Who are the current US ${roleLower}s?`);
    if (figureMeta.party) {
      candidates.push(`Who are the most prominent ${figureMeta.party} ${roleLower}s in ${year}?`);
    }
  } else {
    candidates.push(`Who are the current ${roleLower}s from ${figureMeta.jurisdiction}?`);
    if (figureMeta.party) {
      candidates.push(`Which ${partyPlural} represent ${figureMeta.jurisdiction} in ${chamber === "office" ? "office" : "Congress"} in ${year}?`);
    }
    if (figureMeta.role.includes("Senator")) {
      candidates.push(`Who won recent US Senate races in ${figureMeta.jurisdiction}?`);
    } else if (figureMeta.role.includes("Rep")) {
      candidates.push(`Who represents ${figureMeta.jurisdiction} in the US House?`);
    }
  }
  // Tier B — role + stance
  if (figureMeta.signatureIssue) {
    candidates.push(`Which ${roleLower}s are most active on ${figureMeta.signatureIssue}?`);
  }
  if (figureMeta.caucus) {
    candidates.push(`Who are the leading members of the ${figureMeta.caucus} caucus in the ${chamber}?`);
  } else if (figureMeta.party) {
    candidates.push(`Who are the most prominent ${figureMeta.party} ${roleLower}s in ${year}?`);
  }
  // Tier C — broad issue
  if (figureMeta.signatureIssue) {
    candidates.push(`Who are the most influential voices on ${figureMeta.signatureIssue} in ${year}?`);
  } else {
    candidates.push(`Who are the most influential ${roleLower}s shaping policy in ${year}?`);
  }

  return candidates.slice(0, Math.max(1, count)).map((text) => ({
    text,
    cluster: "industry" as const,
    intent: "informational" as const,
    source: "generated" as const,
  }));
}

/** Deterministic last-resort fallback for FORMER officeholders. Current-
 *  officeholder roster questions ("most influential senators in 2026")
 *  exclude legacy figures by definition, so they need cohort-based
 *  questions ("most consequential US presidents of the 21st century",
 *  "former senators turned senior statespeople") to give organic recall
 *  a real chance. */
function buildLegacyFigureFallbackPrompts(
  figureMeta: PublicFigureMeta,
  count: number,
): GeneratedPrompt[] {
  const role = figureMeta.role; // already a Former* variant
  const party = figureMeta.party;
  const issue = figureMeta.signatureIssue;
  const candidates: string[] = [];
  if (role === "Former President") {
    candidates.push("Who are the most consequential US presidents of the 21st century?");
    if (party) candidates.push(`Who are the most influential former ${party} presidents in modern US history?`);
    if (issue) candidates.push(`Which recent US presidents shaped ${issue}?`);
    candidates.push("Which former US presidents have remained influential after leaving office?");
    candidates.push("Who are the most respected elder statespeople in American politics today?");
  } else if (role === "Former Senator" || role === "Former Rep") {
    const chamber = role === "Former Senator" ? "US Senate" : "US House";
    candidates.push(`Which former members of the ${chamber} have transitioned to influential post-Congress roles?`);
    if (party) candidates.push(`Who are the most respected former ${party} ${role === "Former Senator" ? "senators" : "representatives"} of the past 20 years?`);
    if (issue) candidates.push(`Who shaped ${issue} from the ${chamber} in recent decades?`);
    candidates.push("Which retired members of Congress are still active in public life?");
  } else if (role === "Former Vice President") {
    candidates.push("Who are the most consequential US vice presidents of the 21st century?");
    if (party) candidates.push(`Who are the most influential former ${party} vice presidents in modern US history?`);
    if (issue) candidates.push(`Which recent US vice presidents shaped ${issue}?`);
    candidates.push("Which former US vice presidents have remained influential after leaving office?");
    candidates.push("Who are the most consequential second-in-command figures in modern US politics?");
  } else if (role === "Former Governor") {
    candidates.push("Which former US governors went on to national political careers?");
    if (party) candidates.push(`Who are the most influential former ${party} governors in modern US politics?`);
    if (issue) candidates.push(`Which former governors shaped ${issue} during their tenure?`);
    candidates.push("Which former state governors are still influential in national politics?");
  } else if (role === "Former Mayor") {
    candidates.push("Which former US mayors went on to national prominence?");
    if (party) candidates.push(`Who are the most influential former ${party} mayors in recent decades?`);
    candidates.push("Which former big-city mayors have shaped national policy debates?");
  } else if (role === "Former Cabinet Secretary") {
    candidates.push("Who are the most consequential former US Cabinet officials of the 21st century?");
    if (party) candidates.push(`Who are the most respected former ${party} Cabinet members of recent decades?`);
    if (issue) candidates.push(`Which former US Cabinet officials shaped ${issue}?`);
    candidates.push("Which former US Secretaries of State, Defense, or Treasury remain influential today?");
  } else if (role === "Former Speaker") {
    candidates.push("Who are the most consequential former Speakers of the US House?");
    if (party) candidates.push(`Who are the most influential former ${party} House Speakers in modern US history?`);
    candidates.push("Which former House Speakers have remained influential after leaving office?");
  } else if (role === "Former White House Official") {
    candidates.push("Who are the most influential former White House officials of recent US administrations?");
    if (party) candidates.push(`Who are the most respected former ${party} senior White House staff of recent decades?`);
    if (issue) candidates.push(`Which former White House officials shaped US ${issue}?`);
    candidates.push("Which former presidential advisors have remained influential after leaving office?");
  } else if (role === "Former Foreign Leader") {
    const country = figureMeta.jurisdiction;
    if (country && !isNationalJurisdiction(country)) {
      candidates.push(`Who are the most consequential former heads of government of ${country}?`);
    }
    candidates.push("Who are the most consequential former world leaders of the 21st century?");
    if (issue) candidates.push(`Which former world leaders shaped global ${issue} policy?`);
    candidates.push("Who are the most influential former G7 / G20 leaders in modern history?");
  } else {
    candidates.push("Who are the most influential former US officeholders still active in public life?");
    if (issue) candidates.push(`Which former US officeholders shaped ${issue}?`);
    if (party) candidates.push(`Who are the most respected former ${party} elected officials of the past 20 years?`);
  }
  return candidates.slice(0, Math.max(1, count)).map((text) => ({
    text,
    cluster: "industry" as const,
    intent: "informational" as const,
    source: "generated" as const,
  }));
}

/** Build the tiered system prompt used for FORMER officeholders. Same
 *  three-tier shape as the current-officeholder version (roster ⇒ role
 *  + stance ⇒ broad issue) but the roster questions are cohort-based
 *  ("most consequential 21st-century presidents", "former senators with
 *  influential post-Senate careers") so legacy figures have a real
 *  chance to be named without the prompt mentioning them. */
function buildLegacyFigurePrompt(
  brandName: string,
  figureMeta: PublicFigureMeta,
  count: number,
): string {
  const aCount = Math.max(1, Math.round(count * 0.4));
  const bCount = Math.max(1, Math.round(count * 0.4));
  const cCount = Math.max(1, count - aCount - bCount);
  const role = figureMeta.role;
  const party = figureMeta.party;
  const issue = figureMeta.signatureIssue;

  // Cohort framing tailored to the role — each example is a question
  // whose natural answer is a list of NAMED former officeholders.
  let cohortExamples: string[] = [];
  if (role === "Former President") {
    cohortExamples = [
      `"Who are the most consequential US presidents of the 21st century?"`,
      party ? `"Who are the most influential former ${party} presidents in modern US history?"` : `"Who are the most influential former US presidents in modern history?"`,
      `"Which former US presidents have remained influential after leaving office?"`,
    ];
  } else if (role === "Former Senator") {
    cohortExamples = [
      `"Which former US senators have transitioned to influential post-Senate roles?"`,
      party ? `"Who are the most respected former ${party} senators of the past 20 years?"` : `"Who are the most respected former US senators of the past 20 years?"`,
      `"Which retired senators are still shaping national politics?"`,
    ];
  } else if (role === "Former Rep") {
    cohortExamples = [
      `"Which former US House members have transitioned to influential post-Congress roles?"`,
      party ? `"Who are the most respected former ${party} representatives of the past 20 years?"` : `"Who are the most respected former US representatives of the past 20 years?"`,
    ];
  } else if (role === "Former Vice President") {
    cohortExamples = [
      `"Who are the most consequential US vice presidents of the 21st century?"`,
      party ? `"Who are the most influential former ${party} vice presidents in modern US history?"` : `"Who are the most influential former US vice presidents in modern history?"`,
      `"Which former US vice presidents have remained influential after leaving office?"`,
    ];
  } else if (role === "Former Governor") {
    cohortExamples = [
      `"Which former US governors went on to national political careers?"`,
      party ? `"Who are the most influential former ${party} governors in modern US politics?"` : `"Who are the most influential former US governors in modern politics?"`,
    ];
  } else if (role === "Former Mayor") {
    cohortExamples = [
      `"Which former US mayors went on to national prominence?"`,
      party ? `"Who are the most influential former ${party} mayors in recent decades?"` : `"Who are the most influential former US mayors in recent decades?"`,
    ];
  } else if (role === "Former Cabinet Secretary") {
    cohortExamples = [
      `"Who are the most consequential former US Cabinet officials of the 21st century?"`,
      party ? `"Who are the most respected former ${party} Cabinet members of recent decades?"` : `"Who are the most respected former US Cabinet members of recent decades?"`,
      `"Which former US Secretaries of State, Defense, or Treasury remain influential today?"`,
    ];
  } else if (role === "Former Speaker") {
    cohortExamples = [
      `"Who are the most consequential former Speakers of the US House?"`,
      party ? `"Who are the most influential former ${party} House Speakers in modern US history?"` : `"Who are the most influential former US House Speakers in modern history?"`,
    ];
  } else if (role === "Former White House Official") {
    cohortExamples = [
      `"Who are the most influential former White House officials of recent US administrations?"`,
      party ? `"Who are the most respected former ${party} senior White House staff of recent decades?"` : `"Who are the most respected former senior White House staff of recent decades?"`,
      `"Which former presidential advisors have remained influential after leaving office?"`,
    ];
  } else if (role === "Former Foreign Leader") {
    const countryPhrase = figureMeta.jurisdiction && !isNationalJurisdiction(figureMeta.jurisdiction) ? figureMeta.jurisdiction : "their country";
    cohortExamples = [
      `"Who are the most consequential former heads of government of ${countryPhrase}?"`,
      `"Who are the most consequential former world leaders of the 21st century?"`,
      `"Who are the most influential former G7 / G20 leaders in modern history?"`,
    ];
  } else {
    cohortExamples = [
      `"Who are the most influential former US officeholders still active in public life?"`,
      `"Who are the most respected elder statespeople in American politics today?"`,
    ];
  }

  return `You generate search queries that voters, journalists, historians, and political researchers would type into AI assistants when researching modern US political history — NOT asking about a specific person.

The target figure is "${brandName}" — a ${role}${figureMeta.jurisdiction ? ` (${figureMeta.jurisdiction})` : ""}${party ? `, ${party}` : ""}${issue ? `, associated with ${issue}` : ""}. They are no longer in current office; questions should target the cohort of former / legacy figures they belong to so AI has a natural reason to name them.

Generate EXACTLY ${count} questions, split into three tiers. Each question's natural answer must be a list of NAMED PEOPLE.

TIER A — cohort questions (${aCount} questions). The answer is essentially a list of former officeholders that INCLUDES "${brandName}". Examples:
${cohortExamples.map((e) => `- ${e}`).join("\n")}

TIER B — role + legacy + stance (${bCount} questions). Narrower cohort focused on a specific dimension (party, issue area, era) so "${brandName}" is likely but not guaranteed to be named. Examples:
${issue ? `- "Which recent US ${role.replace(/^Former /, "").toLowerCase()}s shaped ${issue}?"` : `- "Who shaped major US policy debates during the past 20 years?"`}
${party ? `- "Who are the most influential elder statespeople in the ${party} Party today?"` : `- "Who are the most influential elder statespeople in modern US politics?"`}

TIER C — broad legacy / 21st-century influence (${cCount} question${cCount === 1 ? "" : "s"}). Broad enough that surfacing is genuinely organic.
- "Who are the most consequential American political figures of the 21st century?"

Rules:
- Do NOT mention "${brandName}" anywhere in any question
- Sound natural — how a real person types into ChatGPT or Perplexity
- Vary phrasing; don't copy the examples verbatim
- The questions should produce answers that NAME former officeholders, not abstract topic discussions

Return ONLY a JSON array of objects, each with "text" (string), "intent" ("informational" | "high-intent"), and "tier" ("A" | "B" | "C"). No code fences.`;
}

/** Build the tiered system prompt used for political figures. Produces
 *  `count` questions split across three concentric scopes so the
 *  figure has a near-certain chance of surfacing in Tier A while
 *  Tier C still provides a true organic-recall signal. */
function buildTieredFigurePrompt(
  brandName: string,
  figureMeta: PublicFigureMeta,
  count: number,
): string {
  const aCount = Math.max(1, Math.round(count * 0.4));
  const bCount = Math.max(1, Math.round(count * 0.4));
  const cCount = Math.max(1, count - aCount - bCount);
  const year = new Date().getFullYear();
  const partyPhrase = figureMeta.party ? `${figureMeta.party}s` : "members";
  const caucusPhrase = figureMeta.caucus ? `${figureMeta.caucus.toLowerCase()} ` : "";
  const issuePhrase = figureMeta.signatureIssue ?? null;
  const national = isNationalJurisdiction(figureMeta.jurisdiction);
  const isSittingVP = figureMeta.role === "Vice President";
  const isSittingCabinet = figureMeta.role === "Cabinet Secretary";
  const isSittingSpeaker = figureMeta.role === "Speaker";
  const isSittingWhiteHouse = figureMeta.role === "White House Official";
  const isSittingForeign = figureMeta.role === "Foreign Leader";
  // National figures get jurisdiction-less roster shapes so the LLM
  // doesn't produce awkward "senators from United States" questions.
  // Single-person offices (VP, Speaker) and tight-roster offices
  // (Cabinet) anchor on the office instead of the figure's location
  // so the natural answers list the current holder by name.
  let rosterExample1: string;
  let rosterExample2: string;
  let rosterExample3 = "";
  if (isSittingVP) {
    rosterExample1 = `"Who is the current US Vice President?"`;
    rosterExample2 = `"Who is the running mate of the current US president?"`;
    rosterExample3 = `- "Who is second in line to the US presidency in ${year}?"`;
  } else if (isSittingCabinet) {
    rosterExample1 = `"Who are the current members of the US Cabinet?"`;
    rosterExample2 = `"Who serves in the current US presidential administration's cabinet?"`;
    rosterExample3 = `- "Who are the most influential US Cabinet officials right now?"`;
  } else if (isSittingSpeaker) {
    rosterExample1 = `"Who is the current Speaker of the US House of Representatives?"`;
    rosterExample2 = `"Who leads the US House majority caucus in ${year}?"`;
    rosterExample3 = `- "Who are the top members of US House leadership in ${year}?"`;
  } else if (isSittingWhiteHouse) {
    rosterExample1 = `"Who are the senior officials in the current US presidential administration?"`;
    rosterExample2 = `"Who are the top advisors to the current US president?"`;
    rosterExample3 = `- "Who are the most influential figures in the current US executive branch?"`;
  } else if (isSittingForeign) {
    const country = figureMeta.jurisdiction;
    const hasCountry = country && !isNationalJurisdiction(country);
    rosterExample1 = hasCountry
      ? `"Who is the current head of government of ${country}?"`
      : `"Who are the most influential heads of government worldwide in ${year}?"`;
    rosterExample2 = hasCountry
      ? `"Who leads ${country}'s government in ${year}?"`
      : `"Who are the most prominent G7 / G20 leaders in ${year}?"`;
    rosterExample3 = `- "Who are the most influential heads of government worldwide in ${year}?"`;
  } else if (national) {
    rosterExample1 = `"Who are the current US ${figureMeta.role}s?"`;
    rosterExample2 = `"Which ${partyPhrase} hold ${figureMeta.role.includes("Senator") || figureMeta.role.includes("Rep") ? "congressional seats" : "national office"} in ${year}?"`;
  } else {
    rosterExample1 = `"Who are the current ${figureMeta.role}s from ${figureMeta.jurisdiction}?"`;
    rosterExample2 = `"Which ${partyPhrase} represent ${figureMeta.jurisdiction} in ${figureMeta.role.includes("Senator") || figureMeta.role.includes("Rep") ? "Congress" : "office"} in ${year}?"`;
    if (figureMeta.role === "US Senator") {
      rosterExample3 = `- "Who won US Senate races in ${figureMeta.jurisdiction} in recent cycles?"`;
    }
  }

  return `You generate search queries that voters, donors, activists, and journalists would type into AI assistants when researching a political scene — NOT asking about a specific person.

The target figure is "${brandName}" — a ${figureMeta.role}${national ? "" : ` representing ${figureMeta.jurisdiction}`}${figureMeta.party ? ` (${figureMeta.party})` : ""}${figureMeta.caucus ? `, ${figureMeta.caucus} caucus` : ""}${issuePhrase ? `, associated with ${issuePhrase}` : ""}.

Generate EXACTLY ${count} questions, split into three tiers. Each question's natural answer must be a list of NAMED PEOPLE.

TIER A — roster questions (${aCount} questions). The answer is essentially the roster of officeholders that INCLUDES "${brandName}". Examples of the shape:
- ${rosterExample1}
- ${rosterExample2}
${rosterExample3}

TIER B — role + stance questions (${bCount} questions). Narrow enough that "${brandName}" usually makes the list, but doesn't guarantee it. Anchor on role + ${figureMeta.party ?? "party"}${figureMeta.caucus ? ` + ${figureMeta.caucus.toLowerCase()} caucus` : ""}${issuePhrase ? ` + ${issuePhrase}` : ""}. Examples:
- "Which ${caucusPhrase}${figureMeta.role.toLowerCase()}s are most outspoken on ${issuePhrase ?? "current policy debates"}?"
- "Who are the most prominent ${caucusPhrase}${partyPhrase} in the ${figureMeta.role.includes("Senator") ? "US Senate" : figureMeta.role.includes("Rep") ? "US House" : "country"} right now?"

TIER C — broad issue area (${cCount} question${cCount === 1 ? "" : "s"}). The current style — broad enough that surfacing is genuinely organic.
- "Who are the most influential voices on ${issuePhrase ?? "progressive politics"} in ${year}?"

Rules:
- Do NOT mention "${brandName}" anywhere in any question
- Sound natural — how a real person types into ChatGPT or Perplexity
- Vary phrasing; don't copy the examples verbatim
- If you reference a year, use ${year}

Return ONLY a JSON array of objects, each with "text" (string), "intent" ("informational" | "high-intent"), and "tier" ("A" | "B" | "C"). No code fences.`;
}

export async function generateIndustryPrompts(
  brandName: string,
  industry: string,
  category: BrandCategory,
  opts?: { figureMeta?: PublicFigureMeta | null; count?: number },
): Promise<GeneratedPrompt[]> {
  const figureMeta = opts?.figureMeta ?? null;
  const targetCount = opts?.count ?? 8;

  // Tiered path for political figures with known role + jurisdiction —
  // the extra context lets us scope Tier A questions to the roster
  // the figure is literally in, which raises organic-mention rate from
  // "lucky if we get one hit" to "reliable baseline in every run."
  // Former officeholders branch to a cohort/legacy template instead;
  // current-officeholder roster prompts ("senators in 2026") would
  // exclude them by definition.
  if (category === "political_advocacy" && figureMeta) {
    const isFormer = isFormerRole(figureMeta.role);
    const systemPrompt = isFormer
      ? buildLegacyFigurePrompt(brandName, figureMeta, targetCount)
      : buildTieredFigurePrompt(brandName, figureMeta, targetCount);
    const userPrompt = isFormer
      ? `Generate ${targetCount} questions about the cohort of former officeholders that includes "${brandName}" — but do NOT mention them.`
      : `Generate ${targetCount} questions about the political scene around ${figureMeta.jurisdiction} — the target is "${brandName}" but do NOT mention them.`;
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 600,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      const content = response.choices?.[0]?.message?.content?.trim();
      if (content) {
        const parsed = JSON.parse(
          content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim(),
        ) as { text: string; intent: string; tier?: string }[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const brandLower = brandName.toLowerCase();
          const filtered = parsed
            .filter((p) => typeof p?.text === "string" && !p.text.toLowerCase().includes(brandLower))
            .slice(0, targetCount)
            .map((p) => ({
              text: p.text,
              cluster: "industry" as const,
              intent: (p.intent === "high-intent" ? "high-intent" : "informational") as "informational" | "high-intent",
              source: "generated" as const,
            }));
          if (filtered.length > 0) return filtered;
        }
      }
      // fall through to generic generator on empty/malformed output
    } catch (err) {
      console.error("[generateIndustryPrompts tiered] Failed, falling back to generic:", err);
    }
  }

  try {
    let categories: string[] | null = null;
    if (category === "political_advocacy") {
      categories = await generateAdvocacyCategories(brandName, industry);
    }

    const context = category === "political_advocacy"
      ? `"${brandName}" operates in the ${industry} space. "${brandName}" may be a political figure, a candidate, an activist, an advocacy organization, a PAC, or a movement — the questions should work for whatever type of entity they are.

You have identified these question categories as most relevant:
${(categories ?? []).map((c, i) => `${i + 1}. ${c}`).join("\n")}

Generate one natural-sounding question per category about the ${industry} space in general. These must NOT mention "${brandName}" — they should be generic questions about the issue area that a voter, donor, or activist would ask AI.`
      : `"${brandName}" is in the ${industry} industry.`;

    const systemPrompt = category === "political_advocacy"
      ? `You generate search queries that real voters, donors, activists, and journalists would type into AI assistants when researching an issue area — NOT asking about a specific entity.

${context}

The goal is for each question's natural answer to be a list of NAMES — whether those names are people (politicians, candidates, leaders, activists) or organizations (nonprofits, PACs, movements, coalitions). That's how we measure which voices AI surfaces organically in this space.

Rules:
- Generate exactly 8 questions, one per category
- Do NOT mention "${brandName}" anywhere in any question
- Ask about the broader issue area: ${industry}
- Each question's natural answer should be a list of NAMED ENTITIES — people, orgs, coalitions, or a mix — not abstract concepts, tactics, or policy proposals
- Include at least a few questions phrased around leaders, voices, or figures (e.g. "Who are the most influential voices on X in ${new Date().getFullYear()}?") so political figures have a real chance to be named
- Include at least a few phrased around organizations, groups, or movements so advocacy orgs have a real chance to be named
- AVOID question shapes that elicit abstract answers, e.g.:
  * "What are the main issues in…"        (elicits topics, not names)
  * "What policies would help…"            (elicits policy descriptions)
  * "What should voters consider…"         (elicits criteria, not names)
- Sound like a real person asking ChatGPT or Perplexity
- If you reference a year, use ${new Date().getFullYear()}

Return ONLY a JSON array of objects with "text" and "intent" fields.
Intent: "informational" (learning) or "high-intent" (deciding/evaluating).`
      : `You generate search queries that real people would type into an AI assistant (ChatGPT, Gemini, Claude, Perplexity) when exploring a category or industry — NOT asking about a specific brand.

${context}

The goal is to surface questions whose natural answer is a list of BRAND or COMPANY names — not a list of product attributes. This is how we measure which brands AI assistants recommend organically.

Generate exactly 8 questions that:
- Do NOT mention "${brandName}" by name anywhere in the question
- Ask about the broader category/industry that "${brandName}" operates in
- Each question's natural answer should be a ranked or enumerated list of COMPANIES, BRANDS, or PRODUCTS by name — not a list of features, qualities, or things to consider
- Cover a mix of: best/top brands, leading companies, recommended products, most popular options, comparisons between specific players, alternatives to [the category leader], who dominates the market, trusted names for [use case]
- AVOID question shapes that invite feature-list answers, e.g.:
  * "What features should I look for when choosing…"  (elicits "range, safety, price")
  * "What should I consider when buying…"            (elicits considerations, not brands)
  * "How do I choose a…"                             (elicits criteria, not brands)
  * "What are the key qualities of a good…"         (elicits qualities)
- Sound natural — the way a real person would phrase a search
- Vary between short casual queries and longer specific ones
- If you reference a year, use ${new Date().getFullYear()}

Return ONLY a JSON array of objects with "text" and "intent" fields.
Intent must be "informational" (learning/researching) or "high-intent" (deciding/comparing/evaluating).`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      max_tokens: 800,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate 8 ${category === "political_advocacy" ? "issue-area" : "category-level"} search queries for the ${industry} space (the org is "${brandName}" but do NOT mention it)` },
      ],
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) return [];

    const parsed = JSON.parse(
      content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim(),
    ) as { text: string; intent: string }[];

    if (!Array.isArray(parsed)) return [];

    const brandLower = brandName.toLowerCase();
    const genericFiltered = parsed
      .filter((p) => !p.text.toLowerCase().includes(brandLower))
      .slice(0, targetCount)
      .map((p) => ({
        text: p.text,
        cluster: "industry" as const,
        intent: (p.intent === "high-intent" ? "high-intent" : "informational") as "informational" | "high-intent",
        source: "generated" as const,
      }));
    if (genericFiltered.length > 0) return genericFiltered;
    // Generic LLM output was unusable (empty after brand-name filter or
    // malformed) — fall through to the deterministic fallback below.
  } catch (err) {
    console.error("[generateIndustryPrompts] Failed:", err);
  }

  // Last-resort deterministic fallbacks. Layered:
  //   1. figureMeta present → use roster/role/issue templates built
  //      from the classifier output (most specific, highest recall).
  //   2. political_advocacy subject without figureMeta → generic
  //      politics templates. Covers classifier hiccups where we know
  //      it's a political subject but couldn't resolve role/state.
  //   3. Commercial subject with no LLM success → return empty and
  //      let the caller surface the error (rare — the generic LLM
  //      path handles commercial brands reliably).
  if (figureMeta) {
    return isFormerRole(figureMeta.role)
      ? buildLegacyFigureFallbackPrompts(figureMeta, targetCount)
      : buildFallbackIndustryPrompts(figureMeta, targetCount);
  }
  if (category === "political_advocacy") {
    return buildGenericPoliticsFallback(industry, targetCount);
  }
  return [];
}
