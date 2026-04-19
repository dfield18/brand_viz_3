import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { FreeDashboard } from "@/components/free/FreeDashboard";
import { FREE_TIER_CONFIG } from "@/config/freeTier";

export const metadata: Metadata = {
  title: {
    absolute: "aiSaysWhat — See what AI is saying about your brand",
  },
  description:
    "Free AI brand visibility check. Enter your brand and category — see how ChatGPT and Gemini describe you, which competitors come up, and how often your brand appears. No sign-up required.",
  alternates: { canonical: "/" },
};

const FEATURES = [
  {
    title: "Brand Recall",
    description: "When customers ask AI about your category, how often does your brand come up?",
  },
  {
    title: "Sentiment & Narrative",
    description: "Is AI framing your brand positively or negatively? What story is it telling about your products?",
  },
  {
    title: "Competitive Share",
    description: "When AI discusses your category, which brands does it highlight? Track how your share of the conversation shifts over time.",
  },
  {
    title: "Source Attribution",
    description: "Which websites does AI cite when discussing your industry? Are they your properties — or your competitors'?",
  },
  {
    title: "Platform Comparison",
    description: "ChatGPT and Gemini can frame your brand very differently. See which platforms help or hurt your positioning.",
  },
  {
    title: "Weekly Reports",
    description: "Automated reports with visibility scores, competitor alerts, and narrative shifts — delivered to your inbox.",
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
    cta: "Try It Free",
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

export default async function HomePage() {
  // Signed-in users skip the free dashboard and go straight to their Pro dashboard.
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

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
                them on mobile; Sign in + Get Started keep the primary CTAs. */}
            <Link href="/marketing" className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground transition-colors">
              Why us
            </Link>
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

      {/* Hero + free dashboard — one section so spacing stays tight */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-10">
        <div className="max-w-2xl">
          {/* Prominent "free, no signup" pill above the H1 so first-time
              visitors can't miss the entry bar's no-friction mode. */}
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            Free to try — no sign-up required
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground leading-[1.15]">
            AI is shaping how people discover your brand.
            <br />
            <span className="text-muted-foreground">Do you know what it&apos;s saying?</span>
          </h1>
          <div className="mt-8">
            <FreeDashboard
              showSignupCta={FREE_TIER_CONFIG.showSignupCta}
              promptCount={FREE_TIER_CONFIG.promptCount}
              models={FREE_TIER_CONFIG.models}
              exampleBrands={FREE_TIER_CONFIG.exampleBrands}
            />
          </div>
        </div>
      </section>

      {/* How it works — shown first so visitors understand the product before seeing prices */}
      <section className="border-t border-border/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-8">
            How it works
          </h2>
          <div className="grid sm:grid-cols-3 gap-10">
            {[
              { title: "Add your brand", description: "Enter your brand name. We generate targeted questions about your category for each AI platform." },
              { title: "We ask the AI", description: "Real questions sent to real models \u2014 the same way customers and prospects use them." },
              { title: "See what comes back", description: "Visibility scores, sentiment analysis, competitor tracking, and source citations. Updated on your schedule." },
            ].map((item) => (
              <div key={item.title}>
                <h3 className="text-sm font-semibold text-foreground mb-1.5">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-3">
            What you get
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md">
            Built for marketing, comms, and brand teams that need to know how AI is shaping how customers find and perceive their brand.
          </p>
          <div className="grid sm:grid-cols-2 gap-x-14 gap-y-6">
            {FEATURES.map((feature) => (
              <div key={feature.title}>
                <h3 className="text-sm font-semibold text-foreground mb-1.5">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
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
          <div className="grid sm:grid-cols-3 gap-6 max-w-3xl">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`rounded-lg border p-5 flex flex-col ${
                  tier.highlighted
                    ? "border-foreground/20 bg-card shadow-md"
                    : "border-border/60 bg-card"
                }`}
              >
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
          <p className="mt-12 text-lg text-muted-foreground leading-relaxed max-w-lg">
            aiSaysWhat monitors how ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews describe your brand.
          </p>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-border/40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground max-w-lg">
            Your brand is already part of the AI conversation. Find out how AI is framing your story.
          </h2>
          <div className="mt-6">
            <Link
              href="/sign-up"
              className="inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors"
            >
              Try it free
            </Link>
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
