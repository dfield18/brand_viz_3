import type { Metadata } from "next";
import Link from "next/link";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/hash";
import { GET as getVisibility } from "@/app/api/visibility/route";
import { FreeDashboard } from "@/components/free/FreeDashboard";
import { LazyLandingDashboard } from "@/components/landing/LazyLandingDashboard";
import {
  AnthropicIcon,
  GeminiIcon,
  GoogleIcon,
  OpenAIIcon,
  PerplexityIcon,
} from "@/components/landing/PlatformIcons";
import { FREE_TIER_CONFIG } from "@/config/freeTier";
import type { VisibilityTrendPoint } from "@/types/api";
import {
  ArrowRight,
  BarChart3,
  Check,
  Link2,
  Mail,
  MessageCircle,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

export const metadata: Metadata = {
  title: {
    absolute: "aiSaysWhat — See what AI is saying about your brand",
  },
  description:
    "Free AI brand visibility check. Enter your brand and category — see how ChatGPT and Gemini describe you, which competitors come up, and how often your brand appears. No sign-up required.",
  alternates: { canonical: "/" },
};

const FEATURES: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Mention Rate",
    description: "When customers ask AI about your category, how often does your brand come up?",
    icon: TrendingUp,
  },
  {
    title: "Sentiment & Narrative",
    description: "Is AI framing your brand positively or negatively? What story is it telling about your products?",
    icon: MessageCircle,
  },
  {
    title: "Competitive Share",
    description: "When AI discusses your category, which brands does it highlight? Track how your share of the conversation shifts over time.",
    icon: Users,
  },
  {
    title: "Source Attribution",
    description: "Which websites does AI cite when discussing your industry? Are they your properties — or your competitors'?",
    icon: Link2,
  },
  {
    title: "Platform Comparison",
    description: "ChatGPT and Gemini can frame your brand very differently. See which platforms help or hurt your positioning.",
    icon: BarChart3,
  },
  {
    title: "Weekly Reports",
    description: "Automated reports with visibility scores, competitor alerts, and narrative shifts — delivered to your inbox.",
    icon: Mail,
  },
];

const FAQS: { q: string; a: string }[] = [
  {
    q: "How is the data actually generated?",
    a: "We send real questions about your category to the actual AI models — ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews — via their production APIs. No scraping, no proxies. The prompts are phrased the way a real customer or prospect would ask, and the responses are analyzed for brand mentions, sentiment, competitor share, and cited sources.",
  },
  {
    q: "How often is it updated?",
    a: "Free reports run live against every model each time you search. Pro accounts snapshot weekly so you get a 90-day trend built from real logged data points — no back-cast estimates. Enterprise can pick a custom cadence.",
  },
  {
    q: "What's the difference between the free and paid tiers?",
    a: "The free tier runs ChatGPT + Gemini on demand and a historical trend estimated from each model's training-data reference. Pro adds all five platforms, weekly snapshots that accumulate as real logged history, five tracked brands, weekly email reports, CSV export, and custom prompts. Enterprise is for multi-brand companies and agencies with unlimited brands, API access, SSO, and dedicated support.",
  },
  {
    q: "Can I trust the historical data on the free tier?",
    a: "Historical points on the free tier are inferred from each model's training-data reference — not live web queries — so they're useful as a baseline but not a substitute for real logged history. Today's point is always calibrated to live results. Pro accounts log real snapshots weekly so the trend accumulates as genuine longitudinal data from the moment you sign up.",
  },
  {
    q: "Can I track competitors?",
    a: "Yes. When AI discusses your category, we automatically detect which other brands come up and track their share of the conversation — no configuration needed. Pro accounts also get per-competitor movement alerts when a rival's mention rate shifts meaningfully between snapshots.",
  },
  {
    q: "What if my brand name is ambiguous?",
    a: "Common ambiguity — \"Apple\" (company vs. Records vs. fruit), \"Delta\" (airline vs. faucet vs. Greek letter) — is handled with a disambiguation step before analysis. You pick the meaning you want to track, and we scope every subsequent query to that entity. Obscure or recent entities that older models haven't seen are looked up via a live web-search fallback so the report still recognizes them.",
  },
];

