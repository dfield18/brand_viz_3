import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SampleChart, TrendPoint } from "@/components/landing/SampleChart";

const FEATURES = [
  {
    title: "Brand Recall",
    description: "How often does AI mention you when someone asks about your industry?",
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
// Sample trend data — fetched from DB, cached per request
// ---------------------------------------------------------------------------

async function getSampleTrendData(): Promise<{
  brandName: string;
  points: TrendPoint[];
  scorecard: { brandRecall: number; shareOfVoice: number; topResultRate: number };
} | null> {
  try {
    // Pick the brand with the most completed jobs
    const brand = await prisma.brand.findFirst({
      where: { jobs: { some: { finishedAt: { not: null } } } },
      orderBy: { createdAt: "asc" },
      select: { id: true, slug: true, name: true, displayName: true, aliases: true },
    });
    if (!brand) return null;

    const cutoff = new Date(Date.now() - 90 * 86_400_000);

    const runs = await prisma.run.findMany({
      where: {
        brandId: brand.id,
        createdAt: { gte: cutoff },
        prompt: { cluster: "industry" },
      },
      select: {
        id: true,
        model: true,
        promptId: true,
        createdAt: true,
        analysisJson: true,
      },
      orderBy: { createdAt: "desc" },
      take: 3000,
    });

    if (runs.length < 10) return null;

    // Dedup: latest per model+promptId
    const seen = new Set<string>();
    const deduped = runs.filter((r) => {
      const key = `${r.model}|${r.promptId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const runIds = deduped.map((r) => r.id);

    // Brand entity name variants
    const brandNames = [
      brand.slug.toLowerCase(),
      brand.name.toLowerCase(),
      ...(brand.aliases ?? []).map((a) => a.toLowerCase()),
    ];

    // Brand rank metrics
    const brandMetrics = await prisma.entityResponseMetric.findMany({
      where: { runId: { in: runIds }, entityId: { in: brandNames } },
      select: { runId: true, rankPosition: true, frequencyScore: true },
    });
    const brandMetricMap = new Map(
      brandMetrics.map((m) => [m.runId, { rank: m.rankPosition, freq: m.frequencyScore ?? 1 }]),
    );

    // Total entity frequency per run (for SoV denominator)
    const totalFreqs = await prisma.entityResponseMetric.groupBy({
      by: ["runId"],
      where: { runId: { in: runIds } },
      _sum: { frequencyScore: true },
    });
    const totalFreqMap = new Map(totalFreqs.map((e) => [e.runId, e._sum?.frequencyScore ?? 0]));

    // Accumulate by date + model
    type Bucket = {
      total: number;
      mentioned: number;
      rank1: number;
      brandFreq: number;
      totalFreq: number;
    };
    const buckets = new Map<string, Bucket>();

    for (const run of deduped) {
      const date = run.createdAt.toISOString().slice(0, 10);
      const key = `${date}|${run.model}`;
      const b = buckets.get(key) ?? { total: 0, mentioned: 0, rank1: 0, brandFreq: 0, totalFreq: 0 };
      b.total++;

      const analysis = run.analysisJson as { brandMentioned?: boolean } | null;
      if (analysis?.brandMentioned) b.mentioned++;

      const bm = brandMetricMap.get(run.id);
      if (bm?.rank === 1) b.rank1++;
      b.brandFreq += bm?.freq ?? 0;
      b.totalFreq += totalFreqMap.get(run.id) ?? 0;

      buckets.set(key, b);
    }

    // Build trend points (skip dates with < 2 runs per model)
    const points: TrendPoint[] = [];
    for (const [key, b] of buckets) {
      if (b.total < 2) continue;
      const [date, model] = key.split("|");
      points.push({
        date,
        model,
        brandRecall: Math.round((b.mentioned / b.total) * 100),
        shareOfVoice: b.totalFreq > 0 ? Math.round((b.brandFreq / b.totalFreq) * 100) : 0,
        topResultRate: Math.round((b.rank1 / b.total) * 100),
      });
    }

    if (points.length < 3) return null;

    // Scorecard: average of latest date across models
    const sortedPoints = points.sort((a, b) => a.date.localeCompare(b.date));
    const latestDate = sortedPoints[sortedPoints.length - 1].date;
    const latestPoints = sortedPoints.filter((p) => p.date === latestDate);
    const avg = (arr: number[]) => (arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0);

    return {
      brandName: brand.displayName || brand.name,
      points: sortedPoints,
      scorecard: {
        brandRecall: avg(latestPoints.map((p) => p.brandRecall)),
        shareOfVoice: avg(latestPoints.map((p) => p.shareOfVoice)),
        topResultRate: avg(latestPoints.map((p) => p.topResultRate)),
      },
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

  const trendData = await getSampleTrendData();

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-card/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between h-16 px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-blue-700 shadow-sm">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 2L3 5v6l5 3 5-3V5L8 2z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
                <circle cx="8" cy="8" r="2" fill="white" />
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
      <section className="max-w-5xl mx-auto px-6 pt-20 sm:pt-28 pb-20">
        <div className="max-w-2xl">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground leading-[1.15]">
            ChatGPT is recommending your competitors.
            <br />
            <span className="text-muted-foreground">Is it recommending you?</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-lg">
            Visibility tracks what AI platforms say about your brand across ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews.
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

      {/* Dashboard preview — real data or static fallback */}
      <section className="max-w-5xl mx-auto px-6 pb-28">
        <div className="rounded-xl border border-border bg-card shadow-lg overflow-hidden">
          <div className="p-6 sm:p-10">
            {trendData ? (
              <SampleChart
                brandName={trendData.brandName}
                points={trendData.points}
                scorecard={trendData.scorecard}
              />
            ) : (
              /* Static fallback when no DB data */
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                  {[
                    { label: "Brand Recall", value: "73%" },
                    { label: "Share of Voice", value: "18%" },
                    { label: "Top Result Rate", value: "31%" },
                  ].map((kpi) => (
                    <div key={kpi.label} className="rounded-lg border border-border/80 bg-background px-4 py-3">
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
                      <p className="mt-1.5 text-xl font-bold text-foreground">{kpi.value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-border/80 bg-background p-5">
                  <p className="text-sm font-medium text-foreground mb-5">Brand Recall Over Time</p>
                  <svg viewBox="0 0 600 100" className="w-full h-auto" preserveAspectRatio="none">
                    <path d="M0,70 C80,68 140,55 200,48 C260,42 320,38 380,30 C440,25 500,22 560,24 L600,20" fill="none" stroke="hsl(160, 60%, 45%)" strokeWidth="2" />
                    <path d="M0,80 C80,76 140,70 200,62 C260,56 320,48 380,44 C440,40 500,38 560,40 L600,36" fill="none" stroke="hsl(199, 89%, 48%)" strokeWidth="2" />
                    <path d="M0,85 C80,82 140,78 200,72 C260,67 320,60 380,56 C440,52 500,50 560,52 L600,48" fill="none" stroke="hsl(24, 95%, 53%)" strokeWidth="2" />
                  </svg>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border/40">
        <div className="max-w-5xl mx-auto px-6 py-20 sm:py-28">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-4">
            What you get
          </h2>
          <p className="text-muted-foreground mb-12 max-w-md">
            A dashboard built for one question: how does AI represent your brand?
          </p>
          <div className="grid sm:grid-cols-2 gap-x-16 gap-y-10">
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
        <div className="max-w-5xl mx-auto px-6 py-20 sm:py-28">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-12">
            How it works
          </h2>
          <div className="grid sm:grid-cols-3 gap-12">
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
        <div className="max-w-5xl mx-auto px-6 py-20 sm:py-28">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-4">
            Pricing
          </h2>
          <p className="text-muted-foreground mb-12">
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
        <div className="max-w-5xl mx-auto px-6 py-20 sm:py-28">
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
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-primary to-blue-700">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 2L3 5v6l5 3 5-3V5L8 2z" stroke="white" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
                <circle cx="8" cy="8" r="2" fill="white" />
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
