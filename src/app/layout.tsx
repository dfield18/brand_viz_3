import type { Metadata } from "next";
import Script from "next/script";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { ClientHeader } from "@/components/ClientHeader";

const GA_ID = "G-VSPTQ3C4MN";

export const metadata: Metadata = {
  metadataBase: new URL("https://aisayswhat.com"),
  title: {
    default: "aiSaysWhat — AI brand visibility for advocacy organizations",
    template: "%s | aiSaysWhat",
  },
  description:
    "Monitor how ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews describe your organization and the issues you champion. Visibility scores, sentiment analysis, peer tracking, and source citations — all on one dashboard.",
  keywords: [
    "AI brand monitoring",
    "AI brand visibility",
    "ChatGPT visibility tracking",
    "generative engine optimization",
    "GEO",
    "nonprofit AI monitoring",
    "advocacy AI tracking",
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
    title: "aiSaysWhat — AI brand visibility for advocacy organizations",
    description:
      "Monitor how ChatGPT, Gemini, Claude, Perplexity, and Google AI Overviews describe your organization and the issues you champion.",
  },
  twitter: {
    card: "summary_large_image",
    title: "aiSaysWhat — AI brand visibility for advocacy organizations",
    description:
      "See what AI platforms say about your cause. Visibility scores, sentiment, peer tracking, citations.",
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
