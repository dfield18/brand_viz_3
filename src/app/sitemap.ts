import type { MetadataRoute } from "next";

const SITE_URL = "https://aisayswhat.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${SITE_URL}/sign-up`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE_URL}/sign-in`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
