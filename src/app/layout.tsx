import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { ClientHeader } from "@/components/ClientHeader";
import { AnalyticsWithConsent } from "@/components/AnalyticsWithConsent";

const GA_ID = "G-VSPTQ3C4MN";
// Skip GA in non-production builds so local dev sessions don't
// pollute the live analytics data.
const GA_ENABLED = process.env.NODE_ENV === "production";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.aisayswhat.com"),
  title: {
    default: "aiSaysWhat — AI brand visibility for companies and marketing teams",
    template: "%s | aiSaysWhat",
  },
  description:
    "Monitor how ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews describe your brand. Visibility scores, sentiment analysis, competitor tracking, and source citations — all on one dashboard.",
  keywords: [
    "AI brand monitoring",
    "AI brand visibility",
    "ChatGPT visibility tracking",
    "generative engine optimization",
    "GEO",
    "brand tracking AI",
    "competitive brand intelligence",
    "AI search analytics",
    "LLM brand tracking",
  ],
  authors: [{ name: "aiSaysWhat" }],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.aisayswhat.com",
    siteName: "aiSaysWhat",
    title: "aiSaysWhat — AI brand visibility for companies and marketing teams",
    description:
      "Monitor how ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews describe your brand.",
  },
  twitter: {
    card: "summary_large_image",
    title: "aiSaysWhat — AI brand visibility for companies and marketing teams",
    description:
      "See what AI platforms say about your brand. Visibility scores, sentiment, competitor tracking, citations.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body
          className="antialiased"
          style={{
            fontFamily:
              'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
        >
          {GA_ENABLED && <AnalyticsWithConsent gaId={GA_ID} />}
          <ClientHeader />
          <main className="min-h-[calc(100vh-3.75rem)]">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
