"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const TABS = [
  { label: "Overview", segment: "overview" },
  { label: "Visibility", segment: "visibility-v2" },
  { label: "Narrative", segment: "narrative" },
  { label: "Competition", segment: "competition" },
  { label: "Sources", segment: "sources" },
  { label: "Recommendations", segment: "recommendations" },
  { label: "Site Audit", segment: "site-audit" },
  { label: "Reports", segment: "reports" },
  { label: "Reference", segment: "reference" },
  { label: "Visibility Old", segment: "visibility" },
];

const RIGHT_TABS = [
  { label: "Responses", segment: "responses" },
  { label: "Full Data", segment: "full-data" },
];

function TabNavInner({ slug }: { slug: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const suffix = qs ? `?${qs}` : "";

  return (
    <nav className="border-b border-border bg-card">
      <div className="max-w-[1220px] mx-auto flex gap-0 px-6">
        {TABS.map((tab) => {
          const href = `/entity/${slug}/${tab.segment}${suffix}`;
          const isActive = pathname === `/entity/${slug}/${tab.segment}`;
          return (
            <Link
              key={tab.segment}
              href={href}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
        <div className="ml-auto flex gap-0">
          {RIGHT_TABS.map((tab) => {
            const href = `/entity/${slug}/${tab.segment}${suffix}`;
            const isActive = pathname === `/entity/${slug}/${tab.segment}`;
            return (
              <Link
                key={tab.segment}
                href={href}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export function TabNav({ slug }: { slug: string }) {
  return (
    <Suspense fallback={<nav className="border-b border-border bg-background h-[45px]" />}>
      <TabNavInner slug={slug} />
    </Suspense>
  );
}
