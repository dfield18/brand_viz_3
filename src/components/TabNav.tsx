"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useAuth } from "@clerk/nextjs";

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
    { label: "Email Reports", segment: "reports" },
  ];
}

const SECONDARY_TABS = [
  { label: "Full Prompt Data", segment: "full-data" },
  { label: "Refine Prompts", segment: "prompts" },
];

// Segments that require a signed-in account (Pro features or account-bound
// actions). Hidden from the tab nav for anonymous free-tier visitors.
const AUTH_ONLY_SEGMENTS = new Set(["reports", "site-audit"]);

function TabNavInner({ slug, category }: { slug: string; category?: string | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isSignedIn } = useAuth();
  const qs = searchParams.toString();
  const suffix = qs ? `?${qs}` : "";
  // Hide account-bound tabs (Email Reports, Site Audit) from anonymous
  // free-tier visitors so they don't land on pages they can't use. While
  // Clerk is still hydrating `isSignedIn` is `undefined` — keep the tabs
  // visible in that window so signed-in users don't see them briefly
  // disappear before re-rendering.
  const tabs = getTabs(category).filter(
    (t) => !AUTH_ONLY_SEGMENTS.has(t.segment) || isSignedIn !== false,
  );

  return (
    <nav className="sticky top-[var(--header-height)] z-40 border-b border-border/60 bg-card">
      <div className="max-w-[1220px] mx-auto flex gap-1 px-6 items-end overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const href = `/entity/${slug}/${tab.segment}${suffix}`;
          const isActive = pathname === `/entity/${slug}/${tab.segment}`;
          return (
            <Link
              key={tab.segment}
              href={href}
              className={`px-3.5 py-2.5 text-[13px] font-medium rounded-t-md border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-background text-foreground border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground hover:bg-background/60"
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
                className={`px-2.5 py-2.5 text-[11px] rounded-t-md border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-background text-foreground font-medium border-primary"
                    : "text-muted-foreground/50 border-transparent hover:text-muted-foreground hover:bg-background/40"
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
