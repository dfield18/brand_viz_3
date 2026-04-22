"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";

type ConsentState = "unset" | "granted" | "declined";

const STORAGE_KEY = "analytics-consent";

// useSyncExternalStore is React's canonical hook for reading an
// external source (localStorage) without tripping the
// react-hooks/set-state-in-effect lint rule. Subscribe is a no-op
// because the only writer is our own button click, which updates
// local state directly.
const emptySubscribe = () => () => {};
const readStoredConsent = (): ConsentState => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "granted" || stored === "declined") return stored;
  } catch {
    // localStorage unavailable (Safari private mode, storage blocked)
    // — treat as unset so the banner shows and the visitor can still
    // choose.
  }
  return "unset";
};
// SSR snapshot: returning null tells React "no data during server
// render" — the component bails out until client hydration supplies
// the real value. Avoids flashing the banner on initial SSR.
const serverSnapshot = (): null => null;

/**
 * Client-side consent gate for visitors in GDPR jurisdictions.
 * Shown only when AnalyticsWithConsent decided the visitor is in a
 * covered country. Persists the choice in localStorage so returning
 * visitors don't see the banner again.
 */
export function ConsentGatedAnalytics({ gaId }: { gaId: string }) {
  const storedConsent = useSyncExternalStore(
    emptySubscribe,
    readStoredConsent,
    serverSnapshot,
  );
  // Local override so button clicks update the UI without needing to
  // wire a real subscribe() around localStorage.
  const [override, setOverride] = useState<ConsentState | null>(null);
  const consent = override ?? storedConsent;

  const decide = useCallback((choice: "granted" | "declined") => {
    try {
      window.localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // If storage is blocked, still honor the in-session choice;
      // banner just reappears next visit.
    }
    setOverride(choice);
  }, []);

  // SSR / pre-hydration — render nothing.
  if (consent === null) return null;

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
