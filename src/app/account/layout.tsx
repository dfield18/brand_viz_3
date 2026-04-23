import type { Metadata } from "next";
import type { ReactNode } from "react";

// Account settings page is per-user, behind auth, and has no public
// value. Explicit noindex is stronger than the robots.txt disallow —
// robots.txt is a directive bots can ignore; metadata is the
// definitive signal. Belt-and-suspenders against accidental indexing
// if the route ever leaks into a sitemap or external link.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
