import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";

/**
 * Domain classification categories.
 * Stored as lowercase snake_case in DB, displayed with labels on the frontend.
 */
export const CATEGORY_LABELS: Record<string, string> = {
  reviews: "Reviews",
  news_media: "News & Media",
  video: "Video",
  ecommerce: "E-commerce",
  reference: "Reference",
  social_media: "Social Media",
  government: "Government",
  academic: "Academic",
  blog_forum: "Blog / Forum",
  brand_official: "Brand / Official",
  technology: "Technology",
  other: "Other",
};

export const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS);

/**
 * Static mapping of well-known domains to categories.
 * This avoids unnecessary GPT API calls for domains we already know.
 */
const STATIC_DOMAIN_MAP: Record<string, string> = {
  // --- Reviews ---
  "yelp.com": "reviews",
  "trustpilot.com": "reviews",
  "g2.com": "reviews",
  "capterra.com": "reviews",
  "tripadvisor.com": "reviews",
  "consumerreports.org": "reviews",
  "wirecutter.com": "reviews",
  "pcmag.com": "reviews",
  "tomsguide.com": "reviews",
  "tomshardware.com": "reviews",
  "rtings.com": "reviews",
  "cnet.com": "reviews",
  "techradar.com": "reviews",
  "thewirecutter.com": "reviews",
  "goodhousekeeping.com": "reviews",
  "edmunds.com": "reviews",
  "caranddriver.com": "reviews",
  "motortrend.com": "reviews",
  "kbb.com": "reviews",
  "jdpower.com": "reviews",
  "glassdoor.com": "reviews",
  "indeed.com": "reviews",
  "softwareadvice.com": "reviews",
  "getapp.com": "reviews",
  "sitejabber.com": "reviews",
  "bbb.org": "reviews",
  "angi.com": "reviews",
  "homeadvisor.com": "reviews",
  "healthline.com": "reviews",
  "webmd.com": "reviews",
  "mayoclinic.org": "reviews",
  "reviews.com": "reviews",
  "bestreviews.com": "reviews",
  "reviewed.com": "reviews",
  "thespruce.com": "reviews",
  "nerdwallet.com": "reviews",
  "bankrate.com": "reviews",
  "creditkarma.com": "reviews",
  "investopedia.com": "reviews",
  "solarreviews.com": "reviews",
  "energysage.com": "reviews",
  "outdoorgearlab.com": "reviews",
  "switchbacktravel.com": "reviews",
  "runnersworld.com": "reviews",
  "bicycling.com": "reviews",
  "rei.com": "reviews",
  "backpacker.com": "reviews",
  "cleverhiker.com": "reviews",
  "gearjunkie.com": "reviews",
  "soundguys.com": "reviews",
  "whatifi.com": "reviews",

  // --- News & Media ---
  "nytimes.com": "news_media",
  "washingtonpost.com": "news_media",
  "bbc.com": "news_media",
  "bbc.co.uk": "news_media",
  "cnn.com": "news_media",
  "reuters.com": "news_media",
  "apnews.com": "news_media",
  "theguardian.com": "news_media",
  "wsj.com": "news_media",
  "bloomberg.com": "news_media",
  "forbes.com": "news_media",
  "fortune.com": "news_media",
  "businessinsider.com": "news_media",
  "cnbc.com": "news_media",
  "ft.com": "news_media",
  "economist.com": "news_media",
  "time.com": "news_media",
  "newsweek.com": "news_media",
  "usatoday.com": "news_media",
  "latimes.com": "news_media",
  "nypost.com": "news_media",
  "axios.com": "news_media",
  "politico.com": "news_media",
  "thehill.com": "news_media",
  "vox.com": "news_media",
  "slate.com": "news_media",
  "thedailybeast.com": "news_media",
  "huffpost.com": "news_media",
  "nbcnews.com": "news_media",
  "abcnews.go.com": "news_media",
  "cbsnews.com": "news_media",
  "foxnews.com": "news_media",
  "npr.org": "news_media",
  "pbs.org": "news_media",
  "aljazeera.com": "news_media",
  "theatlantic.com": "news_media",
  "newyorker.com": "news_media",
  "wired.com": "news_media",
  "arstechnica.com": "news_media",
  "theverge.com": "news_media",
  "engadget.com": "news_media",
  "mashable.com": "news_media",
  "techcrunch.com": "news_media",
  "venturebeat.com": "news_media",
  "zdnet.com": "news_media",
  "gizmodo.com": "news_media",
  "lifehacker.com": "news_media",
  "insider.com": "news_media",
  "marketwatch.com": "news_media",
  "barrons.com": "news_media",
  "fastcompany.com": "news_media",
  "inc.com": "news_media",
  "entrepreneur.com": "news_media",
  "hbr.org": "news_media",

  // --- Video ---
  "youtube.com": "video",
  "youtu.be": "video",
  "vimeo.com": "video",
  "dailymotion.com": "video",
  "twitch.tv": "video",
  "tiktok.com": "video",

  // --- E-commerce ---
  "amazon.com": "ecommerce",
  "amazon.co.uk": "ecommerce",
  "walmart.com": "ecommerce",
  "target.com": "ecommerce",
  "bestbuy.com": "ecommerce",
  "ebay.com": "ecommerce",
  "etsy.com": "ecommerce",
  "shopify.com": "ecommerce",
  "alibaba.com": "ecommerce",
  "aliexpress.com": "ecommerce",
  "costco.com": "ecommerce",
  "homedepot.com": "ecommerce",
  "lowes.com": "ecommerce",
  "wayfair.com": "ecommerce",
  "overstock.com": "ecommerce",
  "zappos.com": "ecommerce",
  "nordstrom.com": "ecommerce",
  "macys.com": "ecommerce",
  "bhphotovideo.com": "ecommerce",
  "newegg.com": "ecommerce",

  // --- Reference ---
  "wikipedia.org": "reference",
  "en.wikipedia.org": "reference",
  "britannica.com": "reference",
  "merriam-webster.com": "reference",
  "dictionary.com": "reference",
  "statista.com": "reference",
  "worldbank.org": "reference",
  "imf.org": "reference",

  // --- Social Media ---
  "reddit.com": "social_media",
  "old.reddit.com": "social_media",
  "twitter.com": "social_media",
  "x.com": "social_media",
  "facebook.com": "social_media",
  "instagram.com": "social_media",
  "linkedin.com": "social_media",
  "pinterest.com": "social_media",
  "threads.net": "social_media",
  "quora.com": "social_media",
  "discord.com": "social_media",

  // --- Government ---
  "usa.gov": "government",
  "whitehouse.gov": "government",
  "congress.gov": "government",
  "irs.gov": "government",
  "cdc.gov": "government",
  "nih.gov": "government",
  "fda.gov": "government",
  "epa.gov": "government",
  "nasa.gov": "government",
  "energy.gov": "government",
  "sec.gov": "government",
  "ftc.gov": "government",
  "fcc.gov": "government",
  "un.org": "government",
  "who.int": "government",
  "europa.eu": "government",
  "gov.uk": "government",

  // --- Academic ---
  "scholar.google.com": "academic",
  "arxiv.org": "academic",
  "pubmed.ncbi.nlm.nih.gov": "academic",
  "jstor.org": "academic",
  "nature.com": "academic",
  "science.org": "academic",
  "sciencedirect.com": "academic",
  "researchgate.net": "academic",
  "semanticscholar.org": "academic",
  "ieee.org": "academic",
  "acm.org": "academic",
  "springer.com": "academic",

  // --- Technology ---
  "github.com": "technology",
  "stackoverflow.com": "technology",
  "docs.google.com": "technology",
  "developer.mozilla.org": "technology",
  "w3.org": "technology",
  "npmjs.com": "technology",
  "pypi.org": "technology",
  "docker.com": "technology",
  "kubernetes.io": "technology",
  "aws.amazon.com": "technology",
  "cloud.google.com": "technology",
  "azure.microsoft.com": "technology",

  // --- Blog / Forum ---
  "medium.com": "blog_forum",
  "substack.com": "blog_forum",
  "wordpress.com": "blog_forum",
  "blogspot.com": "blog_forum",
  "dev.to": "blog_forum",
  "hackernoon.com": "blog_forum",
};

