import type { MetadataRoute } from "next";

// Use the canonical serving domain (www) so Google doesn't see every
// sitemap URL as a redirect from apex to www. Previously the sitemap
// listed apex URLs but the site is served at www.aisayswhat.com; the
// apex→www 307 redirect made Google flag pages as redirect errors
// and the mismatched canonical tags caused "Excluded by noindex"
// false positives in Search Console.
const SITE_URL = "https://www.aisayswhat.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  // Sign-in / sign-up are auth gateways with no indexable content —
  // keeping them out of the sitemap removes the "Excluded by noindex"
  // Search Console warnings for pages that were never meant to rank
  // in the first place.
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE_URL}/marketing`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
