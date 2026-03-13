"use client";

import { useParams } from "next/navigation";
import { TabNav } from "@/components/TabNav";
import { ResponseViewerProvider } from "@/components/ResponseViewer";

export default function EntityLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  return (
    <ResponseViewerProvider>
      <div>
        <TabNav slug={slug} />
        <div className="max-w-[1060px] mx-auto px-6 py-8">{children}</div>
      </div>
    </ResponseViewerProvider>
  );
}