const PRICING_TIERS = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "Run a report — no sign-up required",
    features: [
      "ChatGPT + Gemini",
      "Visibility, sentiment, competitors, sources",
      "90-day trend — 3 points, 2 derived from model training data",
      "Run as many reports as you want",
      "Free forever — no credit card needed",
    ],
    cta: "Use it free",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/mo",
    description: "Everything in Starter — plus all 5 AI platforms, real weekly snapshots, and 5 brands tracked automatically.",
    features: [
      "5 brands tracked automatically — set once, monitored every week",
      "ChatGPT, Gemini, Claude, Perplexity & Google AI Overviews",
      "Real weekly snapshots build a genuine 90-day trend — not training-data estimates",
      "Custom prompts for the exact questions your customers ask",
      "Weekly email digests + CSV exports",
    ],
    // "Start Free Trial" implied Pro auto-bills after a trial window,
    // muddying the already-clear "Starter = Free" story next door.
    // Neutral "Start with Pro" removes the ambiguity.
    cta: "Start with Pro",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For multi-brand companies and agencies",
    features: [
      "Unlimited brands tracked",
      "Custom prompts written for your team",
      "API access for programmatic exports",
      "Multi-seat workspace with role-based access",
      "Dedicated success contact + onboarding",
      "SSO + audit logging",
      "SLA + uptime guarantee",
    ],
    cta: "Contact us",
    highlighted: false,
  },
];

// Schema.org JSON-LD — Software/Org for entity resolution, FAQ for
// citable Q&A pairs (lets ChatGPT/Perplexity quote individual
// answers), HowTo for the methodology (lets AI tools cite the 3-step
// process verbatim). FAQ + HowTo bodies are derived from the FAQS
// and how-it-works arrays already on the page so the structured data
// stays in sync with the visible copy automatically.
const HOW_IT_WORKS_STEPS = [
  { title: "Add your brand", description: "Enter your brand name. We generate targeted questions about your category for each AI platform." },
  { title: "We ask the AI", description: "Real questions sent to real models — the same way customers and prospects use them." },
  { title: "See what comes back", description: "Visibility scores, sentiment analysis, competitor tracking, and source citations. Updated on your schedule." },
] as const;

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "aiSaysWhat",
      url: "https://www.aisayswhat.com",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "AI brand visibility platform for companies and marketing teams. Monitors how ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews describe your brand — with visibility scores, sentiment analysis, competitor tracking, and source citations.",
      offers: [
        { "@type": "Offer", name: "Starter", price: "0", priceCurrency: "USD" },
        { "@type": "Offer", name: "Pro", price: "49", priceCurrency: "USD" },
        { "@type": "Offer", name: "Enterprise", price: "0", priceCurrency: "USD", description: "Custom pricing" },
      ],
    },
    {
      "@type": "Organization",
      name: "aiSaysWhat",
      url: "https://www.aisayswhat.com",
      email: "support@aisayswhat.com",
      description: "AI brand visibility for companies and marketing teams.",
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@type": "HowTo",
      name: "How aiSaysWhat measures AI brand visibility",
      description: "Three-step process for analyzing how ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews describe a brand.",
      step: HOW_IT_WORKS_STEPS.map((s, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: s.title,
        text: s.description,
      })),
    },
  ],
};

/**
 * Fetch a sample visibility trend for the "dashboard preview" embed below
 * How it works. Walks a preferred candidate list (Costco first — it
 * has broad AI coverage and a consistently positive mention story)
 * and picks the first that has completed jobs. Falls back to any
 * brand with data so the section still renders on fresh deploys.
 * Returns null if nothing is available — caller hides the section
 * entirely.
 */
const SAMPLE_BRAND_SLUGS = ["costco", "duolingo", "lululemon", "patagonia", "nike"];

