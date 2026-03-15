"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState, useCallback } from "react";
import { Loader2, Globe, RefreshCw } from "lucide-react";
import { useBrandName } from "@/lib/useBrandName";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { OnThisPage, type PageSection } from "@/components/OnThisPage";
import { PageSkeleton } from "@/components/PageSkeleton";
import { SiteAuditScorecard } from "@/components/site-audit/SiteAuditScorecard";
import {
  AuditSectionCard,
  CheckList,
  type CheckItem,
} from "@/components/site-audit/AuditSection";
import type { SiteAuditResult } from "@/app/api/site-audit/route";

/* ─── API Response ─────────────────────────────────────────────────── */

interface ApiResponse {
  hasData: boolean;
  brandName: string;
  audit?: SiteAuditResult;
  error?: string;
}

/* ─── Helpers ──────────────────────────────────────────────────────── */

const LLM_BOT_LABELS: Record<string, string> = {
  GPTBot: "GPTBot (OpenAI)",
  "ChatGPT-User": "ChatGPT-User",
  "Google-Extended": "Google-Extended (Gemini training)",
  CCBot: "CCBot (Common Crawl)",
  "anthropic-ai": "Anthropic AI",
  ClaudeBot: "ClaudeBot",
  PerplexityBot: "PerplexityBot",
  Bytespider: "Bytespider (TikTok)",
  "cohere-ai": "Cohere AI",
};

/* ─── Section Builders ─────────────────────────────────────────────── */

function buildLlmChecks(audit: SiteAuditResult): CheckItem[] {
  const checks: CheckItem[] = [];

  checks.push({
    label: "robots.txt exists",
    status: audit.robotsTxt.exists ? "pass" : "fail",
    detail: audit.robotsTxt.exists
      ? "Search engines and AI crawlers can find your crawling rules."
      : "No robots.txt found. AI crawlers have no explicit guidance on what they can access.",
  });

  if (audit.robotsTxt.blocksAll) {
    checks.push({
      label: "Blocks all bots",
      status: "fail",
      detail: "Your robots.txt blocks all crawlers with Disallow: /. No AI model can index your content.",
    });
  }

  // Individual bot checks
  for (const rule of audit.robotsTxt.botRules) {
    if (rule.bot === "*") continue;
    checks.push({
      label: LLM_BOT_LABELS[rule.bot] ?? rule.bot,
      status: rule.allowed ? "pass" : "fail",
      value: rule.allowed ? "Allowed" : "Blocked",
      detail: rule.allowed
        ? "This AI crawler can access your site."
        : "This AI crawler is blocked from accessing your site content.",
    });
  }

  // If no specific bot rules, note that
  if (audit.robotsTxt.botRules.filter((r) => r.bot !== "*").length === 0 && audit.robotsTxt.exists) {
    checks.push({
      label: "No LLM-specific rules",
      status: audit.robotsTxt.blocksAll ? "fail" : "pass",
      detail: audit.robotsTxt.blocksAll
        ? "All bots are blocked, including AI crawlers."
        : "No AI crawlers are specifically blocked. They can access your site.",
    });
  }

  checks.push({
    label: "XML Sitemap",
    status: audit.sitemap.exists ? "pass" : "warn",
    value: audit.sitemap.exists
      ? `${audit.sitemap.urlCount ?? "?"} URLs (${audit.sitemap.format})`
      : "Not found",
    detail: audit.sitemap.exists
      ? "AI crawlers can discover all your pages via the sitemap."
      : "No sitemap.xml found at the root. A sitemap helps AI crawlers discover and index your content.",
  });

  return checks;
}

