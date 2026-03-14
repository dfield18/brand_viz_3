import { GoogleGenerativeAI } from "@google/generative-ai";

// Supports multiple keys: GOOGLE_API_KEY=key1,key2,key3
// Keys are validated lazily at usage time so imports don't fail without env vars.

const globalForGemini = globalThis as unknown as { _geminiPool?: GoogleGenerativeAI[] };

function getPool(): GoogleGenerativeAI[] {
  if (globalForGemini._geminiPool) return globalForGemini._geminiPool;
  const keys = (process.env.GOOGLE_API_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) throw new Error("GOOGLE_API_KEY environment variable is not set");
  const pool = keys.map((apiKey) => new GoogleGenerativeAI(apiKey));
  if (process.env.NODE_ENV !== "production") globalForGemini._geminiPool = pool;
  return pool;
}

let _idx = 0;

/** Default client (first key). Throws if GOOGLE_API_KEY is missing. */
export const gemini: GoogleGenerativeAI = new Proxy({} as GoogleGenerativeAI, {
  get(_target, prop, receiver) {
    return Reflect.get(getPool()[0], prop, receiver);
  },
});

/** Round-robin client for high-throughput. */
export function getGemini(): GoogleGenerativeAI {
  const pool = getPool();
  const client = pool[_idx % pool.length];
  _idx++;
  return client;
}
