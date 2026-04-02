"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Lock } from "lucide-react";
import { useBrands } from "@/lib/useBrands";
import { prefetchAll } from "@/lib/useCachedFetch";
import { PRESET_BRAND_SLUGS } from "@/lib/brandViewLimit";
import { Brand } from "@/types/api";
import { dataClient } from "@/dataClient";

export default function DashboardPage() {
  const router = useRouter();
  const { brands, loading } = useBrands();

  // Prefetch overview + visibility APIs for preset brands
  useEffect(() => {
    if (brands.length === 0) return;
    const urls: string[] = [];
    const presetBrands = brands.filter((b) => PRESET_BRAND_SLUGS.includes(b.slug));
    for (const brand of presetBrands) {
      const base = `brandSlug=${encodeURIComponent(brand.slug)}&model=all&range=90`;
      urls.push(`/api/overview?${base}`);
      urls.push(`/api/visibility?${base}`);
    }
    prefetchAll(urls);
  }, [brands]);

  function handleBrandClick(brand: Brand) {
    dataClient.setLastViewedBrand(brand.slug);
    router.push(`/entity/${brand.slug}/overview`);
  }

  function handleAddBrand() {
    if (brands.length > 0) {
      router.push(`/entity/${brands[0].slug}/overview`);
    } else {
      router.push("/dashboard/new");
    }
  }

  if (loading) {
    return (
      <div>
        <div className="fixed top-0 left-0 right-0 z-[100] h-[3px]">
          <div className="h-full bg-primary/80 progress-bar-animate" />
        </div>
      </div>
    );
  }

  // Split brands into preset (free) and custom (paid)
  const presetBrands = brands.filter((b) => PRESET_BRAND_SLUGS.includes(b.slug));
  const customBrands = brands.filter((b) => !PRESET_BRAND_SLUGS.includes(b.slug));

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-2">Your Brands</h1>
      <p className="text-muted-foreground mb-8">Select a brand to view its AI visibility dashboard.</p>

      {/* Preset demo brands */}
      {presetBrands.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Demo Brands</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {presetBrands
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((brand) => (
                <button
                  key={brand.id}
                  onClick={() => handleBrandClick(brand)}
                  className="flex flex-col items-center justify-center gap-2 h-36 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all cursor-pointer text-center px-3"
                >
                  <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary font-bold text-lg">
                    {brand.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-foreground leading-tight">{brand.name}</span>
                  <span className="text-[10px] text-emerald-600 font-medium">Free</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Custom brands + add button */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Custom Brands</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {/* Add new brand card */}
          <button
            onClick={handleAddBrand}
            className="flex flex-col items-center justify-center gap-3 h-36 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/30 transition-colors cursor-pointer"
          >
            <Plus className="h-7 w-7 text-muted-foreground/50" />
            <span className="text-sm font-medium text-muted-foreground">Add Brand</span>
            <span className="text-[10px] text-muted-foreground/50">Pro plan</span>
          </button>

          {customBrands
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((brand) => (
              <button
                key={brand.id}
                onClick={() => handleBrandClick(brand)}
                className="flex flex-col items-center justify-center gap-2 h-36 rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all cursor-pointer text-center px-3 relative"
              >
                <Lock className="absolute top-2.5 right-2.5 h-3 w-3 text-muted-foreground/30" />
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted/50 text-muted-foreground font-bold text-lg">
                  {brand.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-foreground leading-tight">{brand.name}</span>
                <span className="text-[10px] text-muted-foreground/50">Pro</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
