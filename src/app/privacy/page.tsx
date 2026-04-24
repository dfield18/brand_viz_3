import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How aiSaysWhat handles the data you provide when using the product.",
  alternates: { canonical: "/privacy" },
};

// Minimal factual summary of current data practices. NOT a
// finalized legal document — flagged below. Replace with attorney-
// reviewed policy before relying on this for GDPR/CCPA compliance.
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Legal
      </p>
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-2">
        Privacy Policy
      </h1>
      <p className="text-xs text-muted-foreground mb-8">Last updated: April 2026</p>

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 mb-8 text-sm text-amber-900">
        <strong className="font-semibold">Draft notice.</strong> This page
        describes our current data practices in plain terms. It is not yet a
        finalized legal policy. For questions about your data or to exercise
        privacy rights, email{" "}
        <a
          href="mailto:support@aisayswhat.com"
          className="font-medium underline-offset-2 hover:underline"
        >
          support@aisayswhat.com
        </a>
        .
      </div>

      <h2 className="text-lg font-semibold text-foreground mt-8 mb-2">
        What we collect
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        When you run a free report we store the brand name you entered, an
        anonymous session identifier (cookie), and your IP address for rate
        limiting and abuse prevention. When you create a Pro account we also
        store your email address, subscription status, and any brands you track.
      </p>

      <h2 className="text-lg font-semibold text-foreground mt-8 mb-2">
        How we use it
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        We use the data to run AI analyses, deliver the reports and email
        digests you&apos;ve subscribed to, enforce rate limits on free use, and
        diagnose technical issues. We do not sell personal data.
      </p>

      <h2 className="text-lg font-semibold text-foreground mt-8 mb-2">
        Third parties we rely on
      </h2>
      <ul className="text-sm text-muted-foreground leading-relaxed list-disc pl-5 space-y-1">
        <li>OpenAI, Google, and Anthropic — the AI platforms that generate the analyses you see.</li>
        <li>Clerk — account authentication.</li>
        <li>Stripe — payment processing for Pro subscriptions.</li>
        <li>Vercel — hosting and edge delivery.</li>
      </ul>

      <h2 className="text-lg font-semibold text-foreground mt-8 mb-2">
        Your rights
      </h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        You can request a copy of the data associated with your account, ask us
        to delete your account and its data, or opt out of marketing emails at
        any time by replying to any email digest or emailing support.
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
