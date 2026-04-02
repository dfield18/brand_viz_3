import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RobotsTxtCheck {
  exists: boolean;
  blocksGPTBot: boolean;
  blocksGoogleBot: boolean;
  blocksCCBot: boolean;
  blocksAll: boolean;
  allowsAll: boolean;
  raw: string | null;
  botRules: { bot: string; allowed: boolean }[];
}

interface MetaTagCheck {
  title: string | null;
  titleLength: number;
  description: string | null;
  descriptionLength: number;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  canonical: string | null;
  lang: string | null;
}

interface StructuredDataCheck {
  hasJsonLd: boolean;
  jsonLdTypes: string[];
  jsonLdCount: number;
  hasOpenGraph: boolean;
  hasTwitterCards: boolean;
  schemaTypes: string[];
}

interface HeadingCheck {
  h1Count: number;
  h1Texts: string[];
  h2Count: number;
  h3Count: number;
  hasLogicalHierarchy: boolean;
  totalHeadings: number;
}

interface ContentCheck {
  wordCount: number;
  hasNavigation: boolean;
  hasFAQSection: boolean;
  imageCount: number;
  imagesWithAlt: number;
  linkCount: number;
  internalLinks: number;
  externalLinks: number;
}

interface SitemapCheck {
  exists: boolean;
  urlCount: number | null;
  format: string | null;
}

interface SecurityCheck {
  isHttps: boolean;
  hasHSTS: boolean;
}

interface PerformanceCheck {
  loadTimeMs: number | null;
  contentLength: number | null;
  serverHeader: string | null;
}

