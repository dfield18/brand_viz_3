import { openai } from "@/lib/openai";

export type BrandCategory = "commercial" | "political_advocacy";

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
export async function generateIndustryPrompts(
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
    return parsed
      .filter((p) => !p.text.toLowerCase().includes(brandLower))
      .slice(0, 8)
      .map((p) => ({
        text: p.text,
        cluster: "industry" as const,
        intent: (p.intent === "high-intent" ? "high-intent" : "informational") as "informational" | "high-intent",
        source: "generated" as const,
      }));
  } catch (err) {
    console.error("[generateIndustryPrompts] Failed:", err);
    return [];
  }
}