async function getSampleVisibilityData(): Promise<{
  brandName: string;
  industry: string | null;
  trend: VisibilityTrendPoint[];
} | null> {
  try {
    // Build the full slug list: each candidate in both its free-tier
    // deterministic cache form (`<slug>--<sha256(slug).slice(0,8)>`)
    // and its Pro form (bare `<slug>`). findFirst picks whichever
    // exists with completed jobs, preferring candidates earlier in
    // SAMPLE_BRAND_SLUGS by re-querying one at a time.
    let brand: { slug: string; name: string; displayName: string | null; industry: string | null } | null = null;
    for (const slug of SAMPLE_BRAND_SLUGS) {
      const cacheSlug = `${slug}--${sha256(slug).slice(0, 8)}`;
      brand = await prisma.brand.findFirst({
        where: {
          slug: { in: [cacheSlug, slug] },
          jobs: { some: { finishedAt: { not: null } } },
        },
        orderBy: { createdAt: "desc" },
        select: { slug: true, name: true, displayName: true, industry: true },
      });
      if (brand) break;
    }
    if (!brand) {
      brand = await prisma.brand.findFirst({
        where: { jobs: { some: { finishedAt: { not: null } } } },
        orderBy: { createdAt: "desc" },
        select: { slug: true, name: true, displayName: true, industry: true },
      });
    }
    if (!brand) return null;

    const url = new URL(
      `/api/visibility?brandSlug=${encodeURIComponent(brand.slug)}&model=all&range=90`,
      "http://localhost:3000",
    );
    const req = new NextRequest(url);
    const res = await getVisibility(req);
    if (!res.ok) return null;

    const json = await res.json();
    const trend: VisibilityTrendPoint[] = json?.visibility?.trend ?? [];
    if (trend.length < 2) return null;

    return {
      brandName: brand.displayName || brand.name,
      industry: brand.industry,
      trend,
    };
  } catch {
    return null;
  }
}

// Force-static + ISR. Without force-static, Next detects the
// auth/Clerk imports in the module graph (reached via
// fetchBrandRuns → requireBrandAccess, which short-circuits for
// preset brands but Next can't prove that at build time) and
// falls back to dynamic rendering — defeating the point. Signed-
// in users are redirected to /dashboard by proxy.ts before they
// ever hit this handler, so runtime auth() is never called.
export const dynamic = "force-static";
export const revalidate = 600;

