import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/hash";
import { GET as getVisibility } from "@/app/api/visibility/route";
import { FreeDashboard } from "@/components/free/FreeDashboard";
import { LandingDashboard } from "@/components/landing/LandingDashboard";
import { FREE_TIER_CONFIG } from "@/config/freeTier";
import type { VisibilityTrendPoint } from "@/types/api";
import {
  ArrowRight,
  BarChart3,
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

const PRICING_TIERS = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "Run a report — no sign-up required",
    features: [
      "10 searches per day",
      "ChatGPT + Gemini",
      "Visibility, sentiment, competitors, sources",
      "90-day trend — 3 points, historical estimated",
    ],
    cta: "Use It Free",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/mo",
    description: "For marketing teams tracking brands over time",
    features: [
      "5 brands tracked automatically",
      "All 5 AI platforms",
      "90-day trend — weekly snapshots, all real",
      "Email reports + CSV exports",
      "Custom prompts",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For multi-brand companies and agencies",
    features: ["Unlimited brands", "Custom prompts", "API access", "Dedicated support", "SSO"],
    cta: "Contact Us",
    highlighted: false,
  },
];

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "aiSaysWhat",
      url: "https://aisayswhat.com",
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
      url: "https://aisayswhat.com",
      email: "support@aisayswhat.com",
      description: "AI brand visibility for companies and marketing teams.",
    },
  ],
};

/**
 * Fetch a sample visibility trend for the "dashboard preview" embed below
 * How it works. Prefer Nike in the free-tier deterministic cache form
 * (`nike--<sha256("nike").slice(0,8)>`) or the Pro form (`nike`). Fall
 * back to any other brand with data so the section still renders on
 * fresh deploys. Returns null if nothing is available — caller hides
 * the section entirely.
 */
async function getSampleVisibilityData(): Promise<{
  brandName: string;
  industry: string | null;
  trend: VisibilityTrendPoint[];
} | null> {
  try {
    const nikeCacheSlug = `nike--${sha256("nike").slice(0, 8)}`;
    let brand = await prisma.brand.findFirst({
      where: {
        slug: { in: [nikeCacheSlug, "nike"] },
        jobs: { some: { finishedAt: { not: null } } },
      },
      orderBy: { createdAt: "desc" },
      select: { slug: true, name: true, displayName: true, industry: true },
    });
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

export default async function HomePage() {
  // Signed-in users skip the free dashboard and go straight to their Pro dashboard.
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

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
            {/* Marketing links eat horizontal room on narrow phones — drop
                them on mobile; Sign in + Sign up keep the primary CTAs. */}
            <Link href="/marketing#pricing" className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground transition-colors">
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

      {/* Hero + free dashboard — compressed so the brand-name input
          sits above the fold on a typical laptop viewport.  Previous
          layout (pt-8 sm:pt-12, text-3xl sm:text-5xl, mt-8) pushed the
          input ~100-150 px lower, which meant first-time visitors
          scrolled past a wall of headline before seeing there was
          anything to do. */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-4 sm:pb-4">
        <div className="max-w-2xl">
          {/* Prominent "free, no signup" pill above the H1 so first-time
              visitors can't miss the entry bar's no-friction mode. */}
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Free to use the basic version — no sign-up required
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground leading-[1.1]">
            AI is shaping how people discover your brand.
            <br />
            <span className="text-muted-foreground">Do you know what it&apos;s saying?</span>
          </h1>
          <div className="mt-10 sm:mt-12">
            <FreeDashboard
              showSignupCta={FREE_TIER_CONFIG.showSignupCta}
              promptCount={FREE_TIER_CONFIG.promptCount}
              models={FREE_TIER_CONFIG.models}
              exampleBrands={FREE_TIER_CONFIG.exampleBrands}
            />
          </div>
          {/* Scroll affordance — sits just below the examples row
              inside FreeDashboard, not crowding the input itself. */}
          <p className="mt-8 text-xs text-muted-foreground/70 flex items-center gap-1.5">
            <span aria-hidden="true">↓</span>
            Scroll to see what a real report looks like
          </p>
        </div>
      </section>

      {/* Platform strip — promotes the "we cover all 5 major AI
          surfaces" message from its old orphaned spot at the end of
          pricing up to the hero region, where it acts as implicit
          social proof. Text-only for now; swap in real logos later. */}
      <section className="border-t border-border/40 bg-muted/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Monitors your brand across
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm font-medium text-muted-foreground">
            <span>ChatGPT</span>
            <span className="text-muted-foreground/30">·</span>
            <span>Gemini</span>
            <span className="text-muted-foreground/30">·</span>
            <span>Claude</span>
            <span className="text-muted-foreground/30">·</span>
            <span>Perplexity</span>
            <span className="text-muted-foreground/30">·</span>
            <span>Google AI Overviews</span>
          </div>
        </div>
      </section>

      {/* How it works — numbered steps so the flow is scannable in 2 s
          instead of reading three paragraphs. */}
      <section className="border-t border-border/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-8">
            How it works
          </h2>
          <div className="grid sm:grid-cols-3 gap-10">
            {[
              { title: "Add your brand", description: "Enter your brand name. We generate targeted questions about your category for each AI platform." },
              { title: "We ask the AI", description: "Real questions sent to real models \u2014 the same way customers and prospects use them." },
              { title: "See what comes back", description: "Visibility scores, sentiment analysis, competitor tracking, and source citations. Updated on your schedule." },
            ].map((item, i) => (
              <div key={item.title} className="relative">
                <div className="flex items-center justify-center h-9 w-9 rounded-full bg-foreground text-background text-sm font-semibold tabular-nums mb-4">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="text-base font-semibold text-foreground mb-1.5">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sample dashboard preview — real trend data for the example brand
          so visitors see what a live report actually looks like. Hidden
          if no brand has data yet (fresh deploy). Titled so the chart
          reads as a narrative example, not a floating UI artifact. */}
      {sampleData && (
        <section className="border-t border-border/40 bg-muted/30">
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
                <LandingDashboard
                  brandName={sampleData.brandName}
                  industry={sampleData.industry}
                  trend={sampleData.trend}
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section id="features" className="border-t border-border/40 bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-3">
            What you get
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md">
            Built for marketing, comms, and brand teams that need to know how AI is shaping how customers find and perceive their brand.
          </p>
          <div className="grid sm:grid-cols-2 gap-x-14 gap-y-8">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="flex gap-4">
                  <div className="flex items-center justify-center h-9 w-9 shrink-0 rounded-lg bg-foreground/5 text-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-1.5">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-border/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-3">
            Pricing
          </h2>
          <p className="text-muted-foreground mb-8">
            Start free. No credit card required.
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
                    <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="text-foreground/30">&middot;</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href={tier.cta === "Contact Us" ? "mailto:support@aisayswhat.com" : "/sign-up"}
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
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center gap-2 h-12 px-8 text-base font-medium rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors shadow-md"
            >
              Use it free
              <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-xs text-muted-foreground">
              No credit card, no email.
            </span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">aiSaysWhat</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-muted-foreground/50">
            <Link href="/marketing" className="hover:text-muted-foreground transition-colors">About</Link>
            <a href="mailto:support@aisayswhat.com" className="hover:text-muted-foreground transition-colors">Support</a>
            <span>&copy; {new Date().getFullYear()} BrooklyEcho LLC</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
