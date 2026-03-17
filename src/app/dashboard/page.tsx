"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { dataClient } from "@/dataClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AnalyzeRunner } from "@/components/AnalyzeRunner";
import { Loader2 } from "lucide-react";
import { useBrands, invalidateBrands } from "@/lib/useBrands";

export default function DashboardPage() {
  const router = useRouter();
  const { brands, loading: brandsLoading } = useBrands();
  const [name, setName] = useState("");
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  useEffect(() => {
    if (brands.length > 0) {
      const lastViewed = dataClient.getLastViewedBrand();
      const target = lastViewed ?? brands[0].slug;
      router.replace(`/entity/${target}/overview`);
    }
  }, [router, brands]);

  function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const brand = dataClient.createBrand({ name: trimmed });
    dataClient.setLastViewedBrand(brand.slug);
    setCreatedSlug(brand.slug);
  }

  const handleDone = useCallback((slug: string, execModel: string) => {
    invalidateBrands();
    router.push(`/entity/${slug}/overview?range=30&model=${execModel}`);
  }, [router]);

  // Still loading brands from server or redirecting
  if (brandsLoading || brands.length > 0) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.75rem)]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
      <div className="w-full max-w-md p-8 border border-border rounded-lg bg-card">
        <h1 className="text-2xl font-semibold mb-2">Create your first brand</h1>
        <p className="text-muted-foreground mb-6">
          Enter a brand name to start tracking its AI search visibility.
        </p>

        {createdSlug ? (
          <AnalyzeRunner
            brandSlug={createdSlug}
            model="all"
            range={30}
            onDone={handleDone}
          />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
            className="flex flex-col gap-4"
          >
            <Input
              placeholder="Brand name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            <Button type="submit" disabled={!name.trim()}>
              Analyze
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
