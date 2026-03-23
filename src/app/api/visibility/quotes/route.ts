import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { fetchBrandRuns } from "@/lib/apiPipeline";
import { filterRunsToBrandScope, buildBrandIdentity } from "@/lib/visibility/brandScope";

export async function GET(req: NextRequest) {
  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }
  const model = req.nextUrl.searchParams.get("model") ?? "";
  const viewRange = parseInt(req.nextUrl.searchParams.get("range") ?? "90", 10);

  try {
    const result = await fetchBrandRuns<{ id: string; model: string; promptId: string; rawResponseText: string; analysisJson: unknown; prompt: { text: string } }>({
      brandSlug,
      model,
      viewRange,
      runQuery: { select: { id: true, model: true, promptId: true, rawResponseText: true, analysisJson: true, prompt: { select: { text: true } } } },
      skipJobCheck: true,
    });
    if (!result.ok) return result.response;
    const { brand, runs: rawRuns } = result;
    const brandName = brand.displayName || brand.name;

    // Content scope: quotes must be about the actual brand, not colliding entities
    const runs = filterRunsToBrandScope(rawRuns, buildBrandIdentity(brand));

    if (runs.length === 0) {
      return NextResponse.json({ quotes: [] });
    }

    // Build a condensed view of responses for the LLM
    const responseBlock = runs
      .slice(0, 20) // cap to avoid token overflow
      .map(
        (r, i) =>
          `--- Response ${i + 1} (${r.model}, prompt: "${r.prompt.text.replace(/\{brand\}/g, brandName).replace(/\{industry\}/g, brand.industry || `${brandName}'s industry`)}") ---\n${r.rawResponseText.slice(0, 800)}`,
      )
      .join("\n\n");

    const systemPrompt = `You are a brand intelligence analyst helping CMOs understand how their brand appears in AI-generated responses.

Given a set of AI model responses about "${brandName}", extract 1-3 of the most interesting, surprising, or strategically important direct quotes from the responses.

Pick quotes that would make a CMO stop and pay attention — things like:
- How the brand is uniquely positioned vs competitors
- Surprising strengths or weaknesses mentioned
- Bold claims about market leadership or innovation
- Unexpected associations or perceptions

Rules:
- Each quote must be an EXACT substring from the responses (do not paraphrase)
- Keep quotes concise (1-2 sentences max, under 40 words each)
- Include which AI model generated the quote
- Return valid JSON only, no markdown fences

Return format:
[{"quote": "exact quote here", "model": "chatgpt", "context": "brief 5-word label like 'Brand positioning vs Tesla'"}]`;

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: responseBlock },
      ],
      max_output_tokens: 512,
    });

    const text = response.output_text?.trim() ?? "[]";
    let quotes: { quote: string; model: string; context: string }[] = [];
    try {
      quotes = JSON.parse(text);
      if (!Array.isArray(quotes)) quotes = [];
      // Validate and cap at 3
      quotes = quotes
        .filter(
          (q) =>
            q &&
            typeof q.quote === "string" &&
            typeof q.model === "string" &&
            typeof q.context === "string",
        )
        .slice(0, 3);
    } catch {
      quotes = [];
    }

    return NextResponse.json({ quotes }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Quotes API error:", message);
    return NextResponse.json({ quotes: [] });
  }
}
