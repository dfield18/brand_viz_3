import type { MetadataRoute } from "next";

const SITE_URL = "https://www.aisayswhat.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /sign-in and /sign-up are auth gateways — explicitly
        // disallow them so Googlebot doesn't waste crawl budget and
        // Search Console doesn't flag them as "Excluded by noindex."
        disallow: ["/api/", "/entity/", "/dashboard/", "/account/", "/unsubscribe", "/sign-in", "/sign-up"],
      },
      // Explicit AI crawler entries — same allow/disallow as `*`,
      // but listing them by name is a positive signal for generative
      // search optimization (some AI vendors only crawl when their
      // user-agent is explicitly named) and makes our crawl posture
      // legible to anyone reading the file.
      ...["GPTBot", "ChatGPT-User", "ClaudeBot", "Claude-Web", "anthropic-ai", "PerplexityBot", "Google-Extended", "CCBot", "cohere-ai"].map((agent) => ({
        userAgent: agent,
        allow: "/",
        disallow: ["/api/", "/entity/", "/dashboard/", "/account/", "/unsubscribe", "/sign-in", "/sign-up"],
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
