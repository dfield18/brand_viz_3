"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

// GA4 bootstrap + SPA page-view tracking for the Next.js App Router.
//
// Two things the default gtag install in layout.tsx missed:
//  1. Route changes inside the app (Overview → Visibility → etc.)
//     aren't tracked, so all GA sessions looked like single-page
//     bounces. Subscribing to usePathname + useSearchParams and
//     firing a page_view event on change fixes that.
//  2. gtag('config', id) auto-fires an initial page_view on mount.
//     Now that the client listener handles page views uniformly, we
//     pass { send_page_view: false } on config so the first load
//     doesn't double-count.

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gtag?: (...args: any[]) => void;
    dataLayer?: unknown[];
  }
}

interface Props {
  gaId: string;
}

function PageViewTracker({ gaId }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname || typeof window.gtag !== "function") return;
    const qs = searchParams?.toString();
    const path = qs ? `${pathname}?${qs}` : pathname;
    window.gtag("event", "page_view", {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
      send_to: gaId,
    });
  }, [pathname, searchParams, gaId]);

  return null;
}

export function GoogleAnalytics({ gaId }: Props) {
  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="lazyOnload"
      />
      <Script id="gtag-init" strategy="lazyOnload">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}', { send_page_view: false });`}
      </Script>
      {/* useSearchParams requires a Suspense boundary in the App Router */}
      <Suspense fallback={null}>
        <PageViewTracker gaId={gaId} />
      </Suspense>
    </>
  );
}
