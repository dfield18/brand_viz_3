import Anthropic from "@anthropic-ai/sdk";

// Supports multiple keys: ANTHROPIC_API_KEY=sk-ant-key1,sk-ant-key2
// Keys are validated lazily at usage time so imports don't fail without env vars.

const globalForClaude = globalThis as unknown as { _claudePool?: Anthropic[] };

function getPool(): Anthropic[] {
  if (globalForClaude._claudePool) return globalForClaude._claudePool;
  const keys = (process.env.ANTHROPIC_API_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  const pool = keys.map((apiKey) => new Anthropic({ apiKey }));
  if (process.env.NODE_ENV !== "production") globalForClaude._claudePool = pool;
  return pool;
}

let _idx = 0;

/** Default client (first key). Throws if ANTHROPIC_API_KEY is missing. */
export const claude: Anthropic = new Proxy({} as Anthropic, {
  get(_target, prop, receiver) {
    return Reflect.get(getPool()[0], prop, receiver);
  },
});

/** Round-robin client for high-throughput. */
export function getClaude(): Anthropic {
  const pool = getPool();
  const client = pool[_idx % pool.length];
  _idx++;
  return client;
}
