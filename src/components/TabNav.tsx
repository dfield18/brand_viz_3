"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function getTabs(category?: string | null) {
  const competitionLabel = category === "political_advocacy" ? "Issue Landscape" : "Competitive Marketplace";
  return [
    { label: "Overview", segment: "overview" },
    { label: "Visibility", segment: "visibility-v2" },
    { label: "Narrative", segment: "narrative" },
    { label: competitionLabel, segment: "competition" },
    { label: "Sources", segment: "sources" },
    { label: "Recommendations", segment: "recommendations" },
    { label: "Site Audit", segment: "site-audit" },
    { label: "Reports", segment: "reports" },
  ];
}

const SECONDARY_TABS = [
  { label: "Reference", segment: "reference" },
  { label: "Responses", segment: "responses" },
  { label: "Full Data", segment: "full-data" },
  { label: "Prompts", segment: "prompts" },
];

function TabNavInner({ slug, category }: { slug: string; category?: string | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = searchParams.toString();
  const suffix = qs ? `?${qs}` : "";
  const tabs = getTabs(category);

  return (
    <nav className="sticky top-0 z-50 border-b border-border/60 bg-card">
      <div className="max-w-[1220px] mx-auto flex gap-1 px-6 items-end">
        {tabs.map((tab) => {
          const href = `/entity/${slug}/${tab.segment}${suffix}`;
          const isActive = pathname === `/entity/${slug}/${tab.segment}`;
          return (
            <Link
              key={tab.segment}
              href={href}
              className={`px-3.5 py-2.5 text-[13px] font-medium rounded-t-md transition-all ${
                isActive
                  ? "bg-background text-foreground border-b-2 border-primary -mb-px"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
        <div className="ml-auto flex items-end gap-0.5 border-l border-border/40 pl-2 mb-0">
          {SECONDARY_TABS.map((tab) => {
            const href = `/entity/${slug}/${tab.segment}${suffix}`;
            const isActive = pathname === `/entity/${slug}/${tab.segment}`;
            return (
              <Link
                key={tab.segment}
                href={href}
                className={`px-2.5 py-2.5 text-[11px] rounded-t-md transition-all ${
                  isActive
                    ? "bg-background text-foreground font-medium border-b-2 border-primary -mb-px"
                    : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-background/40"
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

export function TabNav({ slug, category }: { slug: string; category?: string | null }) {
  return (
    <Suspense fallback={<nav className="border-b border-border bg-background h-[45px]" />}>
      <TabNavInner slug={slug} category={category} />
    </Suspense>
  );
}
