"use client";

import { useParams } from "next/navigation";
import { TabNav } from "@/components/TabNav";
import { ResponseViewerProvider } from "@/components/ResponseViewer";
import { useBrands } from "@/lib/useBrands";

export default function EntityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { brands } = useBrands();
  const brand = brands.find((b) => b.slug === slug);

  return (
    <ResponseViewerProvider>
      <div>
        <TabNav slug={slug} category={brand?.category} />
        <div className="max-w-[1060px] mx-auto px-6 py-8 animate-fade-in-up">{children}</div>
      </div>
    </ResponseViewerProvider>
  );
}
