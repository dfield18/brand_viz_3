import { useCachedFetch } from "@/lib/useCachedFetch";
import { titleCase } from "@/lib/utils";

interface BrandInfo {
  name: string;
  displayName: string;
  industry: string | null;
  category: string | null;
}

/**
 * Returns the brand's conversational display name (e.g. "Apple" not "Apple Inc").
 * Falls back to titleCase(slug) while loading or on error. Returns "" when
 * slug is null so this hook is safe to call unconditionally on pages that
 * may or may not have a brand in scope.
 */
export function useBrandName(slug: string | null): string {
  const url = slug ? `/api/brand-info?brandSlug=${encodeURIComponent(slug)}` : null;
  const { data } = useCachedFetch<BrandInfo>(url);
  if (!slug) return "";
  return data?.displayName ?? titleCase(slug);
}

/**
 * Returns the brand's category (e.g. "political_advocacy" or "commercial"),
 * or null while loading / when no slug is in scope.
 */
export function useBrandCategory(slug: string | null): string | null {
  const url = slug ? `/api/brand-info?brandSlug=${encodeURIComponent(slug)}` : null;
  const { data } = useCachedFetch<BrandInfo>(url);
  return data?.category ?? null;
}
