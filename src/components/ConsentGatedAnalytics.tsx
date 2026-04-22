"use client";

import { useEffect, useState } from "react";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";

type ConsentState = "unset" | "granted" | "declined";

const STORAGE_KEY = "analytics-consent";

/**
 * Client-side consent gate for visitors in GDPR jurisdictions.
 * Shown only when AnalyticsWithConsent decided the visitor is in a
 * covered country. Persists the choice in localStorage so returning
 * visitors don't see the banner again.
 */
export function ConsentGatedAnalytics({ gaId }: { gaId: string }) {
  // Start as "unset" on SSR/first hydration so nothing leaks to a
  // visitor whose choice is unknown. Effect below reads storage and
  // updates once — brief tick before banner appears is acceptable
  // and avoids any hydration mismatch warning.
  const [consent, setConsent] = useState<ConsentState>("unset");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "granted" || stored === "declined") {
        setConsent(stored);
      }
    } catch {
      // localStorage unavailable (Safari private mode etc.) — leave
      // as "unset" so the banner shows; visitor can still accept.
    }
  }, []);

  const decide = (choice: "granted" | "declined") => {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // If storage is blocked, still honor the in-session choice;
      // banner just reappears next visit.
    }
    setConsent(choice);
  };

  if (!hydrated) return null;

  return (
    <>
      {consent === "granted" && <GoogleAnalytics gaId={gaId} />}
      {consent === "unset" && (
        <div
          role="dialog"
          aria-live="polite"
          aria-label="Analytics consent"
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md z-[60] rounded-xl border border-border bg-card shadow-xl p-4"
        >
          <p className="text-sm text-foreground mb-1 font-medium">
            Analytics cookies
          </p>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            We use Google Analytics to understand how visitors use this site.
            No ads, no third-party sharing. You can decline without affecting
            the report.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => decide("granted")}
              className="flex-1 h-9 px-4 rounded-lg bg-foreground text-background text-sm font-medium hover:bg-foreground/90 transition-colors"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => decide("declined")}
              className="flex-1 h-9 px-4 rounded-lg border border-border text-sm font-medium hover:bg-muted/50 transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      )}
    </>
  );
}
