import type { Metadata } from "next";
import Script from "next/script";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { ClientHeader } from "@/components/ClientHeader";

const GA_ID = "G-VSPTQ3C4MN";

export const metadata: Metadata = {
  metadataBase: new URL("https://aisayswhat.com"),
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
    url: "https://aisayswhat.com",
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
        <head>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
          </Script>
        </head>
        <body
          className="antialiased"
          style={{
            fontFamily:
              'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
        >
          <ClientHeader />
          <main className="min-h-[calc(100vh-3.75rem)]">{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
