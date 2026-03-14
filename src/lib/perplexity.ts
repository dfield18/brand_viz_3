import OpenAI from "openai";

// Supports multiple keys: PERPLEXITY_API_KEY=pplx-key1,pplx-key2
// Keys are validated lazily at usage time so imports don't fail without env vars.

const globalForPerplexity = globalThis as unknown as { _perplexityPool?: OpenAI[] };

function getPool(): OpenAI[] {
  if (globalForPerplexity._perplexityPool) return globalForPerplexity._perplexityPool;
  const keys = (process.env.PERPLEXITY_API_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) throw new Error("PERPLEXITY_API_KEY environment variable is not set");
  const pool = keys.map((apiKey) => new OpenAI({ apiKey, baseURL: "https://api.perplexity.ai" }));
  if (process.env.NODE_ENV !== "production") globalForPerplexity._perplexityPool = pool;
  return pool;
}

let _idx = 0;

/** Default client (first key). Throws if PERPLEXITY_API_KEY is missing. */
export const perplexity: OpenAI = new Proxy({} as OpenAI, {
  get(_target, prop, receiver) {
    return Reflect.get(getPool()[0], prop, receiver);
  },
});

/** Round-robin client for high-throughput. */
export function getPerplexity(): OpenAI {
  const pool = getPool();
  const client = pool[_idx % pool.length];
  _idx++;
  return client;
}
