"use client";

import { useEffect, useRef, useCallback, useSyncExternalStore } from "react";

/**
 * Simple in-memory SWR-style cache for API fetches.
 * On first call for a URL, fetches from network and caches the result.
 * On subsequent calls with the same URL, returns cached data instantly
 * and revalidates in the background.
 *
 * Uses useSyncExternalStore to avoid lint violations from setState-in-effect.
 */

interface CacheEntry {
  data: unknown;
  ts: number;
  loading: boolean;
  error: string | null;
}

const store = new Map<string, CacheEntry>();
const STALE_MS = 5 * 60 * 1000;

type Listener = () => void;
const listeners = new Set<Listener>();
function emit() {
  for (const fn of listeners) fn();
}
function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function getEntry(url: string): CacheEntry {
  return store.get(url) ?? { data: null, ts: 0, loading: false, error: null };
}

function setEntry(url: string, patch: Partial<CacheEntry>) {
  const prev = getEntry(url);
  store.set(url, { ...prev, ...patch });
  emit();
}

function doFetch<T>(url: string, background: boolean) {
  if (!background) {
    setEntry(url, { loading: true, error: null });
  }

  fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`API error (${r.status})`);
      return r.json();
    })
    .then((result: T) => {
      setEntry(url, { data: result, ts: Date.now(), loading: false, error: null });
    })
    .catch((e) => {
      if (!background) {
        setEntry(url, { loading: false, error: e instanceof Error ? e.message : "Unknown error" });
      }
    });
}

interface UseCachedFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface UseCachedFetchOptions {
  /** Override the default stale window (default: 5 minutes) */
  staleMs?: number;
  /** Always fetch on mount, ignoring cache freshness */
  alwaysRefetchOnMount?: boolean;
}

export function useCachedFetch<T>(url: string | null, options?: UseCachedFetchOptions): UseCachedFetchResult<T> {
  const staleMs = options?.staleMs ?? STALE_MS;
  const alwaysRefetch = options?.alwaysRefetchOnMount ?? false;
  const getSnapshot = useCallback(() => {
    if (!url) return null;
    return store.get(url) ?? null;
  }, [url]);

  const entry = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const urlRef = useRef(url);

  useEffect(() => {
    urlRef.current = url;
    if (!url) return;

    const existing = store.get(url);
    if (existing && existing.ts > 0) {
      if (alwaysRefetch) {
        // Always refetch on mount — show cached data but refresh immediately
        doFetch(url, true);
      } else if (Date.now() - existing.ts > staleMs) {
        // Data exists but stale — revalidate in background
        doFetch(url, true);
      }
    } else {
      // No data — fetch from network
      doFetch(url, false);
    }
  }, [url, alwaysRefetch, staleMs]);

  const refetch = useCallback(() => {
    const current = urlRef.current;
    if (current) {
      store.delete(current);
      emit();
      doFetch(current, false);
    }
  }, []);

  // If we have cached data, never report loading — show stale data instantly
  // while revalidation happens in the background
  const hasData = entry?.data != null;
  return {
    data: (entry?.data as T) ?? null,
    loading: hasData ? false : (entry?.loading ?? (url ? true : false)),
    error: entry?.error ?? null,
    refetch,
  };
}

/** Prefetch a URL into the cache without triggering React re-renders.
 *  If the URL is already cached and fresh, this is a no-op. */
export function prefetch(url: string) {
  const existing = store.get(url);
  if (existing && existing.ts > 0 && Date.now() - existing.ts < STALE_MS) return;
  if (existing?.loading) return;
  doFetch(url, true);
}

/** Prefetch multiple URLs in parallel. */
export function prefetchAll(urls: string[]) {
  for (const url of urls) prefetch(url);
}

/** Clear all cached entries (e.g. after running new prompts). */
export function clearFetchCache() {
  store.clear();
  emit();
}

// Expose for debugging — run `clearCache()` in browser DevTools console
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).clearCache = clearFetchCache;
}
