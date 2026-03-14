import OpenAI from "openai";

// Supports multiple keys: OPENAI_API_KEY=sk-key1,sk-key2,sk-key3
// Requests round-robin across keys to increase throughput.
// Keys are validated lazily at usage time so imports don't fail without env vars.

const globalForOpenAI = globalThis as unknown as { _openaiPool?: OpenAI[] };

function getPool(): OpenAI[] {
  if (globalForOpenAI._openaiPool) return globalForOpenAI._openaiPool;
  const keys = (process.env.OPENAI_API_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) throw new Error("OPENAI_API_KEY environment variable is not set");
  const pool = keys.map((apiKey) => new OpenAI({ apiKey }));
  if (process.env.NODE_ENV !== "production") globalForOpenAI._openaiPool = pool;
  return pool;
}

let _idx = 0;

/** Default client (first key) — use for single calls. Throws if OPENAI_API_KEY is missing. */
export function getOpenAIDefault(): OpenAI {
  return getPool()[0];
}

/** @deprecated Use getOpenAIDefault() for lazy initialization. */
export const openai: OpenAI = new Proxy({} as OpenAI, {
  get(_target, prop, receiver) {
    return Reflect.get(getPool()[0], prop, receiver);
  },
});

/** Round-robin client — use in hot loops to spread load across keys. */
export function getOpenAI(): OpenAI {
  const pool = getPool();
  const client = pool[_idx % pool.length];
  _idx++;
  return client;
}
