"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PromptManager } from "@/components/PromptManager";

function PromptsInner() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const range = Number(searchParams.get("range")) || 90;
  const model = searchParams.get("model") || "all";

  return <PromptManager brandSlug={params.slug} model={model} range={range} />;
}

export default function PromptsPage() {
  return (
    <Suspense fallback={<div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>}>
      <PromptsInner />
    </Suspense>
  );
}
