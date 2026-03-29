"use client";

import { useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { TabNav } from "@/components/TabNav";
import { ResponseViewerProvider } from "@/components/ResponseViewer";
import { useBrands } from "@/lib/useBrands";
import { prefetchAll } from "@/lib/useCachedFetch";

const PREFETCH_TABS = ["overview", "visibility-v2", "narrative", "competition", "sources"];

export default function EntityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = params.slug;
  const { brands } = useBrands();
  const brand = brands.find((b) => b.slug === slug);

  // Prefetch all main tab APIs so switching tabs feels instant
  useEffect(() => {
    if (!slug) return;
    const model = searchParams.get("model") || "all";
    const range = searchParams.get("range") || "90";
    const qs = `brandSlug=${encodeURIComponent(slug)}&model=${model}&range=${range}`;
    // Slight delay so the current tab loads first
    const timer = setTimeout(() => {
      prefetchAll(PREFETCH_TABS.map((tab) => `/api/${tab}?${qs}`));
    }, 1000);
    return () => clearTimeout(timer);
  }, [slug, searchParams]);

  return (
    <ResponseViewerProvider>
      <div>
        <TabNav slug={slug} category={brand?.category} />
        <div className="max-w-[1060px] mx-auto px-6 py-8 min-h-[calc(100vh-7rem)] animate-in fade-in duration-150">{children}</div>
      </div>
    </ResponseViewerProvider>
  );
}
