import { headers } from "next/headers";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { ConsentGatedAnalytics } from "@/components/ConsentGatedAnalytics";

// GDPR / UK-GDPR / Swiss FADP coverage. Keep this list conservative —
// better to over-show the consent banner to a Swiss visitor than to
// skip it for someone in the EU.
const GDPR_COUNTRIES = new Set<string>([
  // EU (27)
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE",
  "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT",
  "RO", "SK", "SI", "ES", "SE",
  // EEA (3 more)
  "IS", "LI", "NO",
  // UK (UK GDPR)
  "GB",
  // Switzerland (Swiss FADP)
  "CH",
]);

/**
 * Mount Google Analytics with a consent step only for visitors in
 * GDPR jurisdictions. Country is read from Vercel's edge-injected
 * `x-vercel-ip-country` header — no IP lookup needed.
 *
 * - Non-GDPR → GA loads immediately (existing behavior).
 * - GDPR    → render a consent banner; GA only mounts after the
 *             visitor clicks Accept. Declined / unset → no GA.
 *
 * If the country header is missing (local dev, unfamiliar host),
 * default to showing the banner — conservative failure mode.
 */
export async function AnalyticsWithConsent({ gaId }: { gaId: string }) {
  const h = await headers();
  const country = h.get("x-vercel-ip-country")?.toUpperCase() ?? null;
  const requiresConsent = country === null || GDPR_COUNTRIES.has(country);

  if (!requiresConsent) {
    return <GoogleAnalytics gaId={gaId} />;
  }
  return <ConsentGatedAnalytics gaId={gaId} />;
}
