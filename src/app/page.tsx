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
        <div className="max-w-3xl mx-auto flex items-center justify-between h-16 px-6">
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
          <div className="flex items-center gap-5">
            <Link href="/marketing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Why us
            </Link>
            <Link href="/marketing#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
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

      {/* Free dashboard */}
      <section className="max-w-3xl mx-auto px-6 pt-12 sm:pt-16 pb-16">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-[1.15]">
            See what AI is saying about your brand.
          </h1>
          <p className="mt-4 text-base text-muted-foreground leading-relaxed max-w-2xl">
            Free. No sign-up needed. Enter your brand and category — we&apos;ll ask ChatGPT and Gemini the questions your customers are really asking and show you how often your brand comes up, who your AI-world competitors are, and how you&apos;re framed.
          </p>
        </div>

        <FreeDashboard
          showSignupCta={FREE_TIER_CONFIG.showSignupCta}
          promptCount={FREE_TIER_CONFIG.promptCount}
          models={FREE_TIER_CONFIG.models}
        />
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">aiSaysWhat</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground/50">
            <Link href="/marketing" className="hover:text-muted-foreground transition-colors">About</Link>
            <a href="mailto:support@aisayswhat.com" className="hover:text-muted-foreground transition-colors">Support</a>
            <span>&copy; {new Date().getFullYear()} BrooklyEcho LLC</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