export interface SiteAuditResult {
  url: string;
  reachable: boolean;
  error?: string;
  robotsTxt: RobotsTxtCheck;
  metaTags: MetaTagCheck;
  structuredData: StructuredDataCheck;
  headings: HeadingCheck;
  content: ContentCheck;
  sitemap: SitemapCheck;
  security: SecurityCheck;
  performance: PerformanceCheck;
  scores: {
    overall: number;
    llmAccessibility: number;
    metaQuality: number;
    structuredData: number;
    contentStructure: number;
    technicalHealth: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LLM_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "Google-Extended",
  "CCBot",
  "anthropic-ai",
  "ClaudeBot",
  "PerplexityBot",
  "Bytespider",
  "cohere-ai",
];

function parseRobotsTxt(raw: string): RobotsTxtCheck["botRules"] {
  const rules: RobotsTxtCheck["botRules"] = [];
  const lines = raw.split("\n").map((l) => l.trim());
  let currentAgent = "";

  for (const line of lines) {
    if (line.startsWith("#") || !line) continue;
    const lowerLine = line.toLowerCase();

    if (lowerLine.startsWith("user-agent:")) {
      currentAgent = line.slice("user-agent:".length).trim();
    } else if (lowerLine.startsWith("disallow:")) {
      const path = line.slice("disallow:".length).trim();
      if (path === "/" || path === "/*") {
        // Check if this applies to an LLM bot or all bots
        const isLLMBot = LLM_BOTS.some(
          (b) => currentAgent.toLowerCase() === b.toLowerCase(),
        );
        const isAll = currentAgent === "*";
        if (isLLMBot) {
          rules.push({ bot: currentAgent, allowed: false });
        } else if (isAll) {
          rules.push({ bot: "*", allowed: false });
        }
      }
    } else if (lowerLine.startsWith("allow:")) {
      const path = line.slice("allow:".length).trim();
      if (path === "/" || path === "/*" || path === "") {
        const isLLMBot = LLM_BOTS.some(
          (b) => currentAgent.toLowerCase() === b.toLowerCase(),
        );
        if (isLLMBot) {
          rules.push({ bot: currentAgent, allowed: true });
        }
      }
    }
  }

  return rules;
}

function extractMeta(
  html: string,
  name: string,
  attr = "name",
): string | null {
  // Match both name and property attributes
  const regex = new RegExp(
    `<meta\\s+(?:[^>]*?${attr}=["']${name}["'][^>]*?content=["']([^"']*?)["']|[^>]*?content=["']([^"']*?)["'][^>]*?${attr}=["']${name}["'])`,
    "i",
  );
  const m = html.match(regex);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function extractTag(html: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const m = html.match(regex);
  return m ? m[1].trim() : null;
}

function extractAllTags(html: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "gi");
  const results: string[] = [];
  let m;
  while ((m = regex.exec(html)) !== null) {
    const text = m[1].trim();
    if (text) results.push(text);
  }
  return results;
}

function countPattern(html: string, pattern: RegExp): number {
  const matches = html.match(pattern);
  return matches ? matches.length : 0;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = 10000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function computeScores(result: Omit<SiteAuditResult, "scores">): SiteAuditResult["scores"] {
  // LLM Accessibility (0-100)
  let llm = 100;
  if (!result.robotsTxt.exists) llm -= 10; // No robots.txt at all
  if (result.robotsTxt.blocksAll) llm = 10;
  if (result.robotsTxt.blocksGPTBot) llm -= 25;
  if (result.robotsTxt.blocksGoogleBot) llm -= 20;
  if (result.robotsTxt.blocksCCBot) llm -= 15;
  const blockedBots = result.robotsTxt.botRules.filter((r) => !r.allowed).length;
  llm -= Math.min(blockedBots * 5, 20);
  if (!result.sitemap.exists) llm -= 10;
  llm = Math.max(0, Math.min(100, llm));

  // Meta Quality (0-100)
  let meta = 0;
  if (result.metaTags.title) meta += 20;
  if (result.metaTags.titleLength > 10 && result.metaTags.titleLength < 70) meta += 10;
  if (result.metaTags.description) meta += 20;
  if (result.metaTags.descriptionLength > 50 && result.metaTags.descriptionLength < 160) meta += 10;
  if (result.metaTags.ogTitle) meta += 10;
  if (result.metaTags.ogDescription) meta += 10;
  if (result.metaTags.ogImage) meta += 10;
  if (result.metaTags.canonical) meta += 5;
  if (result.metaTags.lang) meta += 5;
  meta = Math.min(100, meta);

  // Structured Data (0-100)
  let sd = 0;
  if (result.structuredData.hasJsonLd) sd += 40;
  sd += Math.min(result.structuredData.jsonLdCount * 10, 20);
  if (result.structuredData.schemaTypes.length > 0) sd += 10;
  if (result.structuredData.schemaTypes.includes("Organization") ||
    result.structuredData.schemaTypes.includes("Corporation")) sd += 10;
  if (result.structuredData.schemaTypes.includes("FAQPage")) sd += 10;
  if (result.structuredData.hasOpenGraph) sd += 5;
  if (result.structuredData.hasTwitterCards) sd += 5;
  sd = Math.min(100, sd);

  // Content Structure (0-100)
  let cs = 0;
  if (result.headings.h1Count === 1) cs += 25;
  else if (result.headings.h1Count > 0) cs += 10;
  if (result.headings.h2Count >= 2) cs += 20;
  if (result.headings.hasLogicalHierarchy) cs += 15;
  if (result.content.wordCount >= 300) cs += 15;
  else if (result.content.wordCount >= 100) cs += 8;
  if (result.content.imageCount > 0 && result.content.imagesWithAlt > 0) {
    const altRatio = result.content.imagesWithAlt / result.content.imageCount;
    cs += Math.round(altRatio * 15);
  }
  if (result.content.hasFAQSection) cs += 10;
  cs = Math.min(100, cs);

  // Technical Health (0-100)
  let tech = 0;
  if (result.security.isHttps) tech += 30;
  if (result.security.hasHSTS) tech += 10;
  if (result.sitemap.exists) tech += 20;
  if (result.metaTags.canonical) tech += 10;
  if (result.performance.loadTimeMs !== null && result.performance.loadTimeMs < 3000) tech += 15;
  else if (result.performance.loadTimeMs !== null && result.performance.loadTimeMs < 5000) tech += 8;
  if (result.reachable) tech += 15;
  tech = Math.min(100, tech);

  const overall = Math.round(
    llm * 0.3 + meta * 0.2 + sd * 0.2 + cs * 0.15 + tech * 0.15,
  );

  return {
    overall,
    llmAccessibility: llm,
    metaQuality: meta,
    structuredData: sd,
    contentStructure: cs,
    technicalHealth: tech,
  };
}

// ---------------------------------------------------------------------------
// Main audit function
// ---------------------------------------------------------------------------

async function auditWebsite(url: string): Promise<SiteAuditResult> {
  const base: Omit<SiteAuditResult, "scores"> = {
    url,
    reachable: false,
    robotsTxt: {
      exists: false, blocksGPTBot: false, blocksGoogleBot: false,
      blocksCCBot: false, blocksAll: false, allowsAll: false,
      raw: null, botRules: [],
    },
    metaTags: {
      title: null, titleLength: 0, description: null, descriptionLength: 0,
      ogTitle: null, ogDescription: null, ogImage: null, canonical: null, lang: null,
    },
    structuredData: {
      hasJsonLd: false, jsonLdTypes: [], jsonLdCount: 0,
      hasOpenGraph: false, hasTwitterCards: false, schemaTypes: [],
    },
    headings: {
      h1Count: 0, h1Texts: [], h2Count: 0, h3Count: 0,
      hasLogicalHierarchy: false, totalHeadings: 0,
    },
    content: {
      wordCount: 0, hasNavigation: false, hasFAQSection: false,
      imageCount: 0, imagesWithAlt: 0, linkCount: 0,
      internalLinks: 0, externalLinks: 0,
    },
    sitemap: { exists: false, urlCount: null, format: null },
    security: { isHttps: false, hasHSTS: false },
    performance: { loadTimeMs: null, contentLength: null, serverHeader: null },
  };

  const origin = new URL(url).origin;

  // Fetch robots.txt, sitemap, and homepage in parallel
  const startTime = Date.now();

  const [robotsRes, sitemapRes, pageRes] = await Promise.allSettled([
    fetchWithTimeout(`${origin}/robots.txt`),
    fetchWithTimeout(`${origin}/sitemap.xml`),
    fetchWithTimeout(url),
  ]);

  // --- Robots.txt ---
  if (robotsRes.status === "fulfilled" && robotsRes.value.ok) {
    const raw = await robotsRes.value.text();
    base.robotsTxt.exists = true;
    base.robotsTxt.raw = raw.slice(0, 5000);
    const botRules = parseRobotsTxt(raw);
    base.robotsTxt.botRules = botRules;
    base.robotsTxt.blocksAll = botRules.some(
      (r) => r.bot === "*" && !r.allowed,
    );
    base.robotsTxt.blocksGPTBot = botRules.some(
      (r) => (r.bot.toLowerCase() === "gptbot" || r.bot.toLowerCase() === "chatgpt-user") && !r.allowed,
    );
    base.robotsTxt.blocksGoogleBot = botRules.some(
      (r) => r.bot.toLowerCase() === "google-extended" && !r.allowed,
    );
    base.robotsTxt.blocksCCBot = botRules.some(
      (r) => r.bot.toLowerCase() === "ccbot" && !r.allowed,
    );
    base.robotsTxt.allowsAll = !base.robotsTxt.blocksAll && botRules.length === 0;
  }

  // --- Sitemap ---
  if (sitemapRes.status === "fulfilled" && sitemapRes.value.ok) {
    const sitemapText = await sitemapRes.value.text();
    base.sitemap.exists = true;
    const urlMatches = sitemapText.match(/<loc>/gi);
    base.sitemap.urlCount = urlMatches ? urlMatches.length : null;
    base.sitemap.format = sitemapText.includes("<sitemapindex") ? "sitemap-index" : "urlset";
  }

  // --- Homepage ---
  if (pageRes.status === "fulfilled") {
    const res = pageRes.value;
    base.reachable = res.status < 500;
    base.security.isHttps = url.startsWith("https://");
    base.security.hasHSTS = !!res.headers.get("strict-transport-security");
    base.performance.loadTimeMs = Date.now() - startTime;
    base.performance.contentLength = Number(res.headers.get("content-length")) || null;
    base.performance.serverHeader = res.headers.get("server");

    if (res.ok) {
      const html = await res.text();

      // Meta tags
      base.metaTags.title = extractTag(html, "title");
      base.metaTags.titleLength = base.metaTags.title?.length ?? 0;
      base.metaTags.description = extractMeta(html, "description");
      base.metaTags.descriptionLength = base.metaTags.description?.length ?? 0;
      base.metaTags.ogTitle = extractMeta(html, "og:title", "property");
      base.metaTags.ogDescription = extractMeta(html, "og:description", "property");
      base.metaTags.ogImage = extractMeta(html, "og:image", "property");
      const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
      base.metaTags.canonical = canonicalMatch ? canonicalMatch[1] : null;
      const langMatch = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
      base.metaTags.lang = langMatch ? langMatch[1] : null;

      // Structured Data
      const jsonLdBlocks = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
      base.structuredData.jsonLdCount = jsonLdBlocks.length;
      base.structuredData.hasJsonLd = jsonLdBlocks.length > 0;

      const types: string[] = [];
      for (const block of jsonLdBlocks) {
        const content = block.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
        try {
          const parsed = JSON.parse(content);
          const extractTypes = (obj: unknown): void => {
            if (Array.isArray(obj)) {
              obj.forEach(extractTypes);
            } else if (obj && typeof obj === "object") {
              const rec = obj as Record<string, unknown>;
              if (rec["@type"]) {
                const t = Array.isArray(rec["@type"]) ? rec["@type"] : [rec["@type"]];
                types.push(...t.map(String));
              }
              if (rec["@graph"] && Array.isArray(rec["@graph"])) {
                rec["@graph"].forEach(extractTypes);
              }
            }
          };
          extractTypes(parsed);
        } catch {
          // malformed JSON-LD
        }
      }
      base.structuredData.schemaTypes = [...new Set(types)];
      base.structuredData.jsonLdTypes = [...new Set(types)];
      base.structuredData.hasOpenGraph = !!base.metaTags.ogTitle;
      base.structuredData.hasTwitterCards = !!extractMeta(html, "twitter:card");

      // Headings
      base.headings.h1Texts = extractAllTags(html, "h1").slice(0, 5);
      base.headings.h1Count = countPattern(html, /<h1[\s>]/gi);
      base.headings.h2Count = countPattern(html, /<h2[\s>]/gi);
      base.headings.h3Count = countPattern(html, /<h3[\s>]/gi);
      base.headings.totalHeadings =
        base.headings.h1Count + base.headings.h2Count + base.headings.h3Count;
      // Simple hierarchy check: has at least h1 and h2, h1 count is 1
      base.headings.hasLogicalHierarchy =
        base.headings.h1Count === 1 && base.headings.h2Count >= 1;

      // Content
      const textContent = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      base.content.wordCount = textContent.split(/\s+/).filter((w) => w.length > 1).length;
      base.content.hasNavigation = /<nav[\s>]/i.test(html);
      base.content.hasFAQSection =
        /faq/i.test(html) || /frequently.asked/i.test(html) || types.includes("FAQPage");
      base.content.imageCount = countPattern(html, /<img[\s]/gi);
      base.content.imagesWithAlt = countPattern(html, /<img[^>]+alt=["'][^"']+["']/gi);
      const allLinks = html.match(/<a[^>]+href=["']([^"']+)["']/gi) ?? [];
      base.content.linkCount = allLinks.length;
      const hostname = new URL(url).hostname;
      base.content.internalLinks = allLinks.filter((l) => {
        const hrefMatch = l.match(/href=["']([^"']+)["']/i);
        if (!hrefMatch) return false;
        const href = hrefMatch[1];
        return href.startsWith("/") || href.includes(hostname);
      }).length;
      base.content.externalLinks = base.content.linkCount - base.content.internalLinks;
    }
  } else {
    base.error = pageRes.status === "rejected" ? pageRes.reason?.message ?? "Failed to fetch" : "Non-OK response";
  }

  const scores = computeScores(base);
  return { ...base, scores };
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const { userId, error: authError } = await requireAuth();
  if (authError) return authError;
  const rlError = await checkRateLimit(userId, "expensive");
  if (rlError) return rlError;

  const brandSlug = req.nextUrl.searchParams.get("brandSlug");
  const urlParam = req.nextUrl.searchParams.get("url");

  if (!brandSlug) {
    return NextResponse.json({ error: "Missing brandSlug" }, { status: 400 });
  }

  // Get brand info
  const brand = await prisma.brand.findUnique({ where: { slug: brandSlug } });
  if (!brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  const brandName = brand.displayName || brand.name;

  // Determine URL to audit
  let targetUrl = urlParam;
  if (!targetUrl) {
    // Try to infer from brand name
    const slug = brandName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .trim();
    targetUrl = `https://www.${slug}.com`;
  }

  // Normalize URL
  if (!targetUrl.startsWith("http")) {
    targetUrl = `https://${targetUrl}`;
  }

  try {
    const result = await auditWebsite(targetUrl);
    return NextResponse.json(
      { hasData: true, brandName, audit: result },
      { headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=600" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Audit failed";
    return NextResponse.json(
      { hasData: false, brandName, error: message },
      { status: 200 },
    );
  }
}
