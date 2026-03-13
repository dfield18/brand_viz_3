import OpenAI from "openai";

// Supports multiple keys: PERPLEXITY_API_KEY=pplx-key1,pplx-key2
const keys = (process.env.PERPLEXITY_API_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
if (keys.length === 0) throw new Error("PERPLEXITY_API_KEY environment variable is not set");

const globalForPerplexity = globalThis as unknown as { _perplexityPool?: OpenAI[] };
const pool = globalForPerplexity._perplexityPool ?? keys.map((apiKey) => new OpenAI({
  apiKey,
  baseURL: "https://api.perplexity.ai",
}));
if (process.env.NODE_ENV !== "production") globalForPerplexity._perplexityPool = pool;

let _idx = 0;

/** Default client (first key). */
export const perplexity = pool[0];

/** Round-robin client for high-throughput. */
export function getPerplexity(): OpenAI {
  const client = pool[_idx % pool.length];
  _idx++;
  return client;
}
