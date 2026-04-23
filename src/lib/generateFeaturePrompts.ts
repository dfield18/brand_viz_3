import { openai } from "@/lib/openai";

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
  | "Activist"
  | "Candidate";

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
    "activist": "Activist",
    "candidate": "Candidate",
  };
  return variantMap[key] ?? null;
}

export type PublicFigureMeta = {
  role: PublicFigureRole;
  jurisdiction: string;       // e.g. "Pennsylvania", "New York NY-14", "United States"
  party: string | null;       // "Democrat" | "Republican" | "Independent" | "Other" | null
  caucus: string | null;      // "Progressive" | "Freedom Caucus" | null
  signatureIssue: string | null; // "worker rights" | "climate" | null
};

/** Cheap heuristic — two or three capitalized tokens, no org signal
 *  words. Used to gate the public-figure classifier call so we don't
 *  burn an LLM roundtrip on obvious organizations. */
const PERSON_NAME_SHAPE = /^[A-Z][a-zA-Z'\-]+( [A-Z][a-zA-Z'\-]+){1,3}$/;
const ORG_SIGNAL_WORDS = /\b(Foundation|Society|Union|Coalition|Alliance|Committee|Council|Association|Fund|PAC|Institute|Center|Project|Campaign|Party|Caucus|Action|Network|LLC|Inc|Corp|Co)\b/i;

export function looksLikePersonName(name: string): boolean {
  const trimmed = name.trim();
  if (!PERSON_NAME_SHAPE.test(trimmed)) return false;
  if (ORG_SIGNAL_WORDS.test(trimmed)) return false;
  return true;
}

/** GPT-4o-mini classifier. Returns meta when the subject is a
 *  recognizable US political figure; returns null otherwise. The
 *  caller is expected to have already filtered `category ===
 *  "political_advocacy"` and `looksLikePersonName()` so we don't
 *  waste the call on e.g. ACLU. */
export async function classifyPublicFigure(
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

When the person IS a recognizable political figure (current or recent officeholder, candidate, or prominent activist), return:
{
  "role": one of "US Senator" | "US Rep" | "Governor" | "State Senator" | "State Rep" | "Mayor" | "Activist" | "Candidate" — if none fit cleanly, return null instead of guessing,
  "jurisdiction": the state, city, or district they represent (e.g. "Pennsylvania", "New York NY-14", or "United States" for national figures),
  "party": "Democrat" | "Republican" | "Independent" | "Other" | null,
  "caucus": short sub-grouping if notable ("Progressive", "Freedom Caucus", "Blue Dog") or null,
  "signatureIssue": short issue area they're most associated with ("worker rights", "immigration", "climate") or null
}

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
          content: `Classify the given organization into one of two categories:
- "commercial" — businesses, consumer brands, tech companies, SaaS, retailers, etc.
- "political_advocacy" — political parties, PACs, advocacy organizations, nonprofits focused on policy/social causes, think tanks, labor unions, activist groups, NGOs, charities, foundations

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
  cluster: "brand" | "industry";
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

  const candidates: string[] = [];
  // Tier A — near-certain roster hits
  candidates.push(`Who are the current ${roleLower}s from ${figureMeta.jurisdiction}?`);
  if (figureMeta.party) {
    candidates.push(`Which ${partyPlural} represent ${figureMeta.jurisdiction} in ${chamber === "office" ? "office" : "Congress"} in ${year}?`);
  }
  if (figureMeta.role.includes("Senator")) {
    candidates.push(`Who won recent US Senate races in ${figureMeta.jurisdiction}?`);
  } else if (figureMeta.role.includes("Rep")) {
    candidates.push(`Who represents ${figureMeta.jurisdiction} in the US House?`);
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

  return `You generate search queries that voters, donors, activists, and journalists would type into AI assistants when researching a political scene — NOT asking about a specific person.

The target figure is "${brandName}" — a ${figureMeta.role} representing ${figureMeta.jurisdiction}${figureMeta.party ? ` (${figureMeta.party})` : ""}${figureMeta.caucus ? `, ${figureMeta.caucus} caucus` : ""}${issuePhrase ? `, associated with ${issuePhrase}` : ""}.

Generate EXACTLY ${count} questions, split into three tiers. Each question's natural answer must be a list of NAMED PEOPLE.

TIER A — roster questions (${aCount} questions). The answer is essentially the roster of officeholders that INCLUDES "${brandName}". Examples of the shape:
- "Who are the current ${figureMeta.role}s from ${figureMeta.jurisdiction}?"
- "Which ${partyPhrase} represent ${figureMeta.jurisdiction} in ${figureMeta.role.includes("Senator") || figureMeta.role.includes("Rep") ? "Congress" : "office"} in ${year}?"
${figureMeta.role === "US Senator" ? `- "Who won US Senate races in ${figureMeta.jurisdiction} in recent cycles?"` : ""}

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
  if (category === "political_advocacy" && figureMeta) {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.4,
        max_tokens: 600,
        messages: [
          { role: "system", content: buildTieredFigurePrompt(brandName, figureMeta, targetCount) },
          { role: "user", content: `Generate ${targetCount} questions about the political scene around ${figureMeta.jurisdiction} — the target is "${brandName}" but do NOT mention them.` },
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

  // Last-resort: deterministic roster prompts derived directly from
  // figureMeta. Reached only when both LLM generators came back empty
  // (rate limit, content policy, every prompt tripped the brand-name
  // filter, etc.). For clearly-identified politicians this guarantees
  // the free-run never surfaces "Couldn't generate questions" to the
  // user just because the LLM had a bad call. For non-political
  // subjects (no figureMeta), we still return [] and the caller
  // handles the empty case.
  if (figureMeta) {
    return buildFallbackIndustryPrompts(figureMeta, targetCount);
  }
  return [];
}
