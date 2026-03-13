import OpenAI from "openai";

// Supports multiple keys: OPENAI_API_KEY=sk-key1,sk-key2,sk-key3
// Requests round-robin across keys to increase throughput.

const keys = (process.env.OPENAI_API_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
if (keys.length === 0) throw new Error("OPENAI_API_KEY environment variable is not set");

const globalForOpenAI = globalThis as unknown as { _openaiPool?: OpenAI[] };
const pool = globalForOpenAI._openaiPool ?? keys.map((apiKey) => new OpenAI({ apiKey }));
if (process.env.NODE_ENV !== "production") globalForOpenAI._openaiPool = pool;

let _idx = 0;

/** Default client (first key) — use for single calls. */
export const openai = pool[0];

/** Round-robin client — use in hot loops to spread load across keys. */
export function getOpenAI(): OpenAI {
  const client = pool[_idx % pool.length];
  _idx++;
  return client;
}
