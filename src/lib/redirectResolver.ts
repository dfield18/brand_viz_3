/**
 * Redirect resolution for Gemini grounding URLs (and other short-lived
 * proxy URLs that need to be followed to the real destination).
 *
 * Gemini's googleSearch tool returns grounding chunks whose `web.uri`
 * field points at vertexaisearch.cloud.google.com/grounding-api-redirect/...
 * Those URLs 302 to the actual cited page. Without resolving them we'd
 * persist the vertexai proxy URL, which persistSourcesForRun already
 * filters out — leaving Gemini with zero visible sources.
 *
 * Three call sites use these helpers (free-run/execute, jobs/process
 * backfill/sources) so they live here to avoid drift across copies.
 */

/** Follow one redirect URL to its final destination. HEAD with a 3s
 *  budget, falls back to GET with 2s, returns the original URL on
 *  double failure. */
export async function resolveRedirect(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(3000),
    });
    return res.url || url;
  } catch {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(2000),
      });
      const resolved = res.url || url;
      // Drop the body so we don't buffer large pages we don't need.
      await res.body?.cancel().catch(() => {});
      return resolved;
    } catch {
      return url;
    }
  }
}

/** Resolve all redirect URLs with a global 5s cap — unresolved entries
 *  fall back to their original (vertexai proxy) URLs, which
 *  persistSourcesForRun then filters out. Caps latency per Gemini call. */
export async function resolveRedirectsBatch(
  entries: { uri: string; title: string }[],
): Promise<{ url: string; title: string }[]> {
  return Promise.race([
    Promise.all(
      entries.map(async (entry) => ({
        url: await resolveRedirect(entry.uri),
        title: entry.title,
      })),
    ),
    new Promise<{ url: string; title: string }[]>((resolve) =>
      setTimeout(
        () => resolve(entries.map((e) => ({ url: e.uri, title: e.title }))),
        5000,
      ),
    ),
  ]);
}
