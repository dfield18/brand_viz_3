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
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