function buildMetaChecks(audit: SiteAuditResult): CheckItem[] {
  const checks: CheckItem[] = [];
  const m = audit.metaTags;

  checks.push({
    label: "Page Title",
    status: m.title ? (m.titleLength > 10 && m.titleLength < 70 ? "pass" : "warn") : "fail",
    value: m.title ? `"${m.title}" (${m.titleLength} chars)` : "Missing",
    detail: m.title
      ? m.titleLength < 10 ? "Title is very short. Aim for 30-60 characters." : m.titleLength > 70 ? "Title is long and may be truncated." : "Good length for search and AI context."
      : "No <title> tag found. This is critical for AI models to understand your page.",
  });

  checks.push({
    label: "Meta Description",
    status: m.description ? (m.descriptionLength > 50 && m.descriptionLength < 160 ? "pass" : "warn") : "fail",
    value: m.description ? `${m.descriptionLength} chars` : "Missing",
    detail: m.description
      ? m.descriptionLength < 50 ? "Description is short. Aim for 120-155 characters." : m.descriptionLength > 160 ? "May be truncated in search results." : "Good length for AI and search."
      : "No meta description. AI models use this to summarize your page.",
  });

  checks.push({
    label: "Open Graph Title",
    status: m.ogTitle ? "pass" : "warn",
    value: m.ogTitle ?? "Missing",
    detail: m.ogTitle
      ? "Social and AI platforms can display your preferred title."
      : "No og:title tag. Adding one helps AI models that use Open Graph metadata.",
  });

  checks.push({
    label: "Open Graph Description",
    status: m.ogDescription ? "pass" : "warn",
    value: m.ogDescription ? `${m.ogDescription.length} chars` : "Missing",
  });

  checks.push({
    label: "Open Graph Image",
    status: m.ogImage ? "pass" : "warn",
    value: m.ogImage ? "Present" : "Missing",
  });

  checks.push({
    label: "Canonical URL",
    status: m.canonical ? "pass" : "warn",
    value: m.canonical ?? "Not set",
    detail: m.canonical
      ? "Prevents duplicate content issues for AI indexing."
      : "No canonical URL. Can lead to duplicate content in AI training data.",
  });

  checks.push({
    label: "Language Attribute",
    status: m.lang ? "pass" : "warn",
    value: m.lang ?? "Not set",
    detail: m.lang
      ? "Helps AI models understand the content language."
      : "No lang attribute on <html>. Helps AI models serve your content correctly.",
  });

  return checks;
}

function buildStructuredDataChecks(audit: SiteAuditResult): CheckItem[] {
  const checks: CheckItem[] = [];
  const sd = audit.structuredData;

  checks.push({
    label: "JSON-LD Markup",
    status: sd.hasJsonLd ? "pass" : "fail",
    value: sd.hasJsonLd ? `${sd.jsonLdCount} block${sd.jsonLdCount !== 1 ? "s" : ""}` : "None found",
    detail: sd.hasJsonLd
      ? "AI models can read structured data about your business."
      : "No JSON-LD structured data found. This is the most effective way to communicate facts to AI models.",
  });

  if (sd.schemaTypes.length > 0) {
    checks.push({
      label: "Schema Types",
      status: "pass",
      value: sd.schemaTypes.join(", "),
      detail: "These schema types provide rich context about your content.",
    });

    const hasOrg = sd.schemaTypes.includes("Organization") || sd.schemaTypes.includes("Corporation") || sd.schemaTypes.includes("LocalBusiness");
    checks.push({
      label: "Organization Schema",
      status: hasOrg ? "pass" : "warn",
      detail: hasOrg
        ? "AI models can identify your business entity, name, and details."
        : "Consider adding Organization or Corporation schema to establish your brand identity for AI.",
    });

    const hasFaq = sd.schemaTypes.includes("FAQPage");
    checks.push({
      label: "FAQ Schema",
      status: hasFaq ? "pass" : "info",
      detail: hasFaq
        ? "FAQ markup helps AI models directly answer questions about your brand."
        : "No FAQ schema. Adding FAQPage markup can help AI models reference your answers directly.",
    });
  } else if (sd.hasJsonLd) {
    checks.push({
      label: "Schema Types",
      status: "warn",
      value: "No @type detected",
      detail: "JSON-LD blocks were found but no schema types could be extracted.",
    });
  }

  checks.push({
    label: "Open Graph Protocol",
    status: sd.hasOpenGraph ? "pass" : "warn",
    value: sd.hasOpenGraph ? "Present" : "Missing",
  });

  checks.push({
    label: "Twitter Cards",
    status: sd.hasTwitterCards ? "pass" : "info",
    value: sd.hasTwitterCards ? "Present" : "Missing",
  });

  return checks;
}

