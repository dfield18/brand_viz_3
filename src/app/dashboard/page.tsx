"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useBrands } from "@/lib/useBrands";
import { Brand } from "@/types/api";
import { dataClient } from "@/dataClient";

export default function DashboardPage() {
  const router = useRouter();
  const { brands, loading } = useBrands();

  function handleBrandClick(brand: Brand) {
    dataClient.setLastViewedBrand(brand.slug);
    router.push(`/entity/${brand.slug}/overview`);
  }

  function handleAddBrand() {
    // Open the header's add-brand dialog by navigating to a brand page
    // which renders the Header with the BrandSelector
    // For now, navigate to overview of the first brand which shows the header
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

  // No brands yet — show create first brand
  if (brands.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-bold mb-2">Your Brands</h1>
        <p className="text-muted-foreground mb-8">Track how AI platforms talk about your brands.</p>
        <button
          onClick={handleAddBrand}
          className="flex flex-col items-center justify-center gap-3 w-48 h-40 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/30 transition-colors cursor-pointer"
        >
          <Plus className="h-8 w-8 text-muted-foreground/50" />
          <span className="text-sm font-medium text-muted-foreground">Add Brand</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-2">Your Brands</h1>
      <p className="text-muted-foreground mb-8">Select a brand to view its AI visibility dashboard.</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {/* Add new brand card */}
        <button
          onClick={handleAddBrand}
          className="flex flex-col items-center justify-center gap-3 h-36 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/30 transition-colors cursor-pointer"
        >
          <Plus className="h-7 w-7 text-muted-foreground/50" />
          <span className="text-sm font-medium text-muted-foreground">Add Brand</span>
        </button>

        {/* Brand cards */}
        {[...brands]
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
              {brand.category && (
                <span className="text-[10px] text-muted-foreground/60">{brand.category === "political_advocacy" ? "Advocacy" : "Brand"}</span>
              )}
            </button>
          ))}
      </div>
    </div>
  );
}