/**
 * Look up a domain in the static map. Handles subdomains by stripping them progressively.
 * E.g., "www.nytimes.com" → "nytimes.com" → match
 */
function staticLookup(domain: string): string | null {
  const lower = domain.toLowerCase();

  // Direct match
  if (STATIC_DOMAIN_MAP[lower]) return STATIC_DOMAIN_MAP[lower];

  // Try stripping subdomains (www.foo.com → foo.com)
  const parts = lower.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const sub = parts.slice(i).join(".");
    if (STATIC_DOMAIN_MAP[sub]) return STATIC_DOMAIN_MAP[sub];
  }

  // Heuristic: .gov → government, .edu → academic
  if (lower.endsWith(".gov")) return "government";
  if (lower.endsWith(".edu")) return "academic";

  return null;
}

/**
 * Use GPT to classify a batch of unknown domains into categories.
 * Returns a map of domain → category.
 */
async function classifyWithGPT(domains: string[]): Promise<Record<string, string>> {
  if (domains.length === 0) return {};

  const categoryList = VALID_CATEGORIES.join(", ");
  const domainList = domains.join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      max_tokens: 1024,
      messages: [
        {
          role: "system",
          content: `You classify website domains into categories. Valid categories: ${categoryList}. Respond with JSON only — an object mapping each domain to its category. Use "other" if uncertain.`,
        },
        {
          role: "user",
          content: `Classify these domains:\n${domainList}`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const text = response.choices[0]?.message?.content;
    if (!text) return {};

    const parsed = JSON.parse(text) as Record<string, string>;
    const result: Record<string, string> = {};
    for (const [domain, cat] of Object.entries(parsed)) {
      result[domain.toLowerCase()] = VALID_CATEGORIES.includes(cat) ? cat : "other";
    }
    return result;
  } catch (e) {
    console.error("GPT domain classification error:", e);
    // Fallback: everything is "other"
    const result: Record<string, string> = {};
    for (const d of domains) result[d] = "other";
    return result;
  }
}

/**
 * Classify a list of domains, using cached DB values first, static map second,
 * and GPT API as last resort. Persists new classifications to DB.
 *
 * Returns a map of domain → category for all input domains.
 */
export async function classifyDomains(domains: string[]): Promise<Record<string, string>> {
  if (domains.length === 0) return {};

  const result: Record<string, string> = {};
  const uncached: string[] = [];

  // 1. Check DB cache
  const sources = await prisma.source.findMany({
    where: { domain: { in: domains } },
    select: { domain: true, category: true },
  });

  const dbCategories = new Map(sources.map((s) => [s.domain, s.category]));

  for (const domain of domains) {
    const cached = dbCategories.get(domain);
    if (cached) {
      result[domain] = cached;
    } else {
      // 2. Try static lookup
      const staticCat = staticLookup(domain);
      if (staticCat) {
        result[domain] = staticCat;
        // Persist to DB so we don't re-check next time
        uncached.push(domain); // mark for batch update
      } else {
        uncached.push(domain);
      }
    }
  }

  // Separate domains that got a static hit from those needing GPT
  const needGPT: string[] = [];
  const staticHits: string[] = [];
  for (const d of uncached) {
    if (result[d]) {
      staticHits.push(d);
    } else {
      needGPT.push(d);
    }
  }

  // 3. Classify unknown domains with GPT (batch up to 50 at a time)
  if (needGPT.length > 0) {
    const BATCH = 50;
    for (let i = 0; i < needGPT.length; i += BATCH) {
      const batch = needGPT.slice(i, i + BATCH);
      const gptResults = await classifyWithGPT(batch);
      for (const [domain, cat] of Object.entries(gptResults)) {
        result[domain] = cat;
      }
    }
  }

  // 4. Persist all newly classified domains to DB (static + GPT)
  const toUpdate = [...staticHits, ...needGPT].filter((d) => result[d]);
  if (toUpdate.length > 0) {
    await Promise.all(
      toUpdate.map((domain) =>
        prisma.source.updateMany({
          where: { domain, category: null },
          data: { category: result[domain] },
        }).catch(() => {}),
      ),
    );
  }

  // Fill any remaining gaps
  for (const domain of domains) {
    if (!result[domain]) result[domain] = "other";
  }

  return result;
}
