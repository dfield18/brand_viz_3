"use client";

import { Brand } from "@/types/api";

const BRANDS_KEY = "ai-visibility-brands";
const LAST_VIEWED_KEY = "ai-visibility-last-viewed";

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function getBrands(): Brand[] {
  if (!isClient()) return [];
  try {
    const raw = localStorage.getItem(BRANDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveBrands(brands: Brand[]): void {
  if (!isClient()) return;
  localStorage.setItem(BRANDS_KEY, JSON.stringify(brands));
}

export function getLastViewedBrand(): string | null {
  if (!isClient()) return null;
  return localStorage.getItem(LAST_VIEWED_KEY);
}

export function setLastViewedBrand(slug: string): void {
  if (!isClient()) return;
  localStorage.setItem(LAST_VIEWED_KEY, slug);
}
