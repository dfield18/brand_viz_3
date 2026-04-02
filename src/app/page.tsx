import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GET as getVisibility } from "@/app/api/visibility/route";
import { NextRequest } from "next/server";
import { LandingDashboard } from "@/components/landing/LandingDashboard";
import type { VisibilityTrendPoint } from "@/types/api";

const FEATURES = [
  {
    title: "Brand Recall",
    description: "When voters ask AI about your policy area, how often does your organization come up?",
  },
  {
    title: "Sentiment & Narrative",
    description: "What stories is AI telling about you? Positive, negative, or somewhere in between?",
  },
  {
    title: "Competitive Share",
    description: "Who does AI recommend instead of you? Track share of voice shifts over time.",
  },
  {
    title: "Source Attribution",
    description: "Which websites does AI cite when talking about your brand? Are they yours?",
  },
  {
    title: "Platform Comparison",
    description: "ChatGPT and Gemini can tell very different stories. See the breakdown by model.",
  },
  {
    title: "Weekly Reports",
    description: "KPI snapshots, competitor alerts, and missed opportunities — delivered to your inbox.",
  },
];

const PRICING_TIERS = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "Try it out on one brand",
    features: ["1 brand", "Weekly snapshots", "5 AI platforms", "Core dashboard"],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/mo",
    description: "For teams managing brand reputation",
    features: ["5 brands", "Daily snapshots", "5 AI platforms", "Full analytics", "Email reports", "CSV exports"],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For organizations at scale",
    features: ["Unlimited brands", "Custom prompts", "API access", "Dedicated support", "SSO"],
    cta: "Contact Us",
    highlighted: false,
  },
];

// ---------------------------------------------------------------------------
// Fetch real visibility trend from the API for a sample brand
// ---------------------------------------------------------------------------

async function getSampleVisibilityData(): Promise<{
  brandName: string;
  trend: VisibilityTrendPoint[];
} | null> {
  try {
    // Find a brand with data (prefer ACLU, fall back to oldest brand)
    let brand = await prisma.brand.findFirst({
      where: { slug: "aclu", jobs: { some: { finishedAt: { not: null } } } },
      select: { slug: true, name: true, displayName: true },
    });
    if (!brand) {
      brand = await prisma.brand.findFirst({
        where: { jobs: { some: { finishedAt: { not: null } } } },
        orderBy: { createdAt: "asc" },
        select: { slug: true, name: true, displayName: true },
      });
    }
    if (!brand) return null;

    // Call the visibility API handler directly
    const url = new URL(
      `/api/visibility?brandSlug=${encodeURIComponent(brand.slug)}&model=all&range=90`,
      "http://localhost:3000",
    );
    const req = new NextRequest(url);
    const res = await getVisibility(req);
    if (!res.ok) return null;

    const json = await res.json();
    const trend: VisibilityTrendPoint[] = json?.visibility?.trend ?? [];
    if (trend.length < 3) return null;

    return {
      brandName: brand.displayName || brand.name,
      trend,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  const visData = await getSampleVisibilityData();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-card/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between h-16 px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#111827] shadow-sm">
              <svg width="14" height="14" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 13l9 6 9-6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </div>
            <span className="text-[15px] font-semibold tracking-tight">Visibility</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="text-sm font-medium px-4 py-1.5 rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-14 sm:pt-20 pb-12">
        <div className="max-w-2xl">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground leading-[1.15]">
            Millions of users ask AI about policy issues every day.
            <br />
            <span className="text-muted-foreground">Is AI telling your organization&apos;s story — or someone else&apos;s?</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-lg">
            Visibility monitors how ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews describe your organization and the issues you champion.
          </p>
          <div className="mt-8">
            <Link
              href="/sign-up"
              className="inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors"
            >
              Try it free
            </Link>
          </div>
        </div>
      </section>

      {/* Dashboard preview — real component or static fallback */}
      <section className="max-w-5xl mx-auto px-6 pb-14">
        <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
          <div className="p-6 sm:p-8">
            {visData ? (
              <LandingDashboard brandName={visData.brandName} trend={visData.trend} />
            ) : (
              <div className="rounded-lg border border-border/80 bg-background p-5">
                <p className="text-sm font-medium text-foreground mb-5">Brand Recall Over Time</p>
                <svg viewBox="0 0 600 100" className="w-full h-auto" preserveAspectRatio="none">
                  <path d="M0,70 C80,68 140,55 200,48 C260,42 320,38 380,30 C440,25 500,22 560,24 L600,20" fill="none" stroke="hsl(160, 60%, 45%)" strokeWidth="2" />
                  <path d="M0,80 C80,76 140,70 200,62 C260,56 320,48 380,44 C440,40 500,38 560,40 L600,36" fill="none" stroke="hsl(199, 89%, 48%)" strokeWidth="2" />
                  <path d="M0,85 C80,82 140,78 200,72 C260,67 320,60 380,56 C440,52 500,50 560,52 L600,48" fill="none" stroke="hsl(24, 95%, 53%)" strokeWidth="2" />
                </svg>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border/40">
        <div className="max-w-5xl mx-auto px-6 py-12 sm:py-16">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-3">
            What you get
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md">
            Built for advocacy organizations and campaigns that need to know how AI is shaping their public narrative.
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

      {/* How it works */}
      <section className="border-t border-border/40">
        <div className="max-w-5xl mx-auto px-6 py-12 sm:py-16">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-8">
            How it works
          </h2>
          <div className="grid sm:grid-cols-3 gap-10">
            {[
              { title: "Add your brand", description: "Type in a name. We figure out the right prompts to ask each AI model about your industry." },
              { title: "We ask the AI", description: "Real questions sent to real models \u2014 the same way your customers use them." },
              { title: "See what comes back", description: "Brand recall, sentiment, competitor share, source citations. Updated on a schedule you pick." },
            ].map((item) => (
              <div key={item.title}>
                <h3 className="text-sm font-semibold text-foreground mb-1.5">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-border/40">
        <div className="max-w-5xl mx-auto px-6 py-12 sm:py-16">
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
                  href="/sign-up"
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

      {/* Bottom CTA */}
      <section className="border-t border-border/40">
        <div className="max-w-5xl mx-auto px-6 py-12 sm:py-16">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground max-w-lg">
            Your brand is already part of the AI conversation. Find out what it&apos;s saying.
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
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#111827]">
              <svg width="10" height="10" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 13l9 6 9-6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </div>
            <span className="text-xs text-muted-foreground">Visibility</span>
          </div>
          <p className="text-xs text-muted-foreground/50">
            &copy; {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}
