import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";

// Auth gateway — no indexable content. Explicit noindex so Search
// Console doesn't flag the page as "Excluded by noindex" warning
// (the page was silently inheriting the layout's index,follow).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  alternates: { canonical: "/sign-up" },
};

export default function SignUpPage() {
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
      <div className="flex flex-col items-center gap-6 w-full max-w-sm px-4">
        <SignUp />
        <p className="text-[11px] text-muted-foreground/60 text-center leading-relaxed max-w-xs">
          By signing up, you agree to receive occasional updates and insights from aiSaysWhat, a service of BrooklyEcho LLC. You can unsubscribe anytime.
        </p>
      </div>
    </div>
  );
}