function buildContentChecks(audit: SiteAuditResult): CheckItem[] {
  const checks: CheckItem[] = [];
  const h = audit.headings;
  const c = audit.content;

  checks.push({
    label: "Single H1 Tag",
    status: h.h1Count === 1 ? "pass" : h.h1Count === 0 ? "fail" : "warn",
    value: h.h1Count === 1 ? `"${h.h1Texts[0]}"` : `${h.h1Count} found`,
    detail: h.h1Count === 1
      ? "Clean single H1 helps AI models identify the main topic."
      : h.h1Count === 0
        ? "No H1 tag found. AI models rely on headings to understand page structure."
        : "Multiple H1 tags can confuse AI models about the primary topic.",
  });

  checks.push({
    label: "Heading Hierarchy",
    status: h.hasLogicalHierarchy ? "pass" : "warn",
    value: `H1: ${h.h1Count}, H2: ${h.h2Count}, H3: ${h.h3Count}`,
    detail: h.hasLogicalHierarchy
      ? "Well-structured headings help AI parse your content into meaningful sections."
      : "Heading hierarchy could be improved. Use H1 > H2 > H3 for clear content structure.",
  });

  checks.push({
    label: "Content Depth",
    status: c.wordCount >= 300 ? "pass" : c.wordCount >= 100 ? "warn" : "fail",
    value: `~${c.wordCount.toLocaleString()} words`,
    detail: c.wordCount >= 300
      ? "Sufficient content for AI models to extract meaningful information."
      : "Thin content may not provide enough context for AI models to accurately represent your brand.",
  });

  const altRatio = c.imageCount > 0 ? c.imagesWithAlt / c.imageCount : 0;
  checks.push({
    label: "Image Alt Text",
    status: c.imageCount === 0 ? "info" : altRatio >= 0.8 ? "pass" : altRatio >= 0.5 ? "warn" : "fail",
    value: c.imageCount > 0 ? `${c.imagesWithAlt}/${c.imageCount} images have alt text` : "No images",
    detail: altRatio >= 0.8
      ? "Most images have descriptive alt text for AI accessibility."
      : "Many images lack alt text. AI models that process images rely on alt attributes.",
  });

  checks.push({
    label: "Navigation Element",
    status: c.hasNavigation ? "pass" : "info",
    value: c.hasNavigation ? "Found" : "Not found",
    detail: "Semantic <nav> elements help AI crawlers understand your site structure.",
  });

  checks.push({
    label: "FAQ Content",
    status: c.hasFAQSection ? "pass" : "info",
    value: c.hasFAQSection ? "Detected" : "None found",
    detail: c.hasFAQSection
      ? "FAQ content provides direct answers that AI models can reference."
      : "Consider adding an FAQ section. AI models frequently surface FAQ-style content.",
  });

  checks.push({
    label: "Internal Links",
    status: c.internalLinks >= 5 ? "pass" : c.internalLinks >= 1 ? "warn" : "fail",
    value: `${c.internalLinks} internal, ${c.externalLinks} external`,
    detail: "Internal links help AI crawlers discover and associate your content pages.",
  });

  return checks;
}

function buildTechnicalChecks(audit: SiteAuditResult): CheckItem[] {
  const checks: CheckItem[] = [];

  checks.push({
    label: "HTTPS",
    status: audit.security.isHttps ? "pass" : "fail",
    detail: audit.security.isHttps
      ? "Secure connection. AI platforms prefer HTTPS sources."
      : "Not using HTTPS. AI models may deprioritize insecure sources.",
  });

  checks.push({
    label: "HSTS Header",
    status: audit.security.hasHSTS ? "pass" : "info",
    value: audit.security.hasHSTS ? "Present" : "Not set",
  });

  checks.push({
    label: "Page Load Time",
    status: audit.performance.loadTimeMs !== null
      ? audit.performance.loadTimeMs < 2000 ? "pass" : audit.performance.loadTimeMs < 5000 ? "warn" : "fail"
      : "info",
    value: audit.performance.loadTimeMs !== null ? `${(audit.performance.loadTimeMs / 1000).toFixed(1)}s` : "N/A",
    detail: audit.performance.loadTimeMs !== null && audit.performance.loadTimeMs > 5000
      ? "Slow pages may time out for AI crawlers, causing incomplete indexing."
      : undefined,
  });

  if (audit.performance.serverHeader) {
    checks.push({
      label: "Server",
      status: "info",
      value: audit.performance.serverHeader,
    });
  }

  return checks;
}

