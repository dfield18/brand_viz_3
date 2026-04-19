"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock, Loader2 } from "lucide-react";
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

  const [viewCheck, setViewCheck] = useState<{
    allowed: boolean;
    isPreset: boolean;
    presetBrands: string[];
  } | null>(null);

  // Check brand access
  useEffect(() => {
    if (!slug) return;
    fetch("/api/brand-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandSlug: slug }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setViewCheck(data); })
      .catch(() => {});
  }, [slug]);

  // Prefetch all main tab APIs so switching tabs feels instant
  useEffect(() => {
    if (!slug || viewCheck?.allowed === false) return;
    const model = searchParams.get("model") || "all";
    const range = searchParams.get("range") || "90";
    const qs = `brandSlug=${encodeURIComponent(slug)}&model=${model}&range=${range}`;
    const timer = setTimeout(() => {
      prefetchAll(PREFETCH_TABS.map((tab) => `/api/${tab}?${qs}`));
    }, 1000);
    return () => clearTimeout(timer);
  }, [slug, searchParams, viewCheck?.allowed]);

  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const handleUpgrade = useCallback(async () => {
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("Stripe checkout error:", data);
        alert(data.error || "Failed to start checkout. Please try again.");
        setCheckoutLoading(false);
      }
    } catch (err) {
      console.error("Checkout failed:", err);
      alert("Failed to start checkout. Please try again.");
      setCheckoutLoading(false);
    }
  }, []);

  // Show upgrade prompt if brand not accessible
  if (viewCheck && !viewCheck.allowed) {
    return (
      <div>
        <TabNav slug={slug} category={brand?.category} />
        <div className="max-w-lg mx-auto px-6 py-20 text-center">
          <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mx-auto mb-6">
            <Lock className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">Upgrade to Pro</h2>
          <p className="text-muted-foreground mb-6">
            Custom brands require a Pro subscription. On the free plan, you can explore our preset demo brands.
          </p>
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={handleUpgrade}
              disabled={checkoutLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors"
            >
              {checkoutLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Upgrade to Pro — $49/mo
            </button>
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              View free demo brands
            </Link>
            <a href="mailto:support@aisayswhat.com" className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              Questions? support@aisayswhat.com
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ResponseViewerProvider>
      <div>
        <TabNav slug={slug} category={brand?.category} />
        <div className="max-w-[1060px] mx-auto px-4 sm:px-6 py-6 sm:py-8 min-h-[calc(100vh-7rem)] animate-in fade-in duration-150">{children}</div>
      </div>
    </ResponseViewerProvider>
  );
}
