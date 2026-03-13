/**
 * SerpAPI client for fetching Google AI Overviews.
 *
 * Uses the Google engine (`engine=google`) and extracts the `ai_overview`
 * field returned by SerpAPI when Google shows an AI Overview for the query.
 *
 * Env: SERPAPI_API_KEY
 */

let _apiKey: string | undefined;

function getApiKey(): string {
  if (!_apiKey) {
    _apiKey = process.env.SERPAPI_API_KEY;
    if (!_apiKey) throw new Error("Missing SERPAPI_API_KEY environment variable");
  }
  return _apiKey;
}

/** Shape of a single source reference inside the AI Overview. */
interface AiOverviewSource {
  link: string;
  title?: string;
  snippet?: string;
}

/** Minimal subset of the SerpAPI JSON response we care about. */
interface SerpApiResponse {
  ai_overview?: {
    text?: string;
    text_with_references?: string;
    sources?: AiOverviewSource[];
    /** Some responses return structured blocks instead of a single text. */
    blocks?: Array<{
      type?: string;
      snippet?: string;
      list?: string[];
      sources?: AiOverviewSource[];
    }>;
  };
  organic_results?: Array<{
    title: string;
    link: string;
    snippet?: string;
    position: number;
  }>;
  search_information?: {
    total_results?: number;
    query_displayed?: string;
  };
}

export interface GoogleAioResult {
  text: string;
  citations: { url: string; title: string; startIndex: number; endIndex: number }[];
  hasAiOverview: boolean;
}

/**
 * Query Google via SerpAPI and return the AI Overview text (if present)
 * plus citations from the AI Overview sources and top organic results.
 */
export async function callGoogleAio(query: string): Promise<GoogleAioResult> {
  const apiKey = getApiKey();

  const params = new URLSearchParams({
    engine: "google",
    q: query,
    api_key: apiKey,
    num: "10",
    // Request the AI Overview data
    google_domain: "google.com",
    gl: "us",
    hl: "en",
  });

  const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SerpAPI error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data: SerpApiResponse = await res.json();

  let text = "";
  const citations: GoogleAioResult["citations"] = [];
  const seenUrls = new Set<string>();
  let hasAiOverview = false;

  // ── Extract AI Overview ──
  if (data.ai_overview) {
    hasAiOverview = true;

    // Prefer the plain text version, fall back to text_with_references
    if (data.ai_overview.text) {
      text = data.ai_overview.text;
    } else if (data.ai_overview.text_with_references) {
      text = data.ai_overview.text_with_references;
    }

    // If text is still empty, build from blocks
    if (!text && data.ai_overview.blocks) {
      const parts: string[] = [];
      for (const block of data.ai_overview.blocks) {
        if (block.snippet) parts.push(block.snippet);
        if (block.list) {
          for (const item of block.list) {
            parts.push(`• ${item}`);
          }
        }
        // Collect block-level sources
        if (block.sources) {
          for (const src of block.sources) {
            if (src.link && !seenUrls.has(src.link)) {
              seenUrls.add(src.link);
              citations.push({
                url: src.link,
                title: src.title ?? "",
                startIndex: 0,
                endIndex: 0,
              });
            }
          }
        }
      }
      text = parts.join("\n");
    }

    // Collect top-level AI Overview sources
    if (data.ai_overview.sources) {
      for (const src of data.ai_overview.sources) {
        if (src.link && !seenUrls.has(src.link)) {
          seenUrls.add(src.link);
          citations.push({
            url: src.link,
            title: src.title ?? "",
            startIndex: 0,
            endIndex: 0,
          });
        }
      }
    }
  }

  // ── Fallback: use organic results if no AI Overview ──
  if (!text && data.organic_results && data.organic_results.length > 0) {
    const top = data.organic_results.slice(0, 5);
    const parts: string[] = [];
    for (const r of top) {
      parts.push(`• ${r.title}: ${r.snippet ?? ""}`);
      if (!seenUrls.has(r.link)) {
        seenUrls.add(r.link);
        citations.push({
          url: r.link,
          title: r.title,
          startIndex: 0,
          endIndex: 0,
        });
      }
    }
    text = parts.join("\n");
  }

  // Also add top organic results as supplementary citations
  if (data.organic_results) {
    for (const r of data.organic_results.slice(0, 10)) {
      if (!seenUrls.has(r.link)) {
        seenUrls.add(r.link);
        citations.push({
          url: r.link,
          title: r.title,
          startIndex: 0,
          endIndex: 0,
        });
      }
    }
  }

  // Append sources section (matches format of other model clients)
  if (citations.length > 0) {
    text += "\n\nSources:\n" + citations.map((c) => `- ${c.url}`).join("\n");
  }

  return { text: text || "[No AI Overview or organic results returned]", citations, hasAiOverview };
}
