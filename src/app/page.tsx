import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const PLATFORMS = ["ChatGPT", "Gemini", "Claude", "Perplexity", "Google AI Overview"];

const FEATURES = [
  {
    title: "Brand Recall & Visibility",
    description: "See how often AI models mention your brand when users ask about your industry. Track your share of voice against competitors.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    title: "Narrative & Sentiment",
    description: "Understand the stories AI tells about your brand. Are they positive, neutral, or negative? What themes and frames dominate?",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    title: "Competitive Landscape",
    description: "See who else AI recommends when users ask about your space. Track competitor movements, win/loss trends, and share shifts.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    title: "Source Citations",
    description: "Discover which websites AI models cite when discussing your brand. Find opportunities to influence the sources AI relies on.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
  {
    title: "Cross-Platform Comparison",
    description: "Every AI platform tells a different story. Compare how ChatGPT, Gemini, Claude, Perplexity, and Google AIO represent you.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    title: "Automated Reports",
    description: "Get weekly or monthly email reports with KPI snapshots, competitor alerts, and opportunity prompts delivered to your inbox.",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
];

const PRICING_TIERS = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    description: "For individuals exploring AI visibility",
    features: ["1 brand", "Weekly snapshots", "5 AI platforms", "Basic dashboard"],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$49",
    period: "/mo",
    description: "For teams managing brand reputation",
    features: ["5 brands", "Daily snapshots", "5 AI platforms", "Full analytics suite", "Email reports", "CSV exports"],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For organizations with advanced needs",
    features: ["Unlimited brands", "Custom prompts", "API access", "Dedicated support", "SSO", "Custom integrations"],
    cta: "Contact Us",
    highlighted: false,
  },
];

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-card/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-16 px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-blue-700 shadow-sm">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 2L3 5v6l5 3 5-3V5L8 2z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
                <circle cx="8" cy="8" r="2" fill="white" />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight">Visibility</span>
          </div>
          <div className="hidden sm:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] to-transparent pointer-events-none" />
        <div className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center relative">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Monitoring 5 AI platforms in real time
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground max-w-3xl mx-auto leading-[1.1]">
            See how AI talks about your brand
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            AI platforms are shaping how millions of people discover brands. Visibility monitors what ChatGPT, Gemini, Claude, and others say about you — so you can manage your reputation in the AI era.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="inline-flex items-center px-6 py-3 text-base font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
            >
              Start Monitoring Free
            </Link>
            <a
              href="#features"
              className="inline-flex items-center px-6 py-3 text-base font-medium rounded-lg border border-border text-foreground hover:bg-muted/50 transition-colors"
            >
              See How It Works
            </a>
          </div>

          {/* Platform logos */}
          <div className="mt-20 flex flex-col items-center gap-4">
            <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-widest">Platforms we monitor</p>
            <div className="flex items-center gap-8 sm:gap-12">
              {PLATFORMS.map((name) => (
                <span key={name} className="text-sm font-medium text-muted-foreground/50">{name}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard preview */}
      <section className="max-w-6xl mx-auto px-6 pb-24">
        <div className="rounded-2xl border border-border/60 bg-card shadow-xl shadow-black/[0.03] overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-border/60 bg-muted/30">
            <span className="w-3 h-3 rounded-full bg-red-400/60" />
            <span className="w-3 h-3 rounded-full bg-yellow-400/60" />
            <span className="w-3 h-3 rounded-full bg-green-400/60" />
            <span className="ml-4 text-xs text-muted-foreground/60 font-mono">app.visibility.ai/entity/acme/overview</span>
          </div>
          <div className="p-8 sm:p-12">
            {/* Mock KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
              {[
                { label: "Brand Recall", value: "73%", delta: "+5%" },
                { label: "Share of Voice", value: "18%", delta: "+2%" },
                { label: "Top Result Rate", value: "31%", delta: "+8%" },
                { label: "Avg Position", value: "#2.4", delta: "-0.3" },
              ].map((kpi) => (
                <div key={kpi.label} className="rounded-xl border border-border/60 bg-background p-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">{kpi.value}</p>
                  <p className="mt-1 text-xs font-medium text-accent">{kpi.delta}</p>
                </div>
              ))}
            </div>
            {/* Mock chart area */}
            <div className="rounded-xl border border-border/60 bg-background p-6">
              <div className="flex items-center justify-between mb-6">
                <p className="text-sm font-semibold text-foreground">Brand Recall Over Time</p>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-primary" /> ChatGPT</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-accent" /> Gemini</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-chart-3" /> Claude</span>
                </div>
              </div>
              {/* Stylized chart lines */}
              <svg viewBox="0 0 600 120" className="w-full h-auto" preserveAspectRatio="none">
                <path d="M0,80 C100,75 150,60 200,55 C250,50 300,45 350,35 C400,30 450,25 500,28 C550,30 600,22 600,20" fill="none" stroke="hsl(217 80% 52%)" strokeWidth="2.5" opacity="0.9" />
                <path d="M0,90 C100,85 150,80 200,70 C250,65 300,55 350,50 C400,48 450,42 500,45 C550,47 600,40 600,38" fill="none" stroke="hsl(160 84% 39%)" strokeWidth="2.5" opacity="0.9" />
                <path d="M0,95 C100,92 150,88 200,82 C250,78 300,70 350,65 C400,60 450,55 500,58 C550,56 600,50 600,48" fill="none" stroke="hsl(239 84% 67%)" strokeWidth="2.5" opacity="0.9" />
              </svg>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-muted/30 border-y border-border/40">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Everything you need to manage your AI presence
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              From brand recall to source citations, get a complete picture of how AI platforms represent your brand.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-xl border border-border/60 bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-base font-semibold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            How it works
          </h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-12 max-w-4xl mx-auto">
          {[
            { step: "1", title: "Add your brand", description: "Enter your brand name. We validate it and generate targeted prompts for each AI platform." },
            { step: "2", title: "We query AI models", description: "Our system sends real questions to ChatGPT, Gemini, Claude, Perplexity, and Google AIO — the same way your customers do." },
            { step: "3", title: "Get actionable insights", description: "See your brand recall, sentiment, competitive positioning, and source citations in a clear dashboard updated regularly." },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground text-lg font-bold mx-auto mb-4">
                {item.step}
              </div>
              <h3 className="text-base font-semibold text-foreground mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-muted/30 border-y border-border/40">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Start free. Upgrade when you need more.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`rounded-xl border p-6 flex flex-col ${
                  tier.highlighted
                    ? "border-primary bg-card shadow-lg shadow-primary/10 ring-1 ring-primary/20"
                    : "border-border/60 bg-card shadow-sm"
                }`}
              >
                <h3 className="text-lg font-semibold text-foreground">{tier.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-foreground">{tier.price}</span>
                  {tier.period && <span className="text-sm text-muted-foreground">{tier.period}</span>}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{tier.description}</p>
                <ul className="mt-6 space-y-3 flex-1">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-foreground">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-accent shrink-0">
                        <path d="M3.5 8.5L6.5 11.5L12.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/sign-up"
                  className={`mt-8 inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                    tier.highlighted
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
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
      <section className="max-w-6xl mx-auto px-6 py-24 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
          Your brand is being discussed by AI right now
        </h2>
        <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
          Find out what millions of AI users are hearing about you.
        </p>
        <Link
          href="/sign-up"
          className="mt-8 inline-flex items-center px-8 py-3.5 text-base font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-md shadow-primary/20"
        >
          Start Monitoring Free
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-card">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-blue-700">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 2L3 5v6l5 3 5-3V5L8 2z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
                <circle cx="8" cy="8" r="2" fill="white" />
              </svg>
            </div>
            <span className="text-sm font-medium text-muted-foreground">Visibility</span>
          </div>
          <p className="text-xs text-muted-foreground/60">
            &copy; {new Date().getFullYear()} Visibility. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
