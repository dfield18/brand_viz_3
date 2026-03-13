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
 * Falls back to titleCase(slug) while loading or on error.
 */
export function useBrandName(slug: string): string {
  const { data } = useCachedFetch<BrandInfo>(
    `/api/brand-info?brandSlug=${encodeURIComponent(slug)}`,
  );
  return data?.displayName ?? titleCase(slug);
}
