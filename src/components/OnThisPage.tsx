"use client";

import { useEffect, useState } from "react";

export interface PageSection {
  id: string;
  label: string;
  /** Optional group heading rendered above this item */
  heading?: string;
  /** Optional subheading rendered below the heading */
  subheading?: string;
}

interface OnThisPageProps {
  sections: PageSection[];
}

export function OnThisPage({ sections }: OnThisPageProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the first visible section
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );

    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <nav className="sticky top-24 hidden xl:block">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">
        On this page
      </p>
      <ul className="space-y-0.5">
        {sections.map((s, i) => {
          const isFirstHeading = s.heading && i === 0;
          return (
            <li key={s.id}>
              {s.heading && (
                <p className={`text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1.5 px-3 ${isFirstHeading ? "mt-1" : "mt-5"}`}>
                  {s.heading}
                </p>
              )}
              {s.subheading && (
                <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1.5 mt-4 px-3">
                  {s.subheading}
                </p>
              )}
              <button
                onClick={() => handleClick(s.id)}
                className={`block w-full text-left text-sm py-1.5 px-3 rounded-md transition-colors ${
                  activeId === s.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {s.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
