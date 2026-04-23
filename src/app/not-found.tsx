import type { Metadata } from "next";
import Link from "next/link";

// Custom 404 with explicit noindex. Next.js's built-in 404 page emits
// its own noindex tag but doesn't override the root layout's
// index:true — so every 404 response was serving two conflicting
// <meta name="robots"> tags + two <title> tags. This file replaces
// the default so 404s have one clean metadata block.
export const metadata: Metadata = {
  title: "Page not found | aiSaysWhat",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-6">
      <div className="text-center max-w-md">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          404
        </p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Page not found
        </h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center justify-center h-10 px-5 text-sm font-medium rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
