import type { Metadata } from "next";
import type { ReactNode } from "react";

// Entity pages contain per-brand data — either Pro-only customer
// reports or publicly-viewable preset demos. For Pro brands, indexing
// would leak customer data. For preset brands, indexing is technically
// acceptable but the pages are highly dynamic client-rendered views
// that give search engines little to rank on.
//
// Default everything under /entity/ to noindex. The existing
// src/app/entity/[slug]/layout.tsx is a "use client" file and can't
// export metadata, so this server layout one level up is the cleanest
// place to set the directive for the whole route segment.
//
// robots.txt already disallows /entity/ — explicit noindex is the
// stronger signal for bots that ignore robots.txt and for any case
// where a direct link to an entity page gets crawled anyway.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function EntityLayout({ children }: { children: ReactNode }) {
  return children;
}
