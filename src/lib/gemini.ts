import { GoogleGenerativeAI } from "@google/generative-ai";

// Supports multiple keys: GOOGLE_API_KEY=key1,key2,key3
const keys = (process.env.GOOGLE_API_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
if (keys.length === 0) throw new Error("GOOGLE_API_KEY environment variable is not set");

const globalForGemini = globalThis as unknown as { _geminiPool?: GoogleGenerativeAI[] };
const pool = globalForGemini._geminiPool ?? keys.map((apiKey) => new GoogleGenerativeAI(apiKey));
if (process.env.NODE_ENV !== "production") globalForGemini._geminiPool = pool;

let _idx = 0;

/** Default client (first key). */
export const gemini = pool[0];

/** Round-robin client for high-throughput. */
export function getGemini(): GoogleGenerativeAI {
  const client = pool[_idx % pool.length];
  _idx++;
  return client;
}
