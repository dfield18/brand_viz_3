import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const { userId, error: authError } = await requireAuth();
  if (authError) return authError;
  const rlError = await checkRateLimit(userId, "write");
  if (rlError) return rlError;
  let trimmed = "";
  try {
    const { name } = (await req.json()) as { name?: string };
    trimmed = (name ?? "").trim();

    if (!trimmed) {
      return NextResponse.json({ error: "Missing name" }, { status: 400 });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content: `You are a brand/entity validation assistant. Given a user-typed name, determine:

1. Is this a real, recognizable brand, company, organization, product, public figure, or notable topic/issue (e.g. "Nuclear Energy", "Gun Control", "Climate Change")?
2. If yes, return the properly formatted canonical name (correct capitalization, spelling, spacing).
3. If no or the input looks like gibberish/typo, suggest the closest real brand or entity if possible.
4. IMPORTANT: If the name is ambiguous and could refer to multiple well-known entities, set "ambiguous" to true and list the alternatives.

Respond ONLY with valid JSON in this exact format:
{
  "valid": true or false,
  "ambiguous": true or false,
  "canonicalName": "Properly Formatted Name (best guess)",
  "suggestion": "Did you mean X?" or null,
  "category": "brand" | "company" | "organization" | "product" | "person" | "topic" | "unknown",
  "entityType": "company" | "cause",
  "alternatives": [
    { "name": "Apple Inc.", "description": "Technology company (iPhone, Mac, etc.)" },
    { "name": "Apple Records", "description": "Record label founded by The Beatles" }
  ] or []
}

Rules:
- "entityType" classifies the entity for prompt selection:
  - "company" — commercial businesses, consumer brands, tech companies, SaaS products, retailers, manufacturers, for-profit entities
  - "cause" — advocacy organizations, nonprofits, social causes, political organizations, charities, NGOs, public policy topics (e.g. "Gun Control", "Climate Change", "Nuclear Energy"), think tanks, foundations
- "valid" means it's a real, recognizable entity or topic that someone would want to track AI visibility for.
- Always fix capitalization: "nike" → "Nike", "PATAGONIA" → "Patagonia", "open ai" → "OpenAI".
- For topics/issues, valid=true: "nuclear energy" → "Nuclear Energy", "gun control" → "Gun Control".
- CRITICAL FOR TYPOS/MISSPELLINGS: If the input looks like a misspelled brand, company, or topic, you MUST set valid=false AND set both "suggestion" and "canonicalName" to the corrected name. Try VERY hard to find a match — consider swapped letters, missing letters, extra letters, phonetic similarity. Examples:
  - "reebpk" → canonicalName: "Reebok", suggestion: "Did you mean Reebok?"
  - "Nikee" → canonicalName: "Nike", suggestion: "Did you mean Nike?"
  - "patgonia" → canonicalName: "Patagonia", suggestion: "Did you mean Patagonia?"
  - "gogle" → canonicalName: "Google", suggestion: "Did you mean Google?"
  - "Amazn" → canonicalName: "Amazon", suggestion: "Did you mean Amazon?"
  - "tesle" → canonicalName: "Tesla", suggestion: "Did you mean Tesla?"
  - "adiddas" → canonicalName: "Adidas", suggestion: "Did you mean Adidas?"
- Only set suggestion=null if the input is total gibberish with absolutely no resemblance to any known entity (e.g. "xkqzw").
- Set "ambiguous" to true ONLY when the name genuinely maps to 2+ well-known, distinct entities that a user might plausibly want to track. Include 2-5 alternatives with a short description for each.
- CRITICAL: This tool is for tracking AI visibility of brands/companies/organizations/topics. When listing alternatives, ALWAYS put the most prominent business/company/brand meaning FIRST. The company/brand meaning should always be included if one exists.
- Examples of ambiguous inputs with correct ordering:
  - "Amazon" → alternatives: [Amazon (e-commerce/tech company) FIRST, then Amazon River, Amazon Rainforest]
  - "Apple" → alternatives: [Apple Inc. (tech company) FIRST, then Apple Records]
  - "Shell" → alternatives: [Shell plc (oil company) FIRST, then other meanings]
  - "Delta" → alternatives: [Delta Air Lines FIRST, then Delta Faucets, etc.]
  - "Jaguar" → alternatives: [Jaguar (car brand) FIRST, then Jaguar (animal)]
  - "Mercury" → alternatives: [Mercury (car brand) FIRST, then planet, etc.]
  - "Dove" → alternatives: [Dove (personal care brand) FIRST, then Dove chocolate]
- Do NOT mark as ambiguous if there's one overwhelmingly dominant meaning in a business/brand context. For example "Nike" is clearly the sportswear brand — no need for alternatives.`,
        },
        {
          role: "user",
          content: trimmed,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";

    // Parse the JSON response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({
        valid: true,
        ambiguous: false,
        canonicalName: trimmed,
        suggestion: null,
        category: "unknown",
        entityType: "company",
        alternatives: [],
      });
    }

    const result = JSON.parse(jsonMatch[0]) as {
      valid: boolean;
      ambiguous?: boolean;
      canonicalName: string;
      suggestion: string | null;
      category: string;
      entityType?: string;
      alternatives?: { name: string; description: string }[];
    };

    // Ensure business/brand alternatives appear first regardless of LLM ordering
    const BUSINESS_KEYWORDS = /\b(company|corporation|corp|inc|brand|retailer|e-commerce|tech|airline|automaker|manufacturer|plc|ltd|software|platform|service)\b/i;
    const alternatives = (result.alternatives ?? []).sort((a, b) => {
      const aIsBiz = BUSINESS_KEYWORDS.test(a.description) ? 0 : 1;
      const bIsBiz = BUSINESS_KEYWORDS.test(b.description) ? 0 : 1;
      return aIsBiz - bIsBiz;
    });

    // Map entityType from GPT response, with fallback heuristic
    const mapEntityType = (et: string | undefined, cat: string): "company" | "cause" =>
      et === "cause"
        ? "cause"
        : et === "company"
          ? "company"
          : ["organization", "topic"].includes(cat)
            ? "cause"
            : "company";

    // Web-search fallback: gpt-4o-mini's training cutoff misses recent
    // public figures (e.g. Cherelle Parker, Philadelphia mayor since
    // 2024). Only fires when the cheap path couldn't recognize the
    // entity, so most typed names stay fast. Silently falls back to
    // the original result if the web call fails or returns garbage.
    if (!result.valid && !result.ambiguous) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        const webResponse = await openai.responses.create(
          {
            model: "gpt-4o-mini",
            tools: [{ type: "web_search" as const }],
            input: `Search the web to determine whether "${trimmed}" is a real, recognizable brand, company, organization, product, public figure (including politicians, mayors, athletes, celebrities), or notable topic/issue.

Respond ONLY with valid JSON (no prose before or after) in this shape:
{
  "valid": true or false,
  "canonicalName": "Properly Formatted Name",
  "suggestion": "Did you mean X?" or null,
  "category": "brand" | "company" | "organization" | "product" | "person" | "topic" | "unknown",
  "entityType": "company" or "cause"
}

Rules:
- If the search finds the person/entity, set valid=true with the correctly spelled canonicalName.
- If the input is a misspelling of a real entity you found via search, set valid=false, suggestion="Did you mean X?", and canonicalName=X.
- "person" category → entityType "cause" (public figures are tracked like causes, not commercial brands). For "public figure", prefer valid=true with the canonicalName set to their full real name.
- Only return valid=false + suggestion=null if search confirms the input has no real-world referent.`,
            max_output_tokens: 400,
          },
          { signal: controller.signal },
        );
        clearTimeout(timer);

        let webText = "";
        if (Array.isArray(webResponse.output)) {
          for (const item of webResponse.output) {
            if (item.type === "message" && Array.isArray(item.content)) {
              for (const part of item.content) {
                if (part.type === "output_text") webText += part.text;
              }
            }
          }
        }
        if (!webText && webResponse.output_text) webText = webResponse.output_text;

        const webMatch = webText.match(/\{[\s\S]*\}/);
        if (webMatch) {
          const webResult = JSON.parse(webMatch[0]) as {
            valid: boolean;
            canonicalName?: string;
            suggestion?: string | null;
            category?: string;
            entityType?: string;
          };
          // Override only if web search produced a usable answer —
          // i.e. it confirmed a real entity or found a misspelling.
          const hasWebImprovement =
            webResult.valid ||
            (webResult.suggestion && webResult.canonicalName &&
              webResult.canonicalName.toLowerCase() !== trimmed.toLowerCase());
          if (hasWebImprovement) {
            return NextResponse.json({
              valid: webResult.valid,
              ambiguous: false,
              canonicalName: webResult.canonicalName ?? trimmed,
              suggestion: webResult.suggestion ?? null,
              category: webResult.category ?? "unknown",
              entityType: mapEntityType(webResult.entityType, webResult.category ?? ""),
              alternatives: [],
            });
          }
        }
      } catch (webErr) {
        console.error("validate-brand web-search fallback failed:", webErr);
      }
    }

    return NextResponse.json({
      valid: result.valid,
      ambiguous: result.ambiguous ?? false,
      canonicalName: result.canonicalName,
      suggestion: result.suggestion ?? null,
      category: result.category,
      entityType: mapEntityType(result.entityType, result.category),
      alternatives,
    });
  } catch (e) {
    console.error("Brand validation error:", e);
    // On error, don't block the user — let them proceed
    return NextResponse.json({
      valid: true,
      ambiguous: false,
      canonicalName: trimmed || "Unknown",
      suggestion: null,
      category: "unknown",
      entityType: "company",
      alternatives: [],
    });
  }
}
