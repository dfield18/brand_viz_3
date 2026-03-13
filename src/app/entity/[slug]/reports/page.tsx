"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useBrandName } from "@/lib/useBrandName";

function ReportsInner() {
  const params = useParams<{ slug: string }>();
  useSearchParams(); // subscribe to query param changes
  const brandName = useBrandName(params.slug);

  return (
    <div className="max-w-[1220px] mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold mb-2">Reports</h1>
      <p className="text-muted-foreground">
        Generated reports for <span className="font-medium text-foreground">{brandName}</span> will appear here.
      </p>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>}>
      <ReportsInner />
    </Suspense>
  );
}
