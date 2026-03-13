"use client";

import { useSyncExternalStore } from "react";
import { dataClient } from "@/dataClient";
import { Brand } from "@/types/api";

/**
 * Reactive brand list backed by localStorage via useSyncExternalStore.
 * Returns [] during SSR (server snapshot), then real data on the client
 * — React handles the transition without hydration warnings.
 *
 * Call invalidateBrands() after creating/deleting a brand to trigger
 * a re-render in all components that use useBrands().
 */

let snapshot: Brand[] | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function getSnapshot(): Brand[] {
  if (snapshot === null) {
    snapshot = dataClient.listBrands();
  }
  return snapshot;
}

const SERVER_SNAPSHOT: Brand[] = [];
function getServerSnapshot(): Brand[] {
  return SERVER_SNAPSHOT;
}

/** Invalidate the cached brand list and notify all subscribers. */
export function invalidateBrands() {
  snapshot = null;
  emit();
}

/** Reactive hook — returns brands from localStorage, [] during SSR. */
export function useBrands(): Brand[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