export default async function HomePage() {
  const sampleData = await getSampleVisibilityData();

  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />

      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-card/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between h-16 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#111827] shadow-sm">
              <svg width="14" height="14" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="7" y1="11" x2="25" y2="11" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="7" y1="16" x2="21" y2="16" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
                <line x1="7" y1="21" x2="17" y2="21" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
              </svg>
            </div>
            <span className="text-[15px] font-semibold tracking-tight">aiSaysWhat</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-5">
            {/* Pricing link kept on mobile too — users shouldn't have to
                scroll the full page just to find plan details. Dropped
                gap-3 on mobile keeps it readable alongside Sign in /
                Sign up without overflowing a 375 px viewport. */}
            <Link href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="/sign-in" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="text-sm font-medium px-3 sm:px-4 py-1.5 rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors"
            >
              Sign up
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero + platform strip wrapper — fills the remaining viewport
          (100vh minus nav h-16) so the hero block dominates the first
          fold and the platform strip pins to the bottom of the
          viewport, with the live-example section just barely peeking
          below to invite scroll. flex-col + justify-center on the
          hero centers its content vertically within the grown space. */}
      <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      {/* Hero + free dashboard — compressed so the brand-name input
          sits above the fold on a typical laptop viewport.  Previous
          layout (pt-8 sm:pt-12, text-3xl sm:text-5xl, mt-8) pushed the
          input ~100-150 px lower, which meant first-time visitors
          scrolled past a wall of headline before seeing there was
          anything to do. */}
      <section id="top" className="flex-1 flex flex-col justify-center max-w-5xl w-full mx-auto px-4 sm:px-6 pt-6 sm:pt-10 pb-6 sm:pb-10">
        <div className="max-w-2xl mx-auto sm:text-center">
          {/* Prominent "free, no signup" pill above the H1 so first-time
              visitors can't miss the entry bar's no-friction mode. Mobile
              gets a short-form variant so the pill doesn't push past the
              viewport width on a 375-390 px screen. */}
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            <span className="hidden sm:inline">Free to use the basic version — no sign-up required</span>
            <span className="sm:hidden">Free — no sign-up required</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground leading-tight">
            See what AI is saying about your brand.
          </h1>
          <div className="mt-5 sm:mt-10">
            <FreeDashboard
              showSignupCta={FREE_TIER_CONFIG.showSignupCta}
              promptCount={FREE_TIER_CONFIG.promptCount}
              models={FREE_TIER_CONFIG.models}
              exampleBrands={FREE_TIER_CONFIG.exampleBrands}
            />
          </div>
          {/* Scroll affordance — now a link (was a paragraph) and
              higher contrast (muted-foreground vs /70) so visitors
              actually notice it and realize they can jump to the
              demo chart below. */}
          <a
            href="#live-example"
            className="mt-8 inline-flex items-center gap-1.5 text-sm sm:text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span aria-hidden="true">↓</span>
            See a live example
          </a>
        </div>
      </section>

      {/* Platform strip — branded SVG marks (vs. text + middle-dots)
          read as recognized integrations, not placeholder copy.
          Eyebrow label dropped: the logos are self-explanatory. */}
      <section className="border-t border-border/40 bg-muted/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-7">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <OpenAIIcon className="h-4 w-4" />
              ChatGPT
            </span>
            <span className="inline-flex items-center gap-2">
              <GeminiIcon className="h-4 w-4" />
              Gemini
            </span>
            <span className="inline-flex items-center gap-2">
              <AnthropicIcon className="h-4 w-4" />
              Claude
            </span>
            <span className="inline-flex items-center gap-2">
              <PerplexityIcon className="h-4 w-4" />
              Perplexity
            </span>
            <span className="inline-flex items-center gap-2">
              <GoogleIcon className="h-4 w-4" />
              Google AI Overviews
            </span>
          </div>
        </div>
      </section>
      </div>

      {/* Sample dashboard preview — real trend data for the example brand
          so visitors see what a live report actually looks like. Hidden
          if no brand has data yet (fresh deploy). Titled so the chart
          reads as a narrative example, not a floating UI artifact. */}
      {sampleData && (
        <section id="live-example" className="border-t border-border/40 bg-muted/30 scroll-mt-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-12 sm:pb-16 pt-12 sm:pt-16">
            <div className="mb-6 max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Live example
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-2">
                Here&apos;s what a report looks like
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {sampleData.brandName}&apos;s mention rate over 90 days — how often AI platforms bring the brand up in{" "}
                {sampleData.industry || "industry"} questions, and how that share is moving.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
              <div className="p-6 sm:p-8">
                <LazyLandingDashboard
                  brandName={sampleData.brandName}
                  industry={sampleData.industry}
                  trend={sampleData.trend}
                />
              </div>
            </div>
            {/* Capture momentum: someone who just read the chart is
                peak-convinced — give them a one-click return to the
                hero input instead of making them scroll back. */}
            <div className="mt-5 text-center">
              {/* Button-style treatment on mobile (easy thumb target)
                  degrades to the plain text link at sm+ where the
                  surrounding whitespace already makes the link
                  obvious. */}
              <a
                href="#top"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-foreground/70 transition-colors px-4 py-2 rounded-full bg-card border border-border sm:px-0 sm:py-0 sm:rounded-none sm:bg-transparent sm:border-0"
              >
                <span aria-hidden="true">↑</span>
                Try it with your own brand
              </a>
            </div>
          </div>
        </section>
      )}

      {/* Pricing */}
      <section id="pricing" className="border-t border-border/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Plans
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-3">
            Pricing
          </h2>
          <p className="text-muted-foreground mb-8">
            Same data, three ways to get it.
          </p>
          <div className="grid sm:grid-cols-3 gap-6 max-w-3xl sm:items-stretch">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-lg border p-5 flex flex-col ${
                  tier.highlighted
                    ? "border-foreground bg-card shadow-xl ring-2 ring-foreground/10 sm:scale-[1.03] sm:z-10"
                    : "border-border/60 bg-card"
                }`}
              >
                {tier.highlighted && (
                  // Badge sits half-outside the card so it reads as a
                  // ribbon regardless of the surrounding grid gap.
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-foreground px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-background shadow">
                    Most popular
                  </span>
                )}
                <h3 className="text-sm font-semibold text-foreground">{tier.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">{tier.price}</span>
                  {tier.period && <span className="text-sm text-muted-foreground">{tier.period}</span>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{tier.description}</p>
                <ul className="mt-5 space-y-2 flex-1">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={tier.cta === "Contact us" ? "mailto:support@aisayswhat.com" : "/sign-up"}
                  className={`mt-6 inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    tier.highlighted
                      ? "bg-foreground text-background hover:bg-foreground/90"
                      : "border border-border text-foreground hover:bg-muted/50"
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border/40 bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Why use it
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-3">
            What you get
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md">
            Built for marketing, comms, and brand teams that need to know how AI is shaping how customers find and perceive their brand.
          </p>
          {/* Feature tiles — framed in subtle cards with colored icon
              chips instead of the thin side-by-side layout that was
              blending into the page background. The card treatment
              makes each benefit scan as a distinct, hoverable unit. */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="rounded-xl border border-border/60 bg-card p-5 transition-colors hover:border-border"
                >
                  <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-50 text-blue-600 mb-3">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground mb-1.5">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ — placed between Pricing and the final CTA so evaluators
          who read the tiers can resolve lingering "how does this
          actually work / can I trust it" questions before the close.
          Native <details>/<summary> accordion keeps the section a
          server component and skips any JS state overhead. */}
      <section id="faq" className="border-t border-border/40 bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Questions
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-8">
            Common questions
          </h2>
          {/* Card-framed FAQ items instead of a flat divide-y list —
              gives each question a clear hit target, hover signal,
              and enough visual separation to be scannable at a
              glance. Still native <details>/<summary> so the section
              stays a pure server component. */}
          <div className="max-w-3xl space-y-2">
            {FAQS.map((item) => (
              <details
                key={item.q}
                open={item.q.startsWith("What's the difference")}
                className="group rounded-lg border border-border/60 bg-card px-5 py-4 transition-colors hover:border-border open:border-border"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-6 text-sm font-semibold text-foreground list-none [&::-webkit-details-marker]:hidden">
                  <span>{item.q}</span>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-2xl">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
          <p className="mt-8 text-sm text-muted-foreground">
            Have a different question?{" "}
            <a
              href="mailto:support@aisayswhat.com"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Email support →
            </a>
          </p>
        </div>
      </section>

      {/* Bottom CTA — centered + bulked up. This is the last gravity
          well on the page; the old left-aligned small button read as
          an afterthought. */}
      <section className="border-t border-border/40 bg-gradient-to-b from-background to-muted/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground max-w-2xl mx-auto leading-[1.15]">
            Your brand is already part of the AI conversation.
            <br className="hidden sm:block" />
            <span className="text-muted-foreground">Find out how AI is framing your story.</span>
          </h2>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center gap-2 h-12 px-8 text-base font-medium rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors shadow-md"
            >
              Use it free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-xs text-muted-foreground">
              Free · No credit card · 30-second report
            </span>
          </div>
        </div>
      </section>

      {/* Footer — adds Privacy + Terms links for compliance (GDPR
          and app-store-equivalents expect them accessible from
          every page). */}
      <footer className="border-t border-border/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">aiSaysWhat</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-muted-foreground/50">
            <Link href="/marketing" className="hover:text-muted-foreground transition-colors">About</Link>
            <Link href="/privacy" className="hover:text-muted-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-muted-foreground transition-colors">Terms</Link>
            <a href="mailto:support@aisayswhat.com" className="hover:text-muted-foreground transition-colors">Support</a>
            <span>&copy; {new Date().getFullYear()} BrooklyEcho LLC</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
