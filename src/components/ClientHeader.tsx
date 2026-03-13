"use client";

import dynamic from "next/dynamic";

const Header = dynamic(() => import("@/components/Header").then((m) => m.Header), {
  ssr: false,
  loading: () => <header className="border-b border-border bg-card h-14" />,
});

export function ClientHeader() {
  return <Header />;
}
