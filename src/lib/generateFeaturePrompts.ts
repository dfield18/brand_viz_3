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
 * Generate brand-cluster prompts — questions a real user would ask about
 * the specific brand. Mentions the brand by name.
 */
export async function generateBrandPrompts(
  brandName: string,
  industry: string,
  category: BrandCategory,
): Promise<GeneratedPrompt[]> {
  const context = category === "political_advocacy"
    ? `"${brandName}" is a political/advocacy organization in the ${industry} space.`
    : `"${brandName}" is a brand/company in the ${industry} industry.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content: `You generate search queries that real people would type into an AI assistant (ChatGPT, Gemini, Claude, Perplexity) to learn about a specific brand or organization.

${context}

Generate exactly 8 questions that:
- Mention "${brandName}" by name
- Cover a mix of: what it is, reputation, how it compares, pros/cons, whether it's worth it, recent news/controversies, alternatives
- Sound natural — the way a real person would phrase a question, not formal or academic
- Vary between short casual queries and longer specific questions

Return ONLY a JSON array of objects with "text" and "intent" fields.
Intent must be "informational" (learning/researching) or "high-intent" (deciding/comparing/evaluating).

Example format:
[
  {"text": "Is Nike worth the price?", "intent": "high-intent"},
  {"text": "What is Nike known for?", "intent": "informational"}
]`,
        },
        {
          role: "user",
          content: `Generate 8 search queries about "${brandName}"`,
        },
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
 * Generate industry-cluster prompts — broad category questions that do NOT
 * mention the brand by name. These test whether AI surfaces the brand
 * organically when users ask about the category.
 */
export async function generateIndustryPrompts(
  brandName: string,
  industry: string,
  category: BrandCategory,
): Promise<GeneratedPrompt[]> {
  const context = category === "political_advocacy"
    ? `"${brandName}" operates in the ${industry} space (political/advocacy).`
    : `"${brandName}" is in the ${industry} industry.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content: `You generate search queries that real people would type into an AI assistant (ChatGPT, Gemini, Claude, Perplexity) when exploring a category or industry — NOT asking about a specific brand.

${context}

Generate exactly 8 questions that:
- Do NOT mention "${brandName}" by name anywhere in the question
- Ask about the broader category, industry, or problem space that "${brandName}" operates in
- Cover a mix of: best/top options, recommendations, comparisons between options, what to look for, recent trends, how to choose
- Sound natural — the way a real person would phrase a question
- Would naturally lead AI to potentially mention or recommend "${brandName}" (or its competitors)

Return ONLY a JSON array of objects with "text" and "intent" fields.
Intent must be "informational" (learning/researching) or "high-intent" (deciding/comparing/evaluating).

Example format (for a running shoe brand):
[
  {"text": "What are the best running shoes in 2025?", "intent": "high-intent"},
  {"text": "What should I look for when buying running shoes?", "intent": "informational"}
]`,
        },
        {
          role: "user",
          content: `Generate 8 category-level search queries for the ${industry} space (the brand is "${brandName}" but do NOT mention it)`,
        },
      ],
    });

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) return [];

    const parsed = JSON.parse(
      content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim(),
    ) as { text: string; intent: string }[];

    if (!Array.isArray(parsed)) return [];

    // Safety check: reject any prompt that mentions the brand name
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
