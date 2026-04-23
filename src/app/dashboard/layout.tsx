import type { Metadata } from "next";
import type { ReactNode } from "react";

// Dashboard is per-user, behind auth. Explicit noindex is stronger
// than the robots.txt disallow — defense in depth against accidental
// indexing if the route ever leaks into an external link.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children;
}
