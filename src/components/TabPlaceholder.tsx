"use client";

import { useParams } from "next/navigation";
import { useBrands } from "@/lib/useBrands";

export function TabPlaceholder({ tabName }: { tabName: string }) {
  const params = useParams<{ slug: string }>();
  const brands = useBrands();
  const brandName = brands.find((b) => b.slug === params.slug)?.name ?? params.slug;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">
        {brandName} &mdash; {tabName}
      </h1>
      <p className="text-muted-foreground">
        Placeholder content for this tab.
      </p>
    </div>
  );
}