/* ─── Summary ──────────────────────────────────────────────────────── */

function AuditSummary({ audit, brandName }: { audit: SiteAuditResult; brandName: string }) {
  const s = audit.scores;
  const r = audit.robotsTxt;
  const sd = audit.structuredData;
  const m = audit.metaTags;
  const h = audit.headings;
  const c = audit.content;

  // Count wins and issues for the bottom line
  const wins: string[] = [];
  const issues: string[] = [];

  if (s.llmAccessibility >= 80) wins.push("AI crawlers can access the site");
  else if (s.llmAccessibility < 50) issues.push("AI crawlers are restricted");

  if (s.structuredData >= 60) wins.push("structured data is present");
  else if (s.structuredData < 40) issues.push("no structured data for AI to read");

  if (s.metaQuality >= 80) wins.push("meta tags are strong");
  else if (s.metaQuality < 50) issues.push("key meta tags are missing");

  if (s.contentStructure >= 70) wins.push("content is well-organized");
  else if (s.contentStructure < 50) issues.push("content structure needs work");

  if (s.technicalHealth >= 70) wins.push("technical fundamentals are solid");

  const sections: { heading: string; body: string }[] = [];

  // --- Overall ---
  let overall: string;
  if (s.overall >= 80) {
    overall = `${brandName}'s website is well-optimized for AI visibility, scoring ${s.overall}/100. When someone asks ChatGPT, Gemini, or Perplexity about topics related to ${brandName}, these platforms can easily read, understand, and reference the site's content. This gives ${brandName} a strong advantage in how AI represents the brand.`;
  } else if (s.overall >= 60) {
    overall = `${brandName}'s website scores ${s.overall}/100 for AI readiness. The basics are in place, but there are gaps that may cause AI platforms to miss important details about the brand or represent it less favorably than competitors with better-optimized sites. The good news is that the fixes are straightforward.`;
  } else if (s.overall >= 40) {
    overall = `${brandName}'s website scores ${s.overall}/100 for AI readiness, which means AI platforms may struggle to fully understand what ${brandName} does and how to describe it. When people ask AI assistants about topics in ${brandName}'s space, the brand may be underrepresented or described inaccurately because the site isn't giving AI the right signals.`;
  } else {
    overall = `${brandName}'s website scores ${s.overall}/100 for AI readiness — a significant concern. AI platforms like ChatGPT and Gemini have difficulty reading and understanding the site, which means ${brandName} is likely being left out of AI-generated answers or misrepresented. Addressing these issues should be a priority for the brand's digital strategy.`;
  }
  sections.push({ heading: "The Big Picture", body: overall });

  // --- Crawl Access ---
  // "Think of this like the front door to your website for AI"
  let crawlBody: string;
  const blockedBots = r.botRules.filter((b) => !b.allowed && b.bot !== "*");
  const blockedNames = blockedBots.map((b) => LLM_BOT_LABELS[b.bot] ?? b.bot);

  if (r.blocksAll) {
    crawlBody = `Right now, ${brandName}'s website has a configuration file (robots.txt) that tells all AI crawlers to stay out. Think of it like a "closed" sign on the front door — no AI platform can read the site's content. This is the single most impactful issue to fix. Until it's resolved, ${brandName} is effectively invisible to every AI assistant.`;
  } else if (blockedBots.length > 0) {
    crawlBody = `${brandName}'s website is selectively blocking certain AI platforms from reading its content. Specifically, ${blockedNames.join(" and ")} ${blockedBots.length === 1 ? "is" : "are"} blocked. This means when someone asks ${blockedBots.some((b) => b.bot.toLowerCase().includes("gpt")) ? "ChatGPT" : "those platforms"} about ${brandName}'s industry, the AI can't reference ${brandName}'s own website and may rely on third-party sources instead — which the brand can't control.${r.exists && !r.blocksAll && blockedBots.length < 3 ? " Other AI platforms can still access the site." : ""}`;
  } else if (r.exists) {
    crawlBody = `Good news: ${brandName}'s website allows all major AI crawlers to access its content. Platforms like ChatGPT, Gemini, Claude, and Perplexity can read the site and use it as a source when answering questions.${audit.sitemap.exists ? ` The site also has a sitemap${audit.sitemap.urlCount ? ` listing ${audit.sitemap.urlCount.toLocaleString()} pages` : ""}, which acts like a table of contents that helps AI crawlers find every page.` : " One gap: there's no sitemap (a file that lists all pages). Adding one is like giving AI crawlers a table of contents — it helps them find and index every page on the site."}`;
  } else {
    crawlBody = `The site doesn't have a robots.txt file, which is the standard way websites communicate with AI crawlers about what they can and can't access. While this means AI crawlers aren't blocked, adding a robots.txt is a best practice — it signals a well-maintained site and lets ${brandName} explicitly invite AI crawlers to index the content.`;
  }
  sections.push({ heading: "Can AI Platforms Read Your Site?", body: crawlBody });

  // --- Structured Data ---
  // "This is how your website introduces itself to AI in a language it natively understands"
  let sdBody: string;
  if (sd.hasJsonLd && sd.schemaTypes.length > 0) {
    const hasOrg = sd.schemaTypes.some((t) => ["Organization", "Corporation", "LocalBusiness"].includes(t));
    const hasFaq = sd.schemaTypes.includes("FAQPage");
    const typeList = sd.schemaTypes.slice(0, 5).join(", ");

    sdBody = `The site includes structured data — machine-readable labels embedded in the page code that explicitly tell AI "here's what this business is and does." Specifically, it has ${sd.jsonLdCount} block${sd.jsonLdCount !== 1 ? "s" : ""} of structured data using types: ${typeList}.`;
    if (hasOrg) sdBody += ` This includes business identity markup, which helps AI models correctly identify ${brandName} as a company, not just a keyword.`;
    if (hasFaq) sdBody += " There's also FAQ markup, which is especially valuable — when an AI is looking for answers to questions about the brand, this makes it easy to pull in ${brandName}'s own answers.";
    if (!hasOrg) sdBody += ` One recommendation: add Organization or Corporation markup. This tells AI "here is our company name, what we do, our logo, and our website" in a structured format — think of it as a digital business card that AI can read instantly.`;
    if (!hasFaq) sdBody += " Consider adding FAQ markup as well — it lets AI models directly quote ${brandName}'s answers to common questions, rather than paraphrasing from third-party sites.";
  } else if (sd.hasJsonLd) {
    sdBody = `The site has some structured data markup, but it's not fully configured. Structured data is like a machine-readable summary of your business — it tells AI platforms exactly what ${brandName} is, what it does, and key facts, in a format they can instantly parse. The current markup needs @type labels (like Organization, Product, or FAQPage) to be useful. Ask your web team to review and complete the structured data.`;
  } else {
    sdBody = `The site has no structured data, which is a significant missed opportunity. Structured data is the single most effective way to tell AI platforms exactly who ${brandName} is and what it does — it's like providing AI with a pre-written, accurate summary of the business. Without it, AI models have to guess based on page content, which often leads to incomplete or inaccurate descriptions. Adding Organization schema (company name, description, logo, URL) and FAQ markup should be a top priority.`;
  }
  sections.push({ heading: "Does AI Understand Who You Are?", body: sdBody });

  // --- Meta Tags ---
  const metaIssues: string[] = [];
  if (!m.title) metaIssues.push("page title is missing");
  else if (m.titleLength < 10 || m.titleLength > 70) metaIssues.push(`page title is ${m.titleLength < 10 ? "very short" : "longer than recommended"} at ${m.titleLength} characters`);
  if (!m.description) metaIssues.push("meta description is missing");
  else if (m.descriptionLength < 50) metaIssues.push("meta description is too short to be useful");
  if (!m.ogTitle) metaIssues.push("Open Graph title is missing");
  if (!m.ogDescription) metaIssues.push("Open Graph description is missing");
  if (!m.ogImage) metaIssues.push("no preview image is set for social sharing");
  if (!m.canonical) metaIssues.push("no canonical URL is set");

  let metaBody: string;
  if (metaIssues.length === 0) {
    metaBody = `The site's meta tags are in great shape. These are the hidden labels in the page code that tell AI and search engines "here's what this page is about."${m.title ? ` The page title ("${m.title}") is well-crafted, and the description, social sharing tags, and canonical URL are all present.` : ""} This means when AI platforms scan the page, they get a clear, complete picture of ${brandName}'s content right away.`;
  } else if (metaIssues.length <= 2) {
    metaBody = `Most of the site's meta tags are in good shape${m.title ? ` — the page title ("${m.title}") is set` : ""}. Meta tags are like labels on the page that tell AI "here's what this page is about" before it even reads the full content. There are a couple of small gaps: ${metaIssues.join(" and ")}. These are quick fixes that would give AI an even clearer first impression of ${brandName}.`;
  } else {
    metaBody = `Several important meta tags are missing or incomplete: ${metaIssues.join(", ")}. Meta tags are the first thing AI reads when it visits a page — they're like a quick summary that says "this page is about [topic] by [brand]." ${m.title ? `The current title is "${m.title}", which is a start.` : "There's no page title at all, which should be the first fix."} When these tags are missing, AI has to work harder to figure out what the page is about, and may get it wrong or skip over ${brandName} entirely.`;
  }
  sections.push({ heading: "First Impressions for AI", body: metaBody });

  // --- Content ---
  let contentBody: string;
  const h1Text = h.h1Texts[0] ?? "";

  if (c.wordCount >= 300 && h.hasLogicalHierarchy) {
    contentBody = `The page content is well-organized for AI consumption.${h1Text ? ` The main heading ("${h1Text}") clearly signals the page topic,` : ""} and the content is structured with ${h.h2Count} subheadings that break information into scannable sections. With approximately ${c.wordCount.toLocaleString()} words, there's enough substance for AI to extract meaningful information about ${brandName}.`;
  } else {
    const contentIssues: string[] = [];
    if (h.h1Count === 0) contentIssues.push("there's no main heading (H1) to tell AI what the page is about");
    else if (h.h1Count > 1) contentIssues.push(`there are ${h.h1Count} main headings instead of one clear one, which can confuse AI about the primary topic`);
    if (h.h2Count < 2) contentIssues.push("there aren't enough subheadings to break the content into clear sections");
    if (c.wordCount < 300) contentIssues.push(`the page only has about ${c.wordCount.toLocaleString()} words, which may not give AI enough context to accurately describe ${brandName}`);

    contentBody = `The page content has room for improvement from an AI readability standpoint. Think of headings as chapter titles in a book — they tell AI how information is organized and what each section covers. Currently, ${contentIssues.join(", and ")}.`;
    if (h1Text && h.h1Count === 1) contentBody += ` The main heading ("${h1Text}") is clear, which is good.`;
  }

  if (c.imageCount > 0) {
    const altPct = Math.round((c.imagesWithAlt / c.imageCount) * 100);
    if (altPct >= 80) {
      contentBody += ` Images are well-labeled: ${altPct}% of the ${c.imageCount} images have descriptive alt text, which helps AI understand visual content.`;
    } else {
      contentBody += ` Only ${altPct}% of the ${c.imageCount} images have alt text descriptions. Alt text is how AI "reads" images — without it, visual content is invisible to AI platforms.`;
    }
  }

  if (c.hasFAQSection) {
    contentBody += " The page includes FAQ content, which is especially valuable. AI assistants love FAQs because they provide ready-made answers to common questions — this is one of the easiest ways to influence what AI says about the brand.";
  }

  sections.push({ heading: "How Well Is Content Organized?", body: contentBody });

  // --- Technical ---
  let techBody = "On the technical side: ";
  const techPoints: string[] = [];

  if (audit.security.isHttps) {
    techPoints.push("the site uses HTTPS (secure connection), which AI platforms treat as a trust signal");
  } else {
    techPoints.push("the site doesn't use HTTPS, which AI platforms may view as less trustworthy — this can lower the brand's priority as a source");
  }

  if (audit.performance.loadTimeMs !== null) {
    const seconds = (audit.performance.loadTimeMs / 1000).toFixed(1);
    if (audit.performance.loadTimeMs < 2000) {
      techPoints.push(`the page loads quickly (${seconds}s), so AI crawlers can read it without timing out`);
    } else if (audit.performance.loadTimeMs < 5000) {
      techPoints.push(`the page load time is moderate (${seconds}s) — faster is better, as AI crawlers may skip slow pages`);
    } else {
      techPoints.push(`the page is slow to load (${seconds}s), which means AI crawlers may give up before reading the full content`);
    }
  }

  if (audit.sitemap.exists) {
    techPoints.push(`there's a sitemap${audit.sitemap.urlCount ? ` covering ${audit.sitemap.urlCount.toLocaleString()} pages` : ""} to help AI find all content`);
  } else {
    techPoints.push("there's no sitemap, so AI crawlers have to discover pages on their own (which means some may be missed)");
  }

  techBody += techPoints.join("; ") + ".";
  sections.push({ heading: "Technical Foundations", body: techBody });

  // --- Bottom line ---
  let bottomLine: string;
  if (issues.length === 0) {
    bottomLine = `Bottom line: ${brandName}'s website is in strong shape for AI visibility. The site is accessible to AI crawlers, provides clear metadata, and has good content structure. Continue maintaining these standards as AI platforms evolve.`;
  } else if (issues.length <= 2 && wins.length >= 2) {
    bottomLine = `Bottom line: ${brandName} has a good foundation (${wins.join(", ")}), but should address ${issues.length === 1 ? "one key gap" : "a couple of gaps"}: ${issues.join(" and ")}. These are high-impact fixes that would meaningfully improve how AI platforms talk about the brand.`;
  } else {
    bottomLine = `Bottom line: ${brandName} should prioritize ${issues.slice(0, 3).join(", ")} to improve AI visibility. ${wins.length > 0 ? `The good news is that ${wins.join(" and ")}, so there's a foundation to build on.` : "Start with the highest-impact items: ensuring AI crawlers can access the site and adding structured data."} Each fix directly increases the chance that AI assistants will mention ${brandName} accurately and favorably.`;
  }
  sections.push({ heading: "What This Means", body: bottomLine });

  return (
    <section className="rounded-xl bg-card px-5 py-4 shadow-section">
      <h2 className="text-sm font-semibold mb-4">AI Readiness Summary</h2>
      <div className="space-y-5">
        {sections.map((sec, i) => (
          <div key={i}>
            <h3 className="text-sm font-medium text-foreground mb-1">{sec.heading}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{sec.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Page Sections ────────────────────────────────────────────────── */

const PAGE_SECTIONS: PageSection[] = [
  { id: "scorecard", label: "Scorecard & Summary" },
  { id: "llm-access", label: "LLM Accessibility", heading: "Technical Details" },
  { id: "meta-tags", label: "Meta Tags" },
  { id: "structured-data", label: "Structured Data" },
  { id: "content-structure", label: "Content Structure" },
  { id: "technical", label: "Technical Health" },
];

/* ─── Inner Component ──────────────────────────────────────────────── */

function SiteAuditInner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const brandName = useBrandName(params.slug);

  const [customUrl, setCustomUrl] = useState("");
  const [submittedUrl, setSubmittedUrl] = useState<string | null>(null);

  const urlParam = submittedUrl
    ? `&url=${encodeURIComponent(submittedUrl)}`
    : "";
  const apiUrl = `/api/site-audit?brandSlug=${encodeURIComponent(params.slug)}${urlParam}`;
  const { data: apiData, loading, error } = useCachedFetch<ApiResponse>(apiUrl);

  const handleSubmitUrl = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = customUrl.trim();
      if (trimmed) {
        setSubmittedUrl(trimmed);
      }
    },
    [customUrl],
  );

  // Loading
  if (loading) {
    return (
      <PageSkeleton label="Auditing website...">
        <Header brandName={brandName} url={apiData?.audit?.url} />
      </PageSkeleton>
    );
  }

  // Error
  if (error) {
    return (
      <div className="space-y-8">
        <Header brandName={brandName} />
        <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  // No data / site unreachable
  if (apiData && (!apiData.hasData || !apiData.audit?.reachable)) {
    return (
      <div className="space-y-8">
        <Header brandName={brandName} />
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center space-y-4">
          <Globe className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">
            {apiData.error ?? (apiData.audit ? `Could not reach ${apiData.audit.url}` : "Could not determine website URL.")}
          </p>
          <form onSubmit={handleSubmitUrl} className="flex items-center gap-2 max-w-md mx-auto">
            <input
              type="text"
              placeholder="Enter website URL (e.g. tesla.com)"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Audit
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!apiData?.audit) return null;
  const audit = apiData.audit;

  return (
    <div className="flex gap-8 xl:-ml-52">
      {/* Sidebar */}
      <div className="w-40 shrink-0">
        <OnThisPage sections={PAGE_SECTIONS} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-6 xl:max-w-[1060px]">
        <Header brandName={brandName} url={audit.url} />

        {/* URL bar with re-audit option */}
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-2.5">
            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-foreground truncate">{audit.url}</span>
          </div>
          <form onSubmit={handleSubmitUrl} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Different URL..."
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              className="w-48 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="submit"
              className="rounded-md bg-card px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </form>
        </div>

        {/* ── Scorecard & Summary ─────────────────────────────────── */}
        <div id="scorecard" className="scroll-mt-24 space-y-6">
          <SiteAuditScorecard {...audit.scores} />
          <AuditSummary audit={audit} brandName={brandName} />
        </div>

        {/* ── Technical Details ─────────────────────────────────── */}
        <div id="technical-details" className="scroll-mt-24 space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Technical Details</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Detailed check results for each audit category.
            </p>
          </div>

          {/* LLM Accessibility */}
          <AuditSectionCard
            id="llm-access"
            title="LLM Accessibility"
            subtitle="Can AI crawlers access and index your website content?"
            score={audit.scores.llmAccessibility}
          >
            <CheckList items={buildLlmChecks(audit)} />
          </AuditSectionCard>

          {/* Meta Tags */}
          <AuditSectionCard
            id="meta-tags"
            title="Meta Tag Quality"
            subtitle="HTML meta tags that help AI models understand your content."
            score={audit.scores.metaQuality}
          >
            <CheckList items={buildMetaChecks(audit)} />
          </AuditSectionCard>

          {/* Structured Data */}
          <AuditSectionCard
            id="structured-data"
            title="Structured Data"
            subtitle="JSON-LD and schema.org markup that provides machine-readable context."
            score={audit.scores.structuredData}
          >
            <CheckList items={buildStructuredDataChecks(audit)} />
          </AuditSectionCard>

          {/* Content Structure */}
          <AuditSectionCard
            id="content-structure"
            title="Content Structure"
            subtitle="How well your content is organized for AI comprehension."
            score={audit.scores.contentStructure}
          >
            <CheckList items={buildContentChecks(audit)} />
          </AuditSectionCard>

          {/* Technical Health */}
          <AuditSectionCard
            id="technical"
            title="Technical Health"
            subtitle="Security, performance, and technical SEO fundamentals."
            score={audit.scores.technicalHealth}
          >
            <CheckList items={buildTechnicalChecks(audit)} />
          </AuditSectionCard>
        </div>
      </div>
    </div>
  );
}

/* ─── Header ───────────────────────────────────────────────────────── */

function Header({ brandName, url }: { brandName: string; url?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">Site Audit</h1>
      <p className="text-sm text-muted-foreground mt-1">
        AI readiness analysis for <span className="font-medium text-foreground">{brandName}</span>
        {url ? <> &middot; {url}</> : null}
      </p>
    </div>
  );
}

/* ─── Page Export ──────────────────────────────────────────────────── */

export default function SiteAuditPage() {
  return (
    <Suspense
      fallback={
        <div className="py-16 text-center text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          Loading...
        </div>
      }
    >
      <SiteAuditInner />
    </Suspense>
  );
}
