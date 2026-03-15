"use client";

import { useEffect, useState, useCallback } from "react";
import { Brand } from "@/types/api";

let cachedBrands: Brand[] | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

/** Invalidate the cached brand list and refetch from server. */
export function invalidateBrands() {
  cachedBrands = null;
  emit();
}

/** Reactive hook — fetches brands from the server (all brands with completed jobs). */
export function useBrands(): Brand[] {
  const [brands, setBrands] = useState<Brand[]>(cachedBrands ?? []);

  const fetchBrands = useCallback(async () => {
    try {
      const res = await fetch("/api/brands");
      if (res.ok) {
        const data = await res.json();
        const fetched: Brand[] = data.brands ?? [];
        cachedBrands = fetched;
        setBrands(fetched);
      }
    } catch {
      // Silently fail — keep existing state
    }
  }, []);

  useEffect(() => {
    // Fetch on mount if not cached
    if (!cachedBrands) {
      fetchBrands();
    }

    // Listen for invalidation
    const handler = () => {
      fetchBrands();
    };
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, [fetchBrands]);

  return brands;
}
