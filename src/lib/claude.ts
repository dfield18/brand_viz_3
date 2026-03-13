import Anthropic from "@anthropic-ai/sdk";

// Supports multiple keys: ANTHROPIC_API_KEY=sk-ant-key1,sk-ant-key2
const keys = (process.env.ANTHROPIC_API_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
if (keys.length === 0) throw new Error("ANTHROPIC_API_KEY environment variable is not set");

const globalForClaude = globalThis as unknown as { _claudePool?: Anthropic[] };
const pool = globalForClaude._claudePool ?? keys.map((apiKey) => new Anthropic({ apiKey }));
if (process.env.NODE_ENV !== "production") globalForClaude._claudePool = pool;

let _idx = 0;

/** Default client (first key). */
export const claude = pool[0];

/** Round-robin client for high-throughput. */
export function getClaude(): Anthropic {
  const client = pool[_idx % pool.length];
  _idx++;
  return client;
}
