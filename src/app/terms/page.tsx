import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms under which aiSaysWhat is provided.",
  alternates: { canonical: "/terms" },
};

// Minimal factual summary of the service and its limits. NOT a
// finalized legal document — flagged below. Replace with attorney-
// reviewed terms before relying on this for liability, indemnity,
// or dispute-resolution coverage.
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Legal
      </p>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-2">
        Terms of Service
      </h1>
      <p className="text-xs text-muted-foreground mb-8">Last updated: April 2026</p>

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 mb-8 text-sm text-amber-900">
        <strong className="font-semibold">Draft notice.</strong> This page
        summarizes the service in plain terms. It is not yet a finalized legal
        document. For a formal agreement, email{" "}
        <a
          href="mailto:support@aisayswhat.com"
          className="font-medium underline-offset-2 hover:underline"
        >
          support@aisayswhat.com
        </a>
        .
      </div>

      <h2 className="text-lg font-semibold text-foreground mt-8 mb-2">
        What aiSaysWhat does
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        aiSaysWhat sends queries to third-party AI platforms (ChatGPT, Gemini,
        Claude, Perplexity, and Google AI Overviews) and analyzes the responses
        for brand mentions, sentiment, competitor positioning, and source
        citations. Results reflect what those AI platforms output at query
        time and do not represent guaranteed facts about any brand or person.
      </p>

      <h2 className="text-lg font-semibold text-foreground mt-8 mb-2">
        Acceptable use
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Use of the free tier is subject to per-session rate limits intended to
        prevent abuse. Do not attempt to reverse-engineer, resell, or
        systematically scrape the service. Do not use the product to harass
        individuals or generate reports about private citizens.
      </p>

      <h2 className="text-lg font-semibold text-foreground mt-8 mb-2">
        Accuracy and limitations
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        AI responses can be inaccurate, out of date, or biased. Scores,
        sentiment labels, and competitor detections are statistical summaries —
        not ground truth. Do not rely solely on aiSaysWhat output for legal,
        financial, medical, or safety-critical decisions.
      </p>

      <h2 className="text-lg font-semibold text-foreground mt-8 mb-2">
        Subscription and cancellation
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Pro subscriptions bill monthly via Stripe. You can cancel at any time
        from the Account page; your subscription remains active until the end
        of the current billing period. Unused portions are not refunded.
      </p>

      <h2 className="text-lg font-semibold text-foreground mt-8 mb-2">
        Changes to the service
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        We may add, change, or remove features. If a material change affects
        paying subscribers adversely we&apos;ll provide at least 14 days&apos;
        notice by email before it takes effect.
      </p>

      <p className="mt-10 text-xs text-muted-foreground">
        Questions?{" "}
        <a
          href="mailto:support@aisayswhat.com"
          className="font-medium text-foreground underline-offset-2 hover:underline"
        >
          Email support
        </a>
        {" · "}
        <Link href="/" className="hover:underline">
          Back to home
        </Link>
      </p>
    </main>
  );
}
